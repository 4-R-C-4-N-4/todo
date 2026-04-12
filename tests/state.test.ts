import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { validateTransition, applyTransition } from '../src/state.js';
import { makeTempDir, removeTempDir, initGitRepo, makeCommit, makeTodoDir, makeTicket } from './helpers.js';
import type { Ticket } from '../src/types.js';

let tmpDir: string;
let realCommit: string;

beforeEach(() => {
  tmpDir = makeTempDir();
  initGitRepo(tmpDir);
  realCommit = makeCommit(tmpDir);
  makeTodoDir(tmpDir);
});

afterEach(() => {
  removeTempDir(tmpDir);
});

// ── Valid transitions ──────────────────────────────────────────────────────────

describe('validateTransition - valid transitions', () => {
  it('open → active', () => {
    const t = makeTicket({ state: 'open' });
    expect(() => validateTransition(t, 'active', {}, tmpDir)).not.toThrow();
  });

  it('open → blocked', () => {
    const t = makeTicket({ state: 'open' });
    expect(() => validateTransition(t, 'blocked', {}, tmpDir)).not.toThrow();
  });

  it('open → wontfix', () => {
    const t = makeTicket({ state: 'open' });
    expect(() => validateTransition(t, 'wontfix', {}, tmpDir)).not.toThrow();
  });

  it('open → duplicate (requires duplicate_of)', () => {
    const t = makeTicket({ state: 'open' });
    expect(() =>
      validateTransition(t, 'duplicate', { duplicate_of: 'abc12345' }, tmpDir)
    ).not.toThrow();
  });

  it('active → open', () => {
    const t = makeTicket({ state: 'active' });
    expect(() => validateTransition(t, 'open', {}, tmpDir)).not.toThrow();
  });

  it('active → blocked', () => {
    const t = makeTicket({ state: 'active' });
    expect(() => validateTransition(t, 'blocked', {}, tmpDir)).not.toThrow();
  });

  it('blocked → active', () => {
    const t = makeTicket({ state: 'blocked' });
    expect(() => validateTransition(t, 'active', {}, tmpDir)).not.toThrow();
  });

  it('blocked → open', () => {
    const t = makeTicket({ state: 'blocked' });
    expect(() => validateTransition(t, 'open', {}, tmpDir)).not.toThrow();
  });
});

// ── Invalid transitions ────────────────────────────────────────────────────────

describe('validateTransition - invalid transitions', () => {
  it('done → open (terminal state)', () => {
    const t = makeTicket({ state: 'done' });
    expect(() => validateTransition(t, 'open', {}, tmpDir)).toThrow(/terminal/i);
  });

  it('wontfix → active (terminal state)', () => {
    const t = makeTicket({ state: 'wontfix' });
    expect(() => validateTransition(t, 'active', {}, tmpDir)).toThrow(/terminal/i);
  });

  it('duplicate → open (terminal state)', () => {
    const t = makeTicket({ state: 'duplicate' });
    expect(() => validateTransition(t, 'open', {}, tmpDir)).toThrow(/terminal/i);
  });

  it('duplicate without duplicate_of throws', () => {
    const t = makeTicket({ state: 'open' });
    expect(() => validateTransition(t, 'duplicate', {}, tmpDir)).toThrow(/duplicate_of/i);
  });
});

// ── Done contract ──────────────────────────────────────────────────────────────

