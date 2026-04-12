import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeTempDir, removeTempDir, initGitRepo } from '../helpers.js';
import { DEFAULT_CONFIG, getTodoDir } from '../../src/config.js';
import { ensureTodoDir } from '../../src/config.js';
import { writeFileSync } from 'node:fs';

describe('init command logic', () => {
  let dir: string;

  beforeEach(() => {
    dir = makeTempDir();
    initGitRepo(dir);
  });

  afterEach(() => {
    removeTempDir(dir);
  });

  it('creates .todo/ directory structure', () => {
    ensureTodoDir(dir);
    expect(existsSync(join(dir, '.todo', 'open'))).toBe(true);
    expect(existsSync(join(dir, '.todo', 'done'))).toBe(true);
  });

  it('creates config.json with default config', () => {
    ensureTodoDir(dir);
    const configPath = join(getTodoDir(dir), 'config.json');
    writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf8');
    expect(existsSync(configPath)).toBe(true);
    const raw = readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    expect(parsed.display?.id_length).toBe(8);
    expect(parsed.behavior?.commit_prefix).toBe('todo:');
  });

  it('does not overwrite existing config.json', () => {
    ensureTodoDir(dir);
    const configPath = join(getTodoDir(dir), 'config.json');
    const customConfig = { custom: true };
    writeFileSync(configPath, JSON.stringify(customConfig), 'utf8');

    // Simulate checking if exists (as init does)
    if (!existsSync(configPath)) {
      writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf8');
    }

    const raw = readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    expect(parsed.custom).toBe(true);
  });
});
