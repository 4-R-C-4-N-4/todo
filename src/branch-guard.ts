// Branch-convention guards used by `todo close` and `todo work`.
//
// These turn the conventions documented in the todo-implement skill into
// hard preconditions: agents follow exit codes far more reliably than
// prose, so every drift gets a clear, actionable error.

import {
	getCommitMessagesBetween,
	getDefaultBranch,
	hasUncommittedChanges,
} from "./git.js";
import type { Ticket } from "./types.js";

export function expectedBranchFor(ticket: Ticket): string {
	if (ticket.work?.branch) return ticket.work.branch;
	if (ticket.relationships?.parent)
		return `todo/${ticket.relationships.parent}`;
	return `todo/${ticket.id}`;
}

export interface BranchCheck {
	ok: boolean;
	message?: string;
}

export function checkOnExpectedBranch(
	ticket: Ticket,
	currentBranch: string,
): BranchCheck {
	const expected = expectedBranchFor(ticket);
	if (currentBranch === expected) return { ok: true };
	return {
		ok: false,
		message:
			`Refusing to close ${ticket.id}: HEAD is on '${currentBranch}', expected '${expected}'.\n` +
			`  Run \`todo work ${ticket.id}\` to switch to the right branch, ` +
			`or pass --force to override.`,
	};
}

export function checkBranchHasTodoCommit(
	ticket: Ticket,
	repoRoot: string,
	commitPrefix: string,
): BranchCheck {
	const base = ticket.work?.base_branch ?? getDefaultBranch(repoRoot);
	const messages = getCommitMessagesBetween(base, "HEAD", repoRoot);
	const needle = `${commitPrefix}${ticket.id}`;
	const found = messages.some((m) => m.includes(needle));
	if (found) return { ok: true };
	return {
		ok: false,
		message:
			`Refusing to close ${ticket.id}: no commit since ${base} has message containing '${needle}'.\n` +
			`  Either amend a commit to include the prefix, or pass --force ` +
			`if this ticket genuinely has no code change attached.`,
	};
}

export function checkWorkingTreeClean(repoRoot: string): BranchCheck {
	if (!hasUncommittedChanges(repoRoot)) return { ok: true };
	return {
		ok: false,
		message:
			"Refusing to switch branches: working tree has uncommitted changes.\n" +
			"  Commit, stash, or discard them first.",
	};
}
