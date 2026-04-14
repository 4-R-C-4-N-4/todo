import { Command } from "commander";
import { getContext } from "../context.js";
import { handleError } from "../errors.js";
import {
	branchExists,
	checkoutBranch,
	createBranch,
	getCommitsAhead,
	getCurrentBranch,
	getDefaultBranch,
	getGitUserName,
	isAncestor,
} from "../git.js";
import { applyTransition } from "../state.js";
import {
	readTicket,
	readTicketByPrefix,
	TERMINAL_STATES,
	writeTicket,
} from "../ticket.js";

export function registerWork(program: Command): void {
	program
		.command("work <id>")
		.description("Start or resume work on a ticket")
		.option("--branch <name>", "override branch name")
		.option("--skip-branch", "activate ticket without any git branch operations (orchestrator mode)")
		.option("--actor <name>", "override actor (also reads TODO_ACTOR env)")
		.action((id: string, opts) => {
			const ctx = getContext(true);
			const { repoRoot } = ctx;

			try {
				const ticket = readTicketByPrefix(repoRoot, id);

				// Check not terminal
				if (TERMINAL_STATES.includes(ticket.state)) {
					console.error(
						`Error: ticket ${ticket.id} is in terminal state '${ticket.state}'. Cannot work on it.`,
					);
					process.exit(1);
				}

				// Resolve branch name
				let branch: string;
				if (opts.branch) {
					branch = opts.branch as string;
				} else if (ticket.relationships?.parent) {
					branch = `todo/${ticket.relationships.parent}`;
				} else {
					branch = `todo/${ticket.id}`;
				}

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

				const defaultBranch = getDefaultBranch(repoRoot);

				if (opts.skipBranch) {
					// --no-branch: orchestrator mode — activate on current branch without any git ops
					const currentBranch = getCurrentBranch(repoRoot);
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
					console.log(
						`Activated ticket ${ticket.id} on current branch ${currentBranch}.`,
					);
				} else if (branchExists(branch, repoRoot)) {
					// Resume
					checkoutBranch(branch, repoRoot);

					// Ensure ticket is active
					if (ticket.state !== "active") {
						const params = { actor };
						try {
							const updated = applyTransition(
								ticket,
								"active",
								params,
								repoRoot,
							);
							writeTicket(repoRoot, updated);
						} catch {
							// if transition fails (e.g. already done), just proceed
						}
					}

					let ahead: number;
					try {
						ahead = getCommitsAhead(branch, defaultBranch, repoRoot);
					} catch {
						ahead = 0;
					}

					console.log(
						`Resumed branch ${branch} — ticket ${ticket.id} is active. Branch has ${ahead} commits ahead of ${defaultBranch}.`,
					);
				} else {
					// New branch
					const now = new Date().toISOString();
					const params = {
						actor,
					};

					let updated;
					try {
						updated = applyTransition(ticket, "active", params, repoRoot);
					} catch (err) {
						console.error(`Error: ${(err as Error).message}`);
						process.exit(1);
					}

					// Populate work block
					updated.work = {
						branch,
						base_branch: defaultBranch,
						started_at: now,
						started_by: actor,
					};
					updated.updated_at = now;

					writeTicket(repoRoot, updated);
					createBranch(branch, repoRoot);

					console.log(
						`Created branch ${branch} — ticket ${ticket.id} is now active.`,
					);
				}

				// Check depends_on: warn if dep commit not ancestor of HEAD
				const deps = ticket.relationships?.depends_on ?? [];
				for (const depId of deps) {
					try {
						const dep = readTicket(repoRoot, depId);
						if (dep.resolution?.commit) {
							const depCommit = dep.resolution.commit;
							try {
								if (!isAncestor(depCommit, "HEAD", repoRoot)) {
									console.error(
										`Warning: dependency ${depId} resolved at ${depCommit} is not an ancestor of HEAD`,
									);
								}
							} catch {
								// ignore ancestor check failures
							}
						}
					} catch {
						// ignore dep lookup failures
					}
				}
			} catch (err) {
				handleError(err);
			}
		});
}
