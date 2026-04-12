---
name: todo-analyze
description: >
  Investigate an open ticket whose root cause is not yet understood. Transitions to active,
  examines git blame and history, and appends structured analysis entries leading to a
  conclusion. Use ONLY when the cause is genuinely unknown — intermittent failures, regressions
  without an obvious source, unfamiliar codebases. If the fix is already obvious, skip this
  skill and go directly to todo-implement.
compatibility: Requires git and the todo CLI (npm i -g @todo/cli).
metadata:
  hermes:
    tags: [todo, tickets, analysis, root-cause, debugging, investigation]
    related_skills: [todo-triage, todo-implement]
---

# todo-analyze

**Purpose:** Investigate a ticket systematically when the cause is not yet known.

## Choose Your Path First

```
Is the root cause already clear?
  YES → Skip this skill. Go to todo-implement.
  NO  → Continue below.
```

This skill exists for genuinely complex investigations: intermittent failures, regressions without an obvious commit, behavior that depends on state you have to reconstruct. If you know what to fix, investigating is overhead — commit the fix and close the ticket.

---

## Deep Path — Root Cause Unknown

### 1. Start work (branch + active)
```bash
todo work <id>
```
Creates `todo/<id>` branch (or `todo/<parent-id>` for children) and transitions ticket to `active`.

### 2. Read the ticket in full
```bash
todo show <id>
```
Note the `files` array — these are the linked source locations.

### 3. Gather blame evidence

```bash
# Blame the linked lines
git blame src/parser.ts -L 40,60

# Last commits touching the file
git log --oneline -20 -- src/parser.ts

# Show a suspect commit
git show <suspect-commit>
```

Record findings:
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

Reference supporting entries by their 0-based indices (from `todo show`):
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

Hand off to `todo-implement`.

---

## Analysis Entry Types

| Type | When to use |
|---|---|
| `blame` | Raw git blame, log, or show output |
| `evidence` | Reproduction steps, test results, observed behavior |
| `hypothesis` | Proposed explanation — always include confidence |
| `conclusion` | Confirmed root cause — cite supporting entry indices |

## Confidence Levels

- `high` — Reproduced and traced to a specific commit/line
- `medium` — Strong evidence but not conclusively reproduced
- `low` — Plausible guess, needs more investigation

## Output

A ticket with:
- State: `active`
- `analysis` array with at least one `conclusion`
- `supporting_evidence` indices linking conclusion to its evidence

---

See [CLI reference](references/cli.md) for all flags.
