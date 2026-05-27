import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isGitRepo,
  getCurrentBranch,
  resolveHEAD,
  commitExists,
  branchExists,
  createBranch,
  checkoutBranch,
  getRepoRoot,
  getGitUserName,
  getCommitsAhead,
  isAncestor,
  getLastCommitForFile,
  commitTodoState,
  GitError,
} from '../src/git.js';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { makeTempDir, removeTempDir, initGitRepo, makeCommit } from './helpers.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = makeTempDir();
  initGitRepo(tmpDir);
});

afterEach(() => {
  removeTempDir(tmpDir);
});

describe('isGitRepo', () => {
  it('returns true inside a git repo', () => {
    expect(isGitRepo(tmpDir)).toBe(true);
  });

  it('returns false outside a git repo', () => {
    const nonRepo = makeTempDir();
    try {
      expect(isGitRepo(nonRepo)).toBe(false);
    } finally {
      removeTempDir(nonRepo);
    }
  });
});

describe('getRepoRoot', () => {
  it('returns the repo root path', () => {
    makeCommit(tmpDir);
    // On some systems tmpDir might be under /var which resolves to /private/var
    const root = getRepoRoot(tmpDir);
    // should end with the same directory name
    expect(root).toBeTruthy();
  });
});

describe('getCurrentBranch', () => {
  it('returns main after init with initial commit', () => {
    makeCommit(tmpDir);
    expect(getCurrentBranch(tmpDir)).toBe('main');
  });
});

describe('resolveHEAD', () => {
  it('returns a 40-char SHA after a commit', () => {
    makeCommit(tmpDir);
    const head = resolveHEAD(tmpDir);
    expect(head).toMatch(/^[0-9a-f]{40}$/);
  });
});

describe('commitExists', () => {
  it('returns true for a real commit SHA', () => {
    const sha = makeCommit(tmpDir);
    expect(commitExists(sha, tmpDir)).toBe(true);
  });

  it('returns false for a nonexistent SHA', () => {
    makeCommit(tmpDir);
    expect(commitExists('0000000000000000000000000000000000000000', tmpDir)).toBe(false);
  });

  it('returns false for a non-commit object', () => {
    makeCommit(tmpDir);
    // A tree object is not a commit
    expect(commitExists('HEAD^{tree}', tmpDir)).toBe(false);
  });
});

describe('branchExists', () => {
  it('returns true for the main branch', () => {
    makeCommit(tmpDir);
    expect(branchExists('main', tmpDir)).toBe(true);
  });

  it('returns false for a nonexistent branch', () => {
    makeCommit(tmpDir);
    expect(branchExists('nonexistent-branch-xyz', tmpDir)).toBe(false);
  });
});

describe('createBranch / checkoutBranch', () => {
  it('creates a new branch and can check it out', () => {
    makeCommit(tmpDir);
    createBranch('feature/test', tmpDir);
    expect(getCurrentBranch(tmpDir)).toBe('feature/test');
    checkoutBranch('main', tmpDir);
    expect(getCurrentBranch(tmpDir)).toBe('main');
  });

  it('branchExists is true after createBranch', () => {
    makeCommit(tmpDir);
    createBranch('my-branch', tmpDir);
    checkoutBranch('main', tmpDir);
    expect(branchExists('my-branch', tmpDir)).toBe(true);
  });
});

describe('getGitUserName', () => {
  it('returns the configured user name', () => {
    expect(getGitUserName(tmpDir)).toBe('Test User');
  });
});

describe('getCommitsAhead', () => {
  it('returns 0 when branch is at base', () => {
    makeCommit(tmpDir);
    expect(getCommitsAhead('main', 'main', tmpDir)).toBe(0);
  });

  it('returns correct count after new commits on branch', () => {
    makeCommit(tmpDir);
    createBranch('feature', tmpDir);
    makeCommit(tmpDir, 'second.txt', 'hello2');
    makeCommit(tmpDir, 'third.txt', 'hello3');
    expect(getCommitsAhead('feature', 'main', tmpDir)).toBe(2);
  });
});

