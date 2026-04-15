# todo BIBLE

## What is `todo`

`todo` is a git-native ticket tracker. Tickets are JSON files committed alongside code in `.todo/`. Agents are first-class citizens: every command is designed to be run by a coding agent, not just a human. The proof is in the workflow, not the README.

---

## Two Modes of Work

### Standalone ticket
One bug, one fix, one commit.

```
todo new "Fix null pointer in auth handler" --type bug --source log
todo work <id>
# ... fix it ...
todo close <id>
```

### Feature build (parent + children)
A parent ticket tracks the feature. Children track subtasks. All children share the parent's branch.

```bash
todo new "Add OAuth2 login" --type feature
todo new "Add /auth/callback route" --type chore --parent <feature-id>
todo new "Store session tokens" --type chore --parent <feature-id>
todo new "Write integration tests" --type chore --parent <feature-id>

# First child creates the shared branch
todo work <child-1-id>

# Subsequent children — use todo next (preferred)
while next=$(todo next <feature-id> 2>/dev/null); do
  # implement $next ...
  git add -A && git commit -m "todo:$next — ..."
  todo close $next --note "..."
  git add .todo/ && git commit -m "todo:$next — close"
done

todo close <feature-id> --note "All subtasks done."
```

Children resolve on the parent branch. Close all children before closing the parent.

---

## The Full Lifecycle

1. **Capture** — Create a ticket.
   ```
   todo new "Summary of the problem" --type bug --source human
   ```

2. **Triage** — Tag, edit, set context.
   ```
   todo edit <id> --type bug --tags "auth,crash"
   todo link <id> --to path/to/file.ts
   ```

3. **Analyze** — Add structured analysis entries.
   ```
   todo analyze <id> --type hypothesis --content "Null check missing in auth.ts:42" --confidence medium
   todo analyze <id> --type evidence --content "Reproduced with test_auth.py::test_login_null"
   todo analyze <id> --type conclusion --content "Missing guard on user.profile before access" --supporting "0,1"
   ```

4. **Implement** — Start work, write code, commit.
   ```
   todo work <id>
   # write fix
   git add -A
   git commit -m "todo:<id> — fix null check in auth handler"
   ```

5. **Close** — Resolve and record.
   ```
   todo close <id> --note "Added null guard at line 42"
   git add .todo/
   git commit -m "todo:<id> — close"
   ```

---

## The Branch Workflow

### Standalone ticket

```bash
# 1. Start work — creates branch todo/<id>, transitions ticket to active
todo work <id>

# 2. Implement the fix
# ... edit files ...

# 3. Commit with the convention
git add -A
git commit -m "todo:<id> — describe what you did"

# 4. Close the ticket (captures HEAD commit as resolution)
todo close <id>

# 5. Commit the ticket state change
git add .todo/
git commit -m "todo:<id> — close"

# 6. Merge back to main
git checkout main
git merge --no-ff todo/<id>
git branch -d todo/<id>
```

### Feature build (shared branch)

All children share `todo/<parent-id>`. The first `todo work` creates the branch; subsequent children must not trigger a redundant checkout.

```bash
# First child — creates todo/<parent-id>
todo work <child-1-id>
git add -A && git commit -m "todo:<child-1-id> — ..."
todo close <child-1-id> --note "..."
git add .todo/ && git commit -m "todo:<child-1-id> — close"

# Remaining children — todo next handles activation cleanly
while next=$(todo next <parent-id> 2>/dev/null); do
  # implement ...
  git add -A && git commit -m "todo:$next — ..."
  todo close $next --note "..."
  git add .todo/ && git commit -m "todo:$next — close"
done

# Close parent
todo close <parent-id> --note "All children done."
git add .todo/ && git commit -m "todo:<parent-id> — close"
git checkout main && git merge --no-ff todo/<parent-id>
git branch -d todo/<parent-id>
```

`todo next <parent-id>` finds the first open child (in creation order), activates it on the current branch without any git checkout, prints its ID to stdout and a summary to stderr. Exits 1 when all children are done — that's what stops the `while` loop.

If you need manual control instead of a loop, use `todo work --skip-branch <child-id>` to activate a child without a redundant checkout. Do NOT use plain `todo work` for subsequent children on a shared branch — it performs a no-op checkout and prints confusing resume output.

---

## Ticket Types

| Type | When to use |
|------|-------------|
| `bug` | Something is broken and needs fixing |
| `feature` | New capability that doesn't exist yet |
| `refactor` | Code change with no behavior change |
| `chore` | Tooling, config, dependency updates, cleanup |
| `debt` | Known-bad code that needs to be addressed later |

---

## The Done Contract

What's required before closing each ticket type:

