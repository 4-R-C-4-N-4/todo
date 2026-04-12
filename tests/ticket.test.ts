import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  generateId,
  readTicket,
  writeTicket,
  readTicketByPrefix,
  listTickets,
  ticketPath,
  NotFoundError,
  AmbiguousIdError,
} from '../src/ticket.js';
import { makeTempDir, removeTempDir, makeTodoDir, makeTicket } from './helpers.js';
import type { Ticket } from '../src/types.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = makeTempDir();
  makeTodoDir(tmpDir);
});

afterEach(() => {
  removeTempDir(tmpDir);
});

describe('generateId', () => {
  it('is deterministic for same inputs', () => {
    const id1 = generateId('human', 'some payload', '2024-01-01T00:00:00.000Z');
    const id2 = generateId('human', 'some payload', '2024-01-01T00:00:00.000Z');
    expect(id1).toBe(id2);
  });

  it('is different for different inputs', () => {
    const id1 = generateId('human', 'payload A', '2024-01-01T00:00:00.000Z');
    const id2 = generateId('human', 'payload B', '2024-01-01T00:00:00.000Z');
    expect(id1).not.toBe(id2);
  });

  it('respects length parameter', () => {
    const id = generateId('human', 'test', '2024-01-01T00:00:00.000Z', 12);
    expect(id).toHaveLength(12);
  });

  it('defaults to length 8', () => {
    const id = generateId('human', 'test', '2024-01-01T00:00:00.000Z');
    expect(id).toHaveLength(8);
  });

  it('produces hex characters only', () => {
    const id = generateId('log', 'traceback\ndata', '2024-05-01T12:00:00.000Z', 16);
    expect(id).toMatch(/^[0-9a-f]+$/);
  });
});

describe('writeTicket / readTicket', () => {
  it('round-trips a ticket in open/', () => {
    const ticket = makeTicket({ id: 'aabb1122', state: 'open' });
    writeTicket(tmpDir, ticket);
    const read = readTicket(tmpDir, 'aabb1122');
    expect(read.id).toBe('aabb1122');
    expect(read.state).toBe('open');
    expect(read.summary).toBe('Test ticket');
  });

  it('writes terminal-state ticket to done/', () => {
    const ticket = makeTicket({
      id: 'deadbeef',
      state: 'done',
      resolution: {
        commit: 'abc123',
        resolved_at: '2024-01-02T00:00:00.000Z',
        resolved_by: 'alice',
      },
    });
    writeTicket(tmpDir, ticket);
    const read = readTicket(tmpDir, 'deadbeef');
    expect(read.state).toBe('done');
  });

  it('moves ticket from open to done when state changes to terminal', () => {
    const ticket = makeTicket({ id: 'moveme01', state: 'open' });
    writeTicket(tmpDir, ticket);

    const updated: Ticket = { ...ticket, state: 'wontfix' };
    writeTicket(tmpDir, updated);

    // Should be findable and state should be correct
    const read = readTicket(tmpDir, 'moveme01');
    expect(read.state).toBe('wontfix');
  });

  it('directory-is-truth: corrects state if ticket in done/ has non-terminal state', () => {
    // Manually place a ticket with open state in done/
    const ticket = makeTicket({ id: 'wrongdir', state: 'open' });
    writeFileSync(
      join(tmpDir, '.todo', 'done', 'wrongdir.json'),
      JSON.stringify(ticket),
      'utf8'
    );
    const read = readTicket(tmpDir, 'wrongdir');
    // state should be corrected to a terminal state (we default to 'done')
    expect(read.state).toBe('done');
  });

  it('directory-is-truth: corrects state if ticket in open/ has terminal state', () => {
    // Manually place a ticket with done state in open/
    const ticket = makeTicket({ id: 'wrongdir2', state: 'done' });
    writeFileSync(
      join(tmpDir, '.todo', 'open', 'wrongdir2.json'),
      JSON.stringify(ticket),
      'utf8'
    );
    const read = readTicket(tmpDir, 'wrongdir2');
    // state should be corrected to open
    expect(read.state).toBe('open');
  });
});

