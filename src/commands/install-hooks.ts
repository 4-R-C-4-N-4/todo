import { Command } from "commander";
import { getCommitPrefix } from "../config.js";
import { getContext } from "../context.js";
import { handleError } from "../errors.js";
import {
	type HookName,
	type InstallResult,
	installHook,
	renderPostCommit,
	renderPrepareCommitMsg,
	uninstallHook,
} from "../hooks.js";
import type { Config } from "../types.js";

function reportInstall(name: HookName, res: InstallResult): boolean {
	if (res.action === "refused") {
		console.error(`Error: ${res.reason}`);
		return false;
	}
	console.log(`${name}: ${res.action} ${res.path}`);
	return true;
}

function reportUninstall(name: HookName, res: InstallResult): boolean {
	if (res.action === "refused") {
		console.error(`Error: ${res.reason}`);
		return false;
	}
	console.log(
		res.reason
			? `${name}: ${res.reason} (${res.path})`
			: `${name}: removed ${res.path}`,
	);
	return true;
}

function selectHooks(opts: {
	withSync?: boolean;
	onlySync?: boolean;
}): HookName[] {
	if (opts.onlySync) return ["post-commit"];
	if (opts.withSync) return ["prepare-commit-msg", "post-commit"];
	return ["prepare-commit-msg"];
}

function renderHook(name: HookName, config: Config): string {
	if (name === "prepare-commit-msg") {
		return renderPrepareCommitMsg(getCommitPrefix(config));
	}
	return renderPostCommit();
}

export function registerInstallHooks(program: Command): void {
	program
		.command("install-hooks")
		.description(
			"Install git hooks enforcing todo conventions (prepare-commit-msg, optionally post-commit auto-sync)",
		)
		.option("--force", "overwrite hooks not managed by todo")
		.option("--uninstall", "remove managed hooks instead of installing")
		.option(
			"--with-sync",
			"also install the post-commit hook that runs `todo sync --quiet` after each commit",
		)
		.option(
			"--only-sync",
			"install or uninstall only the post-commit auto-sync hook (skip prepare-commit-msg)",
		)
		.action((opts) => {
			const ctx = getContext(true);
			const { repoRoot, config } = ctx;

			try {
				const hooks = selectHooks(opts);
				let failed = false;

				for (const name of hooks) {
					if (opts.uninstall) {
						const res = uninstallHook(repoRoot, name, {
							force: !!opts.force,
						});
						if (!reportUninstall(name, res)) failed = true;
					} else {
						const content = renderHook(name, config);
						const res = installHook(repoRoot, name, content, {
							force: !!opts.force,
						});
						if (!reportInstall(name, res)) failed = true;
					}
				}

				if (failed) process.exit(1);
			} catch (err) {
				handleError(err);
			}
		});
}
