import { Command } from "commander";
import { getContext } from "../context.js";
import { handleError } from "../errors.js";
import { getGitUserName } from "../git.js";
import { readTicketByPrefix, writeTicket } from "../ticket.js";
import type { AnalysisEntry, AnalysisType } from "../types.js";

const VALID_ANALYSIS_TYPES: AnalysisType[] = [
	"blame",
	"hypothesis",
	"evidence",
	"conclusion",
];
const VALID_CONFIDENCE = ["low", "medium", "high"];

export function registerAnalyze(program: Command): void {
	program
		.command("analyze <id>")
		.description("Add an analysis entry to a ticket")
		.requiredOption(
			"--type <type>",
			"analysis type: blame|hypothesis|evidence|conclusion",
		)
		.requiredOption("--content <text>", "analysis content")
		.option("--confidence <level>", "confidence: low|medium|high")
		.option(
			"--supporting <indices>",
			'comma-separated indices of supporting evidence, e.g. "0,1"',
		)
		.action((id: string, opts) => {
			try {
				const analysisType = opts.type as string;
				if (!VALID_ANALYSIS_TYPES.includes(analysisType as AnalysisType)) {
					console.error(
						`Error: invalid type '${analysisType}'. Must be one of: ${VALID_ANALYSIS_TYPES.join(", ")}`,
					);
					process.exit(1);
				}

				if (
					opts.confidence &&
					!VALID_CONFIDENCE.includes(opts.confidence as string)
				) {
					console.error(
						`Error: invalid confidence '${opts.confidence}'. Must be one of: ${VALID_CONFIDENCE.join(", ")}`,
					);
					process.exit(1);
				}

				const ctx = getContext(true);
				const { repoRoot } = ctx;

				const ticket = readTicketByPrefix(repoRoot, id);

				let author: string;
				if (process.env["TODO_ACTOR"]) {
					author = process.env["TODO_ACTOR"];
				} else {
					try {
						author = getGitUserName(repoRoot);
					} catch {
						author = "unknown";
					}
				}

				const entry: AnalysisEntry = {
					timestamp: new Date().toISOString(),
					author,
					type: analysisType as AnalysisType,
					content: opts.content as string,
				};

				if (opts.confidence) {
					entry.confidence = opts.confidence as "low" | "medium" | "high";
				}

				if (opts.supporting) {
					const indices = (opts.supporting as string)
						.split(",")
						.map((s) => parseInt(s.trim(), 10))
						.filter((n) => !isNaN(n));
					if (indices.length > 0) {
						entry.supporting_evidence = indices;
					}
				}

				ticket.analysis = [...(ticket.analysis ?? []), entry];
				ticket.updated_at = new Date().toISOString();
				writeTicket(repoRoot, ticket);

				console.log(
					`Added analysis entry [${ticket.analysis.length - 1}] to ${ticket.id}`,
				);
			} catch (err) {
				handleError(err);
			}
		});
}
