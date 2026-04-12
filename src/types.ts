// Phase 1: All type definitions for the todo CLI tool

export type TicketType = 'bug' | 'feature' | 'refactor' | 'chore' | 'debt';
export type State = 'open' | 'active' | 'blocked' | 'done' | 'wontfix' | 'duplicate';
export type SourceType = 'log' | 'test' | 'agent' | 'human' | 'comment';
export type AnalysisType = 'blame' | 'hypothesis' | 'evidence' | 'conclusion';

// Discriminated union on `type`
export type Source =
  | { type: 'log'; raw?: string; traceback_fingerprint?: string }
  | { type: 'test'; raw?: string; traceback_fingerprint?: string; test_file?: string; test_function?: string }
  | { type: 'agent'; raw?: string }
  | { type: 'human'; raw?: string }
  | { type: 'comment'; raw?: string };

export interface FileReference {
  path: string;
  lines?: [number, number]; // [start, end]
  commit?: string;          // SHA of commit when file was anchored
  note?: string;
}

export interface AnalysisEntry {
  timestamp: string;        // ISO 8601
  author: string;
  type: AnalysisType;
  content: string;
  confidence?: 'low' | 'medium' | 'high';
  supporting_evidence?: number[]; // indices into analysis array
}

export interface Relationships {
  depends_on?: string[];
  blocks?: string[];
  related?: string[];
  duplicates?: string;      // ID of canonical ticket this is dup of
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
  created_at: string;
  updated_at: string;
}

export interface Config {
  project?: { name?: string };
  behavior?: { commit_prefix?: string };
  intake?: {
    dedup_strategy?: 'fingerprint' | 'file-line' | 'semantic';
    scan_patterns?: string[];
    scan_exclude?: string[];
  };
  display?: {
    id_length?: number;
    date_format?: 'relative' | 'iso';
  };
}
