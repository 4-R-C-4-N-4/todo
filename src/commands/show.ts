import { Command } from "commander";
import { getContext } from "../context.js";
import { handleError } from "../errors.js";
import { readTicketByPrefix } from "../ticket.js";
import type { Ticket } from "../types.js";

function formatDate(iso: string): string {
	return iso.slice(0, 10); // YYYY-MM-DD
}

function formatTicketDetail(ticket: Ticket): string {
	const lines: string[] = [];

	lines.push(`=== ${ticket.id} [${ticket.type}] ${ticket.state} ===`);
	lines.push(`SUMMARY: ${ticket.summary}`);

	if (ticket.tags && ticket.tags.length > 0) {
		lines.push(`TAGS: ${ticket.tags.join(", ")}`);
	}

	lines.push(`CREATED: ${ticket.created_at}`);
	lines.push(`UPDATED: ${ticket.updated_at}`);

	if (ticket.description) {
		lines.push("");
		lines.push(`DESCRIPTION: ${ticket.description}`);
	}

	// Source
	lines.push("");
	lines.push(`SOURCE: ${ticket.source.type}`);
	if ("test_file" in ticket.source && ticket.source.test_file) {
		const fn =
			"test_function" in ticket.source
				? ticket.source.test_function
				: undefined;
		lines.push(`  File: ${ticket.source.test_file}${fn ? `::${fn}` : ""}`);
	}
	if ("raw" in ticket.source && ticket.source.raw) {
		lines.push(`  Raw: ${ticket.source.raw}`);
	}

	// Files
	if (ticket.files && ticket.files.length > 0) {
		lines.push("");
		lines.push("FILES:");
		for (const f of ticket.files) {
			let desc = `  ${f.path}`;
			if (f.lines) desc += `:${f.lines[0]}-${f.lines[1]}`;
			if (f.commit) desc += ` (${f.commit.slice(0, 7)})`;
			if (f.note) desc += ` — ${f.note}`;
			lines.push(desc);
		}
	}

	// Analysis
	if (ticket.analysis && ticket.analysis.length > 0) {
		lines.push("");
		lines.push(`ANALYSIS: (${ticket.analysis.length} entries)`);
		for (let i = 0; i < ticket.analysis.length; i++) {
			const a = ticket.analysis[i];
			const conf = a.confidence ? ` [${a.confidence}]` : "";
			lines.push(`  [${i}] ${formatDate(a.timestamp)} • ${a.type}${conf}`);
			lines.push(`      ${a.content}`);
		}
	}

	// Relationships
	if (ticket.relationships) {
		const rel = ticket.relationships;
		const parts: string[] = [];
		if (rel.parent) parts.push(`  parent: ${rel.parent}`);
		if (rel.children && rel.children.length > 0)
			parts.push(`  children: ${rel.children.join(", ")}`);
		if (rel.depends_on && rel.depends_on.length > 0)
			parts.push(`  depends_on: ${rel.depends_on.join(", ")}`);
		if (rel.blocks && rel.blocks.length > 0)
			parts.push(`  blocks: ${rel.blocks.join(", ")}`);
		if (rel.related && rel.related.length > 0)
			parts.push(`  related: ${rel.related.join(", ")}`);
		if (rel.duplicates) parts.push(`  duplicates: ${rel.duplicates}`);
		if (rel.linked_commits && rel.linked_commits.length > 0)
			parts.push(`  linked_commits: ${rel.linked_commits.join(", ")}`);

		if (parts.length > 0) {
			lines.push("");
			lines.push("RELATIONSHIPS:");
			lines.push(...parts);
		}
	}

	// Work
	if (ticket.work) {
		lines.push("");
		lines.push("WORK:");
		lines.push(`  branch: ${ticket.work.branch}`);
		lines.push(`  base: ${ticket.work.base_branch}`);
		lines.push(
			`  started: ${ticket.work.started_at} by ${ticket.work.started_by}`,
		);
	}

	// Resolution
	if (ticket.resolution) {
		lines.push("");
		lines.push("RESOLUTION:");
		lines.push(`  commit: ${ticket.resolution.commit}`);
		lines.push(
			`  resolved_at: ${ticket.resolution.resolved_at} by ${ticket.resolution.resolved_by}`,
		);
		if (ticket.resolution.test_file) {
			const fn = ticket.resolution.test_function
				? `::${ticket.resolution.test_function}`
				: "";
			lines.push(`  test: ${ticket.resolution.test_file}${fn}`);
		}
		if (ticket.resolution.note) {
			lines.push(`  note: ${ticket.resolution.note}`);
		}
	}

	return lines.join("\n");
}

export function registerShow(program: Command): void {
	program
		.command("show <id>")
		.description("Show ticket details")
		.option("--raw", "dump raw JSON")
		.action((id: string, opts) => {
			const ctx = getContext(true);
			const { repoRoot } = ctx;

			try {
				const ticket = readTicketByPrefix(repoRoot, id);
				if (opts.raw) {
					console.log(JSON.stringify(ticket, null, 2));
				} else {
					console.log(formatTicketDetail(ticket));
				}
			} catch (err) {
				handleError(err);
			}
		});
}
