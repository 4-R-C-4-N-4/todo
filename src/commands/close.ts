import { Command } from "commander";
import {
	checkBranchHasTodoCommit,
	checkOnExpectedBranch,
} from "../branch-guard.js";
import { getCommitPrefix } from "../config.js";
import { getContext } from "../context.js";
import { handleError } from "../errors.js";
import {
	checkoutBranch,
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
		.option("--force", "skip branch and commit-message guards")
		.action((id: string, opts) => {
			const ctx = getContext(true);
			const { repoRoot, config } = ctx;

			try {
				const ticket = readTicketByPrefix(repoRoot, id);

				// Branch-convention guards (skippable with --force).
				if (!opts.force) {
					let currentBranch = "";
					try {
						currentBranch = getCurrentBranch(repoRoot);
					} catch {
						// Detached HEAD or other; treat as a branch mismatch.
					}
					const branchCheck = checkOnExpectedBranch(ticket, currentBranch);
					if (!branchCheck.ok) {
						console.error(`Error: ${branchCheck.message}`);
						process.exit(1);
					}
					const commitCheck = checkBranchHasTodoCommit(
						ticket,
						repoRoot,
						getCommitPrefix(config),
					);
					if (!commitCheck.ok) {
						console.error(`Error: ${commitCheck.message}`);
						process.exit(1);
					}
				} else {
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
