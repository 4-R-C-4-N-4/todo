import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Regression: cli.ts used to hardcode '1.0.0', drifting from package.json
// (which the npm publisher actually bumps). `todo --version` should always
// reflect the installed package's version.
describe("`todo --version` matches package.json", () => {
	it("prints the version field from package.json", () => {
		const repoRoot = join(__dirname, "..");
		const pkg = JSON.parse(
			readFileSync(join(repoRoot, "package.json"), "utf8"),
		) as { version: string };
		const cliPath = join(repoRoot, "dist", "cli.js");
		const r = spawnSync("node", [cliPath, "--version"], { encoding: "utf8" });
		expect(r.status).toBe(0);
		expect(r.stdout.trim()).toBe(pkg.version);
	});
});
