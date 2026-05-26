import { Command } from "commander";
import { getContext } from "../context.js";
import { handleError } from "../errors.js";
import { getCurrentBranch } from "../git.js";
import { branchToTicketId, defaultPrEnv, runPr } from "../pr.js";
import { readTicket } from "../ticket.js";

export function registerPr(program: Command): void {
	program
		.command("pr")
		.description(
			"Push the current todo/<id> branch and open (or update) a GitHub PR",
		)
		.option("--base <branch>", "PR base branch (default: repo default)")
		.option("--draft", "open the PR as a draft")
		.action((opts) => {
			const ctx = getContext(true);
			const { repoRoot } = ctx;

			try {
				let branch: string;
				try {
					branch = getCurrentBranch(repoRoot);
				} catch {
					console.error(
						"Error: could not resolve current branch (detached HEAD?).",
					);
					process.exit(1);
				}

				const id = branchToTicketId(branch);
				if (!id) {
					console.error(
						`Error: not on a todo/<id> branch (HEAD is on '${branch}').\n` +
							"  Run `todo work <id>` first.",
					);
					process.exit(1);
				}

				let ticket;
				try {
					ticket = readTicket(repoRoot, id);
				} catch {
					console.error(
						`Error: branch '${branch}' references ticket '${id}' but no .todo/ ` +
							"file exists for it. Was it deleted?",
					);
					process.exit(1);
				}

				const outcome = runPr(
					repoRoot,
					branch,
					ticket,
					{ base: opts.base as string | undefined, draft: !!opts.draft },
					defaultPrEnv(repoRoot),
				);

				if (outcome.kind === "error") {
					console.error(`Error: ${outcome.message}`);
					process.exit(1);
				}

				console.log(
					outcome.kind === "created"
						? `Opened PR: ${outcome.url}`
						: `Updated PR: ${outcome.url}`,
				);
			} catch (err) {
				handleError(err);
			}
		});
}
