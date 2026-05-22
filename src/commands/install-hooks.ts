import { Command } from "commander";
import { getCommitPrefix } from "../config.js";
import { getContext } from "../context.js";
import { handleError } from "../errors.js";
import {
	installHook,
	renderPrepareCommitMsg,
	uninstallHook,
} from "../hooks.js";

export function registerInstallHooks(program: Command): void {
	program
		.command("install-hooks")
		.description(
			"Install git hooks that enforce todo conventions (prepare-commit-msg auto-prefix)",
		)
		.option("--force", "overwrite hooks not managed by todo")
		.option("--uninstall", "remove managed hooks instead of installing")
		.action((opts) => {
			const ctx = getContext(true);
			const { repoRoot, config } = ctx;

			try {
				if (opts.uninstall) {
					const res = uninstallHook(repoRoot, "prepare-commit-msg", {
						force: !!opts.force,
					});
					if (res.action === "refused") {
						console.error(`Error: ${res.reason}`);
						process.exit(1);
					}
					console.log(
						res.reason
							? `prepare-commit-msg: ${res.reason} (${res.path})`
							: `removed ${res.path}`,
					);
					return;
				}

				const content = renderPrepareCommitMsg(getCommitPrefix(config));
				const res = installHook(repoRoot, "prepare-commit-msg", content, {
					force: !!opts.force,
				});
				if (res.action === "refused") {
					console.error(`Error: ${res.reason}`);
					process.exit(1);
				}
				console.log(`${res.action} ${res.path}`);
			} catch (err) {
				handleError(err);
			}
		});
}
