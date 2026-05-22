import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Regression for CI bug where `npm test` skipped the build, leaving every
// spawn-based test failing with "Cannot find module dist/cli.js". The
// `pretest` script in package.json should make this trivially true; this
// test fails loudly if that script is ever removed.
describe("dist/cli.js is built before tests run", () => {
	it("exists at dist/cli.js (built by the pretest hook)", () => {
		const cliPath = join(__dirname, "..", "dist", "cli.js");
		expect(existsSync(cliPath)).toBe(true);
	});
});
