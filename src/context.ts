// Context helper used by all CLI commands

import { isGitRepo, getRepoRoot } from './git.js';
import { loadConfig } from './config.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from './types.js';

export interface Context {
  repoRoot: string;
  config: Config;
}

/** Get current context. Exits with code 3 if not a git repo. */
export function getContext(requireInit: boolean = true): Context {
  if (!isGitRepo()) {
    console.error('Error: not a git repository');
    process.exit(3);
  }
  const repoRoot = getRepoRoot();
  if (requireInit) {
    if (!existsSync(join(repoRoot, '.todo', 'config.json'))) {
      console.error('Error: .todo/ not initialized. Run `todo init` first.');
      process.exit(1);
    }
  }
  const config = loadConfig(repoRoot);
  return { repoRoot, config };
}
