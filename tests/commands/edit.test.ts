import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  makeTempDir,
  removeTempDir,
  initGitRepo,
  makeTodoDir,
  makeTicket,
} from '../helpers.js';
import { readTicket, readTicketByPrefix, writeTicket } from '../../src/ticket.js';
import { DEFAULT_CONFIG } from '../../src/config.js';
import type { Ticket } from '../../src/types.js';

// Simulate what "todo edit" does for the fields exercised here.
// Mirrors the action handler in src/commands/edit.ts.
function editTicket(
  repoRoot: string,
  id: string,
  opts: { summary?: string; parent?: string } = {}
): Ticket {
  const ticket = readTicketByPrefix(repoRoot, id);
  let changed = false;

  if (opts.summary !== undefined) {
    ticket.summary = opts.summary;
    changed = true;
  }

  if (opts.parent !== undefined) {
    let newParent: Ticket;
    try {
      newParent = readTicketByPrefix(repoRoot, opts.parent);
    } catch {
      throw new Error(`parent ticket '${opts.parent}' not found`);
    }
    if (newParent.id === ticket.id) {
      throw new Error('a ticket cannot be its own parent');
    }

    const oldParentId = ticket.relationships?.parent;
    if (oldParentId !== newParent.id) {
      const now = new Date().toISOString();

      if (oldParentId) {
        try {
          const oldParent = readTicketByPrefix(repoRoot, oldParentId);
          if (oldParent.relationships?.children) {
            const before = oldParent.relationships.children.length;
            oldParent.relationships.children =
              oldParent.relationships.children.filter((c) => c !== ticket.id);
            if (oldParent.relationships.children.length !== before) {
              oldParent.updated_at = now;
              writeTicket(repoRoot, oldParent);
            }
          }
        } catch {
          // old parent missing — nothing to detach
        }
      }

      if (!newParent.relationships) newParent.relationships = {};
      if (!newParent.relationships.children)
        newParent.relationships.children = [];
      if (!newParent.relationships.children.includes(ticket.id)) {
        newParent.relationships.children.push(ticket.id);
        newParent.updated_at = now;
        writeTicket(repoRoot, newParent);
      }

      if (!ticket.relationships) ticket.relationships = {};
      ticket.relationships.parent = newParent.id;
      changed = true;
    }
  }

  if (changed) {
    ticket.updated_at = new Date().toISOString();
    writeTicket(repoRoot, ticket);
  }

  return ticket;
}

describe('edit command --parent', () => {
  let dir: string;

  beforeEach(() => {
    dir = makeTempDir();
    initGitRepo(dir);
    makeTodoDir(dir);
    writeFileSync(
      join(dir, '.todo', 'config.json'),
      JSON.stringify(DEFAULT_CONFIG, null, 2),
      'utf8'
    );
  });

  afterEach(() => {
    removeTempDir(dir);
  });

  it('attaches an orphan child to a parent', () => {
    const parent = makeTicket({ id: 'parent01', summary: 'Parent' });
    const child = makeTicket({ id: 'child001', summary: 'Child' });
    writeTicket(dir, parent);
    writeTicket(dir, child);

    editTicket(dir, 'child001', { parent: 'parent01' });

    expect(readTicket(dir, 'child001').relationships?.parent).toBe('parent01');
    expect(readTicket(dir, 'parent01').relationships?.children).toContain(
      'child001'
    );
  });

  it('reparents from old to new parent', () => {
    const oldParent = makeTicket({
      id: 'oldpar01',
      summary: 'Old parent',
      relationships: { children: ['child001'] },
    });
    const newParent = makeTicket({ id: 'newpar01', summary: 'New parent' });
    const child = makeTicket({
      id: 'child001',
      summary: 'Child',
      relationships: { parent: 'oldpar01' },
    });
    writeTicket(dir, oldParent);
    writeTicket(dir, newParent);
    writeTicket(dir, child);

    editTicket(dir, 'child001', { parent: 'newpar01' });

    expect(readTicket(dir, 'child001').relationships?.parent).toBe('newpar01');
    expect(readTicket(dir, 'oldpar01').relationships?.children).not.toContain(
      'child001'
    );
    expect(readTicket(dir, 'newpar01').relationships?.children).toContain(
      'child001'
    );
  });

  it('is a no-op when reparenting to the same parent', () => {
    const parent = makeTicket({
      id: 'parent01',
      summary: 'Parent',
      relationships: { children: ['child001'] },
    });
    const child = makeTicket({
      id: 'child001',
      summary: 'Child',
      relationships: { parent: 'parent01' },
    });
    writeTicket(dir, parent);
    writeTicket(dir, child);

    editTicket(dir, 'child001', { parent: 'parent01' });

    const reloadedParent = readTicket(dir, 'parent01');
    expect(reloadedParent.relationships?.children).toEqual(['child001']);
  });

  it('rejects an unknown parent id', () => {
    const child = makeTicket({ id: 'child001', summary: 'Child' });
    writeTicket(dir, child);

    expect(() =>
      editTicket(dir, 'child001', { parent: 'doesnotexist' })
    ).toThrow(/not found/);

    expect(readTicket(dir, 'child001').relationships?.parent).toBeUndefined();
  });

  it('rejects self-parenting', () => {
    const child = makeTicket({ id: 'child001', summary: 'Child' });
    writeTicket(dir, child);

    expect(() =>
      editTicket(dir, 'child001', { parent: 'child001' })
    ).toThrow(/own parent/);

    expect(readTicket(dir, 'child001').relationships?.parent).toBeUndefined();
  });

  it('combines --parent with --summary in one edit', () => {
    const parent = makeTicket({ id: 'parent01', summary: 'Parent' });
    const child = makeTicket({ id: 'child001', summary: 'Old summary' });
    writeTicket(dir, parent);
    writeTicket(dir, child);

    editTicket(dir, 'child001', {
      parent: 'parent01',
      summary: 'New summary',
    });

    const reloaded = readTicket(dir, 'child001');
    expect(reloaded.summary).toBe('New summary');
    expect(reloaded.relationships?.parent).toBe('parent01');
    expect(readTicket(dir, 'parent01').relationships?.children).toContain(
      'child001'
    );
  });
});
