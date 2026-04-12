---
name: todo-scan
description: >
  Sweep a repository's source tree for TODO, FIXME, HACK, and XXX comments and convert
  them into tracked tickets. Deduplicates against existing tickets by content fingerprint.
  Use after cloning a new repo, at the start of a triage session, or when the user asks
  to capture all outstanding code comments. Also covers dedup sweeps across existing tickets.
  Requires git and the todo CLI.
compatibility: Requires git and the todo CLI (npm i -g @todo/cli).
metadata:
  hermes:
    tags: [todo, tickets, scan, sweep, comments, fixme, dedup, triage]
    related_skills: [todo-capture, todo-triage]
---

# todo-scan

**Purpose:** Convert code comments into tracked tickets. Sweep for existing duplicates.

## Scanning for TODO/FIXME Comments

### 1. Dry run first (see what would be created)
```bash
todo scan --dry-run
```

Output example:
```
Would create: src/parser.ts:42 [TODO] Add null guard for empty input
Would create: tests/auth.test.ts:88 [FIXME] This test is flaky on CI
Skipping existing: src/router.ts:15 [TODO] Extract into middleware
```

### 2. Create tickets for all new comments
```bash
todo scan
```

By default creates tickets with `--type chore`. Override:
```bash
todo scan --type debt
```

### 3. Commit the new tickets
```bash
git add .todo/
git commit -m "chore: scan and capture code comments as tickets"
```

### 4. Triage the created tickets

After scan, run `todo list` to see new tickets. Triage each one:
```bash
todo list
# For each new ticket, apply todo-triage skill
```

## Deduplication Sweep

After bulk capture or scan, look for duplicate tickets:

### Fingerprint strategy (for log/test source tickets with tracebacks)
```bash
todo dedup --strategy fingerprint
```

### File-line strategy (tickets referencing overlapping source lines)
```bash
todo dedup --strategy file-line
```

### Apply links between confirmed duplicates
```bash
# Review the pairs, then:
todo dedup --strategy fingerprint --apply
```

This adds `related` links between potential duplicate pairs. To mark one as the canonical and close the other:
```bash
todo transition <dup-id> duplicate --duplicate-of <canonical-id>
git add .todo/ && git commit -m "todo:<dup-id> — duplicate of <canonical-id>"
```

## Supported File Types

The scanner recognizes comment syntax for:
- TypeScript, JavaScript, JSX, TSX (line: `//`, block: `/* */`)
- Java, C, C++, C# (line: `//`)
- Go, Rust, Swift, Kotlin (line: `//`)
- Python, Ruby, Shell, YAML, TOML (line: `#`)
- HTML, XML (block: `<!-- -->`)

Files with other extensions are skipped.

## Exclusions

Configured in `.todo/config.json` under `intake.scan_exclude`. Defaults:
```json
[".todo", "node_modules", ".venv", "__pycache__", ".git", "dist", "build"]
```

## What Counts as a Duplicate

Comment identity fingerprint = `sha256(normalized comment text)`. Two identical TODO comments in different files are treated as one ticket (usually correct — identical TODOs are copy-paste). If they're intentionally different, create the second ticket manually with `todo new`.

---

See [CLI reference](references/cli.md) for all flags.
