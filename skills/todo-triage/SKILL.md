---
name: todo-triage
description: >
  Make sense of an open ticket before implementing it — either by enriching missing metadata
  (type, tags, file links) on a freshly captured ticket, or by investigating root cause when
  the fix isn't obvious. Use ONLY when the ticket isn't already ready to implement: skip
  triage if you created the ticket yourself with full metadata and the fix is clear. The
  CLI primitive `todo analyze` (used in the Deep Investigation section below) is also
  available mid-implementation for recording structured findings on the fly.
compatibility: Requires git and the todo CLI (npm i -g @todo/cli).
metadata:
  hermes:
    tags: [todo, tickets, triage, classification, dedup, root-cause, investigation]
    related_skills: [todo-capture, todo-plan, todo-implement]
---

# todo-triage

**Purpose:** Get a ticket ready to implement — by enriching its metadata, investigating its root cause, or both.

## Which Mode Are You In?

```
Ticket has missing metadata (no type / tags / file links)?
  YES → Classification mode (below)
  NO  → continue

Root cause is obvious from reading the ticket?
  YES → Skip this skill. Go to /todo-implement.
  NO  → Deep investigation mode (below)
```

Both modes are optional. If you captured the ticket yourself with full metadata AND know what to fix, go straight to `/todo-implement`. Triage is overhead unless the ticket is genuinely not ready.

---

## Classification Mode — Enrich Missing Metadata

**Contract:** Do NOT transition to `active` in this mode. Leave the ticket in `open` unless marking `wontfix` or `duplicate`.

**Use when:**
- Ticket was created from piped log/test output — no type, tags, or file context.
- Many tickets just arrived from `todo scan` and need bulk classification.

### 1. Read the ticket
```bash
todo show <id>
```

### 2. Correct the type

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

Tags are freeform, kebab-case. Examples: `auth`, `crash`, `regression`, `parser`, `performance`.
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

If confirmed:
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

### Output

A ticket in `open` state with correct type, tags, and file links. Hand off to:
- **Deep investigation mode** (below) if root cause is still unknown.
- **`/todo-implement`** if the fix is now clear.

---

## Deep Investigation Mode — Root Cause Unknown

**Contract:** This mode transitions the ticket to `active` (via `todo work`) and records structured analysis entries that the eventual implement step reads.

**Use when:** intermittent failures, regressions without an obvious commit, behavior that depends on state you have to reconstruct, or an unfamiliar codebase. If you know what to fix, investigating is overhead.

### 1. Start work (branch + active)
```bash
todo work <id>
```
Creates `todo/<id>` branch (or `todo/<parent-id>` for children) and transitions the ticket to `active`.

### 2. Read the ticket in full
```bash
todo show <id>
```
Note the `files` array — these are the linked source locations to start from.

### 3. Gather blame evidence

```bash
git blame src/parser.ts -L 40,60
git log --oneline -20 -- src/parser.ts
git show <suspect-commit>
```

Record findings as structured entries:
```bash
todo analyze <id> --type blame \
  --content "$(git blame src/parser.ts -L 42,42)"
```

### 4. Record reproduction evidence
```bash
todo analyze <id> --type evidence \
  --content "Reproduced: calling parse('') throws TypeError at line 42"
```

### 5. Form a hypothesis
```bash
todo analyze <id> --type hypothesis \
  --confidence high \
  --content "Null guard removed in commit abc1234 during parser refactor"
```

### 6. Write the conclusion

Reference supporting entries by their 0-based indices (visible in `todo show`):
```bash
todo analyze <id> --type conclusion \
  --content "Confirmed: null guard removed in abc1234. Restore it." \
  --supporting "0,1,2"
```

### 7. Commit the analysis
```bash
git add .todo/
git commit -m "todo:<id> — analysis complete"
```

Hand off to `/todo-implement` — its step 2 will read the conclusion before any code is written.

### Analysis Entry Types

| Type | When to use |
|---|---|
| `blame` | Raw git blame, log, or show output |
| `evidence` | Reproduction steps, test results, observed behavior |
| `hypothesis` | Proposed explanation — always include confidence |
| `conclusion` | Confirmed root cause — cite supporting entry indices |

### Confidence Levels

- `high` — Reproduced and traced to a specific commit/line
- `medium` — Strong evidence but not conclusively reproduced
- `low` — Plausible guess, needs more investigation

---

## Note: `todo analyze` Mid-Implementation

The `todo analyze` CLI primitive shown above is also useful *during* `/todo-implement` — if you discover the ticket spec is wrong while writing code, drop a `--type conclusion` entry before continuing. See `/todo-implement` step 2b. The CLI command is the same; only the surrounding workflow differs.

---

See [CLI reference](references/cli.md) for all flags.
