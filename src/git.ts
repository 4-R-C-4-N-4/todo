// Phase 2: Git integration helpers

import { execFileSync } from "node:child_process";

export class GitError extends Error {
	constructor(
		message: string,
		public readonly cause?: unknown,
	) {
		super(message);
		this.name = "GitError";
	}
}

function exec(args: string[], cwd: string): string {
	try {
		return execFileSync("git", args, {
			encoding: "utf8",
			cwd,
			stdio: ["pipe", "pipe", "pipe"],
		}).trim();
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err);
		throw new GitError(`git ${args.join(" ")} failed: ${msg}`, err);
	}
}

export function isGitRepo(cwd: string = process.cwd()): boolean {
	try {
		exec(["rev-parse", "--git-dir"], cwd);
		return true;
	} catch {
		return false;
	}
}

export function getRepoRoot(cwd: string = process.cwd()): string {
	return exec(["rev-parse", "--show-toplevel"], cwd);
}

export function commitExists(
	sha: string,
	cwd: string = process.cwd(),
): boolean {
	try {
		const type = exec(["cat-file", "-t", sha], cwd);
		return type === "commit";
	} catch {
		return false;
	}
}

export function resolveHEAD(cwd: string = process.cwd()): string {
	return exec(["rev-parse", "HEAD"], cwd);
}

export function getCurrentBranch(cwd: string = process.cwd()): string {
	return exec(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
}

export function branchExists(
	name: string,
	cwd: string = process.cwd(),
): boolean {
	try {
		exec(["rev-parse", "--verify", `refs/heads/${name}`], cwd);
		return true;
	} catch {
		return false;
	}
}

export function getDefaultBranch(cwd: string = process.cwd()): string {
	try {
		const ref = exec(["symbolic-ref", "refs/remotes/origin/HEAD"], cwd);
		// ref looks like refs/remotes/origin/main
		return ref.replace(/^refs\/remotes\/origin\//, "");
	} catch {
		return "main";
	}
}

export function getMergeBase(
	b1: string,
	b2: string,
	cwd: string = process.cwd(),
): string {
	return exec(["merge-base", b1, b2], cwd);
}

export function getCommitsAhead(
	branch: string,
	base: string,
	cwd: string = process.cwd(),
): number {
	const out = exec(["rev-list", "--count", `${base}..${branch}`], cwd);
	return parseInt(out, 10);
}

export function isAncestor(
	ancestor: string,
	descendant: string,
	cwd: string = process.cwd(),
): boolean {
	try {
		exec(["merge-base", "--is-ancestor", ancestor, descendant], cwd);
		return true;
	} catch {
		return false;
	}
}

export function showFileAtCommit(
	commit: string,
	path: string,
	cwd: string = process.cwd(),
): string {
	return exec(["show", `${commit}:${path}`], cwd);
}

export function getLastCommitForFile(
	path: string,
	cwd: string = process.cwd(),
): string {
	return exec(["log", "-1", "--format=%H", "--", path], cwd);
}

export function createBranch(name: string, cwd: string = process.cwd()): void {
	exec(["checkout", "-b", name], cwd);
}

export function checkoutBranch(
	name: string,
	cwd: string = process.cwd(),
): void {
	exec(["checkout", name], cwd);
}

export function getGitUserName(cwd: string = process.cwd()): string {
	return exec(["config", "user.name"], cwd);
}
