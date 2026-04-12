---
name: todo-implement
description: >
  Execute a fix or feature and close the ticket with proof. Writes code, writes or updates
  tests, commits with the todo:<id> convention, then closes the ticket with a linked commit
  and test reference. Enforces the done contract: bugs require a test, features require a
  test or note, all types require a linked commit. Use when the root cause is understood and
  it's time to write code. Always call todo work first if not already on the branch.
compatibility: Requires git and the todo CLI (npm i -g @todo/cli).
metadata:
  hermes:
    tags: [todo, tickets, implementation, fix, feature, close, done]
    related_skills: [todo-analyze, todo-capture, todo-plan]
---

# todo-implement

**Purpose:** Implement the fix or feature and close the ticket with verifiable proof.

**Contract:** Must satisfy the done contract before calling `todo close`. The commit must exist in the repo. For bugs: test file and function are required.

## Steps

### 1. Start work (if not already on the branch)
```bash
todo work <id>
```
Creates/resumes `todo/<id>` branch. Transitions ticket to `active` if not already.

### 2. Read the ticket
```bash
todo show <id>
```
If analysis entries exist, read the conclusion before writing any code.

### 3. Implement the fix

Write the code change. For bugs: also write a regression test.

### 4. Verify

Run the relevant tests. Confirm the fix works and nothing regressed.

### 5. Commit the code change
```bash
git add <changed files> <test files>
git commit -m "todo:<id> — describe what you changed"
```
Do NOT include `.todo/` in this commit — that comes after `close`.

### 6. Close the ticket

`todo close` defaults `--commit` to HEAD. Always commit the fix first so HEAD is the right commit.

**Bug:**
```bash
todo close <id> \
  --test tests/test_parser.py::test_empty_input \
  --note "Restored null guard removed in abc1234"
```
Both test file and function are required for bugs.

**Feature:**
```bash
todo close <id> \
  --test tests/auth/test_oauth.ts::test_callback_redirect \
  --note "OAuth2 callback route implemented and tested"
```
Either `--test` or `--note` required for features.

**Refactor / Chore / Debt:**
```bash
todo close <id> --note "Extracted validation logic into shared module"
```
Commit is captured from HEAD automatically. Note is optional.

**Parent ticket (all children must be closed first):**
```bash
todo close <feature-id> --note "All subtasks complete. Feature shipped."
```

### 7. Commit the ticket state change
```bash
git add .todo/
git commit -m "todo:<id> — close"
```

### 8. Merge back to main
```bash
git checkout main
git merge --no-ff todo/<id>
git branch -d todo/<id>
```

**Use `--no-ff`, never squash.** Squash replaces commit SHAs — the resolution commit stored in the ticket points at an orphaned commit that `git gc` will eventually delete.

## Done Contract Quick Reference

| Type | commit | test_file | test_function | note |
|---|---|---|---|---|
| `bug` | required | required | required | optional |
| `feature` | required | optional | optional | required if no test |
| `refactor` | required | — | — | optional |
| `chore` | required | — | — | optional |
| `debt` | required | — | — | optional |
| parent | HEAD (default) | — | — | required |

## Feature Builds (Parent + Children)

Children share the parent's branch. Work them sequentially:
```bash
# First child — creates todo/<parent-id> branch
todo work <child-id>
git add -A && git commit -m "todo:<child-id> — add email validator"
todo close <child-id> --test tests/test_email.ts::test_validate_email
git add .todo/ && git commit -m "todo:<child-id> — close"

# Next child — resumes same branch
todo work <next-child-id>
# ... repeat for each child ...

# Close parent when all children are done
todo close <parent-id> --note "All tasks complete."
git add .todo/ && git commit -m "todo:<parent-id> — close"
git checkout main && git merge --no-ff todo/<parent-id>
```

## Common Mistakes

1. **Closing before committing** — `todo close` captures HEAD. Commit the fix first, always.
2. **Forgetting `git add .todo/`** — Ticket state lives in `.todo/`. Commit it after every close.
3. **Squash merging** — Breaks resolution commit references. Use `--no-ff`.

---

See [CLI reference](references/cli.md) for all flags.
