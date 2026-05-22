import { execFileSync, spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	checkBranchHasTodoCommit,
	checkOnExpectedBranch,
	checkWorkingTreeClean,
	expectedBranchFor,
} from "../src/branch-guard.js";
import { DEFAULT_CONFIG } from "../src/config.js";
import { writeTicket } from "../src/ticket.js";
import type { Ticket } from "../src/types.js";
import {
	initGitRepo,
	makeCommit,
	makeTempDir,
	makeTicket,
	makeTodoDir,
	removeTempDir,
} from "./helpers.js";

function writeConfig(dir: string): void {
	writeFileSync(
		join(dir, ".todo", "config.json"),
		JSON.stringify(DEFAULT_CONFIG, null, 2),
		"utf8",
	);
}

function git(dir: string, args: string[]): string {
	return execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
}

describe("expectedBranchFor", () => {
	it("uses ticket.work.branch when set", () => {
		const t = makeTicket({
			id: "abc12345",
			work: {
				branch: "feature/custom",
				base_branch: "main",
				started_at: "x",
				started_by: "y",
			},
		});
		expect(expectedBranchFor(t)).toBe("feature/custom");
	});

	it("uses todo/<parent> when ticket has parent", () => {
		const t = makeTicket({
			id: "child001",
			relationships: { parent: "parent01" },
		});
		expect(expectedBranchFor(t)).toBe("todo/parent01");
	});

	it("defaults to todo/<id>", () => {
		const t = makeTicket({ id: "abc12345" });
		expect(expectedBranchFor(t)).toBe("todo/abc12345");
	});
});

describe("checkOnExpectedBranch", () => {
	it("ok when current branch matches", () => {
		const t = makeTicket({ id: "abc12345" });
		expect(checkOnExpectedBranch(t, "todo/abc12345").ok).toBe(true);
	});

	it("fails when on main", () => {
		const t = makeTicket({ id: "abc12345" });
		const res = checkOnExpectedBranch(t, "main");
		expect(res.ok).toBe(false);
		expect(res.message).toContain("todo/abc12345");
		expect(res.message).toContain("todo work");
	});

	it("fails on wrong todo branch", () => {
		const t = makeTicket({ id: "abc12345" });
		const res = checkOnExpectedBranch(t, "todo/wrongid1");
		expect(res.ok).toBe(false);
		expect(res.message).toContain("todo/abc12345");
	});

	it("ok for child on parent branch", () => {
		const t = makeTicket({
			id: "child001",
			relationships: { parent: "parent01" },
		});
		expect(checkOnExpectedBranch(t, "todo/parent01").ok).toBe(true);
	});
});

describe("checkBranchHasTodoCommit", () => {
	let dir: string;

	beforeEach(() => {
		dir = makeTempDir();
		initGitRepo(dir);
		makeTodoDir(dir);
		writeConfig(dir);
		makeCommit(dir, "seed.txt", "seed"); // need at least one commit on main
	});

	afterEach(() => {
		removeTempDir(dir);
	});

	it("fails when branch has no matching commit", () => {
		const t = makeTicket({ id: "abc12345" });
		writeTicket(dir, t);
		execFileSync("git", ["checkout", "-b", "todo/abc12345"], { cwd: dir });
		writeFileSync(join(dir, "code.txt"), "x", "utf8");
		execFileSync("git", ["add", "code.txt"], { cwd: dir });
		execFileSync("git", ["commit", "-m", "unprefixed work"], { cwd: dir });

		const res = checkBranchHasTodoCommit(t, dir, "todo:");
		expect(res.ok).toBe(false);
		expect(res.message).toContain("todo:abc12345");
	});

	it("passes when at least one commit has the prefix", () => {
		const t = makeTicket({ id: "abc12345" });
		writeTicket(dir, t);
		execFileSync("git", ["checkout", "-b", "todo/abc12345"], { cwd: dir });
		writeFileSync(join(dir, "code.txt"), "x", "utf8");
		execFileSync("git", ["add", "code.txt"], { cwd: dir });
		execFileSync("git", ["commit", "-m", "todo:abc12345 — fix the thing"], {
			cwd: dir,
		});

		const res = checkBranchHasTodoCommit(t, dir, "todo:");
		expect(res.ok).toBe(true);
	});

	it("respects ticket.work.base_branch", () => {
		const t: Ticket = makeTicket({
			id: "abc12345",
			work: {
				branch: "todo/abc12345",
				base_branch: "main",
				started_at: "x",
				started_by: "y",
			},
		});
		writeTicket(dir, t);
		execFileSync("git", ["checkout", "-b", "todo/abc12345"], { cwd: dir });
		writeFileSync(join(dir, "code.txt"), "x", "utf8");
		execFileSync("git", ["add", "code.txt"], { cwd: dir });
		execFileSync("git", ["commit", "-m", "todo:abc12345 — fix"], { cwd: dir });

		const res = checkBranchHasTodoCommit(t, dir, "todo:");
		expect(res.ok).toBe(true);
	});
});