| Type | Required to close |
|------|-------------------|
| `bug` | Commit SHA, ideally a test reference |
| `feature` | Commit SHA, children all closed |
| `refactor` | Commit SHA, tests still passing |
| `chore` | Commit SHA |
| `debt` | Commit SHA, note explaining what changed |

Close command: `todo close <id> --note "what you did" --test tests/foo.ts::test_name`

---

## Commit Message Convention

Format: `todo:<id> — <description>`

Examples:
```
todo:a1b2c3d4 — fix null pointer in auth handler
todo:a1b2c3d4 — close
todo:e5f6a7b8 — add /auth/callback route
todo:e8e874e9 — plan: 4 subtasks
```

The `<id>` is the full 8-char ticket ID. Always include it. This ties commits to tickets and enables commit-based dedup and linking.

---

## Common Mistakes

1. **Closing before committing** — `todo close` captures HEAD. If you haven't committed the fix, the resolution commit is wrong. Always commit code first.

2. **Forgetting `git add .todo/`** — Ticket files live in `.todo/`. They must be committed. After any `todo` command that writes, stage `.todo/`.

3. **Squash merging breaks commit refs** — Tickets store resolution commits. Squash merging replaces them with a new SHA. The linked commit disappears. Use `--no-ff` merges or update the resolution commit after squash.

4. **Using a short prefix when IDs are ambiguous** — If two tickets share a prefix, commands fail. Use more characters of the ID.

5. **Not committing parent ticket after adding children** — Parent `relationships.children` is updated when you create a child. Commit `.todo/` after creating children.

6. **Using plain `todo work` for subsequent children on a shared branch** — After the first child creates `todo/<parent-id>`, calling `todo work <child-N>` again does a redundant checkout and prints misleading "Resumed branch" output. Use `todo next <parent-id>` (preferred) or `todo work --skip-branch <child-N>` instead.

7. **Using `--no-branch` instead of `--skip-branch`** — Commander.js treats `--no-X` as negating the `--X <value>` option. `--no-branch` silently overrides `--branch <name>` rather than setting a new flag. The correct flag is `--skip-branch`.

---

## CLI Quick Reference

```
todo init                              Initialize .todo/ in current git repo
todo new <summary>                     Create a ticket
  --type bug|feature|refactor|chore|debt
  --source log|test|agent|human|comment
  --file <path>  --lines <start,end>
  --tags <t1,t2>  --parent <id>  --pipe
todo list                              List open tickets
  --state --type --tag --file --done --all
todo show <id>                         Show ticket detail
  --raw
todo edit <id>                         Edit ticket fields
  --summary --description --type --tags --add-tag --rm-tag
  --parent <id>                        reparent under a different parent
todo transition <id> <state>           Transition state
  --commit --test --note --depends-on --duplicate-of
todo close <id>                        Shorthand: transition to done
  --commit --test --note --checkout
todo work <id>                         Start/resume work on a ticket
  --branch --actor
  --skip-branch                        Activate on current branch, no git ops (orchestrator mode)
todo next <parent-id>                  Activate next open child on current branch
                                       stdout: ticket ID  stderr: summary  exit 1: all done
  --actor
todo analyze <id>                      Add analysis entry
  --type blame|hypothesis|evidence|conclusion (required)
  --content <text> (required)
  --confidence low|medium|high
  --supporting <indices>
todo link <id>                         Link ticket to commit/file/ticket
  --to <target> (required)
  --relation depends_on|blocks|related|duplicates
  --as <note>
todo scan                              Scan source tree for TODO/FIXME comments
  --dry-run  --type <tickettype>
todo dedup                             Find duplicate tickets
  --strategy fingerprint|file-line|semantic
  --apply
todo export                            Export tickets as JSON
  --state --type
```

---

## Skill Interface

Agents operate via five named skills. Each maps to a phase of the lifecycle.

**todo-capture** — Create a ticket from any signal (log, test failure, comment, agent observation). Use `todo new` with `--source` and `--pipe` as appropriate. Always commit the result.

**todo-triage** — Set type, tags, file links, relationships. Use `todo edit`, `todo link`. Run `todo dedup` after bulk captures. Commit `.todo/`.

**todo-analyze** — Build up the understanding of a bug or requirement. Use `todo analyze` with sequenced entries: hypothesis → evidence → conclusion. Reference supporting indices. Commit when done.

**todo-plan** — Decompose a feature or spec into a parent ticket with ordered children. Use `todo new --parent` to wire children. Commit the full structure before handing off. Children are worked sequentially on the parent's branch via `todo next`.

**todo-implement** — Run `todo work` to branch, implement, commit with the `todo:<id>` prefix, then `todo close`. Use `todo next` to advance through children on a shared branch. Always commit `.todo/` after close.
