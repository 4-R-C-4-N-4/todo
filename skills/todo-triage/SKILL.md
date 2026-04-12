---
name: todo-triage
description: >
  Classify, tag, and contextualize an open ticket after capture. Corrects the ticket type,
  adds tags, links to relevant files and commits, checks for duplicates, and optionally
  transitions to wontfix or duplicate. Use immediately after todo-capture when the ticket
  needs more context before work begins, or during a sweep of many open tickets.
  Must NOT transition to active — that's for todo-analyze or todo-implement.
compatibility: Requires git and the todo CLI (npm i -g @todo/cli).
metadata:
  hermes:
    tags: [todo, tickets, triage, classification, dedup]
    related_skills: [todo-capture, todo-analyze, todo-implement]
---

# todo-triage

**Purpose:** Assess and classify an open ticket. Improve its signal before anyone acts on it.

**Contract:** Do NOT transition to `active` here. Leave tickets in `open` state unless marking `wontfix` or `duplicate`.

## Steps

### 1. Read the ticket
```bash
todo show <id>
```

### 2. Correct the type if needed

| Signal | Correct type |
|---|---|
| Something broken, incorrect behavior | `bug` |
| New capability requested | `feature` |
| Internal restructuring, no behavior change | `refactor` |
| Config, tooling, deps, cleanup | `chore` |
| Known-bad code to address later | `debt` |

```bash
todo edit <id> --type bug
```

### 3. Add tags

Tags are freeform. Use kebab-case. Examples: `auth`, `crash`, `regression`, `parser`, `performance`.
```bash
todo edit <id> --tags "auth,crash,regression"
# Or add one at a time:
todo edit <id> --add-tag parser
```

### 4. Link relevant files and commits

```bash
# Link a file (with line range if known)
todo link <id> --to src/auth/handler.ts

# Link a specific commit (if you know where the bug was introduced)
todo link <id> --to <commit-sha>

# Link to a related ticket
todo link <id> --to <other-ticket-id> --relation related
```

### 5. Check for duplicates

```bash
# Quick scan
todo dedup --strategy fingerprint
todo dedup --strategy file-line
```

If a duplicate is confirmed:
```bash
todo transition <id> duplicate --duplicate-of <canonical-id>
git add .todo/ && git commit -m "todo:<id> — duplicate of <canonical-id>"
```

### 6. Mark wontfix if appropriate

If the ticket describes intended behavior or is explicitly out of scope:
```bash
todo transition <id> wontfix --note "Intended behavior: empty list is valid state"
git add .todo/ && git commit -m "todo:<id> — wontfix"
```

### 7. Commit triage changes

```bash
git add .todo/
git commit -m "todo:<id> — triage"
```

## Output

A ticket in `open` state with:
- Correct `type`
- Meaningful `tags`
- `files` array linking to relevant code
- No duplicate open tickets for the same issue

Hand off to `todo-analyze` (needs investigation) or `todo-implement` (root cause already known).

---

See [CLI reference](references/cli.md) for all flags.
