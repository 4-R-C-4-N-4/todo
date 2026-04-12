// Test helpers

import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Ticket, Source, TicketType, State } from '../src/types.js';

export function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'todo-test-'));
}

export function removeTempDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

export function initGitRepo(dir: string): void {
  execFileSync('git', ['init', '-b', 'main'], { cwd: dir, encoding: 'utf8' });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir, encoding: 'utf8' });
  execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: dir, encoding: 'utf8' });
}

export function makeCommit(dir: string, filename: string = 'file.txt', content: string = 'hello'): string {
  const filePath = join(dir, filename);
  writeFileSync(filePath, content, 'utf8');
  execFileSync('git', ['add', filename], { cwd: dir, encoding: 'utf8' });
  execFileSync('git', ['commit', '-m', `add ${filename}`], { cwd: dir, encoding: 'utf8' });
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim();
  return sha;
}

export function makeTodoDir(repoRoot: string): void {
  mkdirSync(join(repoRoot, '.todo', 'open'), { recursive: true });
  mkdirSync(join(repoRoot, '.todo', 'done'), { recursive: true });
}

export function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  const source: Source = { type: 'human', raw: 'test' };
  return {
    id: 'abcdef12',
    type: 'bug' as TicketType,
    state: 'open' as State,
    summary: 'Test ticket',
    source,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}