describe('ticketPath', () => {
  it('throws NotFoundError for missing ticket', () => {
    expect(() => ticketPath(tmpDir, 'missing1')).toThrow(NotFoundError);
  });

  it('finds ticket in open/', () => {
    const ticket = makeTicket({ id: 'findme01', state: 'open' });
    writeTicket(tmpDir, ticket);
    const p = ticketPath(tmpDir, 'findme01');
    expect(p).toContain('open');
  });

  it('finds ticket in done/', () => {
    const ticket = makeTicket({ id: 'doneme01', state: 'done' });
    writeTicket(tmpDir, ticket);
    const p = ticketPath(tmpDir, 'doneme01');
    expect(p).toContain('done');
  });
});

describe('readTicketByPrefix', () => {
  it('finds a unique ticket by prefix', () => {
    const ticket = makeTicket({ id: 'prefix123', state: 'open' });
    writeTicket(tmpDir, ticket);
    const read = readTicketByPrefix(tmpDir, 'prefix1');
    expect(read.id).toBe('prefix123');
  });

  it('throws NotFoundError if no match', () => {
    expect(() => readTicketByPrefix(tmpDir, 'zzz')).toThrow(NotFoundError);
  });

  it('throws AmbiguousIdError if multiple matches', () => {
    const t1 = makeTicket({ id: 'ambig001', state: 'open' });
    const t2 = makeTicket({ id: 'ambig002', state: 'open' });
    writeTicket(tmpDir, t1);
    writeTicket(tmpDir, t2);
    expect(() => readTicketByPrefix(tmpDir, 'ambig')).toThrow(AmbiguousIdError);
  });

  it('AmbiguousIdError includes both matches', () => {
    const t1 = makeTicket({ id: 'dupid001', state: 'open' });
    const t2 = makeTicket({ id: 'dupid002', state: 'open' });
    writeTicket(tmpDir, t1);
    writeTicket(tmpDir, t2);
    try {
      readTicketByPrefix(tmpDir, 'dupid');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AmbiguousIdError);
      const ambig = err as AmbiguousIdError;
      expect(ambig.matches).toContain('dupid001');
      expect(ambig.matches).toContain('dupid002');
    }
  });
});

describe('listTickets', () => {
  it('returns all open tickets', () => {
    writeTicket(tmpDir, makeTicket({ id: 'list0001', state: 'open' }));
    writeTicket(tmpDir, makeTicket({ id: 'list0002', state: 'open', type: 'feature' }));
    const tickets = listTickets(tmpDir, 'open');
    expect(tickets).toHaveLength(2);
  });

  it('filters by state', () => {
    writeTicket(tmpDir, makeTicket({ id: 'filt0001', state: 'open' }));
    writeTicket(tmpDir, makeTicket({ id: 'filt0002', state: 'active' }));
    const tickets = listTickets(tmpDir, 'open', { state: 'active' });
    expect(tickets).toHaveLength(1);
    expect(tickets[0].id).toBe('filt0002');
  });

  it('filters by type', () => {
    writeTicket(tmpDir, makeTicket({ id: 'type0001', state: 'open', type: 'bug' }));
    writeTicket(tmpDir, makeTicket({ id: 'type0002', state: 'open', type: 'feature' }));
    const tickets = listTickets(tmpDir, 'open', { type: 'bug' });
    expect(tickets).toHaveLength(1);
    expect(tickets[0].type).toBe('bug');
  });

  it('filters by tag', () => {
    writeTicket(tmpDir, makeTicket({ id: 'tag00001', state: 'open', tags: ['urgent', 'api'] }));
    writeTicket(tmpDir, makeTicket({ id: 'tag00002', state: 'open', tags: ['api'] }));
    writeTicket(tmpDir, makeTicket({ id: 'tag00003', state: 'open', tags: [] }));
    const tickets = listTickets(tmpDir, 'open', { tag: 'urgent' });
    expect(tickets).toHaveLength(1);
    expect(tickets[0].id).toBe('tag00001');
  });

  it('returns empty array for done/ when nothing written there', () => {
    const tickets = listTickets(tmpDir, 'done');
    expect(tickets).toHaveLength(0);
  });
});
