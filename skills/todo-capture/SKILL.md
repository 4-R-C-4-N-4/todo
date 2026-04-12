---
name: todo-capture
description: >
  Intake any signal (test failure, log traceback, agent observation, human note, code comment)
  and produce a structured ticket in the current git repository's .todo/ store. Use when you
  encounter a bug, notice a problem, receive a task, or need to record any unit of work before
  acting on it. Requires git and the todo CLI (todo init must have been run).
compatibility: Requires git and the todo CLI installed (npm i -g @todo/cli). Run `todo init` first.
metadata:
  hermes:
    tags: [todo, tickets, capture, intake, bug, triage]
    related_skills: [todo-triage, todo-analyze, todo-implement]
---

# todo-capture

**Purpose:** Turn any signal into a tracked ticket. Capture first, investigate later.

## When to Use

- You receive test output, a traceback, or stderr from a failing command
- You or the user describes a bug, task, or thing that needs doing
- You observe a problem in the code that isn't the primary task
- You want to register work before starting a branch

## Steps

### 1. Identify the source type

| You have... | `--source` | `--type` default |
|---|---|---|
| Traceback / log output | `log` | `bug` |
| Test runner failure (pytest, jest) | `test` | `bug` |
| Your own observation of code | `agent` | `chore` |
| The user told you | `human` | `chore` |
| A `# TODO` comment in source | `comment` | `chore` |

### 2. Create the ticket

**From piped log/test output:**
```bash
<command> 2>&1 | todo new --type bug --source log --pipe
```

**From agent observation:**
```bash
todo new "Summary of the issue" --type bug --source agent --file src/parser.ts --lines 42,60
```

**From human input:**
```bash
todo new "The export button crashes when list is empty" --type bug --source human
```

**With tags:**
```bash
todo new "Pagination off-by-one" --type bug --source agent --tags "pagination,off-by-one"
```

**As a child of a parent feature ticket:**
```bash
todo new "Add email validation" --type chore --parent <feature-id>
```

### 3. Capture the output

`todo new` prints only the ticket ID to stdout. Capture it:
```bash
id=$(todo new "Summary" --type bug --source agent)
echo "Created: $id"
```

### 4. Commit the ticket

Ticket files live in `.todo/open/`. Always commit after creating:
```bash
git add .todo/
git commit -m "todo:$id — capture"
```

## Duplicate Detection

`todo new` warns to stderr if a ticket with the same summary already exists:
```
Warning: possible duplicate of a1b2c3d4
```
The ticket is still created and linked. Run `todo dedup` after bulk captures to review pairs.

## Done

Output is the ticket ID (8 hex chars). Hand off to `todo-triage` or `todo-implement`.

---

See [CLI reference](references/cli.md) for all flags.
