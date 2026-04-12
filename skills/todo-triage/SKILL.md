---
name: todo-triage
description: >
  Classify, tag, and contextualize a ticket that arrived with incomplete metadata. Use ONLY
  after raw pipe capture (log or test output with no type, tags, or file context) or after a
  bulk todo scan sweep. Do NOT use for tickets you created yourself with full metadata — that
  is wasted ceremony. Must NOT transition to active — that's for todo-analyze or todo-implement.
compatibility: Requires git and the todo CLI (npm i -g @todo/cli).
metadata:
  hermes:
    tags: [todo, tickets, triage, classification, dedup]
    related_skills: [todo-capture, todo-analyze, todo-implement]
---

# todo-triage

**Purpose:** Enrich tickets that arrived incomplete. Not a mandatory lifecycle phase.

**Contract:** Do NOT transition to `active` here. Leave tickets in `open` state unless marking `wontfix` or `duplicate`.

## When to Use This Skill

**Use it when:**
- Ticket was created from piped log/test output — no type, tags, or file context
- Many tickets just arrived from `todo scan` and need bulk classification

**Skip it when:**
- You created the ticket yourself with `--type`, `--tags`, and `--file` already set
- The ticket summary is self-explanatory and needs no further metadata
- You're about to start work immediately via `todo-implement`

If you already know what to do with a ticket, go directly to `todo-implement`. Triage is overhead unless the ticket is actually missing information.

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
```

### 4. Link relevant files

```bash
todo link <id> --to src/auth/handler.ts
```

### 5. Check for duplicates (after bulk intake only)

```bash
todo dedup --strategy fingerprint
todo dedup --strategy file-line
```

If a duplicate is confirmed:
```bash
todo transition <id> duplicate --duplicate-of <canonical-id>
git add .todo/ && git commit -m "todo:<id> — duplicate of <canonical-id>"
```

### 6. Mark wontfix if appropriate

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

A ticket in `open` state with correct type, tags, and file links.

Hand off to `todo-analyze` (root cause unknown) or `todo-implement` (root cause known).

---

See [CLI reference](references/cli.md) for all flags.
