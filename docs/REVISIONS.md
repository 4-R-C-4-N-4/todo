# todo CLI — Proposed Revisions

Drafted from real agent-orchestration usage (cap-sdk Tier 2 refactor, April 2026).
Two distinct problems with two distinct fixes.

---

## Problem 1: stderr leaks from `exec()` pollute terminal output

### Root cause

`git.ts` `exec()` uses:

```ts
execFileSync("git", args, { encoding: "utf8", cwd })
```

This captures stdout but lets stderr pass through to the terminal. Every git call
that fails (even ones that are intentionally caught and handled) prints its error
to the terminal before the `catch` runs.

Concrete examples observed:

- `branchExists("todo/b25aecff")` calls `git rev-parse --verify refs/heads/todo/b25aecff`
  when the branch doesn't exist. Git writes `fatal: Needed a single revision` to
  stderr. The catch correctly returns `false`, but the message already printed.

- `checkoutBranch(branch)` calls `git checkout branch`. When already on that branch,
  git writes `Already on 'todo/b25aecff'` to stderr. Not an error, but it interleaves
  with todo's own output confusingly.

- `createBranch(branch)` calls `git checkout -b branch`. Writes
  `Switched to a new branch 'branch'` to stderr. Again, not an error but noise.

### Fix

Suppress stderr in the internal `exec()` helper. Callers that actually need git's
error text already re-throw with their own message via `GitError`.

```ts
// git.ts — exec()
function exec(args: string[], cwd: string): string {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      cwd,
      stdio: ["pipe", "pipe", "pipe"],  // <-- add this; captures stderr, suppresses leak
    }).trim();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new GitError(`git ${args.join(" ")} failed: ${msg}`, err);
  }
}
```

One-line change. Zero behaviour change — callers get the same `GitError` with the
same message (Node puts stderr into `err.message` for `execFileSync` when stdio
is piped). Git's raw stderr never reaches the terminal again.

If you want to preserve stderr for debugging in specific cases (e.g. `createBranch`),
add a separate `execPassthrough()` that doesn't suppress it — but for all the
probe/check calls (`branchExists`, `commitExists`, `isAncestor`), silent failure is
exactly what you want.

---

## Problem 2: Orchestrator friction — `todo work` per ticket when already on the branch

### What the pain is

When an orchestrating agent dispatches subagents sequentially:

1. `todo work <child-1>` — creates branch, activates ticket
2. Dispatch subagent — it commits the work
3. `todo close <child-1>` + commit `.todo/`
4. `todo work <child-2>` — resumes same branch, activates ticket
5. Dispatch subagent — it commits the work
6. `todo close <child-2>` + commit `.todo/`
7. ...

Step 4 is the friction point. The orchestrator is already on `todo/<parent-id>`.
`todo work <child-2>` does a `git checkout todo/<parent-id>` that's a no-op (already
there), then reads the ahead-count, then prints "Resumed branch". The git checkout
is pure ceremony. And if the orchestrator is not careful about calling `todo work`
before dispatching, the child stays in `open` state while the subagent is working
on it — which is a silent inconsistency.

There's also a conceptual mismatch: the orchestrator is managing ticket state as
bookkeeping, not as "starting work" — it already knows what branch it's on.

### Fix: `--no-branch` flag on `todo work`

Add a flag that performs the state transition (open → active) without any git
branch operations. The branch is assumed to already be correct.

```
todo work <id> --no-branch
```

Behaviour:
- Resolves the ticket
- Validates it is not terminal
- Transitions to `active` (writing the work block with the CURRENT branch, not
  the computed target branch)
- Writes `.todo/` and prints the confirmation line
- Does NOT call `branchExists`, `checkoutBranch`, `createBranch`, or `getCommitsAhead`

This is safe because:
- Orchestrators that use `--no-branch` are responsible for being on the right
  branch already (they created it on the first `todo work` without the flag)
- Subagents share the parent's branch — they never switch branches themselves
- The state transition is still recorded, so `todo list` shows active tickets correctly

Implementation in `work.ts` — add at the top of the action handler:

```ts
.option("--no-branch", "transition to active without any git branch operations")
```

Then wrap the entire branch block:

```ts
if (!opts.noBranch) {
  // ... existing branch create/resume logic ...
} else {
  // --no-branch: just activate, record current branch
  const currentBranch = getCurrentBranch(repoRoot);
  if (ticket.state !== "active") {
    const now = new Date().toISOString();
    let updated;
    try {
      updated = applyTransition(ticket, "active", { actor }, repoRoot);
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
    updated.work = {
      branch: currentBranch,
      base_branch: getDefaultBranch(repoRoot),
      started_at: now,
      started_by: actor,
    };
    updated.updated_at = now;
    writeTicket(repoRoot, updated);
  }
  console.log(`Activated ticket ${ticket.id} on current branch ${currentBranch}.`);
}
```

### Alternative / complementary: `todo next <parent-id>`

A higher-level command for the orchestration pattern:

```
todo next <parent-id>
```

Finds the first open child of `<parent-id>` (in creation order), transitions it
to active on the current branch (`--no-branch` semantics), and prints the ticket ID.
Returns exit code 1 if all children are done.

Useful for scripted orchestration loops:

```bash
while next=$(todo next b25aecff 2>/dev/null); do
  echo "Working $next"
  # ... dispatch subagent ...
  git add -A && git commit -m "todo:$next — ..."
  todo close $next --note "..."
  git add .todo/ && git commit -m "todo:$next — close"
done
todo close b25aecff --note "All children done."
```

This makes the orchestration pattern first-class rather than a convention baked
into a skill doc. The skill doc can then just say "use `todo next`" instead of
spelling out the manual juggle.

---

## Minor observation: `todo work` output on resume says "commits ahead of main"

On the resume path, `getCommitsAhead` is called against `defaultBranch`. This is
useful context for humans. For agent orchestrators reading the output, the number
is noise. Not a blocker, just noting it's agent-facing output that could be
cleaner — e.g. only print the ahead-count if it's > 0 and we're not in `--no-branch`
mode.

---

## Priority

| Fix | Effort | Impact |
|---|---|---|
| Suppress stderr in `exec()` | 1 line | High — eliminates all false-alarm output |
| `--no-branch` flag on `todo work` | ~20 lines | Medium — removes ceremony from orchestration |
| `todo next <parent>` | ~40 lines new command | Medium — makes orchestration pattern scriptable |

Recommend doing stderr fix first (trivial, no tradeoffs), then `--no-branch` since
it's the minimal change that solves the friction, then `todo next` if the pattern
becomes common enough to warrant a dedicated command.
