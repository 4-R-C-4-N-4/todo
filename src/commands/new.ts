import { readFileSync } from "node:fs";
import { Command } from "commander";
import { ensureTodoDir } from "../config.js";
import { getContext } from "../context.js";
import { tracebackFingerprint } from "../fingerprint.js";
import { generateId, listTickets, writeTicket } from "../ticket.js";
import type {
	FileReference,
	Source,
	SourceType,
	Ticket,
	TicketType,
} from "../types.js";

const VALID_TYPES: TicketType[] = [
	"bug",
	"feature",
	"refactor",
	"chore",
	"debt",
];
const VALID_SOURCES: SourceType[] = [
	"log",
	"test",
	"agent",
	"human",
	"comment",
];

export function registerNew(program: Command): void {
	program
		.command("new [summary]")
		.description("Create a new ticket")
		.option(
			"-t, --type <type>",
			"ticket type: bug|feature|refactor|chore|debt",
			"chore",
		)
		.option(
			"-s, --source <source>",
			"source type: log|test|agent|human|comment",
			"human",
		)
		.option("-f, --file <path>", "associate a file path")
		.option("-l, --lines <start,end>", "line range for the file (e.g. 10,20)")
		.option("--tags <tags>", "comma-separated tags")
		.option("--parent <id>", "parent ticket ID")
		.option("--pipe", "read summary from stdin")
		.action((summaryArg: string | undefined, opts) => {
			// Validate type
			const ticketType = opts.type as string;
			if (!VALID_TYPES.includes(ticketType as TicketType)) {
				console.error(
					`Error: invalid type '${ticketType}'. Must be one of: ${VALID_TYPES.join(", ")}`,
				);
				process.exit(1);
			}

			// Validate source
			const sourceType = opts.source as string;
			if (!VALID_SOURCES.includes(sourceType as SourceType)) {
				console.error(
					`Error: invalid source '${sourceType}'. Must be one of: ${VALID_SOURCES.join(", ")}`,
				);
				process.exit(1);
			}

			// Get context (init required)
			const ctx = getContext(true);
			const { repoRoot } = ctx;

			// Ensure dirs exist
			ensureTodoDir(repoRoot);

			// Handle --pipe
			let summary: string;
			if (opts.pipe) {
				if (process.stdin.isTTY) {
					console.error("Error: --pipe requires piped input");
					process.exit(1);
				}
				const stdinContent = readFileSync("/dev/stdin", "utf8");
				const lines = stdinContent.split("\n").filter((l) => l.trim() !== "");
				summary = lines[lines.length - 1] ?? "";
			} else {
				summary = summaryArg ?? "";
			}

			if (!summary.trim()) {
				console.error("Error: summary is required");
				process.exit(1);
			}

			// Build source object
			const sourceObj: Source = { type: sourceType as SourceType } as Source;

			// Compute traceback fingerprint for log/test sources with piped content
			if (opts.pipe && (sourceType === "log" || sourceType === "test")) {
				// summary was extracted from stdin; we want to fingerprint the full content
				// re-read isn't possible; fingerprint from summary as best-effort
				const fp = tracebackFingerprint(summary);
				(sourceObj as Record<string, unknown>)["traceback_fingerprint"] = fp;
			}

			// Build file reference
			let fileRefs: FileReference[] | undefined;
			if (opts.file) {
				const fileRef: FileReference = { path: opts.file as string };
				if (opts.lines) {
					const parts = (opts.lines as string).split(",");
					if (parts.length === 2) {
						const start = parseInt(parts[0], 10);
						const end = parseInt(parts[1], 10);
						if (!isNaN(start) && !isNaN(end)) {
							fileRef.lines = [start, end];
						}
					}
				}
				fileRefs = [fileRef];
			}

			// Parse tags
			let tags: string[] | undefined;
			if (opts.tags) {
				tags = (opts.tags as string)
					.split(",")
					.map((t) => t.trim())
					.filter((t) => t.length > 0);
			}

			const createdAt = new Date().toISOString();
			const rawPayload = summary + (opts.file ?? "");
			const id = generateId(sourceType as SourceType, rawPayload, createdAt);

			// Dedup check
			try {
				const openTickets = listTickets(repoRoot, "open");
				for (const existing of openTickets) {
					if (existing.summary === summary) {
						console.error(`Warning: possible duplicate of ${existing.id}`);
						break;
					}
				}
			} catch {
				// ignore listing errors
			}

			// Handle parent
			if (opts.parent) {
				const { readTicketByPrefix } =
					require("../ticket.js") as typeof import("../ticket.js");
				try {
					const parentTicket = readTicketByPrefix(
						repoRoot,
						opts.parent as string,
					);
					if (!parentTicket.relationships) parentTicket.relationships = {};
					if (!parentTicket.relationships.children)
						parentTicket.relationships.children = [];
					parentTicket.relationships.children.push(id);
					parentTicket.updated_at = createdAt;
					writeTicket(repoRoot, parentTicket);
				} catch {
					console.error(`Error: parent ticket '${opts.parent}' not found`);
					process.exit(1);
				}
			}

			// Build ticket
			const ticket: Ticket = {
				id,
				type: ticketType as TicketType,
				state: "open",
				summary,
				source: sourceObj,
				created_at: createdAt,
				updated_at: createdAt,
			};

			if (fileRefs) ticket.files = fileRefs;
			if (tags && tags.length > 0) ticket.tags = tags;
			if (opts.parent) {
				ticket.relationships = { parent: opts.parent as string };
			}

			writeTicket(repoRoot, ticket);
			console.log(ticket.id);
		});
}
