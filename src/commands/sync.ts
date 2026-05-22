import { Command } from "commander";
import { getContext } from "../context.js";
import { handleError } from "../errors.js";
import type { KanbanTask, SyncAction } from "../hermes.js";
import {
	applySyncActions,
	makeKanbanClient,
	planSyncActions,
	resolveHermesConfig,
} from "../hermes.js";
import { listTickets, writeTicket } from "../ticket.js";
import type { Ticket } from "../types.js";

function summariseAction(a: SyncAction): string {
	if (a.kind === "create") {
		return `+ create ${a.ticket.id} (${a.ticket.state}) → ${a.targetStatus}`;
	}
	if (a.kind === "update") {
		return `~ update ${a.ticket.id} ${a.fromStatus} → ${a.toStatus}`;
	}
	if (a.kind === "noop") {
		return `= ${a.ticket.id} unchanged (${a.status})`;
	}
	return `! skip ${a.ticket.id}: ${a.reason}`;
}

export function registerSync(program: Command): void {
	program
		.command("sync")
		.description("Push ticket state to a Hermes Kanban board")
		.option("--dry-run", "show what would change without contacting Hermes")
		.option("--quiet", "only print errors")
		.option("--board <slug>", "override the configured board slug")
		.action(async (opts) => {
			const ctx = getContext(true);
			const { repoRoot, config } = ctx;

			try {
				const resolved = resolveHermesConfig(
					config.hermes,
					process.env,
					opts.board as string | undefined,
				);
				if ("error" in resolved) {
					console.error(`Error: ${resolved.error}`);
					process.exit(1);
				}

				const open = listTickets(repoRoot, "open");
				const done = listTickets(repoRoot, "done");
				const tickets: Ticket[] = [...open, ...done];

				const client = makeKanbanClient(resolved);

				const existingByHermesId: Map<string, KanbanTask> = new Map();
				if (!opts.dryRun) {
					const board = await client.getBoard();
					for (const col of board.columns) {
						for (const task of col.tasks) {
							// Tasks come back with their per-column status; trust it.
							existingByHermesId.set(task.id, { ...task, status: col.name });
						}
					}
				} else {
					// In dry-run we can't reach the server; treat ids we have cached
					// in tickets as existing (best-effort preview only).
					for (const t of tickets) {
						const hid = t.external_refs?.hermes_task_id;
						if (hid) {
							existingByHermesId.set(hid, {
								id: hid,
								title: t.summary,
								status: "?",
							});
						}
					}
				}

				const actions = planSyncActions(tickets, existingByHermesId);

				if (!opts.quiet) {
					for (const a of actions) console.log(summariseAction(a));
				}

				if (opts.dryRun) {
					if (!opts.quiet) console.log("(dry run — no requests made)");
					return;
				}

				const stats = await applySyncActions(
					actions,
					client,
					(ticket, hermesId) => {
						const refs = ticket.external_refs ?? {};
						refs.hermes_task_id = hermesId;
						refs.hermes_board = resolved.board;
						ticket.external_refs = refs;
						ticket.updated_at = new Date().toISOString();
						writeTicket(repoRoot, ticket);
					},
				);

				if (!opts.quiet) {
					console.log(
						`done: ${stats.created} created, ${stats.updated} updated, ` +
							`${stats.noop} unchanged, ${stats.skipped} skipped`,
					);
				}
				// fetch keep-alive sockets can hold the event loop open for ~30s
				// past completion; for a CLI we want a snappy exit.
				process.exit(0);
			} catch (err) {
				handleError(err);
			}
		});
}
