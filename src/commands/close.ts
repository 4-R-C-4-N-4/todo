import { Command } from "commander";
import {
	checkBranchHasTodoCommit,
	checkOnExpectedBranch,
	isParentWithAllChildrenClosed,
} from "../branch-guard.js";
import { getBranchMode, getCommitPrefix, getGuardMode } from "../config.js";
import { getContext } from "../context.js";
import { handleError } from "../errors.js";
import {
	checkoutBranch,
	commitTodoState,
	getCurrentBranch,
	getDefaultBranch,
	resolveHEAD,
} from "../git.js";
import { applyTransition } from "../state.js";
import { readTicketByPrefix, writeTicket } from "../ticket.js";

export function registerClose(program: Command): void {
	program
		.command("close <id>")
		.description("Shorthand for transition to done")
		.option("--commit <sha>", "resolution commit (default: HEAD)")
		.option("--test <file::func>", "test file and function (colon-separated)")
		.option("--note <text>", "resolution note")
		.option("--checkout", "git checkout base_branch after closing")
		.option(
			"--commit-state",
			"atomically git-commit the .todo/ state change (no separate manual commit needed)",
		)
		.option("--force", "skip branch and commit-message guards")
		.action((id: string, opts) => {
			const ctx = getContext(true);
			const { repoRoot, config } = ctx;

			try {
				const ticket = readTicketByPrefix(repoRoot, id);
				const managed = getBranchMode(config) === "managed";
				const strict = getGuardMode(config) === "strict";

				// Branch-convention guards. Skipped entirely in managed mode (the
				// user owns branching) or with --force. Otherwise they are advisory
				// by default — warn and proceed — and only hard-fail when the
				// project opts into behavior.guard_mode = "strict". This keeps the
				// tool from litigating a workflow you are not using, while still
				// letting agent-driven repos enforce the conventions.
				if (!opts.force && !managed) {
					// Report a guard failure at the configured severity. In strict
					// mode it exits 1; otherwise it warns and execution continues.
					const reportGuard = (message: string) => {
						if (strict) {
							console.error(`Error: ${message}`);
							process.exit(1);
						}
						console.error(`Warning: ${message} (advisory — proceeding)`);
					};

					let currentBranch = "";
					try {
						currentBranch = getCurrentBranch(repoRoot);
					} catch {
						// Detached HEAD or other; treat as a branch mismatch.
					}
					const branchCheck = checkOnExpectedBranch(ticket, currentBranch);
					if (!branchCheck.ok) reportGuard(branchCheck.message ?? "");

					// The commit-prefix grep is a heuristic over commit messages, not
					// the real done-contract (commit-exists + test/note, enforced in
					// state.ts). An explicit --commit names the deliverable, so skip
					// it; a parent with all children closed carries no commit of its
					// own.
					if (!opts.commit && !isParentWithAllChildrenClosed(ticket, repoRoot)) {
						const commitCheck = checkBranchHasTodoCommit(
							ticket,
							repoRoot,
							getCommitPrefix(config),
						);
						if (!commitCheck.ok) {
							reportGuard(
								`${commitCheck.message} Pass --commit <sha> to point close at the deliverable`,
							);
						}
					}
				} else if (opts.force) {
					console.error("Warning: --force used; skipping branch guards.");
				}

				// Resolve commit
				let commit: string;
				if (opts.commit) {
					commit = opts.commit as string;
				} else {
					try {
						commit = resolveHEAD(repoRoot);
					} catch {
						console.error("Error: could not resolve HEAD commit");
						process.exit(1);
					}
				}

				// Parse --test
				let testFile: string | undefined;
				let testFunction: string | undefined;
				if (opts.test) {
					const parts = (opts.test as string).split("::");
					testFile = parts[0];
					testFunction = parts[1];
				}

				const params = {
					commit,
					test_file: testFile,
					test_function: testFunction,
					note: opts.note as string | undefined,
				};

				let updated;
				try {
					updated = applyTransition(ticket, "done", params, repoRoot);
				} catch (err) {
					console.error(`Error: ${(err as Error).message}`);
					process.exit(1);
				}

				writeTicket(repoRoot, updated);
				console.log(`Closed ${updated.id}`);

				// Atomically record the state change. This only runs once the
				// close has already succeeded on disk, so the "close" commit can
				// never describe a ticket that did not actually close — the
				// phantom-commit hazard of a manual `git commit` after a failed
				// close. Runs before --checkout so the commit lands on the ticket
				// branch before switching away.
				if (opts.commitState || managed) {
					const message = `${getCommitPrefix(config)}${updated.id} — close`;
					try {
						commitTodoState(message, repoRoot);
						console.log(`Recorded .todo/ state: ${message}`);
					} catch (err) {
						console.error(
							`Warning: closed ${updated.id} but could not commit .todo/ state: ${(err as Error).message}\n` +
								"  Commit it manually: git add -A .todo && git commit",
						);
					}
				}

				// Checkout base branch if requested
				if (opts.checkout) {
					const targetBranch =
						updated.work?.base_branch ?? getDefaultBranch(repoRoot);
					try {
						checkoutBranch(targetBranch, repoRoot);
					} catch (err) {
						console.error(
							`Warning: could not checkout branch '${targetBranch}': ${(err as Error).message}`,
						);
					}
				}
			} catch (err) {
				handleError(err);
			}
		});
}
