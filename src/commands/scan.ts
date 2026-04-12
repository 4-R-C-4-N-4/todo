import { createHash } from "node:crypto";
import { Command } from "commander";
import { ensureTodoDir } from "../config.js";
import { getContext } from "../context.js";
import { handleError } from "../errors.js";
import { getLastCommitForFile } from "../git.js";
import { scanComments } from "../scan.js";
import { generateId, listTickets, writeTicket } from "../ticket.js";
import type { Ticket, TicketType } from "../types.js";

const VALID_TYPES: TicketType[] = [
	"bug",
	"feature",
	"refactor",
	"chore",
	"debt",
];

export function registerScan(program: Command): void {
	program
		.command("scan")
		.description(
			"Scan source tree for TODO/FIXME/etc comments and create tickets",
		)
		.option("--dry-run", "print what would be created, do not write")
		.option("--type <type>", "ticket type for created tickets", "chore")
		.action((opts) => {
			try {
				const ticketType = opts.type as string;
				if (!VALID_TYPES.includes(ticketType as TicketType)) {
					console.error(
						`Error: invalid type '${ticketType}'. Must be one of: ${VALID_TYPES.join(", ")}`,
					);
					process.exit(1);
				}

				const ctx = getContext(true);
				const { repoRoot, config } = ctx;

				const scanPatterns = config.intake?.scan_patterns ?? [
					"TODO",
					"FIXME",
					"HACK",
					"XXX",
				];
				const scanExclude = config.intake?.scan_exclude ?? [
					".todo",
					"node_modules",
					".git",
					"dist",
					"build",
				];

				ensureTodoDir(repoRoot);

				const matches = scanComments(repoRoot, scanPatterns, scanExclude);

				// Load all open tickets for dedup
				const openTickets = listTickets(repoRoot, "open");

				let created = 0;
				let skipped = 0;

				for (const match of matches) {
					const normalizedText = match.text.trim().toLowerCase();
					const fingerprint = createHash("sha256")
						.update(normalizedText)
						.digest("hex");

					// Check for existing ticket with same fingerprint
					const exists = openTickets.some((t) => {
						if (t.source.type === "comment" && t.source.raw) {
							const existingFp = createHash("sha256")
								.update(t.source.raw.trim().toLowerCase())
								.digest("hex");
							return existingFp === fingerprint;
						}
						return false;
					});

					if (exists) {
						console.log(`Skipping existing: ${match.text}`);
						skipped++;
						continue;
					}

					if (opts.dryRun) {
						console.log(
							`Would create: ${match.file}:${match.line} [${match.keyword}] ${match.text}`,
						);
						created++;
						continue;
					}

					const createdAt = new Date().toISOString();
					const id = generateId(
						"comment",
						match.text + match.file + match.line,
						createdAt,
					);

					let lastCommit: string | undefined;
					try {
						const c = getLastCommitForFile(match.file, repoRoot);
						if (c) lastCommit = c;
					} catch {
						lastCommit = undefined;
					}

					const ticket: Ticket = {
						id,
						type: ticketType as TicketType,
						state: "open",
						summary: `${match.keyword}: ${match.text}`.slice(0, 120),
						source: { type: "comment", raw: match.text },
						files: [
							{
								path: match.file,
								lines: [match.line, match.line],
								commit: lastCommit,
							},
						],
						created_at: createdAt,
						updated_at: createdAt,
					};

					writeTicket(repoRoot, ticket);
					openTickets.push(ticket); // add to in-memory list for subsequent dedup checks
					created++;
				}

				console.log(
					`Created ${created} tickets, skipped ${skipped} duplicates`,
				);
			} catch (err) {
				handleError(err);
			}
		});
}