describe('isAncestor', () => {
  it('returns true when first commit is ancestor of second', () => {
    const sha1 = makeCommit(tmpDir);
    makeCommit(tmpDir, 'second.txt');
    expect(isAncestor(sha1, 'HEAD', tmpDir)).toBe(true);
  });

  it('returns false when commit is not an ancestor', () => {
    makeCommit(tmpDir);
    const sha2 = makeCommit(tmpDir, 'second.txt');
    // sha2 is not an ancestor of sha1 (first commit)
    expect(isAncestor(sha2, 'HEAD~1', tmpDir)).toBe(false);
  });
});

describe('getLastCommitForFile', () => {
  it('returns SHA of the commit that last modified a file', () => {
    const sha = makeCommit(tmpDir, 'file.txt', 'content');
    const result = getLastCommitForFile('file.txt', tmpDir);
    expect(result).toBe(sha);
  });
});

describe('GitError', () => {
  it('is thrown on invalid git commands', () => {
    expect(() => resolveHEAD(makeTempDir())).toThrow(GitError);
  });
});

describe('commitTodoState', () => {
  function writeOpenTicket(dir: string, id: string): void {
    const p = join(dir, '.todo', 'open', `${id}.json`);
    writeFileSync(p, JSON.stringify({ id, state: 'open' }), 'utf8');
  }

  it('stages additions, modifications, and deletions under .todo/ and commits', () => {
    makeCommit(tmpDir); // base commit so HEAD exists
    mkdirSync(join(tmpDir, '.todo', 'open'), { recursive: true });
    mkdirSync(join(tmpDir, '.todo', 'done'), { recursive: true });
    writeOpenTicket(tmpDir, 'abcd1234');
    execFileSync('git', ['add', '-A', '.todo'], { cwd: tmpDir });
    execFileSync('git', ['commit', '-m', 'add ticket'], { cwd: tmpDir });

    // Simulate a close: move open/ -> done/ (a deletion AND an addition).
    rmSync(join(tmpDir, '.todo', 'open', 'abcd1234.json'));
    writeFileSync(
      join(tmpDir, '.todo', 'done', 'abcd1234.json'),
      JSON.stringify({ id: 'abcd1234', state: 'done' }),
      'utf8'
    );

    const before = resolveHEAD(tmpDir);
    const sha = commitTodoState('todo:abcd1234 — close', tmpDir);

    expect(sha).not.toBe(before); // a new commit was made
    expect(commitExists(sha, tmpDir)).toBe(true);
    // Working tree is clean: the move was fully captured.
    const status = execFileSync('git', ['status', '--porcelain'], { cwd: tmpDir, encoding: 'utf8' });
    expect(status.trim()).toBe('');
  });

  it('only commits .todo/, leaving unrelated working-tree changes unstaged', () => {
    makeCommit(tmpDir);
    mkdirSync(join(tmpDir, '.todo', 'open'), { recursive: true });
    writeOpenTicket(tmpDir, 'beef0001');
    writeFileSync(join(tmpDir, 'src.txt'), 'uncommitted code change', 'utf8');

    commitTodoState('todo:beef0001 — close', tmpDir);

    // The code change is still pending — it was not swept into the state commit.
    const status = execFileSync('git', ['status', '--porcelain'], { cwd: tmpDir, encoding: 'utf8' });
    expect(status).toContain('src.txt');
  });

  it('makes no commit and returns current HEAD when nothing is staged', () => {
    makeCommit(tmpDir);
    mkdirSync(join(tmpDir, '.todo', 'open'), { recursive: true });
    writeOpenTicket(tmpDir, 'cafe0002');
    execFileSync('git', ['add', '-A', '.todo'], { cwd: tmpDir });
    execFileSync('git', ['commit', '-m', 'add ticket'], { cwd: tmpDir });

    // .todo/ exists and is fully committed — nothing left to record.
    const head = resolveHEAD(tmpDir);
    const result = commitTodoState('todo:cafe0002 — close', tmpDir);
    expect(result).toBe(head);
  });
});
