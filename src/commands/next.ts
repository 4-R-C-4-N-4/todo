import { Command } from "commander";
import { getContext } from "../context.js";
import { handleError } from "../errors.js";
import { getCurrentBranch, getDefaultBranch, getGitUserName } from "../git.js";
import { applyTransition } from "../state.js";
import { listTickets, readTicket, writeTicket } from "../ticket.js";

export function registerNext(program: Command): void {
	program
		.command("next <parent-id>")
		.description(
			"Activate the next open child of a parent ticket on the current branch (orchestrator mode)",
		)
		.option("--actor <name>", "override actor (also reads TODO_ACTOR env)")
		.action((parentId: string, opts) => {
			const ctx = getContext(true);
			const { repoRoot } = ctx;

			try {
				// Resolve actor
				let actor: string;
				if (opts.actor) {
					actor = opts.actor as string;
				} else if (process.env["TODO_ACTOR"]) {
					actor = process.env["TODO_ACTOR"];
				} else {
					try {
						actor = getGitUserName(repoRoot);
					} catch {
						actor = "unknown";
					}
				}

				// Load the parent ticket to get the children list (ordered by creation)
				const parent = readTicket(repoRoot, parentId);
				const children: string[] = parent.relationships?.children ?? [];

				if (children.length === 0) {
					console.error(`Error: ticket ${parent.id} has no children.`);
					process.exit(1);
				}

				// Find the first child that is not in a terminal state
				const openTickets = listTickets(repoRoot, "open");
				const openIds = new Set(openTickets.map((t) => t.id));

				const nextId = children.find((id) => openIds.has(id));

				if (!nextId) {
					console.error(
						`All children of ${parent.id} are done. Close the parent with: todo close ${parent.id}`,
					);
					process.exit(1);
				}

				// Activate the child on the current branch (--skip-branch semantics)
				const ticket = readTicket(repoRoot, nextId);
				const currentBranch = getCurrentBranch(repoRoot);
				const defaultBranch = getDefaultBranch(repoRoot);

				if (ticket.state !== "active") {
					const now = new Date().toISOString();
					let updated;
					try {
						updated = applyTransition(ticket, "active", { actor }, repoRoot);
					} catch (err) {
						console.error(`Error: ${(err as Error).message}`);
						process.exit(1);
					}
					updated.work = {
						branch: currentBranch,
						base_branch: defaultBranch,
						started_at: now,
						started_by: actor,
					};
					updated.updated_at = now;
					writeTicket(repoRoot, updated);
				}

				// Print the ticket ID on stdout — scriptable (while next=$(todo next <parent>))
				process.stdout.write(`${nextId}\n`);

				// Print summary on stderr so it doesn't pollute the captured value
				process.stderr.write(`Activated ${nextId}: ${ticket.summary}\n`);
			} catch (err) {
				handleError(err);
			}
		});
}
