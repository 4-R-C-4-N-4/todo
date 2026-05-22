// Git hook installation for `todo install-hooks`.
//
// All hooks Todo writes carry a sentinel comment so we can detect our own
// installs and re-install idempotently. Hooks written by a human (no
// sentinel) require --force to clobber.

import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { getGitDir } from "./git.js";

export type HookName = "prepare-commit-msg" | "post-commit";

export const SENTINEL_PREFIX = "# @todo-managed-hook";

export function hookSentinel(name: HookName, version: number): string {
	return `${SENTINEL_PREFIX} ${name} v${version}`;
}

export function renderPrepareCommitMsg(commitPrefix: string): string {
	const sentinel = hookSentinel("prepare-commit-msg", 1);
	return `#!/bin/sh
${sentinel}
# Auto-prefixes commit messages on todo/<id> branches with '${commitPrefix}<id> — '.
# Re-run \`todo install-hooks\` to refresh after editing .todo/config.json.
#
# $1 = commit message file
# $2 = source (message|template|merge|squash|commit)
# $3 = SHA when amending

case "$2" in
  merge|squash) exit 0 ;;
esac

branch=$(git symbolic-ref --short HEAD 2>/dev/null) || exit 0
case "$branch" in
  todo/*) id=\${branch#todo/} ;;
  *) exit 0 ;;
esac
[ -z "$id" ] && exit 0

msg_file="$1"
[ -f "$msg_file" ] || exit 0
first_line=$(head -n 1 "$msg_file" 2>/dev/null) || exit 0

# Already prefixed (this id or any id) — leave it.
case "$first_line" in
  ${commitPrefix}*) exit 0 ;;
esac

tmp="\${msg_file}.todoprefix.$$"
printf '%s%s — ' "${commitPrefix}" "$id" > "$tmp" || exit 0
cat "$msg_file" >> "$tmp" || { rm -f "$tmp"; exit 0; }
mv "$tmp" "$msg_file" || exit 0

exit 0
`;
}

export function renderPostCommit(): string {
	const sentinel = hookSentinel("post-commit", 1);
	return `#!/bin/sh
${sentinel}
# Best-effort sync to a Hermes Kanban board after each commit on a
# todo/<id> branch. Never blocks the commit; all errors are swallowed.

branch=$(git symbolic-ref --short HEAD 2>/dev/null) || exit 0
case "$branch" in
  todo/*) ;;
  *) exit 0 ;;
esac

# Run sync detached so a slow / down Hermes doesn't stall the shell.
( todo sync --quiet >/dev/null 2>&1 & ) >/dev/null 2>&1 || true
exit 0
`;
}

export interface HookStatus {
	exists: boolean;
	managed: boolean;
	path: string;
}

export function hookPath(repoRoot: string, name: HookName): string {
	let gitDir = getGitDir(repoRoot);
	// `git rev-parse --git-dir` can return a relative path like ".git";
	// resolve relative to repoRoot for safety.
	if (!gitDir.startsWith("/")) {
		gitDir = join(repoRoot, gitDir);
	}
	return join(gitDir, "hooks", name);
}

export function readHookStatus(repoRoot: string, name: HookName): HookStatus {
	const path = hookPath(repoRoot, name);
	if (!existsSync(path)) return { exists: false, managed: false, path };
	const content = readFileSync(path, "utf8");
	return {
		exists: true,
		managed: content.includes(SENTINEL_PREFIX),
		path,
	};
}

export interface InstallResult {
	action: "created" | "replaced" | "refused" | "removed";
	path: string;
	reason?: string;
}

export function installHook(
	repoRoot: string,
	name: HookName,
	content: string,
	opts: { force?: boolean } = {},
): InstallResult {
	const path = hookPath(repoRoot, name);
	const dir = join(path, "..");
	mkdirSync(dir, { recursive: true });

	const status = readHookStatus(repoRoot, name);
	if (status.exists && !status.managed && !opts.force) {
		return {
			action: "refused",
			path,
			reason:
				`refusing to overwrite existing ${name} hook at ${path}: ` +
				"no Todo sentinel found. Pass --force to overwrite.",
		};
	}

	const action: InstallResult["action"] = status.exists
		? "replaced"
		: "created";
	writeFileSync(path, content, "utf8");
	chmodSync(path, 0o755);
	return { action, path };
}

export function uninstallHook(
	repoRoot: string,
	name: HookName,
	opts: { force?: boolean } = {},
): InstallResult {
	const status = readHookStatus(repoRoot, name);
	if (!status.exists) {
		return { action: "removed", path: status.path, reason: "not installed" };
	}
	if (!status.managed && !opts.force) {
		return {
			action: "refused",
			path: status.path,
			reason:
				`refusing to remove existing ${name} hook at ${status.path}: ` +
				"no Todo sentinel found. Pass --force to remove anyway.",
		};
	}
	rmSync(status.path, { force: true });
	return { action: "removed", path: status.path };
}
