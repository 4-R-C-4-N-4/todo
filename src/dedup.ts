// Deduplication utility
import type { Ticket } from "./types.js";

export interface DuplicatePair {
	ticket1: string;
	ticket2: string;
	reason: string;
	strategy: "fingerprint" | "file-line";
}

function rangesOverlap(a: [number, number], b: [number, number]): boolean {
	return a[0] <= b[1] && b[0] <= a[1];
}

export function findDuplicates(
	tickets: Ticket[],
	strategy: "fingerprint" | "file-line",
): DuplicatePair[] {
	const pairs: DuplicatePair[] = [];

	if (strategy === "fingerprint") {
		// Group by traceback_fingerprint
		const byFingerprint = new Map<string, Ticket[]>();
		for (const ticket of tickets) {
			const src = ticket.source;
			const fp = (src as { traceback_fingerprint?: string })
				.traceback_fingerprint;
			if (fp && fp.length > 0) {
				const group = byFingerprint.get(fp) ?? [];
				group.push(ticket);
				byFingerprint.set(fp, group);
			}
		}
		for (const [fp, group] of byFingerprint) {
			for (let i = 0; i < group.length; i++) {
				for (let j = i + 1; j < group.length; j++) {
					pairs.push({
						ticket1: group[i].id,
						ticket2: group[j].id,
						reason: `same traceback fingerprint: ${fp.slice(0, 8)}...`,
						strategy: "fingerprint",
					});
				}
			}
		}
	} else {
		// file-line strategy
		for (let i = 0; i < tickets.length; i++) {
			for (let j = i + 1; j < tickets.length; j++) {
				const t1 = tickets[i];
				const t2 = tickets[j];
				const files1 = t1.files ?? [];
				const files2 = t2.files ?? [];

				for (const f1 of files1) {
					for (const f2 of files2) {
						if (f1.path !== f2.path) continue;
						if (!f1.lines || !f2.lines) continue;
						if (rangesOverlap(f1.lines, f2.lines)) {
							pairs.push({
								ticket1: t1.id,
								ticket2: t2.id,
								reason: `both reference ${f1.path} lines ${f1.lines[0]}-${f1.lines[1]} and ${f2.lines[0]}-${f2.lines[1]}`,
								strategy: "file-line",
							});
						}
					}
				}
			}
		}
	}

	return pairs;
}
