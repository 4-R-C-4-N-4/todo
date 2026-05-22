// Hermes Kanban push-sync client.
//
// .todo/ remains the source of truth; this module only pushes state out
// to a Hermes dashboard's Kanban plugin API at /api/plugins/kanban/.
// We persist the Hermes task id on each ticket under
// ``external_refs.hermes_task_id`` so re-syncs hit the same card.

import type { HermesConfig, State, Ticket } from "./types.js";

export const STATE_TO_KANBAN: Record<State, string> = {
	open: "todo",
	active: "running",
	blocked: "blocked",
	done: "done",
	wontfix: "archived",
	duplicate: "archived",
};

export interface ResolvedHermesConfig {
	dashboard_url: string;
	board: string;
	session_token: string;
}

export function resolveHermesConfig(
	cfg: HermesConfig | undefined,
	env: NodeJS.ProcessEnv = process.env,
	boardOverride?: string,
): ResolvedHermesConfig | { error: string } {
	if (!cfg) {
		return {
			error:
				"Hermes config missing. Add a `hermes` block to .todo/config.json:\n" +
				'  { "hermes": { "dashboard_url": "http://localhost:8765", ' +
				'"board": "<slug>", "session_token": "<token>" } }\n' +
				"  session_token can also come from HERMES_SESSION_TOKEN env.",
		};
	}
	const dashboard_url = cfg.dashboard_url?.replace(/\/$/, "");
	const board = boardOverride ?? cfg.board;
	const session_token = cfg.session_token ?? env["HERMES_SESSION_TOKEN"];
	if (!dashboard_url) return { error: "Hermes config missing dashboard_url." };
	if (!board) return { error: "Hermes config missing board." };
	if (!session_token) {
		return {
			error:
				"Hermes session token missing. Set hermes.session_token in " +
				".todo/config.json or HERMES_SESSION_TOKEN in the environment.",
		};
	}
	return { dashboard_url, board, session_token };
}

export interface KanbanTask {
	id: string;
	title: string;
	status: string;
	body?: string;
}

export interface KanbanClient {
	getBoard(): Promise<{ columns: { name: string; tasks: KanbanTask[] }[] }>;
	getTask(id: string): Promise<KanbanTask | null>;
	createTask(payload: {
		title: string;
		body?: string;
		idempotency_key?: string;
	}): Promise<KanbanTask>;
	updateStatus(id: string, status: string): Promise<KanbanTask>;
}

export function makeKanbanClient(
	cfg: ResolvedHermesConfig,
	fetchImpl: typeof fetch = fetch,
): KanbanClient {
	const headers: Record<string, string> = {
		Authorization: `Bearer ${cfg.session_token}`,
		"Content-Type": "application/json",
	};
	const base = `${cfg.dashboard_url}/api/plugins/kanban`;
	const boardQ = `?board=${encodeURIComponent(cfg.board)}`;

	async function expectJson(res: Response): Promise<unknown> {
		if (!res.ok) {
			const text = await res.text().catch(() => "");
			throw new Error(
				`Hermes ${res.status} ${res.statusText}: ${text || "(no body)"}`,
			);
		}
		return res.json();
	}

	return {
		async getBoard() {
			const res = await fetchImpl(`${base}/board${boardQ}`, { headers });
			return (await expectJson(res)) as {
				columns: { name: string; tasks: KanbanTask[] }[];
			};
		},
		async getTask(id) {
			const res = await fetchImpl(`${base}/tasks/${id}${boardQ}`, { headers });
			if (res.status === 404) return null;
			const body = (await expectJson(res)) as { task: KanbanTask };
			return body.task;
		},
		async createTask(payload) {
			const res = await fetchImpl(`${base}/tasks${boardQ}`, {
				method: "POST",
				headers,
				body: JSON.stringify(payload),
			});
			const body = (await expectJson(res)) as { task: KanbanTask };
			return body.task;
		},
		async updateStatus(id, status) {
			const res = await fetchImpl(`${base}/tasks/${id}${boardQ}`, {
				method: "PATCH",
				headers,
				body: JSON.stringify({ status }),
			});
			const body = (await expectJson(res)) as { task: KanbanTask };
			return body.task;
		},
	};
}

export type SyncAction =
	| { kind: "create"; ticket: Ticket; targetStatus: string }
	| {
			kind: "update";
			ticket: Ticket;
			hermesId: string;
			fromStatus: string;
			toStatus: string;
	  }
	| { kind: "noop"; ticket: Ticket; hermesId: string; status: string }
	| { kind: "skip"; ticket: Ticket; reason: string };

export function planSyncActions(
	tickets: Ticket[],
	existingByHermesId: Map<string, KanbanTask>,
): SyncAction[] {
	const actions: SyncAction[] = [];
	for (const t of tickets) {
		const targetStatus = STATE_TO_KANBAN[t.state];
		if (!targetStatus) {
			actions.push({
				kind: "skip",
				ticket: t,
				reason: `no kanban mapping for state '${t.state}'`,
			});
			continue;
		}
		const hermesId = t.external_refs?.hermes_task_id;
		if (!hermesId) {
			actions.push({ kind: "create", ticket: t, targetStatus });
			continue;
		}
		const existing = existingByHermesId.get(hermesId);
		if (!existing) {
			// Cached id no longer exists on the board; re-create.
			actions.push({ kind: "create", ticket: t, targetStatus });
			continue;
		}
		if (existing.status === targetStatus) {
			actions.push({
				kind: "noop",
				ticket: t,
				hermesId,
				status: targetStatus,
			});
		} else {
			actions.push({
				kind: "update",
				ticket: t,
				hermesId,
				fromStatus: existing.status,
				toStatus: targetStatus,
			});
		}
	}
	return actions;
}

export async function applySyncActions(
	actions: SyncAction[],
	client: KanbanClient,
	onPersistId: (ticket: Ticket, hermesId: string) => void,
): Promise<{
	created: number;
	updated: number;
	skipped: number;
	noop: number;
}> {
	let created = 0;
	let updated = 0;
	let skipped = 0;
	let noop = 0;
	for (const a of actions) {
		if (a.kind === "create") {
			const task = await client.createTask({
				title: a.ticket.summary,
				body: a.ticket.description,
				idempotency_key: a.ticket.id,
			});
			onPersistId(a.ticket, task.id);
			if (task.status !== a.targetStatus) {
				await client.updateStatus(task.id, a.targetStatus);
			}
			created++;
		} else if (a.kind === "update") {
			await client.updateStatus(a.hermesId, a.toStatus);
			updated++;
		} else if (a.kind === "noop") {
			noop++;
		} else {
			skipped++;
		}
	}
	return { created, updated, skipped, noop };
}
