import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Command } from "commander";
import { getContext } from "../context.js";
import { handleError } from "../errors.js";
import { branchExists, commitExists, isAncestor, resolveHEAD } from "../git.js";
import { listTickets, TERMINAL_STATES } from "../ticket.js";
import type { SourceType, State, Ticket, TicketType } from "../types.js";

type Severity = "error" | "warning";

interface Issue {
	severity: Severity;
	ticket: string;
	message: string;
}

// Valid enum values, kept in sync with src/types.ts. Used to validate the raw
// files on disk — a hand-authored ticket that violates these never reaches the
// git-drift checks, because listTickets() casts `JSON.parse(...) as Ticket` and
// silently skips anything it cannot parse.
const TICKET_TYPES: TicketType[] = [
	"bug",
	"feature",
	"refactor",
	"chore",
	"debt",
	"investigation",
];
const TICKET_STATES: State[] = [
	"open",
	"active",
	"blocked",
	"done",
	"wontfix",
	"duplicate",
];
const SOURCE_TYPES: SourceType[] = ["log", "test", "agent", "human", "comment"];

/**
 * Store-integrity pass: validate the raw ticket files before the git-drift
 * checks run. `listTickets()` skips files it cannot parse, so a hand-authored
 * ticket with a JSON syntax error, a missing required field, a bad enum, a
 * filename that disagrees with its id, or a duplicated id would otherwise pass
 * unnoticed. This is the half of `doctor` that catches editing the JSON by hand
 * instead of going through the CLI.
 */
export function validateStoreFiles(repoRoot: string): Issue[] {
	const issues: Issue[] = [];
	const seen = new Map<string, string>(); // id -> "dir/file.json"

	for (const dir of ["open", "done"] as const) {
		const directory = join(repoRoot, ".todo", dir);
		let files: string[];
		try {
			files = readdirSync(directory).filter((f) => f.endsWith(".json"));
		} catch {
			continue; // directory absent — nothing to validate
		}

		for (const file of files) {
			const name = file.slice(0, -5); // basename without ".json"
			const where = `${dir}/${file}`;

			let parsed: unknown;
			try {
				parsed = JSON.parse(readFileSync(join(directory, file), "utf8"));
			} catch {
				issues.push({
					severity: "error",
					ticket: name,
					message: `${where} is not valid JSON — corrupt or hand-edited; use the todo CLI`,
				});
				continue;
			}

			if (typeof parsed !== "object" || parsed === null) {
				issues.push({
					severity: "error",
					ticket: name,
					message: `${where} is not a ticket object`,
				});
				continue;
			}

			const t = parsed as Record<string, unknown>;
			const id = typeof t.id === "string" ? t.id : name;
			const bad = (message: string) =>
				issues.push({ severity: "error", ticket: id, message });

			if (typeof t.id !== "string" || t.id.length === 0)
				bad(`${where} has no valid 'id'`);
			if (typeof t.summary !== "string" || t.summary.length === 0)
				bad(`${where} has no 'summary'`);
			if (typeof t.created_at !== "string") bad(`${where} has no 'created_at'`);
			if (typeof t.updated_at !== "string") bad(`${where} has no 'updated_at'`);

			if (!TICKET_TYPES.includes(t.type as TicketType))
				bad(`${where} has invalid type '${String(t.type)}'`);
			if (!TICKET_STATES.includes(t.state as State))
				bad(`${where} has invalid state '${String(t.state)}'`);
			const src = t.source as { type?: unknown } | undefined;
			if (!src || !SOURCE_TYPES.includes(src.type as SourceType))
				bad(`${where} has invalid or missing 'source.type'`);

			// The CLI always names a file <id>.json; a mismatch means it was
			// renamed or authored by hand.
			if (typeof t.id === "string" && t.id !== name)
				bad(`${where} filename does not match ticket id '${t.id}'`);

			if (typeof t.id === "string") {
				const prior = seen.get(t.id);
				if (prior)
					bad(`duplicate ticket id '${t.id}' — in both ${prior} and ${where}`);
				else seen.set(t.id, where);
			}
		}
	}

	return issues;
}

/**
 * Reconcile committed .todo/ state against git reality and report drift.
 * Because state lives in git and is edited by agents, the file can silently
 * diverge from what actually happened (a done ticket whose resolution commit
 * was never merged, an active ticket whose branch was deleted, a ticket in
 * the wrong directory for its state). `doctor` turns that into a report.
 */
export function collectIssues(repoRoot: string): Issue[] {
	const issues: Issue[] = validateStoreFiles(repoRoot);
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
