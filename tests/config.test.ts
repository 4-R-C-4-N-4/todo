import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  loadConfig,
  getBranchMode,
  getGuardMode,
  getCommitPrefix,
  DEFAULT_CONFIG,
} from '../src/config.js';
import { makeTempDir, removeTempDir } from './helpers.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = makeTempDir();
  mkdirSync(join(tmpDir, '.todo'), { recursive: true });
});

afterEach(() => {
  removeTempDir(tmpDir);
});

function writeConfig(obj: unknown): void {
  writeFileSync(join(tmpDir, '.todo', 'config.json'), JSON.stringify(obj), 'utf8');
}

describe('getBranchMode', () => {
  it('defaults to per-ticket when unset', () => {
    expect(getBranchMode(DEFAULT_CONFIG)).toBe('per-ticket');
    expect(getBranchMode({})).toBe('per-ticket');
    expect(getBranchMode({ behavior: {} })).toBe('per-ticket');
  });

  it('returns managed when configured', () => {
    expect(getBranchMode({ behavior: { branch_mode: 'managed' } })).toBe('managed');
  });
});

describe('getGuardMode', () => {
  it('defaults to advisory when unset', () => {
    expect(getGuardMode(DEFAULT_CONFIG)).toBe('advisory');
    expect(getGuardMode({})).toBe('advisory');
    expect(getGuardMode({ behavior: {} })).toBe('advisory');
  });

  it('returns strict when configured', () => {
    expect(getGuardMode({ behavior: { guard_mode: 'strict' } })).toBe('strict');
  });

  it('reads guard_mode from .todo/config.json', () => {
    writeConfig({ behavior: { guard_mode: 'strict' } });
    expect(getGuardMode(loadConfig(tmpDir))).toBe('strict');
  });
});

describe('loadConfig with branch_mode', () => {
  it('reads branch_mode = managed from .todo/config.json', () => {
    writeConfig({ behavior: { branch_mode: 'managed' } });
    const cfg = loadConfig(tmpDir);
    expect(getBranchMode(cfg)).toBe('managed');
  });

  it('preserves commit_prefix default when only branch_mode is overridden', () => {
    writeConfig({ behavior: { branch_mode: 'managed' } });
    const cfg = loadConfig(tmpDir);
    // deepMerge must not drop the sibling default.
    expect(getCommitPrefix(cfg)).toBe('todo:');
  });

  it('falls back to per-ticket default when no config file exists', () => {
    const cfg = loadConfig(tmpDir);
    expect(getBranchMode(cfg)).toBe('per-ticket');
  });
});
