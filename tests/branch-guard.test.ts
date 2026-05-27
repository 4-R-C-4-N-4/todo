import { execFileSync, spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	checkBranchHasTodoCommit,
	checkOnExpectedBranch,
	checkWorkingTreeClean,
	expectedBranchFor,
	isParentWithAllChildrenClosed,
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

function writeConfig(
	dir: string,
	behavior: Record<string, unknown> = {},
): void {
	const cfg = {
		...DEFAULT_CONFIG,
		behavior: { ...DEFAULT_CONFIG.behavior, ...behavior },
	};
	writeFileSync(
		join(dir, ".todo", "config.json"),
		JSON.stringify(cfg, null, 2),
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

describe("isParentWithAllChildrenClosed", () => {
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

	it("returns false for tickets with no children", () => {
		const t = makeTicket({ id: "lone0001" });
		writeTicket(dir, t);
		expect(isParentWithAllChildrenClosed(t, dir)).toBe(false);
	});

	it("returns true when every child is in a terminal state", () => {
		const c1 = makeTicket({ id: "child001", state: "done" });
		const c2 = makeTicket({ id: "child002", state: "wontfix" });
		const c3 = makeTicket({ id: "child003", state: "duplicate" });
		writeTicket(dir, c1);
		writeTicket(dir, c2);
		writeTicket(dir, c3);
		const parent = makeTicket({
			id: "parent01",
			relationships: { children: ["child001", "child002", "child003"] },
		});
		writeTicket(dir, parent);
		expect(isParentWithAllChildrenClosed(parent, dir)).toBe(true);
	});

	it("returns false when at least one child is still open/active/blocked", () => {
		const c1 = makeTicket({ id: "child001", state: "done" });
		const c2 = makeTicket({ id: "child002", state: "active" });
		writeTicket(dir, c1);
		writeTicket(dir, c2);
		const parent = makeTicket({
			id: "parent01",
			relationships: { children: ["child001", "child002"] },
		});
		writeTicket(dir, parent);
		expect(isParentWithAllChildrenClosed(parent, dir)).toBe(false);
	});

	it("returns false when a child file is missing (conservative)", () => {
		const parent = makeTicket({
			id: "parent01",
			relationships: { children: ["missing-child"] },
		});
		writeTicket(dir, parent);
		expect(isParentWithAllChildrenClosed(parent, dir)).toBe(false);
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

	it("warns but proceeds when closing from the wrong branch (advisory default)", () => {
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

		// Stay on main (wrong branch). Default guard_mode is advisory.
		const res = todoCli(dir, ["close", "abc12345", "--note", "wip"]);
		expect(res.status).toBe(0);
		expect(res.stderr).toContain("Warning");
		expect(res.stderr).toContain("todo/abc12345");
		expect(res.stdout).toContain("Closed abc12345");
	});

	it("refuses to close from the wrong branch under guard_mode=strict", () => {
		writeConfig(dir, { guard_mode: "strict" });
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

	it("hard-fails the commit-prefix grep under guard_mode=strict", () => {
		writeConfig(dir, { guard_mode: "strict" });
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
		git(dir, ["checkout", "-b", "todo/abc12345"]); // correct branch
		writeFileSync(join(dir, "code.txt"), "x", "utf8");
		git(dir, ["add", "code.txt"]);
		git(dir, ["commit", "-m", "unprefixed"]); // no todo:<id> prefix

		const res = todoCli(dir, ["close", "abc12345", "--note", "wip"]);
		expect(res.status).toBe(1);
		expect(res.stderr).toContain("todo:abc12345");
	});

	it("warns but proceeds when no commit has todo:<id> (advisory)", () => {
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
		expect(res.status).toBe(0);
		expect(res.stderr).toContain("Warning");
		expect(res.stderr).toContain("todo:abc12345");
		expect(res.stdout).toContain("Closed abc12345");
	});

	it("--commit <sha> satisfies the commit-prefix grep (no warning)", () => {
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
		// Deliverable rode an unprefixed commit (e.g. a differently-tagged change).
		git(dir, ["commit", "-m", "concept-hierarchy: notes doc"]);
		const sha = git(dir, ["rev-parse", "HEAD"]).trim();

		const res = todoCli(dir, [
			"close",
			"abc12345",
			"--commit",
			sha,
			"--note",
			"deliverable rode a non-todo commit",
		]);
		expect(res.status).toBe(0);
		// Explicit --commit means the grep is skipped — no advisory warning.
		expect(res.stderr).not.toContain("Warning");
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

	it("parent close succeeds when all children are closed (no own commit needed)", () => {
		// Two terminal children, parent has no commit of its own. This is the
		// pattern that used to require --force.
		const child = makeTicket({
			id: "child001",
			type: "chore",
			state: "done",
			resolution: {
				commit: "0".repeat(40),
				resolved_at: new Date().toISOString(),
				resolved_by: "test",
			},
			relationships: { parent: "parent01" },
		});
		writeTicket(dir, child);
		const parent = makeTicket({
			id: "parent01",
			type: "feature",
			state: "active",
			work: {
				branch: "todo/parent01",
				base_branch: "main",
				started_at: new Date().toISOString(),
				started_by: "test",
			},
			relationships: { children: ["child001"] },
		});
		writeTicket(dir, parent);

		// Be on the parent branch with a child commit (not parent's prefix).
		git(dir, ["checkout", "-b", "todo/parent01"]);
		writeFileSync(join(dir, "code.txt"), "x", "utf8");
		git(dir, ["add", "code.txt"]);
		git(dir, ["commit", "-m", "todo:child001 — work"]);

		const res = todoCli(dir, [
			"close",
			"parent01",
			"--note",
			"All children shipped",
		]);
		expect(res.status).toBe(0);
		expect(res.stderr).not.toContain("--force");
	});

	it("parent close STILL refuses when a child is open (state machine blocks)", () => {
		// One open child — the state machine refuses parent->done regardless of
		// the now-advisory commit-prefix grep.
		const c1 = makeTicket({
			id: "child001",
			type: "chore",
			state: "done",
			resolution: {
				commit: "0".repeat(40),
				resolved_at: new Date().toISOString(),
				resolved_by: "test",
			},
			relationships: { parent: "parent01" },
		});
		const c2 = makeTicket({
			id: "child002",
			type: "chore",
			state: "open",
			relationships: { parent: "parent01" },
		});
		writeTicket(dir, c1);
		writeTicket(dir, c2);
		const parent = makeTicket({
			id: "parent01",
			type: "feature",
			state: "active",
			work: {
				branch: "todo/parent01",
				base_branch: "main",
				started_at: new Date().toISOString(),
				started_by: "test",
			},
			relationships: { children: ["child001", "child002"] },
		});
		writeTicket(dir, parent);

		git(dir, ["checkout", "-b", "todo/parent01"]);
		writeFileSync(join(dir, "code.txt"), "x", "utf8");
		git(dir, ["add", "code.txt"]);
		git(dir, ["commit", "-m", "todo:child001 — work"]);

		const res = todoCli(dir, [
			"close",
			"parent01",
			"--note",
			"premature",
		]);
		expect(res.status).toBe(1);
		expect(res.stderr).toContain("child ticket(s) still open");
	});

	it("parent close refuses on the wrong branch under guard_mode=strict", () => {
		// Branch-match check fires even for fully-closed parents — when strict.
		writeConfig(dir, { guard_mode: "strict" });
		const child = makeTicket({
			id: "child001",
			type: "chore",
			state: "done",
			resolution: {
				commit: "0".repeat(40),
				resolved_at: new Date().toISOString(),
				resolved_by: "test",
			},
			relationships: { parent: "parent01" },
		});
		writeTicket(dir, child);
		const parent = makeTicket({
			id: "parent01",
			type: "feature",
			state: "active",
			work: {
				branch: "todo/parent01",
				base_branch: "main",
				started_at: new Date().toISOString(),
				started_by: "test",
			},
			relationships: { children: ["child001"] },
		});
		writeTicket(dir, parent);
		// Stay on main; do NOT switch to todo/parent01.

		const res = todoCli(dir, [
			"close",
			"parent01",
			"--note",
			"All done",
		]);
		expect(res.status).toBe(1);
		expect(res.stderr).toContain("todo/parent01");
	});

	it("parent close on the wrong branch is advisory by default (succeeds)", () => {
		// Same setup, default guard_mode: warns about the branch but proceeds.
		const child = makeTicket({
			id: "child001",
			type: "chore",
			state: "done",
			resolution: {
				commit: "0".repeat(40),
				resolved_at: new Date().toISOString(),
				resolved_by: "test",
			},
			relationships: { parent: "parent01" },
		});
		writeTicket(dir, child);
		const parent = makeTicket({
			id: "parent01",
			type: "feature",
			state: "active",
			work: {
				branch: "todo/parent01",
				base_branch: "main",
				started_at: new Date().toISOString(),
				started_by: "test",
			},
			relationships: { children: ["child001"] },
		});
		writeTicket(dir, parent);

		const res = todoCli(dir, ["close", "parent01", "--note", "All done"]);
		expect(res.status).toBe(0);
		expect(res.stderr).toContain("Warning");
		expect(res.stdout).toContain("Closed parent01");
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
