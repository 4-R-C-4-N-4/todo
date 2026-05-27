// Phase 1: All type definitions for the todo CLI tool

export type TicketType =
	| "bug"
	| "feature"
	| "refactor"
	| "chore"
	| "debt"
	// Investigation/decision: the deliverable is a documented conclusion
	// (an analysis trail + a note), not a code change. Closes on a note
	// rather than a test or code commit. See the done contract in state.ts.
	| "investigation";
export type State =
	| "open"
	| "active"
	| "blocked"
	| "done"
	| "wontfix"
	| "duplicate";
export type SourceType = "log" | "test" | "agent" | "human" | "comment";
export type BranchMode = "per-ticket" | "managed";
// How branch-convention guards behave when they fail. "advisory" (default):
// warn and proceed. "strict": hard error (exit 1), the old behavior — opt in
// when you want git to enforce the conventions.
export type GuardMode = "advisory" | "strict";
export type AnalysisType = "blame" | "hypothesis" | "evidence" | "conclusion";

// Discriminated union on `type`
export type Source =
	| { type: "log"; raw?: string; traceback_fingerprint?: string }
	| {
			type: "test";
			raw?: string;
			traceback_fingerprint?: string;
			test_file?: string;
			test_function?: string;
	  }
	| { type: "agent"; raw?: string }
	| { type: "human"; raw?: string }
	| { type: "comment"; raw?: string };

export interface FileReference {
	path: string;
	lines?: [number, number]; // [start, end]
	commit?: string; // SHA of commit when file was anchored
	note?: string;
}

export interface AnalysisEntry {
	timestamp: string; // ISO 8601
	author: string;
	type: AnalysisType;
	content: string;
	confidence?: "low" | "medium" | "high";
	supporting_evidence?: number[]; // indices into analysis array
}

export interface Relationships {
	depends_on?: string[];
	blocks?: string[];
	related?: string[];
	duplicates?: string; // ID of canonical ticket this is dup of
	parent?: string;
	children?: string[];
	linked_commits?: string[];
}

export interface Work {
	branch: string;
	base_branch: string;
	started_at: string;
	started_by: string;
}

export interface Resolution {
	commit: string;
	test_file?: string;
	test_function?: string;
	resolved_at: string;
	resolved_by: string;
	note?: string;
}

export interface Ticket {
	id: string;
	type: TicketType;
	state: State;
	summary: string;
	description?: string;
	tags?: string[];
	source: Source;
	files?: FileReference[];
	analysis?: AnalysisEntry[];
	relationships?: Relationships;
	work?: Work;
	resolution?: Resolution;
	external_refs?: Record<string, string>;
	created_at: string;
	updated_at: string;
}

export interface HermesConfig {
	dashboard_url: string;
	board: string;
	session_token?: string;
}

export interface Config {
	project?: { name?: string };
	behavior?: {
		commit_prefix?: string;
		// "per-ticket" (default): todo manages a todo/<id> branch per ticket and
		// runs the branch-convention guards. "managed": the user (or a PR flow)
		// owns branching — `work` performs no git ops and `close` drops the
		// branch guards entirely. See BranchMode.
		branch_mode?: BranchMode;
		// Whether failing branch-convention guards are advisory (warn, default)
		// or strict (hard error). Ignored in managed branch_mode, which has no
		// guards. See GuardMode.
		guard_mode?: GuardMode;
	};
	intake?: {
		dedup_strategy?: "fingerprint" | "file-line" | "semantic";
		scan_patterns?: string[];
		scan_exclude?: string[];
	};
	display?: {
		id_length?: number;
		date_format?: "relative" | "iso";
	};
	hermes?: HermesConfig;
}
