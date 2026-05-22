import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import {
	createServer,
	type IncomingMessage,
	type Server,
	type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.js";
import {
	applySyncActions,
	makeKanbanClient,
	planSyncActions,
	resolveHermesConfig,
	STATE_TO_KANBAN,
} from "../src/hermes.js";
import { writeTicket } from "../src/ticket.js";
import type { Ticket } from "../src/types.js";
import {
	initGitRepo,
	makeCommit,
	makeTempDir,
	makeTicket,
	makeTodoDir,
	removeTempDir,
} from "./helpers.js";

interface RecordedRequest {
	method: string;
	url: string;
	body: string;
	auth?: string;
}

interface MockServer {
	url: string;
	requests: RecordedRequest[];
	close(): Promise<void>;
	tasks: Map<string, { id: string; title: string; status: string; body?: string }>;
}

async function startMockHermes(opts: {
	failNextN?: number;
	initialTasks?: Array<{ id: string; title: string; status: string }>;
} = {}): Promise<MockServer> {
	const requests: RecordedRequest[] = [];
	const tasks = new Map<
		string,
		{ id: string; title: string; status: string; body?: string }
	>();
	for (const t of opts.initialTasks ?? []) tasks.set(t.id, { ...t });
	let nextId = 1;
	let failsLeft = opts.failNextN ?? 0;

	const handler = async (req: IncomingMessage, res: ServerResponse) => {
		const chunks: Buffer[] = [];
		for await (const c of req) chunks.push(c as Buffer);
		const body = Buffer.concat(chunks).toString("utf8");
		requests.push({
			method: req.method ?? "",
			url: req.url ?? "",
			body,
			auth: req.headers.authorization,
		});
		// Force client to close the socket after this response so vitest's
		// afterEach close() doesn't have to wait on keep-alive timeouts.
		res.setHeader("Connection", "close");

		if (failsLeft > 0) {
			failsLeft--;
			res.statusCode = 500;
			res.end("simulated failure");
			return;
		}

		const url = req.url ?? "";
		// /api/plugins/kanban/board
		if (req.method === "GET" && url.startsWith("/api/plugins/kanban/board")) {
			const byStatus = new Map<string, typeof tasks extends Map<infer _, infer V> ? V[] : never>();
			for (const t of tasks.values()) {
				const arr = byStatus.get(t.status) ?? [];
				arr.push(t);
				byStatus.set(t.status, arr);
			}
			const columns: Array<{ name: string; tasks: typeof tasks extends Map<infer _, infer V> ? V[] : never }> = [];
			for (const [name, ts] of byStatus.entries()) columns.push({ name, tasks: ts });
			res.setHeader("Content-Type", "application/json");
			res.end(JSON.stringify({ columns }));
			return;
		}
		// /api/plugins/kanban/tasks/<id>
		const taskMatch = url.match(/^\/api\/plugins\/kanban\/tasks\/([^?]+)/);
		if (taskMatch) {
			const id = decodeURIComponent(taskMatch[1] as string);
			if (req.method === "GET") {
				const t = tasks.get(id);
				if (!t) {
					res.statusCode = 404;
					res.end("not found");
					return;
				}
				res.setHeader("Content-Type", "application/json");
				res.end(JSON.stringify({ task: t }));
				return;
			}
			if (req.method === "PATCH") {
				const t = tasks.get(id);
				if (!t) {
					res.statusCode = 404;
					res.end("not found");
					return;
				}
				const payload = JSON.parse(body) as { status?: string };
				if (payload.status) t.status = payload.status;
				res.setHeader("Content-Type", "application/json");
				res.end(JSON.stringify({ task: t }));
				return;
			}
		}
		// /api/plugins/kanban/tasks (POST)
		if (req.method === "POST" && url.startsWith("/api/plugins/kanban/tasks")) {
			const payload = JSON.parse(body) as {
				title: string;
				body?: string;
				idempotency_key?: string;
			};
			// Idempotency: if a task with the same idempotency key already exists,
			// return it. We're keying tasks by their generated id; track keys.
			const idkey = payload.idempotency_key;
			if (idkey) {
				for (const t of tasks.values()) {
					if ((t as { idempotency_key?: string }).idempotency_key === idkey) {
						res.setHeader("Content-Type", "application/json");
						res.end(JSON.stringify({ task: t }));
						return;
					}
				}
			}
			const id = `t_${nextId++}`;
			const created = {
				id,
				title: payload.title,
				status: "todo",
				body: payload.body,
				idempotency_key: idkey,
			};
			tasks.set(id, created);
			res.setHeader("Content-Type", "application/json");
			res.end(JSON.stringify({ task: created }));
			return;
		}

		res.statusCode = 404;
		res.end("unhandled");
	};

	const server: Server = createServer((req, res) => {
		handler(req, res).catch((err: unknown) => {
			res.statusCode = 500;
			res.end(String(err));
		});
	});
	await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
	const addr = server.address() as AddressInfo;
	const url = `http://127.0.0.1:${addr.port}`;
	return {
		url,
		requests,
		tasks,
		close: () =>
			new Promise<void>((r) => {
				// Drop any keep-alive sockets so close() doesn't wait on them.
				const s = server as Server & {
					closeAllConnections?: () => void;
				};
				s.closeAllConnections?.();
				server.close(() => r());
			}),
	};
}

describe("STATE_TO_KANBAN", () => {
	it("maps every State to a non-empty Kanban column", () => {
		for (const k of Object.keys(STATE_TO_KANBAN)) {
			expect(STATE_TO_KANBAN[k as keyof typeof STATE_TO_KANBAN]).toBeTruthy();
		}
		expect(STATE_TO_KANBAN.open).toBe("todo");
		expect(STATE_TO_KANBAN.active).toBe("running");
		expect(STATE_TO_KANBAN.blocked).toBe("blocked");
		expect(STATE_TO_KANBAN.done).toBe("done");
		expect(STATE_TO_KANBAN.wontfix).toBe("archived");
		expect(STATE_TO_KANBAN.duplicate).toBe("archived");
	});
});

describe("resolveHermesConfig", () => {
	it("rejects when config missing entirely", () => {
		const res = resolveHermesConfig(undefined, {});
		expect("error" in res).toBe(true);
		if ("error" in res) expect(res.error).toContain("hermes");
	});

	it("pulls session_token from env when absent from config", () => {
		const res = resolveHermesConfig(
			{ dashboard_url: "http://x", board: "b" },
			{ HERMES_SESSION_TOKEN: "from-env" },
		);
		expect("session_token" in res && res.session_token).toBe("from-env");
	});

	it("--board overrides config board", () => {
		const res = resolveHermesConfig(
			{ dashboard_url: "http://x", board: "configured", session_token: "t" },
			{},
			"override",
		);
		expect("board" in res && res.board).toBe("override");
	});

	it("strips trailing slash from dashboard_url", () => {
		const res = resolveHermesConfig(
			{ dashboard_url: "http://x/", board: "b", session_token: "t" },
			{},
		);
		expect("dashboard_url" in res && res.dashboard_url).toBe("http://x");
	});
});

describe("planSyncActions", () => {
	it("plans 'create' for tickets without a hermes_task_id", () => {
		const t = makeTicket({ id: "aa", state: "open" });
		const actions = planSyncActions([t], new Map());
		expect(actions[0]?.kind).toBe("create");
	});

	it("plans 'update' when cached id exists but status differs", () => {
		const t = makeTicket({
			id: "aa",
			state: "active",
			external_refs: { hermes_task_id: "t_1" },
		});
		const existing = new Map([
			["t_1", { id: "t_1", title: "x", status: "todo" }],
		]);
		const actions = planSyncActions([t], existing);
		expect(actions[0]?.kind).toBe("update");
		if (actions[0]?.kind === "update") {
			expect(actions[0].toStatus).toBe("running");
		}
	});

	it("plans 'noop' when status already matches", () => {
		const t = makeTicket({
			id: "aa",
			state: "done",
			external_refs: { hermes_task_id: "t_1" },
		});
		const existing = new Map([
			["t_1", { id: "t_1", title: "x", status: "done" }],
		]);
		const actions = planSyncActions([t], existing);
		expect(actions[0]?.kind).toBe("noop");
	});

	it("falls back to 'create' if cached id was deleted server-side", () => {
		const t = makeTicket({
			id: "aa",
			state: "open",
			external_refs: { hermes_task_id: "t_orphan" },
		});
		const actions = planSyncActions([t], new Map());
		expect(actions[0]?.kind).toBe("create");
	});
});

describe("applySyncActions (against mock Hermes)", () => {
	let server: MockServer;

	beforeEach(async () => {
		server = await startMockHermes();
	});

	afterEach(async () => {
		await server.close();
	});

	it("POSTs new tickets and persists hermes_task_id", async () => {
		const client = makeKanbanClient({
			dashboard_url: server.url,
			board: "b",
			session_token: "tok",
		});
		const t: Ticket = makeTicket({ id: "aaaa", state: "active" });
		const persisted: Array<{ ticket: Ticket; hermesId: string }> = [];
		const actions = planSyncActions([t], new Map());
		const stats = await applySyncActions(actions, client, (ticket, hermesId) =>
			persisted.push({ ticket, hermesId }),
		);
		expect(stats.created).toBe(1);
		expect(persisted).toHaveLength(1);
		expect(persisted[0]?.hermesId).toMatch(/^t_/);
		// POST was made and Authorization header forwarded.
		const post = server.requests.find((r) => r.method === "POST");
		expect(post?.auth).toBe("Bearer tok");
		const payload = JSON.parse(post?.body ?? "{}");
		expect(payload.idempotency_key).toBe("aaaa");
		// And a PATCH followed to move it from todo → running.
		const patch = server.requests.find((r) => r.method === "PATCH");
		expect(patch).toBeTruthy();
		expect(JSON.parse(patch?.body ?? "{}").status).toBe("running");
	});

	it("PATCHes existing tickets when status changes", async () => {
		const client = makeKanbanClient({
			dashboard_url: server.url,
			board: "b",
			session_token: "tok",
		});
		// Pre-seed the server with a task and reference it from the ticket.
		server.tasks.set("t_99", { id: "t_99", title: "x", status: "todo" });
		const t: Ticket = makeTicket({
			id: "aaaa",
			state: "blocked",
			external_refs: { hermes_task_id: "t_99" },
		});
		const existing = new Map([
			["t_99", { id: "t_99", title: "x", status: "todo" }],
		]);
		const actions = planSyncActions([t], existing);
		const stats = await applySyncActions(actions, client, () => {});
		expect(stats.updated).toBe(1);
		const patch = server.requests.find((r) => r.method === "PATCH");
		expect(JSON.parse(patch?.body ?? "{}").status).toBe("blocked");
	});
});

// ---------------------------------------------------------------------------
// End-to-end: `todo sync` against a mock Hermes server.
// ---------------------------------------------------------------------------

function todoCli(
	dir: string,
	args: string[],
	env: NodeJS.ProcessEnv = {},
): Promise<{ status: number; stdout: string; stderr: string }> {
	// IMPORTANT: must be async (spawn, not spawnSync). spawnSync blocks the
	// vitest worker, deadlocking against any in-process mock server the
	// subprocess is trying to reach on the same event loop.
	const cliPath = join(__dirname, "..", "dist", "cli.js");
	return new Promise((resolve) => {
		const child = spawn("node", [cliPath, ...args], {
			cwd: dir,
			env: { ...process.env, ...env },
		});
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (d) => {
			stdout += d.toString();
		});
		child.stderr.on("data", (d) => {
			stderr += d.toString();
		});
		child.on("close", (code) => {
			resolve({ status: code ?? 1, stdout, stderr });
		});
	});
}

