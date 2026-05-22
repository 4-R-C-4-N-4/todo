import { execFileSync, spawnSync } from "node:child_process";
import {
	chmodSync,
	existsSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.js";
import {
	hookPath,
	installHook,
	readHookStatus,
	renderPostCommit,
	renderPrepareCommitMsg,
	uninstallHook,
} from "../src/hooks.js";
import {
	initGitRepo,
	makeCommit,
	makeTempDir,
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

describe("renderPrepareCommitMsg", () => {
	it("includes sentinel and commit prefix", () => {
		const out = renderPrepareCommitMsg("todo:");
		expect(out).toContain("@todo-managed-hook prepare-commit-msg");
		expect(out).toContain("todo:");
		expect(out).toContain("#!/bin/sh");
	});

	it("honors custom commit prefix", () => {
		const out = renderPrepareCommitMsg("TICKET-");
		expect(out).toContain("TICKET-");
	});
});

describe("installHook / uninstallHook", () => {
	let dir: string;

	beforeEach(() => {
		dir = makeTempDir();
		initGitRepo(dir);
		makeTodoDir(dir);
		writeConfig(dir);
		makeCommit(dir, "seed.txt", "x");
	});

	afterEach(() => {
		removeTempDir(dir);
	});

	it("creates a new hook", () => {
		const res = installHook(
			dir,
			"prepare-commit-msg",
			renderPrepareCommitMsg("todo:"),
		);
		expect(res.action).toBe("created");
		expect(existsSync(res.path)).toBe(true);
		// Executable bit on POSIX.
		const mode = statSync(res.path).mode;
		expect(mode & 0o100).toBeTruthy();
	});

	it("reinstall is idempotent and reports 'replaced'", () => {
		installHook(dir, "prepare-commit-msg", renderPrepareCommitMsg("todo:"));
		const res = installHook(
			dir,
			"prepare-commit-msg",
			renderPrepareCommitMsg("todo:"),
		);
		expect(res.action).toBe("replaced");
		expect(readHookStatus(dir, "prepare-commit-msg").managed).toBe(true);
	});

	it("refuses to clobber an unmanaged hook without --force", () => {
		const p = hookPath(dir, "prepare-commit-msg");
		execFileSync("mkdir", ["-p", join(p, "..")]);
		writeFileSync(p, "#!/bin/sh\necho custom\n", "utf8");
		chmodSync(p, 0o755);

		const res = installHook(
			dir,
			"prepare-commit-msg",
			renderPrepareCommitMsg("todo:"),
		);
		expect(res.action).toBe("refused");
		expect(res.reason).toContain("--force");
		// Existing hook untouched.
		expect(readFileSync(p, "utf8")).toContain("echo custom");
	});

	it("--force overwrites an unmanaged hook", () => {
		const p = hookPath(dir, "prepare-commit-msg");
		execFileSync("mkdir", ["-p", join(p, "..")]);
		writeFileSync(p, "#!/bin/sh\necho custom\n", "utf8");

		const res = installHook(
			dir,
			"prepare-commit-msg",
			renderPrepareCommitMsg("todo:"),
			{ force: true },
		);
		expect(res.action).toBe("replaced");
		expect(readHookStatus(dir, "prepare-commit-msg").managed).toBe(true);
	});

	it("uninstall removes a managed hook", () => {
		installHook(dir, "prepare-commit-msg", renderPrepareCommitMsg("todo:"));
		const res = uninstallHook(dir, "prepare-commit-msg");
		expect(res.action).toBe("removed");
		expect(existsSync(hookPath(dir, "prepare-commit-msg"))).toBe(false);
	});

	it("uninstall refuses unmanaged hook without --force", () => {
		const p = hookPath(dir, "prepare-commit-msg");
		execFileSync("mkdir", ["-p", join(p, "..")]);
		writeFileSync(p, "#!/bin/sh\necho custom\n", "utf8");

		const res = uninstallHook(dir, "prepare-commit-msg");
		expect(res.action).toBe("refused");
		expect(existsSync(p)).toBe(true);
	});

	it("post-commit template renders with sentinel", () => {
		const out = renderPostCommit();
		expect(out).toContain("@todo-managed-hook post-commit");
		expect(out).toContain("todo sync --quiet");
	});
});

// ---------------------------------------------------------------------------
// End-to-end: install via CLI then make a commit on todo/<id> and verify
// the prepare-commit-msg hook prepends the prefix.
// ---------------------------------------------------------------------------

describe("CLI install-hooks (end-to-end)", () => {
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

	it("install + commit on todo/<id> prepends todo:<id> — ", () => {
		const inst = todoCli(dir, ["install-hooks"]);
		expect(inst.status).toBe(0);
		expect(inst.stdout).toContain("prepare-commit-msg");

		execFileSync("git", ["checkout", "-b", "todo/abc12345"], { cwd: dir });
		writeFileSync(join(dir, "code.txt"), "x", "utf8");
		execFileSync("git", ["add", "code.txt"], { cwd: dir });
		execFileSync("git", ["commit", "-m", "fix the thing"], { cwd: dir });

		const msg = execFileSync("git", ["log", "-1", "--format=%s"], {
			cwd: dir,
			encoding: "utf8",
		}).trim();
		expect(msg).toBe("todo:abc12345 — fix the thing");
	});

	it("commit on main passes through unchanged", () => {
		todoCli(dir, ["install-hooks"]);
		writeFileSync(join(dir, "code.txt"), "x", "utf8");
		execFileSync("git", ["add", "code.txt"], { cwd: dir });
		execFileSync("git", ["commit", "-m", "plain message"], { cwd: dir });

		const msg = execFileSync("git", ["log", "-1", "--format=%s"], {
			cwd: dir,
			encoding: "utf8",
		}).trim();
		expect(msg).toBe("plain message");
	});

	it("already-prefixed message is not double-prefixed", () => {
		todoCli(dir, ["install-hooks"]);
		execFileSync("git", ["checkout", "-b", "todo/abc12345"], { cwd: dir });
		writeFileSync(join(dir, "code.txt"), "x", "utf8");
		execFileSync("git", ["add", "code.txt"], { cwd: dir });
		execFileSync(
			"git",
			["commit", "-m", "todo:abc12345 — already prefixed"],
			{ cwd: dir },
		);

		const msg = execFileSync("git", ["log", "-1", "--format=%s"], {
			cwd: dir,
			encoding: "utf8",
		}).trim();
		expect(msg).toBe("todo:abc12345 — already prefixed");
	});

	it("refuses to clobber unmanaged hook without --force", () => {
		const p = hookPath(dir, "prepare-commit-msg");
		execFileSync("mkdir", ["-p", join(p, "..")]);
		writeFileSync(p, "#!/bin/sh\necho custom\n", "utf8");

		const res = todoCli(dir, ["install-hooks"]);
		expect(res.status).toBe(1);
		expect(res.stderr).toContain("--force");
	});

	it("--uninstall removes a managed hook", () => {
		todoCli(dir, ["install-hooks"]);
		const res = todoCli(dir, ["install-hooks", "--uninstall"]);
		expect(res.status).toBe(0);
		expect(existsSync(hookPath(dir, "prepare-commit-msg"))).toBe(false);
	});
});
