import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scanComments } from "../src/scan.js";
import { makeTempDir, removeTempDir } from "./helpers.js";

let dir: string;
beforeEach(() => {
	dir = makeTempDir();
});
afterEach(() => {
	removeTempDir(dir);
});

const write = (rel: string, content: string) => {
	const full = join(dir, rel);
	mkdirSync(dirname(full), { recursive: true });
	writeFileSync(full, content, "utf8");
};

describe("scanComments", () => {
	it("finds a // TODO in a .ts file with keyword, text, and 1-indexed line", () => {
		write("src/a.ts", "const x = 1;\n// TODO: refactor this\n");
		const m = scanComments(dir, ["TODO", "FIXME"], []);
		expect(m).toHaveLength(1);
		expect(m[0]).toMatchObject({
			keyword: "TODO",
			text: "refactor this",
			line: 2,
		});
		expect(m[0].file).toMatch(/a\.ts$/);
	});

	it("finds a # FIXME in a .py file", () => {
		write("b.py", "# FIXME: broken\n");
		const m = scanComments(dir, ["FIXME"], []);
		expect(m).toHaveLength(1);
		expect(m[0]).toMatchObject({ keyword: "FIXME", text: "broken", line: 1 });
	});

	it("finds an <!-- HACK --> in an .html file, stripping the close marker", () => {
		write("c.html", "<!-- HACK: temporary -->\n");
		const m = scanComments(dir, ["HACK"], []);
		expect(m).toHaveLength(1);
		expect(m[0]).toMatchObject({ keyword: "HACK", text: "temporary" });
	});

	it("matches patterns case-insensitively", () => {
		write("d.ts", "// todo: lowercase marker\n");
		expect(scanComments(dir, ["TODO"], [])).toHaveLength(1);
	});

	it("skips files with no known comment style (.txt)", () => {
		write("notes.txt", "TODO: not a comment\n");
		expect(scanComments(dir, ["TODO"], [])).toHaveLength(0);
	});

	it("ignores a keyword that is not inside a comment", () => {
		write("e.ts", "const TODO = 1;\n");
		expect(scanComments(dir, ["TODO"], [])).toHaveLength(0);
	});

	it("respects the exclude list", () => {
		write("node_modules/pkg/x.ts", "// TODO: in a dep\n");
		write("src/y.ts", "// TODO: real\n");
		const m = scanComments(dir, ["TODO"], ["node_modules"]);
		expect(m).toHaveLength(1);
		expect(m[0].file).toMatch(/y\.ts$/);
	});
});