describe("CLI sync (end-to-end)", () => {
	let dir: string;
	let server: MockServer;

	beforeEach(async () => {
		dir = makeTempDir();
		initGitRepo(dir);
		makeTodoDir(dir);
		makeCommit(dir, "seed.txt", "x");
		server = await startMockHermes();
		writeFileSync(
			join(dir, ".todo", "config.json"),
			JSON.stringify(
				{
					...DEFAULT_CONFIG,
					hermes: {
						dashboard_url: server.url,
						board: "test-board",
						session_token: "tok",
					},
				},
				null,
				2,
			),
			"utf8",
		);
	});

	afterEach(async () => {
		await server.close();
		removeTempDir(dir);
	});

	it("errors clearly when hermes config missing", async () => {
		writeFileSync(
			join(dir, ".todo", "config.json"),
			JSON.stringify(DEFAULT_CONFIG, null, 2),
			"utf8",
		);
		const t = makeTicket({ id: "aaaa1111", state: "open" });
		writeTicket(dir, t);

		const res = await todoCli(dir, ["sync"]);
		expect(res.status).toBe(1);
		expect(res.stderr).toContain("Hermes");
	});

	it("--dry-run makes no requests", async () => {
		const t = makeTicket({ id: "aaaa1111", state: "open" });
		writeTicket(dir, t);

		const res = await todoCli(dir, ["sync", "--dry-run"]);
		expect(res.status).toBe(0);
		expect(server.requests).toHaveLength(0);
		expect(res.stdout).toContain("create aaaa1111");
	});

	it("creates new tasks and persists hermes_task_id back into the ticket", async () => {
		const t = makeTicket({ id: "aaaa1111", state: "active" });
		writeTicket(dir, t);

		const res = await todoCli(dir, ["sync"]);
		expect(res.status).toBe(0);
		const after = JSON.parse(
			require("node:fs").readFileSync(
				join(dir, ".todo", "open", "aaaa1111.json"),
				"utf8",
			),
		) as Ticket;
		expect(after.external_refs?.hermes_task_id).toMatch(/^t_/);
		expect(after.external_refs?.hermes_board).toBe("test-board");
	});

	it("--quiet suppresses per-action output", async () => {
		const t = makeTicket({ id: "aaaa1111", state: "open" });
		writeTicket(dir, t);

		const res = await todoCli(dir, ["sync", "--quiet"]);
		expect(res.status).toBe(0);
		expect(res.stdout).toBe("");
	});
});
