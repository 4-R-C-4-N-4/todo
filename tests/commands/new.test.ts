import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync } from 'node:fs';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  makeTempDir,
  removeTempDir,
  initGitRepo,
  makeTodoDir,
  makeTicket,
} from '../helpers.js';
import { generateId, writeTicket, readTicket, listTickets } from '../../src/ticket.js';
import { DEFAULT_CONFIG } from '../../src/config.js';
import type { Ticket, TicketType, SourceType } from '../../src/types.js';

// Simulate what "todo new" does
function createTicket(
  repoRoot: string,
  summary: string,
  opts: {
    type?: TicketType;
    source?: SourceType;
    tags?: string[];
    parentId?: string;
  } = {}
): Ticket {
  const ticketType: TicketType = opts.type ?? 'chore';
  const sourceType: SourceType = opts.source ?? 'human';
  const createdAt = new Date().toISOString();
  const id = generateId(sourceType, summary, createdAt);

  const ticket: Ticket = {
    id,
    type: ticketType,
    state: 'open',
    summary,
    source: { type: sourceType },
    created_at: createdAt,
    updated_at: createdAt,
  };

  if (opts.tags && opts.tags.length > 0) ticket.tags = opts.tags;

  if (opts.parentId) {
    ticket.relationships = { parent: opts.parentId };
    // Update parent
    const parent = readTicket(repoRoot, opts.parentId);
    if (!parent.relationships) parent.relationships = {};
    if (!parent.relationships.children) parent.relationships.children = [];
    parent.relationships.children.push(id);
    parent.updated_at = createdAt;
    writeTicket(repoRoot, parent);
  }

  writeTicket(repoRoot, ticket);
  return ticket;
}

describe('new command logic', () => {
  let dir: string;

  beforeEach(() => {
    dir = makeTempDir();
    initGitRepo(dir);
    makeTodoDir(dir);
    // Write a config.json so context is valid
    writeFileSync(join(dir, '.todo', 'config.json'), JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf8');
  });

  afterEach(() => {
    removeTempDir(dir);
  });

  it('creates a ticket file in open/', () => {
    const ticket = createTicket(dir, 'Fix the parser');
    const openDir = join(dir, '.todo', 'open');
    const files = readdirSync(openDir);
    expect(files).toContain(`${ticket.id}.json`);
  });

  it('created ticket has correct fields', () => {
    const ticket = createTicket(dir, 'Add login feature', { type: 'feature', source: 'human' });
    const loaded = readTicket(dir, ticket.id);
    expect(loaded.summary).toBe('Add login feature');
    expect(loaded.type).toBe('feature');
    expect(loaded.state).toBe('open');
    expect(loaded.source.type).toBe('human');
  });

  it('stores tags on ticket', () => {
    const ticket = createTicket(dir, 'Fix crash', { tags: ['crash', 'parser'] });
    const loaded = readTicket(dir, ticket.id);
    expect(loaded.tags).toEqual(['crash', 'parser']);
  });

  it('--parent wires parent.relationships.children', () => {
    const parent = makeTicket({ id: 'parent01', type: 'feature', summary: 'Parent feature' });
    writeTicket(dir, parent);

    const child = createTicket(dir, 'Child subtask', { parentId: 'parent01' });
    expect(child.relationships?.parent).toBe('parent01');

    const updatedParent = readTicket(dir, 'parent01');
    expect(updatedParent.relationships?.children).toContain(child.id);
  });

  it('duplicate summary detection', () => {
    const summary = 'Fix the same bug';
    const first = createTicket(dir, summary);
    expect(first.summary).toBe(summary);

    // Simulate dedup check
    const openTickets = listTickets(dir, 'open');
    const dup = openTickets.find(t => t.summary === summary);
    expect(dup).toBeDefined();
    expect(dup?.id).toBe(first.id);
  });

  it('generates unique IDs for different summaries', () => {
    const t1 = createTicket(dir, 'Task one');
    const t2 = createTicket(dir, 'Task two');
    expect(t1.id).not.toBe(t2.id);
  });
});