describe("checkWorkingTreeClean", () => {
	let dir: string;

	beforeEach(() => {
		dir = makeTempDir();
		initGitRepo(dir);
		makeCommit(dir, "seed.txt", "seed");
	});

	afterEach(() => {
		removeTempDir(dir);
	});

	it("ok on clean tree", () => {
		expect(checkWorkingTreeClean(dir).ok).toBe(true);
	});

	it("fails on uncommitted changes", () => {
		writeFileSync(join(dir, "dirty.txt"), "dirty", "utf8");
		const res = checkWorkingTreeClean(dir);
		expect(res.ok).toBe(false);
		expect(res.message).toContain("uncommitted");
	});
});

// ---------------------------------------------------------------------------
// End-to-end: spawn the built CLI to verify exit codes and messages.
// ---------------------------------------------------------------------------

function todoCli(dir: string, args: string[]): {
	status: number;
	stdout: string;
	stderr: string;
} {
	const cliPath = join(__dirname, "..", "dist", "cli.js");
	const r = spawnSync("node", [cliPath, ...args], {
		cwd: dir,
		encoding: "utf8",
	});
	return {
		status: r.status ?? 1,
		stdout: r.stdout ?? "",
		stderr: r.stderr ?? "",
	};
}

describe("CLI close — branch guards (end-to-end)", () => {
	let dir: string;

	beforeEach(() => {
		dir = makeTempDir();
		initGitRepo(dir);
		makeTodoDir(dir);
		writeConfig(dir);
		makeCommit(dir, "seed.txt", "seed");
	});

	afterEach(() => {
		removeTempDir(dir);
	});

	it("refuses to close from main", () => {
		const t = makeTicket({
			id: "abc12345",
			type: "chore",
			state: "active",
			work: {
				branch: "todo/abc12345",
				base_branch: "main",
				started_at: new Date().toISOString(),
				started_by: "test",
			},
		});
		writeTicket(dir, t);

		const res = todoCli(dir, ["close", "abc12345", "--note", "wip"]);
		expect(res.status).toBe(1);
		expect(res.stderr).toContain("todo/abc12345");
		expect(res.stderr).toContain("todo work");
	});

	it("refuses to close when no commit has todo:<id>", () => {
		const t = makeTicket({
			id: "abc12345",
			type: "chore",
			state: "active",
			work: {
				branch: "todo/abc12345",
				base_branch: "main",
				started_at: new Date().toISOString(),
				started_by: "test",
			},
		});
		writeTicket(dir, t);
		git(dir, ["checkout", "-b", "todo/abc12345"]);
		writeFileSync(join(dir, "code.txt"), "x", "utf8");
		git(dir, ["add", "code.txt"]);
		git(dir, ["commit", "-m", "unprefixed"]);

		const res = todoCli(dir, ["close", "abc12345", "--note", "wip"]);
		expect(res.status).toBe(1);
		expect(res.stderr).toContain("todo:abc12345");
	});

	it("--force bypasses both guards", () => {
		const t = makeTicket({
			id: "abc12345",
			type: "chore",
			state: "active",
			work: {
				branch: "todo/abc12345",
				base_branch: "main",
				started_at: new Date().toISOString(),
				started_by: "test",
			},
		});
		writeTicket(dir, t);
		// Stay on main, no matching commit — both guards would fire.
		const res = todoCli(dir, [
			"close",
			"abc12345",
			"--force",
			"--note",
			"emergency",
		]);
		expect(res.status).toBe(0);
		expect(res.stderr).toContain("Warning: --force");
	});
});

describe("CLI work — dirty-tree guard (end-to-end)", () => {
	let dir: string;

	beforeEach(() => {
		dir = makeTempDir();
		initGitRepo(dir);
		makeTodoDir(dir);
		writeConfig(dir);
		makeCommit(dir, "seed.txt", "seed");
	});

	afterEach(() => {
		removeTempDir(dir);
	});

	it("refuses to leave a dirty todo/* branch for another ticket", () => {
		const a = makeTicket({ id: "aaaa1111", type: "chore" });
		const b = makeTicket({ id: "bbbb2222", type: "chore" });
		writeTicket(dir, a);
		writeTicket(dir, b);

		// Get onto todo/aaaa1111 with dirty tree.
		git(dir, ["checkout", "-b", "todo/aaaa1111"]);
		writeFileSync(join(dir, "wip.txt"), "wip", "utf8");

		const res = todoCli(dir, ["work", "bbbb2222"]);
		expect(res.status).toBe(1);
		expect(res.stderr).toContain("uncommitted");
		expect(res.stderr).toContain("todo/aaaa1111");
		expect(res.stderr).toContain("todo/bbbb2222");
	});
});
