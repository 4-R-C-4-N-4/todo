import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Command } from "commander";
import { DEFAULT_CONFIG, ensureTodoDir, getTodoDir } from "../config.js";
import { getRepoRoot, isGitRepo } from "../git.js";

export function registerInit(program: Command): void {
	program
		.command("init")
		.description("Initialize todo in the current git repository")
		.action(() => {
			if (!isGitRepo()) {
				console.error("Error: not a git repository");
				process.exit(3);
			}
			const repoRoot = getRepoRoot();
			ensureTodoDir(repoRoot);
			const configPath = join(getTodoDir(repoRoot), "config.json");
			if (!existsSync(configPath)) {
				writeFileSync(
					configPath,
					JSON.stringify(DEFAULT_CONFIG, null, 2),
					"utf8",
				);
				console.log("Initialized .todo/ in " + repoRoot);
				console.log("Remember to commit .todo/ to your repository.");
			} else {
				console.log(".todo/ already initialized.");
			}
		});
}
