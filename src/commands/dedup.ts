import { Command } from "commander";
import { getContext } from "../context.js";
import { findDuplicates } from "../dedup.js";
import { handleError } from "../errors.js";
import { listTickets, writeTicket } from "../ticket.js";

export function registerDedup(program: Command): void {
	program
		.command("dedup")
		.description("Find potential duplicate tickets")
		.option("--strategy <s>", "fingerprint|file-line|semantic", "fingerprint")
		.option("--apply", "apply related links (default: dry-run)")
		.action((opts) => {
			try {
				const strategy = opts.strategy as string;

				if (strategy === "semantic") {
					console.error("Semantic dedup not yet implemented");
					process.exit(0);
				}

				if (strategy !== "fingerprint" && strategy !== "file-line") {
					console.error(
						`Error: invalid strategy '${strategy}'. Must be one of: fingerprint, file-line, semantic`,
					);
					process.exit(1);
				}

				const ctx = getContext(true);
				const { repoRoot } = ctx;

				const tickets = listTickets(repoRoot, "open");
				const pairs = findDuplicates(
					tickets,
					strategy as "fingerprint" | "file-line",
				);

				if (pairs.length === 0) {
					console.log("No duplicates found");
					return;
				}

				const apply = !!opts.apply;

				if (!apply) {
					for (const p of pairs) {
						console.log(
							`Possible duplicate: ${p.ticket1} ↔ ${p.ticket2} (${p.reason})`,
						);
					}
					console.log(
						`Found ${pairs.length} potential duplicate pair(s). Run with --apply to link them.`,
					);
					return;
				}

				// Apply: add related links both ways
				const ticketMap = new Map(tickets.map((t) => [t.id, t]));
				for (const p of pairs) {
					const t1 = ticketMap.get(p.ticket1);
					const t2 = ticketMap.get(p.ticket2);
					if (!t1 || !t2) continue;

					if (!t1.relationships) t1.relationships = {};
					if (!t1.relationships.related) t1.relationships.related = [];
					if (!t1.relationships.related.includes(t2.id)) {
						t1.relationships.related.push(t2.id);
					}

					if (!t2.relationships) t2.relationships = {};
					if (!t2.relationships.related) t2.relationships.related = [];
					if (!t2.relationships.related.includes(t1.id)) {
						t2.relationships.related.push(t1.id);
					}

					t1.updated_at = new Date().toISOString();
					t2.updated_at = new Date().toISOString();
					writeTicket(repoRoot, t1);
					writeTicket(repoRoot, t2);

					console.log(
						`Linked ${p.ticket1} ↔ ${p.ticket2} as related (${p.reason})`,
					);
				}

				console.log(`Applied links for ${pairs.length} duplicate pair(s)`);
			} catch (err) {
				handleError(err);
			}
		});
}
