import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { collectIssues } from '../../src/commands/doctor.js';
import {
  makeTempDir,
  removeTempDir,
  initGitRepo,
  makeCommit,
  makeTodoDir,
  makeTicket,
} from '../helpers.js';
import { writeTicket } from '../../src/ticket.js';
import type { Ticket } from '../../src/types.js';

let dir: string;

beforeEach(() => {
  dir = makeTempDir();
  initGitRepo(dir);
  makeTodoDir(dir);
});

afterEach(() => {
  removeTempDir(dir);
});

// writeTicket routes by terminal-ness of state, so it always lands in the
// correct directory. Some tests need a deliberately *misfiled* ticket, so we
// write those by hand.
function writeRaw(d: 'open' | 'done', t: Ticket): void {
  writeFileSync(join(dir, '.todo', d, `${t.id}.json`), JSON.stringify(t), 'utf8');
}

describe('collectIssues', () => {
  it('reports nothing for a consistent store', () => {
    const sha = makeCommit(dir);
    writeTicket(dir, makeTicket({ id: 'aaaa1111', state: 'open' }));
    writeTicket(
      dir,
      makeTicket({
        id: 'bbbb2222',
        state: 'done',
        resolution: { commit: sha, resolved_at: 'x', resolved_by: 'y' },
      })
    );
    expect(collectIssues(dir)).toEqual([]);
  });

  it('flags a done ticket whose resolution commit does not exist', () => {
    makeCommit(dir);
    writeTicket(
      dir,
      makeTicket({
        id: 'bad00001',
        state: 'done',
        resolution: { commit: '0'.repeat(40), resolved_at: 'x', resolved_by: 'y' },
      })
    );
    const issues = collectIssues(dir);
    expect(issues).toContainEqual(
      expect.objectContaining({ severity: 'error', ticket: 'bad00001' })
    );
    expect(issues[0].message).toMatch(/does not exist/i);
  });

  it('flags a done ticket with no resolution commit', () => {
    makeCommit(dir);
    writeTicket(dir, makeTicket({ id: 'bad00002', state: 'done' }));
    const issues = collectIssues(dir);
    expect(issues).toContainEqual(
      expect.objectContaining({ severity: 'error', ticket: 'bad00002' })
    );
  });

  it('flags an active ticket whose branch no longer exists', () => {
    makeCommit(dir);
    writeTicket(
      dir,
      makeTicket({
        id: 'act00001',
        state: 'active',
        work: { branch: 'todo/gone', base_branch: 'main', started_at: 'x', started_by: 'y' },
      })
    );
    const issues = collectIssues(dir);
    expect(issues).toContainEqual(
      expect.objectContaining({ severity: 'warning', ticket: 'act00001' })
    );
    expect(issues[0].message).toMatch(/branch 'todo\/gone' no longer exists/);
  });

  it('flags a done parent with a still-open child', () => {
    const sha = makeCommit(dir);
    writeTicket(
      dir,
      makeTicket({ id: 'child001', state: 'open', relationships: { parent: 'prnt0001' } })
    );
    writeTicket(
      dir,
      makeTicket({
        id: 'prnt0001',
        state: 'done',
        resolution: { commit: sha, resolved_at: 'x', resolved_by: 'y' },
        relationships: { children: ['child001'] },
      })
    );
    const issues = collectIssues(dir);
    expect(issues).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        ticket: 'prnt0001',
        message: expect.stringContaining("child001 is still 'open'"),
      })
    );
  });

  it('flags a ticket misfiled in the wrong directory for its state', () => {
    makeCommit(dir);
    // A terminal ticket sitting in open/.
    writeRaw('open', makeTicket({ id: 'misf0001', state: 'done' }) as Ticket);
    const issues = collectIssues(dir);
    expect(issues).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        ticket: 'misf0001',
        message: expect.stringContaining('wrong directory'),
      })
    );
  });

  it('warns on dangling relationship references', () => {
    makeCommit(dir);
    writeTicket(
      dir,
      makeTicket({
        id: 'dep00001',
        state: 'open',
        relationships: { depends_on: ['ghost999'] },
      })
    );
    const issues = collectIssues(dir);
    expect(issues).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        ticket: 'dep00001',
        message: expect.stringContaining('missing dependency ghost999'),
      })
    );
  });
});

describe('validateStoreFiles (store integrity / hand-authoring)', () => {
  const writeFile = (d: 'open' | 'done', name: string, contents: string) =>
    writeFileSync(join(dir, '.todo', d, name), contents, 'utf8');

  it('reports a corrupt (unparseable) ticket file instead of silently skipping it', () => {
    writeFile('open', 'bad11111.json', '{ this is not json');
    const issues = collectIssues(dir);
    const hit = issues.find((i) => i.ticket === 'bad11111');
    expect(hit?.severity).toBe('error');
    expect(hit?.message).toMatch(/not valid JSON/);
  });

  it('reports a missing required field', () => {
    // valid JSON, valid enums, but no summary
    writeFile(
      'open',
      'cccc3333.json',
      JSON.stringify({
        id: 'cccc3333',
        type: 'bug',
        state: 'open',
        source: { type: 'human' },
        created_at: 'x',
        updated_at: 'y',
      }),
    );
    const issues = collectIssues(dir);
    expect(
      issues.some((i) => i.ticket === 'cccc3333' && /has no 'summary'/.test(i.message)),
    ).toBe(true);
  });

  it('reports an invalid enum value (bad type)', () => {
    writeFile(
      'open',
      'dddd4444.json',
      JSON.stringify(makeTicket({ id: 'dddd4444', type: 'banana' as unknown as Ticket['type'] })),
    );
    const issues = collectIssues(dir);
    expect(
      issues.some((i) => i.ticket === 'dddd4444' && /invalid type 'banana'/.test(i.message)),
    ).toBe(true);
  });

  it('reports a filename that does not match the ticket id', () => {
    // file is named eeee5555.json but the ticket claims a different id
    writeFile('open', 'eeee5555.json', JSON.stringify(makeTicket({ id: 'ffff6666' })));
    const issues = collectIssues(dir);
    expect(
      issues.some((i) => /filename does not match ticket id 'ffff6666'/.test(i.message)),
    ).toBe(true);
  });

  it('reports a duplicate ticket id across the store', () => {
    writeFile('open', 'dup00000.json', JSON.stringify(makeTicket({ id: 'dup00000', state: 'open' })));
    writeFile(
      'done',
      'dup00000.json',
      JSON.stringify(
        makeTicket({
          id: 'dup00000',
          state: 'done',
          resolution: { commit: 'x', resolved_at: 'a', resolved_by: 'b' },
        }),
      ),
    );
    const issues = collectIssues(dir);
    expect(
      issues.some((i) => i.ticket === 'dup00000' && /duplicate ticket id/.test(i.message)),
    ).toBe(true);
  });

  it('adds nothing for a schema-valid store', () => {
    const sha = makeCommit(dir);
    writeTicket(dir, makeTicket({ id: 'aaaa1111', state: 'open' }));
    writeTicket(
      dir,
      makeTicket({
        id: 'bbbb2222',
        state: 'done',
        resolution: { commit: sha, resolved_at: 'x', resolved_by: 'y' },
      }),
    );
    // validateStoreFiles is the store-integrity half; it must be silent here
    expect(collectIssues(dir)).toEqual([]);
  });
});
