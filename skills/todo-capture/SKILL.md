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
    related_skills: [todo-triage, todo-analyze, todo-implement, todo-plan]
---

# todo-capture

**Purpose:** Turn any signal into a tracked ticket. Capture first, investigate later.

## When to Use

- You receive test output, a traceback, or stderr from a failing command
- You or the user describes a bug, task, or thing that needs doing
- You observe a problem in the code that isn't the primary task
- You want to register work before starting a branch

## After Capture — Which Skill Next?

```
Root cause is obvious → todo-implement directly
Root cause is unknown → todo-analyze
Raw pipe input with no metadata → todo-triage first
Planning a multi-step feature → todo-plan
```

Skip triage if you already know the type, file, and tags — include them at capture time instead.

## Steps

### 1. Identify the source type

| You have... | `--source` | `--type` default |
|---|---|---|
| Traceback / log output | `log` | `bug` |
| Test runner failure (pytest, jest) | `test` | `bug` |
| Your own observation of code | `agent` | `chore` |
| The user told you | `human` | `chore` |
| A `# TODO` comment in source | `comment` | `chore` |

### 2. Include metadata you already know

If you know the type, file, and tags at capture time, add them now. Don't defer to triage what you can specify in one command.

```bash
# Full metadata at capture — no triage needed
todo new "Null pointer in auth handler" \
  --type bug --source agent \
  --file src/auth/handler.ts --lines 42,60 \
  --tags "auth,crash"
```

### 3. Create the ticket

**From piped log/test output** (metadata unknown — triage after):
```bash
<command> 2>&1 | todo new --type bug --source log --pipe
```

**From agent observation** (metadata known — skip triage):
```bash
todo new "Summary of the issue" --type bug --source agent \
  --file src/parser.ts --lines 42,60 --tags "parser,crash"
```

**From human input:**
```bash
todo new "The export button crashes when list is empty" --type bug --source human
```

**As a child of a parent feature ticket:**
```bash
todo new "Add email validation" --type chore --parent <feature-id>
```

### 4. Capture the output

`todo new` prints only the ticket ID to stdout. Capture it:
```bash
id=$(todo new "Summary" --type bug --source agent)
```

### 5. Commit the ticket
```bash
git add .todo/
git commit -m "todo:$id — capture"
```

## Duplicate Detection

`todo new` warns to stderr if a ticket with the same summary already exists:
```
Warning: possible duplicate of a1b2c3d4
```
The ticket is still created. Run `todo dedup` after bulk captures to review pairs.

## Using `todo scan`

`todo scan` sweeps the source tree for TODO/FIXME/HACK/XXX comments and creates tickets. Use it deliberately:

- When taking over a new codebase and wanting a map of known issues
- When the explicit task is auditing technical debt
- **Always run `--dry-run` first** and review the list before committing

```bash
todo scan --dry-run   # preview
todo scan             # create tickets
git add .todo/ && git commit -m "chore: capture code comments as tickets"
```

Real codebases often have hundreds of stale comments. Scan selectively, not reflexively.

---

See [CLI reference](references/cli.md) for all flags.