describe('validateTransition - done contract', () => {
  it('bug: requires commit, test_file, test_function', () => {
    const testFile = join(tmpDir, 'test.ts');
    writeFileSync(testFile, 'export {}');
    const t = makeTicket({ type: 'bug', state: 'open' });
    expect(() =>
      validateTransition(t, 'done', { commit: realCommit, test_file: testFile, test_function: 'testFoo' }, tmpDir)
    ).not.toThrow();
  });

  it('bug: missing test_file throws', () => {
    const t = makeTicket({ type: 'bug', state: 'open' });
    expect(() =>
      validateTransition(t, 'done', { commit: realCommit, test_function: 'testFoo' }, tmpDir)
    ).toThrow(/test_file/i);
  });

  it('bug: missing test_function throws', () => {
    const testFile = join(tmpDir, 'test.ts');
    writeFileSync(testFile, 'export {}');
    const t = makeTicket({ type: 'bug', state: 'open' });
    expect(() =>
      validateTransition(t, 'done', { commit: realCommit, test_file: testFile }, tmpDir)
    ).toThrow(/test_function/i);
  });

  it('bug: test_file that does not exist on disk throws', () => {
    const t = makeTicket({ type: 'bug', state: 'open' });
    expect(() =>
      validateTransition(
        t,
        'done',
        { commit: realCommit, test_file: '/nonexistent/test.ts', test_function: 'testFoo' },
        tmpDir
      )
    ).toThrow(/does not exist/i);
  });

  it('feature: test_file satisfies contract', () => {
    const testFile = join(tmpDir, 'feat.test.ts');
    writeFileSync(testFile, 'export {}');
    const t = makeTicket({ type: 'feature', state: 'open' });
    expect(() =>
      validateTransition(t, 'done', { commit: realCommit, test_file: testFile }, tmpDir)
    ).not.toThrow();
  });

  it('feature: note satisfies contract', () => {
    const t = makeTicket({ type: 'feature', state: 'open' });
    expect(() =>
      validateTransition(t, 'done', { commit: realCommit, note: 'shipped with manual test' }, tmpDir)
    ).not.toThrow();
  });

  it('feature: neither test_file nor note throws', () => {
    const t = makeTicket({ type: 'feature', state: 'open' });
    expect(() =>
      validateTransition(t, 'done', { commit: realCommit }, tmpDir)
    ).toThrow(/test_file or a resolution note/i);
  });

  it('refactor: commit only is enough', () => {
    const t = makeTicket({ type: 'refactor', state: 'open' });
    expect(() =>
      validateTransition(t, 'done', { commit: realCommit }, tmpDir)
    ).not.toThrow();
  });

  it('chore: commit only is enough', () => {
    const t = makeTicket({ type: 'chore', state: 'open' });
    expect(() =>
      validateTransition(t, 'done', { commit: realCommit }, tmpDir)
    ).not.toThrow();
  });

  it('debt: commit only is enough', () => {
    const t = makeTicket({ type: 'debt', state: 'open' });
    expect(() =>
      validateTransition(t, 'done', { commit: realCommit }, tmpDir)
    ).not.toThrow();
  });

  it('done: missing commit throws', () => {
    const t = makeTicket({ type: 'refactor', state: 'open' });
    expect(() =>
      validateTransition(t, 'done', {}, tmpDir)
    ).toThrow(/commit/i);
  });

  it('done: nonexistent commit throws', () => {
    const t = makeTicket({ type: 'chore', state: 'open' });
    expect(() =>
      validateTransition(t, 'done', { commit: '0000000000000000000000000000000000000000' }, tmpDir)
    ).toThrow(/does not exist/i);
  });

  it('parent ticket: note required, commit defaults to HEAD', () => {
    const t = makeTicket({
      type: 'feature',
      state: 'open',
      relationships: { children: ['child001', 'child002'] },
    });
    expect(() =>
      validateTransition(t, 'done', { note: 'all children resolved' }, tmpDir)
    ).not.toThrow();
  });

  it('parent ticket: missing note throws', () => {
    const t = makeTicket({
      type: 'feature',
      state: 'open',
      relationships: { children: ['child001'] },
    });
    expect(() =>
      validateTransition(t, 'done', {}, tmpDir)
    ).toThrow(/note/i);
  });
});

// ── applyTransition ────────────────────────────────────────────────────────────

describe('applyTransition', () => {
  it('returns a new ticket object (immutable)', () => {
    const t = makeTicket({ state: 'open' });
    const next = applyTransition(t, 'active', {}, tmpDir);
    expect(next).not.toBe(t);
    expect(t.state).toBe('open');
    expect(next.state).toBe('active');
  });

  it('sets updated_at on transition', () => {
    const t = makeTicket({ state: 'open', updated_at: '2024-01-01T00:00:00.000Z' });
    const next = applyTransition(t, 'active', {}, tmpDir);
    expect(next.updated_at).not.toBe('2024-01-01T00:00:00.000Z');
  });

  it('active → open clears work', () => {
    const t = makeTicket({
      state: 'active',
      work: {
        branch: 'fix/something',
        base_branch: 'main',
        started_at: '2024-01-01T00:00:00.000Z',
        started_by: 'alice',
      },
    });
    const next = applyTransition(t, 'open', {}, tmpDir);
    expect(next.work).toBeUndefined();
  });

  it('done: populates resolution', () => {
    const testFile = join(tmpDir, 'test.ts');
    writeFileSync(testFile, 'export {}');
    const t = makeTicket({ type: 'bug', state: 'open' });
    const next = applyTransition(
      t,
      'done',
      { commit: realCommit, test_file: testFile, test_function: 'testBug', resolved_by: 'alice' },
      tmpDir
    );
    expect(next.resolution).toBeDefined();
    expect(next.resolution!.commit).toBe(realCommit);
    expect(next.resolution!.test_file).toBe(testFile);
    expect(next.resolution!.test_function).toBe('testBug');
    expect(next.resolution!.resolved_by).toBe('alice');
  });

  it('duplicate: sets relationships.duplicates', () => {
    const t = makeTicket({ state: 'open' });
    const next = applyTransition(t, 'duplicate', { duplicate_of: 'canonical01' }, tmpDir);
    expect(next.relationships?.duplicates).toBe('canonical01');
  });

  it('wontfix: just changes state', () => {
    const t = makeTicket({ state: 'open' });
    const next = applyTransition(t, 'wontfix', {}, tmpDir);
    expect(next.state).toBe('wontfix');
  });
});
