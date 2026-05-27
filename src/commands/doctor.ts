import { Command } from "commander";
import { getContext } from "../context.js";
import { handleError } from "../errors.js";
import { branchExists, commitExists, isAncestor, resolveHEAD } from "../git.js";
import { listTickets, TERMINAL_STATES } from "../ticket.js";
import type { Ticket } from "../types.js";

type Severity = "error" | "warning";

interface Issue {
	severity: Severity;
	ticket: string;
	message: string;
}

/**
 * Reconcile committed .todo/ state against git reality and report drift.
 * Because state lives in git and is edited by agents, the file can silently
 * diverge from what actually happened (a done ticket whose resolution commit
 * was never merged, an active ticket whose branch was deleted, a ticket in
 * the wrong directory for its state). `doctor` turns that into a report.
 */
export function collectIssues(repoRoot: string): Issue[] {
	const issues: Issue[] = [];
	const add = (severity: Severity, ticket: string, message: string) =>
		issues.push({ severity, ticket, message });

	const openTickets = listTickets(repoRoot, "open");
	const doneTickets = listTickets(repoRoot, "done");
	const all = [...openTickets, ...doneTickets];
	const byId = new Map<string, Ticket>(all.map((t) => [t.id, t]));

	let head: string | undefined;
	try {
		head = resolveHEAD(repoRoot);
	} catch {
		head = undefined;
	}

	// Directory must agree with state: open/ holds non-terminal, done/ terminal.
	for (const t of openTickets) {
		if (TERMINAL_STATES.includes(t.state)) {
			add(
				"error",
				t.id,
				`is in .todo/open/ but its state is '${t.state}' (terminal) — file is in the wrong directory`,
			);
		}
	}
	for (const t of doneTickets) {
		if (!TERMINAL_STATES.includes(t.state)) {
			add(
				"error",
				t.id,
				`is in .todo/done/ but its state is '${t.state}' (non-terminal) — file is in the wrong directory`,
			);
		}
	}

	for (const t of all) {
		// Resolution integrity for done tickets.
		if (t.state === "done") {
			const sha = t.resolution?.commit;
			if (!sha) {
				add("error", t.id, "is done but records no resolution commit");
			} else if (!commitExists(sha, repoRoot)) {
				add(
					"error",
					t.id,
					`resolution commit ${sha} does not exist in the repository (orphaned by a squash/rebase?)`,
				);
			} else if (head && !isAncestor(sha, "HEAD", repoRoot)) {
				add(
					"warning",
					t.id,
					`resolution commit ${sha.slice(0, 8)} is not reachable from HEAD (closed on an unmerged branch?)`,
				);
			}
		}

		// A done parent must have no non-terminal children.
		const children = t.relationships?.children ?? [];
		if (TERMINAL_STATES.includes(t.state) && children.length > 0) {
			for (const childId of children) {
				const child = byId.get(childId);
				if (child && !TERMINAL_STATES.includes(child.state)) {
					add(
						"error",
						t.id,
						`is ${t.state} but child ${childId} is still '${child.state}'`,
					);
				}
			}
		}

		// An active ticket whose branch was deleted has lost its working context.
		if (t.state === "active" && t.work?.branch) {
			if (!branchExists(t.work.branch, repoRoot)) {
				add(
					"warning",
					t.id,
					`is active but its branch '${t.work.branch}' no longer exists`,
				);
			}
		}

		// Dangling relationship references.
		const rel = t.relationships;
		if (rel?.parent && !byId.has(rel.parent)) {
			add("warning", t.id, `references missing parent ${rel.parent}`);
		}
		for (const childId of children) {
			if (!byId.has(childId)) {
				add("warning", t.id, `references missing child ${childId}`);
			}
		}
		for (const depId of rel?.depends_on ?? []) {
			if (!byId.has(depId)) {
				add("warning", t.id, `references missing dependency ${depId}`);
			}
		}
	}

	return issues;
}

export function registerDoctor(program: Command): void {
	program
		.command("doctor")
		.description(
			"Reconcile committed .todo/ state against git reality and report drift",
		)
		.option("--json", "output issues as a JSON array")
		.option(
			"--strict",
			"exit non-zero when any issue is found, including warnings",
		)
		.action((opts) => {
			const ctx = getContext(true);
			const { repoRoot } = ctx;

			try {
				const issues = collectIssues(repoRoot);
				const errors = issues.filter((i) => i.severity === "error");
				const warnings = issues.filter((i) => i.severity === "warning");

				if (opts.json) {
					console.log(JSON.stringify(issues, null, 2));
				} else if (issues.length === 0) {
					console.log("todo doctor: no issues found — .todo/ is consistent.");
				} else {
					for (const i of issues) {
						const tag = i.severity === "error" ? "ERROR" : "warn ";
						console.log(`${tag}  ${i.ticket}  ${i.message}`);
					}
					console.log(
						`\n${errors.length} error(s), ${warnings.length} warning(s).`,
					);
				}

				const failed = opts.strict ? issues.length > 0 : errors.length > 0;
				if (failed) process.exit(1);
			} catch (err) {
				handleError(err);
			}
		});
}
