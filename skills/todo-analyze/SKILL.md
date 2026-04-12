---
name: todo-analyze
description: >
  Investigate an open ticket and produce a structured root cause analysis. Transitions the
  ticket to active, examines git blame and history, and appends blame → evidence → hypothesis →
  conclusion analysis entries. Use when a bug or feature needs investigation before implementation
  begins. Output is a ticket with a populated analysis section and a conclusion entry.
  Requires git and the todo CLI.
compatibility: Requires git and the todo CLI (npm i -g @todo/cli).
metadata:
  hermes:
    tags: [todo, tickets, analysis, root-cause, debugging, investigation]
    related_skills: [todo-triage, todo-implement]
---

# todo-analyze

**Purpose:** Investigate a ticket systematically. Produce evidence, not guesses.

**Contract:** Must produce at least one `hypothesis` entry. Must produce a `conclusion` entry before handing off to `todo-implement`.

## Steps

### 1. Start work (transition to active, create branch)
```bash
todo work <id>
```
This creates branch `todo/<id>` (or `todo/<parent-id>` for child tickets) and transitions the ticket to `active`.

### 2. Read the ticket in full
```bash
todo show <id>
```
Note the `files` array — these are the linked source locations.

### 3. Gather blame evidence

```bash
# Git blame on the linked file/lines
git blame src/parser.ts -L 40,60

# Log the last commits touching the file
git log --oneline -20 -- src/parser.ts

# Show the diff that introduced the suspected change
git show <suspect-commit>
```

Record what you find:
```bash
todo analyze <id> --type blame \
  --content "$(git blame src/parser.ts -L 42,42)"
```

### 4. Record evidence

```bash
todo analyze <id> --type evidence \
  --content "Reproduced: calling parse('') throws TypeError at line 42"
```

### 5. Form a hypothesis

```bash
todo analyze <id> --type hypothesis \
  --confidence high \
  --content "Empty string guard removed in commit abc1234 during the parser refactor"
```

### 6. Write the conclusion

Reference the supporting entries by their indices (0-based, from `todo show`):
```bash
todo analyze <id> --type conclusion \
  --content "Confirmed: null guard on line 42 was removed in abc1234. Restore it." \
  --supporting "0,1,2"
```

### 7. Commit the analysis
```bash
git add .todo/
git commit -m "todo:<id> — analysis complete"
```

## Analysis Entry Types

| Type | When to use |
|---|---|
| `blame` | Raw output from git blame, log, or show |
| `evidence` | Reproduction steps, test results, observed behavior |
| `hypothesis` | Your proposed explanation — include confidence |
| `conclusion` | Final confirmed root cause — cite supporting entries |

## Confidence Levels

- `high` — You reproduced it and traced it to a specific commit/line
- `medium` — Strong evidence but not conclusively reproduced
- `low` — Plausible guess, needs more investigation

## Output

A ticket with:
- State: `active`
- `analysis` array with at least one `hypothesis` and one `conclusion`
- `supporting_evidence` indices linking conclusion to its evidence

Hand off to `todo-implement`.

---

See [CLI reference](references/cli.md) for all flags.
