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

```
todo new "Add OAuth2 login" --type feature
todo new "Add /auth/callback route" --type chore --parent <feature-id>
todo new "Store session tokens" --type chore --parent <feature-id>
todo work <child-id>   # checks out todo/<feature-id> branch
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

Step by step:

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

For child tickets: `todo work <child-id>` checks out the parent's branch, not a new one.

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
```

The `<id>` is the full 8-char ticket ID. Always include it. This ties commits to tickets and enables commit-based dedup and linking.

---

## Common Mistakes

1. **Closing before committing** — `todo close` captures HEAD. If you haven't committed the fix, the resolution commit is wrong. Always commit code first.

2. **Forgetting `git add .todo/`** — Ticket files live in `.todo/`. They must be committed. After any `todo` command that writes, stage `.todo/`.

3. **Squash merging breaks commit refs** — Tickets store resolution commits. Squash merging replaces them with a new SHA. The linked commit disappears. Use `--no-ff` merges or update the resolution commit after squash.

4. **Using a short prefix when IDs are ambiguous** — If two tickets share a prefix, commands fail. Use more characters of the ID.

5. **Not committing parent ticket after adding children** — Parent `relationships.children` is updated when you create a child. Commit `.todo/` after creating children.

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
todo transition <id> <state>           Transition state
  --commit --test --note --depends-on --duplicate-of
todo close <id>                        Shorthand: transition to done
  --commit --test --note --checkout
todo work <id>                         Start/resume work on a ticket
  --branch --actor
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
todo export <id>                       Export ticket as JSON/markdown
  --format json|markdown
```

---

## Skill Interface

Agents operate via four named skills. Each maps to a phase of the lifecycle.

**todo-capture** — Create a ticket from any signal (log, test failure, comment, agent observation). Use `todo new` with `--source` and `--pipe` as appropriate. Always commit the result.

**todo-triage** — Set type, tags, file links, relationships. Use `todo edit`, `todo link`. Run `todo dedup` after bulk captures. Commit `.todo/`.

**todo-analyze** — Build up the understanding of a bug or requirement. Use `todo analyze` with sequenced entries: hypothesis → evidence → conclusion. Reference supporting indices. Commit when done.

**todo-implement** — Run `todo work` to branch, implement, commit with the `todo:<id>` prefix, then `todo close`. Always commit `.todo/` after close.
