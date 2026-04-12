// Phase 5: State machine for ticket transitions

import { existsSync } from 'node:fs';
import { commitExists } from './git.js';
import { TERMINAL_STATES } from './ticket.js';
import type { Ticket, State } from './types.js';

export interface TransitionParams {
  commit?: string;
  test_file?: string;
  test_function?: string;
  note?: string;
  depends_on?: string;
  duplicate_of?: string;
  resolved_by?: string;
  actor?: string;
}

// Valid transitions map
const VALID_TRANSITIONS: Record<State, State[]> = {
  open:      ['active', 'blocked', 'done', 'wontfix', 'duplicate'],
  active:    ['open', 'blocked', 'done', 'wontfix', 'duplicate'],
  blocked:   ['open', 'active', 'done', 'wontfix', 'duplicate'],
  done:      [],
  wontfix:   [],
  duplicate: [],
};

export function validateTransition(
  ticket: Ticket,
  targetState: State,
  params: TransitionParams,
  repoRoot: string
): void {
  const allowed = VALID_TRANSITIONS[ticket.state];

  if (TERMINAL_STATES.includes(ticket.state)) {
    throw new Error(
      `Cannot transition ticket ${ticket.id} from terminal state '${ticket.state}'`
    );
  }

  if (!allowed.includes(targetState)) {
    throw new Error(
      `Invalid transition from '${ticket.state}' to '${targetState}' for ticket ${ticket.id}`
    );
  }

  if (targetState === 'duplicate' && !params.duplicate_of) {
    throw new Error(`Transition to 'duplicate' requires params.duplicate_of`);
  }

  if (targetState === 'done') {
    const isParent = (ticket.relationships?.children ?? []).length > 0;
    const commit = params.commit;

    if (isParent) {
      // Parent ticket: note required; commit defaults to HEAD if not provided
      if (!params.note) {
        throw new Error(`Parent ticket requires a resolution note when closing as done`);
      }
      // commit is optional for parent (defaults to HEAD — caller handles HEAD resolution)
    } else {
      // Non-parent: commit always required
      if (!commit) {
        throw new Error(`Resolution commit is required to close ticket as done`);
      }

      // Validate commit exists in repo
      if (!commitExists(commit, repoRoot)) {
        throw new Error(`Commit '${commit}' does not exist in the repository`);
      }

      switch (ticket.type) {
        case 'bug':
          if (!params.test_file) {
            throw new Error(`Bug ticket requires resolution.test_file`);
          }
          if (!params.test_function) {
            throw new Error(`Bug ticket requires resolution.test_function`);
          }
          if (!existsSync(params.test_file)) {
            throw new Error(`test_file '${params.test_file}' does not exist on disk`);
          }
          break;

        case 'feature':
          if (!params.test_file && !params.note) {
            throw new Error(`Feature ticket requires either test_file or a resolution note`);
          }
          break;

        case 'refactor':
        case 'chore':
        case 'debt':
          // commit only — no test required
          break;
      }
    }
  }
}

export function applyTransition(
  ticket: Ticket,
  targetState: State,
  params: TransitionParams,
  repoRoot: string
): Ticket {
  validateTransition(ticket, targetState, params, repoRoot);

  // Deep clone
  const next: Ticket = JSON.parse(JSON.stringify(ticket)) as Ticket;
  const now = new Date().toISOString();

  next.state = targetState;
  next.updated_at = now;

  // Handle specific transition side effects
  if (targetState === 'open' && ticket.state === 'active') {
    // abandoned: clear work
    delete next.work;
  }

  if (targetState === 'done') {
    const isParent = (ticket.relationships?.children ?? []).length > 0;
    const resolvedBy = params.resolved_by ?? params.actor ?? 'unknown';
    const commit = params.commit ?? (isParent ? 'HEAD' : '');

    next.resolution = {
      commit,
      resolved_at: now,
      resolved_by: resolvedBy,
    };

    if (params.test_file) next.resolution.test_file = params.test_file;
    if (params.test_function) next.resolution.test_function = params.test_function;
    if (params.note) next.resolution.note = params.note;
  }

  if (targetState === 'duplicate') {
    if (!next.relationships) next.relationships = {};
    next.relationships.duplicates = params.duplicate_of;
  }

  return next;
}
