# `todo` — Git-Native Work Tracking for Coding Agents

## Design Specification v0.1

---

## 1. Purpose

`todo` is a local-first, git-native work tracking tool designed for coding agents. It captures, tracks, and enforces lifecycle discipline for all units of work in a code project — bugs, features, refactors, chores, and technical debt — using git as the sole source of truth.

`todo` is not a project manager. It does not do sprints, story points, velocity, burndown, or assignment. It is a structured mailbox with a state machine and a test contract. It answers two questions:

1. **What needs doing?**
2. **Can you prove it's done?**

### 1.1 Design Principles

- **Git is the database.** No server, no daemon, no external state. Tickets are files in the repo. History is git history. Sync is push/pull.
- **Agents are first-class consumers.** The schema, CLI, and lifecycle are designed for machine operation. Humans can use it; agents should love it.
- **Prove it, don't claim it.** Closing a ticket requires evidence — a linked commit, a passing test, a documented rationale. The tool enforces this.
- **Capture everything, triage later.** Intake is cheap and fast. Classification, prioritization, and investigation happen downstream as separate operations.
- **Emergent taxonomy over fixed categories.** Tags are freeform strings. Types are a small fixed set. No labels, milestones, epics, or components.
- **Symbiotic with git.** `.todo/` lives in the repo. Ticket history is git history. Blame, diff, and log all work on ticket files. The tool reads git but never writes to it — committing is the agent's responsibility.

### 1.2 What `todo` Is Not

- Not a replacement for GitHub Issues in collaborative open-source workflows.
- Not a Jira/Linear alternative for team coordination.
- Not an opinionated methodology (no agile, no scrum, no kanban).
- Not a CI system — it shells out to your test runner, not the other way around.

---

## 2. Data Model

### 2.1 Storage Layout

```
.todo/
├── config.json          # project-level configuration
├── open/                # tickets in non-terminal states
│   ├── a3f8c2e1.json
│   ├── b7e1d4f0.json
│   └── ...
└── done/                # tickets in terminal states
    ├── c9a2f1b3.json
    └── ...
```

Tickets live in `.todo/open/` while active and move to `.todo/done/` on terminal state transitions. This keeps `open/` scannable — an agent listing open work reads one directory without filtering.

**The directory is the source of truth.** If a ticket file's `state` field disagrees with the directory it lives in (e.g., `state = "done"` but the file is in `open/`), the directory wins. On read, the tool silently corrects the `state` field to match the directory. This prevents desync from interrupted operations or manual file moves. The rule is simple: a ticket in `open/` is non-terminal, a ticket in `done/` is terminal.

The `.todo/` directory is committed to the repository. It is not gitignored. Ticket history is repo history.

### 2.2 Ticket Identity

Each ticket has a short ID derived from a content hash of its initial capture payload:

```
ID = truncate(sha256(source_type + raw_payload + created_at), 8)
```

Eight hex characters. Collision probability is negligible for any single-repo context. IDs are immutable once assigned — editing a ticket does not change its ID.

### 2.3 Ticket Schema

Every ticket is a JSON file with two-space indentation. Fields are grouped into required core fields and optional typed metadata.

```json
// .todo/open/a3f8c2e1.json
{
  "id": "a3f8c2e1",
  "type": "bug",
  "state": "open",
  "summary": "Parser crashes on empty input with index error",
  "created_at": "2026-04-10T14:30:00Z",
  "updated_at": "2026-04-10T14:30:00Z",

  "description": "When parse() is called with an empty string, it raises an IndexError\non line 42 of parser.py. Expected behavior: return an empty AST node.",

  "tags": ["parser", "crash", "edge-case"],

  "source": {
    "type": "log",
    "captured_by": "agent:claude-code",
    "raw": "Traceback (most recent call last):\n  File \"parser.py\", line 42, in parse\n    first_token = tokens[0]\nIndexError: list index out of range",
    "log_level": "ERROR",
    "log_timestamp": "2026-04-10T14:28:33Z",
    "command": "python -m myproject.main --input ''"
  },

  "relationships": {
    "depends_on": [],
    "blocks": [],
    "related": [],
    "duplicates": null,
    "parent": null,
    "children": [],
    "linked_commits": []
  },

  "files": [
    {
      "path": "src/parser.py",
      "lines": [40, 45],
      "commit": "e4a1b2c3",
      "note": "IndexError originates here"
    }
  ],

  "analysis": [
    {
      "timestamp": "2026-04-10T15:00:00Z",
      "author": "agent:claude-code",
      "type": "blame",
      "content": "Line 42 last modified in commit e4a1b2c by ivy, 2026-04-08.\nChange introduced: removed the `if not tokens: return EmptyNode()` guard."
    },
    {
      "timestamp": "2026-04-10T15:02:00Z",
      "author": "agent:claude-code",
      "type": "hypothesis",
      "content": "Guard clause was removed during refactor in e4a1b2c. Restoring it should fix the crash.",
      "confidence": "high"
    },
    {
      "timestamp": "2026-04-10T15:10:00Z",
      "author": "agent:claude-code",
      "type": "conclusion",
      "content": "Confirmed: commit e4a1b2c removed the empty-input guard. Root cause is the missing bounds check.",
      "supporting_evidence": [0, 1]
    }
  ],

  "work": {
    "branch": "todo/a3f8c2e1",
    "base_branch": "main",
    "started_at": "2026-04-10T14:45:00Z",
    "started_by": "agent:claude-code"
  },

  "resolution": {
    "commit": "f7b3a9d2",
    "test_file": "tests/test_parser.py",
    "test_function": "test_parse_empty_input",
    "resolved_at": "2026-04-10T16:00:00Z",
    "resolved_by": "agent:claude-code",
    "note": "Restored empty-input guard clause. Added regression test."
  }
}
```

Note: JSON does not support comments. The `//` comments above are for documentation only and are not present in actual ticket files. Empty optional sections (`work`, `resolution`) are omitted entirely rather than included as empty objects — the tool treats missing keys as absent.

### 2.4 Source Provenance Types

Each source type carries specific optional fields:

| Source Type   | Specific Fields |
|---------------|----------------|
| `log`         | `log_level`, `log_timestamp`, `command`, `logger`, `traceback_fingerprint` |
| `test`        | `test_file`, `test_function`, `assertion_message`, `test_output` |
| `agent`       | `agent_id`, `task_context`, `instruction` |
| `human`       | `reporter` (freeform name/handle) |
| `comment`     | `file`, `line`, `comment_type` (TODO/FIXME/HACK/XXX), `surrounding_context` |

### 2.5 Traceback Fingerprinting

For `log` and `test` sources that include tracebacks, the tool computes a normalized fingerprint for dedup:

1. Strip memory addresses (`0x[0-9a-f]+` → `0xADDR`)
2. Strip timestamps
3. Strip PIDs, thread IDs
4. Strip absolute path prefixes (keep relative paths from repo root)
5. SHA256 the normalized traceback

Two tickets with the same `traceback_fingerprint` are flagged as potential duplicates during intake.

### 2.6 Git Permalinks

File references in the `files` array are commit-anchored. The `commit` field pins the `path` and `lines` to a specific point in git history, so the reference remains valid even as code changes on the working branch.

**Format:** `<commit>:<path>#L<start>-L<end>`

Example: `e4a1b2c3:src/parser.py#L40-L45`

**Resolution:** The tool resolves a permalink to actual content via `git show <commit>:<path>` and extracts the specified line range from the output.

**When `commit` is set automatically:**
- `todo new --file PATH --lines START,END` sets `commit` to `HEAD` at capture time.
- `todo scan` sets `commit` to the last commit that touched the file (`git log -1 --format=%H -- <path>`). This is the most recent stable anchor — the line numbers may drift slightly if there are uncommitted changes above the comment, but the file content at that commit is the best available reference. If the file has never been committed (untracked), `commit` is omitted and the reference is floating.
- `todo link <ID> --to <FILE>` sets `commit` to `HEAD`.
- `todo analyze` entries that reference files (via `blame` type) should include the commit in their content, but the tool does not auto-populate file references from analysis entries.

**`todo scan` never modifies the user's working tree or git index** (other than writing to `.todo/`). It does not force commits, does not auto-commit source files, and does not fail on dirty working tree state. The tool reads the working tree to find comments but anchors references to git history. This separation is deliberate — `todo` tracks work, it doesn't manage your commit workflow.

**When `commit` is omitted:** The reference is a "floating" pointer to the current working tree. This is valid — not every file reference needs to be anchored — but anchored references are preferred because they survive code changes. The tool treats omitted `commit` as "resolve against working tree" rather than an error.

**Display on `todo show`:** When a file reference has a `commit`, the tool displays the anchored content inline:

```
>> src/parser.py#L40-L45 @ e4a1b2c3
   │ 40  def parse(self, tokens):
   │ 41      """Parse token list into AST."""
   │ 42      first_token = tokens[0]  # ← IndexError when empty
   │ 43      if first_token.type == TokenType.OPEN:
   │ 44          return self._parse_block(tokens)
   │ 45      return self._parse_expr(tokens)
   Note: IndexError originates here
```

This makes `todo show` a self-contained bug report — the agent sees the exact code that was referenced, not whatever happens to be on line 42 today. The content is resolved from git on display, not stored in the ticket file (keeping tickets small and avoiding content duplication).

---

## 3. State Machine

### 3.1 States

| State       | Meaning | Terminal? | Directory |
|-------------|---------|-----------|-----------|
| `open`      | Captured, awaiting action | No | `open/` |
| `active`    | Work in progress | No | `open/` |
| `blocked`   | Waiting on dependency | No | `open/` |
| `done`      | Completed with evidence | Yes | `done/` |
| `wontfix`   | Deliberately not addressing | Yes | `done/` |
| `duplicate` | Duplicate of another ticket | Yes | `done/` |

### 3.2 Transitions

```
      open ──────► active ──────► done
        │             │            ▲
        │             ▼            │
        │          blocked ────► active
        │             │
        ├─────────────┼──────► done (direct, with done contract)
        ├──────► wontfix
        └──────► duplicate
```

### 3.3 Transition Rules

| From      | To        | Validation |
|-----------|-----------|------------|
| `open`    | `active`  | None. Agent claims the ticket. |
| `open`    | `done`    | **See §3.4 Done Contract.** Allows quick fixes without intermediate state. |
| `open`    | `wontfix` | Requires `resolution.note` explaining why. |
| `open`    | `duplicate` | Requires `relationships.duplicates` pointing to canonical ticket ID. |
| `active`  | `blocked` | Requires at least one entry in `relationships.depends_on`. |
| `active`  | `done`    | **See §3.4 Done Contract.** |
| `active`  | `open`    | Abandoning work. Clears the `[work]` block (branch, started_at, started_by). The branch is not deleted — it may contain useful partial work. |
| `blocked` | `active`  | No automatic validation. The agent is responsible for knowing the block is cleared. The `depends_on` list is informational context, not a programmatic gate. |
| `blocked` | `open`    | Abandoning, returning to pool. |

Terminal states (`done`, `wontfix`, `duplicate`) are final. If a closed ticket's problem recurs, create a new ticket and link it via `relationships.related`. This keeps the history clean — the original ticket's resolution record is preserved, and the new ticket stands on its own with its own lifecycle.

### 3.4 The Done Contract

A ticket cannot transition to `done` unless ALL of the following are met:

1. **Linked commit.** `resolution.commit` must reference a valid commit SHA in the repo.
2. **For type `bug`:** `resolution.test_file` and `resolution.test_function` must be populated. The referenced test must exist in the working tree.
3. **For type `feature`:** `resolution.test_file` and `resolution.test_function` must be populated OR `resolution.note` must explain why no test is applicable (e.g., documentation-only change).
4. **For types `refactor`, `chore`, `debt`:** `resolution.commit` is sufficient. Tests are encouraged but not enforced.
5. **For parent tickets (tickets with `children`):** `resolution.commit` defaults to `HEAD` and `resolution.note` is required. The parent is a summary ticket — its proof of completion is that all children are done, documented in the note.

The tool validates that referenced files exist but does **not** run tests. Test execution is the agent's (or CI's) responsibility. The tool's job is to ensure the evidence is registered, not to re-verify it.

This contract is the core behavioral enforcement. It prevents "done means I pushed a commit" without proof.

---

## 4. Configuration

```json
// .todo/config.json
{
  "project": {
    "name": "my-project"
  },
  "behavior": {
    "commit_prefix": "todo:"
  },
  "intake": {
    "dedup_strategy": "fingerprint",
    "scan_patterns": ["TODO", "FIXME", "HACK", "XXX"],
    "scan_exclude": [".todo", "node_modules", ".venv", "__pycache__", ".git"]
  },
  "display": {
    "id_length": 8,
    "date_format": "relative"
  }
}
```

---

## 5. CLI Interface

### 5.1 Command Overview

```
todo init                              # initialize .todo/ in a git repo
todo new [--type TYPE] [--source SOURCE] [--parent ID] [SUMMARY]
todo list [--state STATE] [--type TYPE] [--tag TAG] [--file PATH]
todo show <ID>
todo edit <ID> [--summary S] [--type T] [--tags T1,T2] [--add-tag T] [--rm-tag T]
todo transition <ID> <STATE> [--commit SHA] [--test FILE::FUNC] [--note NOTE]
todo close <ID> [--commit SHA] [--test FILE::FUNC] [--note NOTE] [--checkout]
todo work <ID> [--branch NAME]
todo analyze <ID> --type TYPE --content CONTENT [--confidence LEVEL]
todo link <ID> --to <ID|COMMIT|FILE> [--relation TYPE]
todo scan [--path PATH]               # extract TODO/FIXME comments from source
todo dedup [--dry-run]                # scan for potential duplicates
todo export [--state STATE] [--type TYPE]  # dump tickets as JSON to stdout
```

### 5.2 Command Details

#### `todo init`

```
todo init
```

Creates `.todo/` directory structure and `config.json`. Must be run inside a git repository. The agent should commit the initial structure after running this command.

#### `todo new`

```
todo new [--type bug|feature|refactor|chore|debt]
         [--source log|test|agent|human|comment]
         [--file PATH] [--lines START,END]
         [--tags tag1,tag2]
         [--parent ID]               # group under a parent ticket
         [--pipe]                     # read raw payload from stdin
         [SUMMARY]
```

Creates a new ticket. If `--parent` is provided, sets `relationships.parent` on the new ticket and appends the new ticket's ID to the parent's `relationships.children` array (preserving creation order). This is the primary mechanism for grouping feature work — see §5.3.

If `--pipe` is set, reads raw content from stdin (useful for agents piping in logs, test output, or error messages). If `--pipe` is set but stdin is a TTY (no pipe connected), the tool prints an error to stderr and exits with code 1 rather than hanging. Computes content hash for ID. Checks for duplicates against existing tickets using configured `dedup_strategy`. If potential duplicate found, prints warning and adds `relationships.related` but still creates the ticket.

If `--file` and `--lines` are provided, the file reference is automatically permalink-anchored to `HEAD` (see §2.6).

If `--type` is omitted, defaults to `chore`.
If `SUMMARY` is omitted and `--pipe` is set, the tool attempts source-type-aware summary extraction:
- For `log` sources: uses the last line of the traceback (the exception message), e.g., `IndexError: list index out of range`.
- For `test` sources: uses the test name and assertion, e.g., `test_parse_empty FAILED: AssertionError`.
- For all other sources: uses the first non-blank line of input, truncated to 120 characters.
- If extraction fails or produces an empty string, the tool exits with an error requiring an explicit `SUMMARY` argument.

**Output (stdout):** The new ticket ID on a single line. Agents parse this.

#### `todo list`

```
todo list [--state open|active|blocked|done|wontfix|duplicate]
          [--type bug|feature|refactor|chore|debt]
          [--tag TAG]
          [--file PATH]               # tickets referencing this file
          [--sort created|updated|type|state]
          [--json]                    # machine-readable output
          [--limit N]
```

Lists tickets matching filters. Default: all tickets in `open/` (non-terminal states). If `--state done` or another terminal state is given, reads from `done/`.

**Default output (human):**
```
a3f8c2e1  bug     open     Parser crashes on empty input
b7e1d4f0  feature active   Add CSV export support              [todo/b7e1d4f0]
c2a9e3b1  refactor blocked  Extract shared validation logic     [todo/c2a9e3b1]
```

Active and blocked tickets show their branch name (from `[work].branch`) when present.

**JSON output (agent):** With `--json`, outputs a JSON array of ticket summaries. Since ticket files are already JSON, agents can also read them directly from `.todo/open/`, but `todo list --json` provides filtered, sorted results without manual file enumeration.
```json
[
  {
    "id": "a3f8c2e1",
    "type": "bug",
    "state": "open",
    "summary": "Parser crashes on empty input",
    "tags": ["parser", "crash"],
    "created_at": "2026-04-10T14:30:00Z"
  }
]
```

#### `todo show <ID>`

Prints the full ticket content. With `--raw`, outputs the raw JSON file. Default: human-formatted display.

**Human-formatted display** shows fields in this order:
```
[a3f8c2e1] bug — open                              [todo/a3f8c2e1]
Parser crashes on empty input with index error

  When parse() is called with an empty string, it raises an IndexError
  on line 42 of parser.py. Expected behavior: return an empty AST node.

  Tags: parser, crash, edge-case
  Source: log (captured by agent:claude-code at 2026-04-10T14:30:00Z)

  Files:
  >> src/parser.py#L40-L45 @ e4a1b2c3
     │ 40  def parse(self, tokens):
     │ 41      """Parse token list into AST."""
     │ 42      first_token = tokens[0]
     │ 43      if first_token.type == TokenType.OPEN:
     │ 44          return self._parse_block(tokens)
     │ 45      return self._parse_expr(tokens)
     Note: IndexError originates here

  Analysis (3 entries):
  [0] blame  2026-04-10T15:00:00Z  agent:claude-code
      Line 42 last modified in commit e4a1b2c by ivy...
  [1] hypothesis (high)  2026-04-10T15:02:00Z  agent:claude-code
      Guard clause was removed during refactor...
  [2] conclusion  2026-04-10T15:10:00Z  agent:claude-code
      Confirmed: commit e4a1b2c removed the empty-input guard...

  Resolution: commit f7b3a9d2
  Test: tests/test_parser.py::test_parse_empty_input
  Resolved by agent:claude-code at 2026-04-10T16:00:00Z
```

Sections with no data (e.g., `analysis` on a fresh ticket, `resolution` on an open ticket) are omitted. Long `content` fields are truncated with `...` — use `--raw` for full content.

Since the ticket format is JSON, agents can also read ticket files directly without the CLI — `cat .todo/open/a3f8c2e1.json | jq .summary` works with no tooling.

Accepts ID prefix matching — `todo show a3f` works if unambiguous.

#### `todo edit <ID>`

```
todo edit <ID> [--summary S] [--description D] [--type T]
               [--tags T1,T2]         # replaces all tags
               [--add-tag T]          # appends a tag
               [--rm-tag T]           # removes a tag
```

Modifies mutable ticket fields. Does not allow changing `id`, `created_at`, or `source`. Updates `updated_at`. `--tags` replaces the entire tag list; `--add-tag` and `--rm-tag` are incremental operations.

#### `todo transition <ID> <STATE>`

```
todo transition <ID> done --commit <SHA> --test <FILE::FUNC> [--note NOTE]
todo transition <ID> active
todo transition <ID> blocked --depends-on <ID1,ID2>
todo transition <ID> wontfix --note "reason"
todo transition <ID> duplicate --duplicate-of <ID>
todo transition <ID> open                 # abandon active/blocked ticket, return to pool
```

Validates transition rules (§3.3) and the done contract (§3.4). Moves the ticket file between `open/` and `done/` directories as appropriate.

**Exit codes:**
- `0` — transition successful
- `1` — validation failed (prints reason to stderr)
- `2` — ticket not found

#### `todo analyze <ID>`

```
todo analyze <ID> --type blame|hypothesis|evidence|conclusion
                  --content "analysis text"
                  [--confidence low|medium|high]
                  [--supporting 0,1,2]
```

Appends a structured analysis entry to the ticket. Analysis entries are append-only — they cannot be edited or deleted. This preserves the investigation audit trail.

#### `todo link <ID>`

```
todo link <ID> --to <TARGET> [--relation blocks|blocked-by|related|parent|child]
```

TARGET can be:
- Another ticket ID → adds to `relationships`
- A commit SHA → adds to `relationships.linked_commits` list
- A file path → adds to the `files` array, with `commit` set to `HEAD` (permalink-anchored)

**Disambiguation:** TARGET is resolved in order: (1) match against existing ticket IDs (prefix match); (2) if no ticket match, try `git cat-file -t TARGET` — if it resolves, treat as commit SHA; (3) if neither, treat as file path. To force a specific interpretation, use `--as ticket|commit|file`.

#### `todo scan`

```
todo scan [--path PATH] [--dry-run] [--type chore]
```

Walks the source tree (respecting `scan_exclude`), extracts comments matching `scan_patterns`, and creates tickets with source type `comment`. Deduplicates using content-only fingerprinting (see §8.3) to avoid creating duplicates on repeated scans and to survive file renames.

**Comment syntax support (v0.1):** The scanner recognizes comments by file extension:
- `//` line comments: `.js`, `.ts`, `.jsx`, `.tsx`, `.c`, `.cpp`, `.h`, `.java`, `.go`, `.rs`, `.swift`, `.kt`
- `#` line comments: `.py`, `.rb`, `.sh`, `.bash`, `.yaml`, `.yml`, `.toml`
- `--` line comments: `.lua`, `.sql`, `.hs`
- Block comments (`/* */`) are not scanned in v0.1 — only line comments.
- Unknown file extensions are skipped silently.

The scanner looks for lines where the comment text (after the comment marker) contains a `scan_patterns` match (e.g., `TODO`, `FIXME`). The captured text is everything after the pattern keyword to the end of the line.

`--dry-run` shows what would be created without creating it.

Default type for scanned comments: `chore`. Override with `--type`.

#### `todo dedup`

```
todo dedup [--dry-run] [--strategy fingerprint|file-line|semantic]
```

Scans open tickets for potential duplicates using the specified strategy. `fingerprint` compares traceback fingerprints. `file-line` compares file reference overlaps. `semantic` is reserved for LLM-assisted similarity (not implemented in v0.1 — prints "not yet implemented" and exits).

`--dry-run` (default) shows potential duplicates without modifying anything.
Without `--dry-run`, adds `relationships.related` links between potential duplicates.

#### `todo export`

```
todo export [--state STATE] [--type TYPE]
```

Dumps matching tickets as a JSON array to stdout. Useful for piping into other tools or for agents that want to load all state at once.

#### `todo close`

```
todo close <ID> [--commit SHA] [--test FILE::FUNC] [--note NOTE] [--checkout]
```

Shorthand for `todo transition <ID> done`. If `--commit` is omitted, defaults to `HEAD`. Accepts all the same flags as `todo transition ... done`. This is the ergonomic path for the most common agent operation — "I fixed it, close the ticket."

If `--checkout` is passed and the ticket has a `work.base_branch`, the tool checks out that branch after closing. This is the clean exit from the branch workflow — close the ticket and return to where you started. If `--checkout` is not passed, the agent stays on the current branch.

```bash
# Close and stay on the ticket branch:
todo close a3f8c2e1 --test tests/test_parser.py::test_empty

# Close and return to the base branch:
todo close a3f8c2e1 --test tests/test_parser.py::test_empty --checkout
```

#### `todo work`

```
todo work <ID> [--branch NAME]
```

Claims a ticket and sets up a branch for the work. This is the standard entry point for an agent picking up a task — for both standalone bug fixes and feature build tasks.

**Branch naming:** If `--branch` is omitted, the branch name is determined by:
1. If the ticket has a `parent`: branch is `todo/<parent_id>` (feature branch shared by all siblings).
2. If the ticket has no parent: branch is `todo/<ticket_id>`.

This means all children of a feature ticket automatically share one branch. The agent doesn't need to decide — `todo work` resolves the right branch for the context. For a standalone bug, you get `todo/bugid`. For a feature child, you get `todo/featureid`. The `--branch` flag overrides this for cases where neither default is right.

**Behavior depends on whether the branch already exists:**

**Branch does not exist (fresh work):**
1. Transition ticket to `active`.
2. Create branch from current HEAD.
3. Check out the branch.
4. Print: `Created branch todo/<id> — ticket <ticket_id> is now active`

**Branch already exists (resuming or sibling work):**
1. Check out the existing branch.
2. Read the ticket to check current state.
3. If ticket is `open`: transition to `active`. Print: `Resumed branch todo/<id> — ticket <ticket_id> is now active. Branch has N commits ahead of <base>.`
4. If ticket is already `active`: no state change. Print: `Resumed branch todo/<id> — ticket <ticket_id> is already active. Branch has N commits ahead of <base>.`
5. If ticket is in a terminal state (`done`, `wontfix`, `duplicate`): print warning to stderr: `Warning: ticket <ticket_id> is already <state>. Branch exists with N commits. No state change.` Exit code 1.

The "N commits ahead" message tells the agent that prior work exists on this branch — either from a previous session on this ticket, or from sibling tickets in the same feature. The agent should review before continuing.

**Dependency check:** If the ticket has `depends_on` entries, the tool checks whether each dependency's `resolution.commit` is reachable from the current HEAD (via `git merge-base --is-ancestor`). If not, it prints an advisory warning: `Warning: ticket <id> depends on <dep_id> (commit <sha>), which is not reachable from current HEAD.` This is not blocking — the agent can proceed.

**Base branch detection:** `todo work` records the current branch as the base when creating a new ticket branch. This is stored in `work.base_branch`. If not recorded (e.g., legacy tickets), the tool falls back to detecting the default branch via `git symbolic-ref refs/remotes/origin/HEAD`, then tries `main`, then `master`.

**Ticket state tracking:** The ticket file (in `.todo/open/`) records the branch name when `todo work` is invoked:

```json
{
  "work": {
    "branch": "todo/feat001",
    "base_branch": "main",
    "started_at": "2026-04-10T15:00:00Z",
    "started_by": "agent:claude-code"
  }
}
```

This allows `todo list` to show which branch each active ticket lives on, and lets `todo close` verify that the resolution commit exists on the ticket's branch.

**Actor identification:** `started_by` (and `captured_by`, `resolved_by`, `author` on analysis entries) is determined by: (1) the `--actor` flag if provided on any command, (2) the `TODO_ACTOR` environment variable, (3) git config `user.name`. Agents should set `TODO_ACTOR=agent:claude-code` (or similar) in their environment so all ticket operations are attributed correctly. The format is freeform but the convention is `agent:<name>` for agents and the person's name for humans.

### 5.3 Two Modes of Work

`todo` supports two distinct work patterns. The tool surface is identical — the difference is how tickets are organized at intake time.

#### Mode 1: Standalone Tickets (bug fixes, chores, one-offs)

A single ticket, a single branch, a single fix. No parent, no children.

```bash
$ todo new --type bug "Parser crashes on empty input"
Created: abc123

$ todo work abc123
# Created branch todo/abc123

# ... fix, commit, close, merge ...
```

#### Mode 2: Feature Builds (design specs, task lists, multi-step work)

A parent ticket represents the feature. Child tickets are the ordered tasks. All children share the parent's branch.

```bash
# Create the feature and its tasks
$ todo new --type feature "Email validation system"
Created: feat001

$ todo new --type chore --parent feat001 "Add email regex validator"
Created: aa11
$ todo new --type chore --parent feat001 "Add MX record lookup"
Created: bb22
$ todo new --type chore --parent feat001 "Integrate into signup form"
Created: cc33
$ todo new --type chore --parent feat001 "Add error messages to UI"
Created: dd44

# Work the first task — creates the feature branch
$ todo work aa11
# Created branch todo/feat001 — ticket aa11 is now active

# ... fix ...
$ git add src/validation.ts tests/validation.test.ts .todo/
$ git commit -m "todo:aa11 — add email regex validator"
$ todo close aa11 --test tests/validation.test.ts::test_email_regex
$ git add .todo/ && git commit -m "todo:aa11 — closed"

# Work the next task — resumes the same branch
$ todo work bb22
# Resumed branch todo/feat001 — ticket bb22 is now active. Branch has 2 commits ahead of main.

# ... fix ...
$ git add src/mx-lookup.ts tests/mx-lookup.test.ts .todo/
$ git commit -m "todo:bb22 — add MX record lookup"
$ todo close bb22 --test tests/mx-lookup.test.ts::test_mx_lookup
$ git add .todo/ && git commit -m "todo:bb22 — closed"

# ... repeat for cc33, dd44 ...

# When all children are done, close the parent
$ todo close feat001 --note "All tasks complete. Email validation system implemented."
$ git add .todo/ && git commit -m "todo:feat001 — feature complete"

# Merge the feature branch
$ git checkout main
$ git merge todo/feat001
$ git branch -d todo/feat001
```

The parent ticket (`feat001`) acts as the feature summary. Its `children` array preserves task order. The agent works children sequentially via `todo work`, and each call lands on the same branch because they share a parent. One branch, one merge, N tickets — clean history with full per-task traceability.

The `depends_on` field is available if the agent wants to be explicit about which tasks require which, but it's optional — in most feature builds, the ordering in `children` is sufficient because the agent works them sequentially.

---

## 6. Skill Interface

Skills are the agent-facing contract. Each skill maps to one phase of the work lifecycle and defines a clear input/output contract. Skills are designed to be invoked by any agent framework that supports tool use or command execution.

### 6.1 Skill Catalog

#### `todo-capture`

**Purpose:** Intake a raw signal and produce a structured ticket.

**Input:** Raw content (log output, test failure, error message, natural language description, code comment).

**Actions:**
1. Classify source type from content shape (traceback → `log`, pytest output → `test`, etc.)
2. Extract structured fields (file paths, line numbers, error types)
3. Compute fingerprint for dedup
4. Check existing tickets for duplicates
5. Create ticket via `todo new`

**Output:** New ticket ID.

**Contract:** Must set `source.type` correctly. Must compute `traceback_fingerprint` if applicable.

#### `todo-triage`

**Purpose:** Assess and classify an open ticket.

**Input:** A ticket ID for an `open` ticket.

**Actions:**
1. Read the ticket
2. Assess type correctness (is this actually a bug, or a feature request?)
3. Check for duplicates against existing tickets
4. Add tags based on content analysis
5. Optionally transition to `duplicate` or `wontfix` if appropriate

**Output:** Modified ticket (updated type, tags, state).

**Contract:** Must not transition to `active` — that's for `todo-analyze` or `todo-implement`.

#### `todo-analyze`

**Purpose:** Investigate a ticket and produce root cause analysis.

**Input:** A ticket ID. Access to the repository (git blame, log, source files).

**Actions:**
1. Transition ticket to `active`
2. Run git blame on referenced files
3. Examine relevant git history
4. Produce `blame`, `evidence`, and `hypothesis` analysis entries
5. Converge on a `conclusion` analysis entry

**Output:** Ticket with populated `analysis` section and a `conclusion`.

**Contract:** Must produce at least one `hypothesis` entry. Must produce a `conclusion` entry before handing off to `todo-implement`.

#### `todo-plan`

**Purpose:** Decompose a large ticket into sub-tasks.

**Input:** A ticket ID for a complex work item.

**Actions:**
1. Analyze scope of the ticket
2. Create child tickets via `todo new` with `parent` relationship
3. Link children to parent via `todo link`
4. Optionally transition parent to `blocked` with `depends_on` pointing to children

**Output:** Parent ticket with children linked; child tickets created.

**Contract:** Each child ticket must have a clear, independently-completable summary.

#### `todo-implement`

**Purpose:** Execute the fix/feature/refactor and register proof.

**Input:** A ticket ID in `active` state, ideally with analysis completed.

**Actions:**
1. Write code changes
2. Write or update tests demonstrating the fix/feature
3. Commit changes with a message referencing the ticket ID
4. Register resolution via `todo transition <ID> done --commit <SHA> --test <FILE::FUNC>`

**Output:** Ticket transitioned to `done` with `resolution` block populated.

**Contract:** Must satisfy the done contract (§3.4). For bugs: must have a test. The commit message should include the ticket ID (e.g., `todo:a3f8c2e1 — fix empty input crash`).

### 6.2 Skill Composition

Skills are composable. Common agent workflows:

**Full bug lifecycle:**
```
todo-capture → todo-triage → todo-analyze → todo-implement
```

**Quick fix (agent already knows the issue):**
```
todo-capture → todo-implement
```
The `open → done` direct transition and `todo close` shorthand make this a two-command operation: `todo new ...` then `todo close <id> --test ...`.

**Branch workflow (recommended):**
```
todo-capture → todo work <id> → todo-analyze → todo-implement → merge
```

**Feature build (parent + children):**
```
todo new (parent) → todo new --parent (children) → [todo work → todo-implement → todo close] per child → todo close (parent) → merge
```

**Intake sweep:**
```
todo scan → todo-triage (for each new ticket)
```

---

## 7. Intake Adapters

Intake adapters are thin transformations that normalize different input signals into `todo new` calls. They are not separate tools — they're patterns for how agents or scripts invoke `todo new`.

### 7.1 Log Adapter

**Input:** stderr/stdout capture containing a traceback or error.

**Pattern:**
```bash
command 2>&1 | todo new --type bug --source log --pipe
```

Or in a script:
```bash
output=$(command 2>&1)
if [ $? -ne 0 ]; then
  echo "$output" | todo new --type bug --source log --pipe
fi
```

### 7.2 Test Adapter

**Input:** Test runner output (pytest, unittest, etc.).

**Pattern:**
```bash
pytest --tb=short 2>&1 | todo new --type bug --source test --pipe
```

For structured intake, a pytest plugin could emit one ticket per failing test with file/function metadata already extracted.

### 7.3 Agent Adapter

**Input:** An agent's own observation that something needs doing.

**Pattern:**
```bash
todo new --type refactor --source agent \
  --tags "coupling,parser" \
  --file src/parser.py --lines 100,150 \
  "Extract validation logic into shared module"
```

### 7.4 Human Adapter

**Input:** Natural language from a person.

**Pattern:**
```bash
todo new --source human "The export button doesn't work when the list is empty"
```

Type defaults to `chore`; a triage skill can reclassify.

### 7.5 Comment Adapter (built-in)

**Input:** Source code scan.

**Pattern:**
```bash
todo scan
```

This is the only adapter built into the tool itself. All others are invocation patterns.

---

## 8. Deduplication

### 8.1 Strategy: Fingerprint

Applicable when source has a traceback. Normalizes the traceback (§2.5), computes SHA256, compares against `source.traceback_fingerprint` on all open tickets.

**Match:** Same fingerprint → flag as potential duplicate.

### 8.2 Strategy: File-Line

Compares `files[].path` and `files[].lines` across tickets. If two tickets reference overlapping line ranges in the same file, flag as potential duplicate.

**Match:** Same file, overlapping line range → flag as potential duplicate.

### 8.3 Strategy: Comment Identity

For `comment` sources only. Fingerprint is `sha256(comment_text_normalized)` — the comment text stripped of leading whitespace and the comment marker itself (e.g., `# TODO: ` becomes the text after `TODO:`). File and line are stored as metadata on the ticket but are **not** part of the fingerprint. This makes `todo scan` resilient to file renames and code movement. The tradeoff: two identical TODO comments in different files will dedup to one ticket. This is usually correct — identical TODOs are typically copy-paste artifacts — but if intentional, the agent can manually create a second ticket.

### 8.4 Behavior on Duplicate Detection

- During `todo new`: print warning to stderr, create the ticket anyway, add `relationships.related` link to the potential duplicate.
- During `todo dedup`: print report of potential duplicate pairs.
- Never auto-merge. Dedup is advisory. The decision to mark `duplicate` is a triage action.

---

## 9. Git Integration

### 9.1 The Tool Does Not Commit

`todo` writes files to `.todo/` but never runs `git add` or `git commit`. The agent (or human) is responsible for committing `.todo/` changes alongside their code changes.

**Exception:** `todo work` is the one command that writes to git — it creates and checks out branches via `git checkout -b` and `git checkout`. This is the only git write operation the tool performs. All other commands are pure file operations plus git reads.

This separation is deliberate:

- **No interleaved commits.** The tool never creates commits between the agent's own commits, avoiding unexpected git state changes.
- **Atomic work units.** A code fix and its ticket state change belong in the same commit — `git add src/parser.py .todo/ && git commit` captures both as one logical unit.
- **No edge cases.** No dirty index conflicts, no protected branch failures, no auto-commit racing with the agent's own commit workflow.
- **Branch-friendly.** On a ticket branch, all changes (code + ticket updates) accumulate naturally and get merged together.

### 9.2 Commit Message Convention

When an agent commits work that includes ticket changes, the commit message should reference the ticket ID using the configurable `commit_prefix` (default: `todo:`):

```
todo:a3f8c2e1 — fix empty input crash in parser

Restored empty-input guard clause removed in e4a1b2c.
Added regression test: test_parse_empty_input.
```

This is a convention, not enforced by the tool. Agents should follow it; the commit message links the fix to the ticket for `git log` traceability.

### 9.3 Merge Strategy

JSON files do not support union merge well (unlike line-oriented formats, a naive merge can produce invalid JSON). The recommended approach is the branch-per-ticket workflow (§9.4), which avoids `.todo/` merge conflicts entirely by isolating work on separate branches. If conflicts do occur during merge, they are resolved manually — ticket files are small and the structure is simple.

### 9.4 Recommended Workflow: Branch-Per-Ticket

The recommended workflow for agents (and humans) is to create a branch for each ticket via `todo work`. This keeps ticket work isolated and mainline clean.

**Important:** `todo` commands write files to `.todo/` but never commit. The agent is responsible for committing `.todo/` changes alongside code changes. The examples below show the complete workflow including the git operations the agent performs.

**The workflow:**

```bash
# 1. Pick up a ticket and start a branch (todo creates branch + checks it out)
$ todo work a3f8c2e1
# Created branch todo/a3f8c2e1 — ticket a3f8c2e1 is now active

# 2. Investigate (todo writes to .todo/, agent commits when ready)
$ todo analyze a3f8c2e1 --type blame --content "..."
$ todo analyze a3f8c2e1 --type conclusion --content "..."
$ git add .todo/ && git commit -m "todo:a3f8c2e1 — analysis complete"

# 3. Commit the fix, then close the ticket, then commit the state change
$ git add src/parser.py tests/test_parser.py .todo/
$ git commit -m "todo:a3f8c2e1 — fix empty input crash"
$ todo close a3f8c2e1 --test tests/test_parser.py::test_parse_empty_input
$ git add .todo/ && git commit -m "todo:a3f8c2e1 — closed"

# 4. Merge back to main
$ git checkout main
$ git merge todo/a3f8c2e1
$ git branch -d todo/a3f8c2e1
```

The fix commit and the ticket-close commit are preserved on mainline with their original SHAs. This is critical: `resolution.commit` in the ticket file points to the actual fix commit, and that reference must remain resolvable via `git show`. A regular merge preserves this. A squash merge would create a new commit with a different SHA, leaving the ticket pointing at an orphaned commit that `git gc` will eventually delete.

**Resuming prior work:**

```bash
# Another agent (or the same agent in a new session) picks up the same ticket
$ todo work a3f8c2e1
# Resumed branch todo/a3f8c2e1 — ticket a3f8c2e1 is already active. Branch has 4 commits ahead of main.

# Agent reviews what's already been done
$ git log main..HEAD --oneline
$ todo show a3f8c2e1
# ... sees existing analysis entries, prior commits ...
# Agent continues from where the previous work left off
```

**Why this works:**
- The feature branch preserves the full investigation and lifecycle history.
- Regular merge preserves all commit SHAs, so `resolution.commit` references stay valid forever.
- The tool never commits — code changes and ticket state changes are committed together as atomic units by the agent.
- Multiple agents can work on different tickets concurrently on different branches without `.todo/` conflicts until merge time.
- Prior work is never lost — `todo work` on an existing branch resumes rather than overwrites, and the "N commits ahead" signal tells the agent to review before acting.

**`todo` does not enforce this workflow.** It works identically on any branch. But this pattern is strongly recommended for any project using `todo`.

**Why not squash merge?** Squash merge creates a new commit with a different SHA and discards the original branch commits. This breaks `resolution.commit` — the ticket would point at an orphaned commit that `git gc` will eventually delete. Since the whole point of the done contract is provable traceability to a specific commit, squash merge undermines the tool's core guarantee. If you need a clean mainline `git log`, use `git log --first-parent` to see only merge commits without branch detail.

---

## 10. Scope Boundaries

### 10.1 Explicitly In Scope (v0.1)

- Ticket CRUD with JSON schema
- Parent/child ticket relationships for feature builds (§5.3)
- State machine with transition validation (terminal states are final)
- Done contract enforcement (linked commit, test registration)
- CLI with all commands in §5
- Source comment scanning (`todo scan`)
- Fingerprint and file-line dedup
- JSON as the universal data format (tickets, config, CLI output)
- ID prefix matching
- `todo close` shorthand and `todo work` branch workflow
- Parent-aware branch naming (children share the parent's branch)

### 10.2 Explicitly Out of Scope (v0.1)

- **Prioritization / severity.** The schema reserves space for it (tags), but the tool has no opinion. Triage is a skill decision.
- **Assignment / ownership.** No concept of "assigned to." Agents claim tickets by transitioning to `active`. Git commit author is the implicit owner.
- **Notifications.** No webhooks, email, Slack, or any push mechanism. Watch the git log.
- **Web UI.** The interface is CLI and files. Period.
- **Cross-repo tracking.** One repo, one `.todo/`. Cross-repo bugs are a coordination problem outside this tool's scope.
- **LLM-assisted dedup (semantic).** Reserved for future. The `--strategy semantic` flag exists but prints "not yet implemented."
- **Time tracking.** No estimates, no actuals, no burndown.
- **Custom workflows.** The state machine is fixed. No user-defined states or transitions.
- **Plugin system.** Skills are invocation patterns, not registered plugins. The tool doesn't load or manage skills.
- **Database export/sync.** No SQLite, no PostgreSQL, no sync to external systems.
- **Regression detection.** Automatic reopening of tickets based on test failures is deferred. If a resolved bug recurs, create a new ticket with `relationships.related` pointing to the original. This keeps the tool simple and avoids looping rewrites.
- **Ticket reopening.** Terminal states are final. No `done → open` transition.

### 10.3 Future Considerations (not committed)

- Semantic dedup via local LLM
- `todo dashboard` — terminal UI for human overview
- `todo regress` — automated regression detection against resolved tickets (deferred from v0.1 to avoid complexity and agent loops)
- Structured sub-states (e.g., `active.investigating`, `active.implementing`) via tags rather than state machine expansion
- Intake adapters as installable plugins
- Templates directory for project-specific ticket defaults

### 10.4 The `todo:bible`

The tool ships with a `BIBLE.md` file — a concise, agent-readable workflow guide designed to be included in agent system prompts or read via tool use. While this design spec is the authoritative reference for implementers, the bible is the operational reference for agents and users.

The bible covers:
- The two modes of work: standalone tickets vs feature builds
- The complete lifecycle: capture → triage → analyze → implement → close
- The branch workflow step by step, including git commands
- How to decompose a design spec into parent + child tickets
- When to use each ticket type (`bug` vs `chore` vs `debt` etc.)
- The done contract — what's required to close each type
- Commit message conventions
- Common mistakes and how to avoid them (e.g., closing before committing the fix, forgetting to `git add .todo/`, squash merging and breaking commit references)
- Quick reference for all CLI commands

The bible is written in a voice that agents can follow as instructions. It is not a design document — it is a runbook. It should be created after the tool is implemented and validated.

---

## 11. Implementation Notes

### 11.1 Language and Distribution

- **TypeScript** compiled to JavaScript, targeting Node.js 18+.
- **Distributed via npm.** Install globally with `npm i -g @todo/cli` (package name TBD). The `bin` entry in `package.json` registers the `todo` command on the user's PATH.
- **Single package, no monorepo.** The tool is small enough to be one package.

### 11.2 Dependencies

Keep the dependency surface minimal:

- **`commander`** — CLI framework. Standard in the Node ecosystem, mature, zero transitive deps. **This is the only runtime dependency.**
- **`node:crypto`** (built-in) — SHA256 for content hashing and fingerprinting.
- **`node:child_process`** (built-in) — `execSync` / `execFileSync` for git operations.
- **`node:fs`** (built-in) — file operations. `JSON.parse` / `JSON.stringify` for all serialization.
- **`node:path`** (built-in) — path manipulation.
- **No** `chalk`, `ora`, `inquirer`, or other cosmetic dependencies. Output is plain text for agent consumption.
- **No TOML library.** All data files (tickets, config) are JSON. Serialization is handled entirely by Node built-ins with zero edge cases.

### 11.3 File Operations

All ticket file operations follow:
1. Read existing file (if editing)
2. Modify in memory
3. Write atomically (`fs.writeFileSync` to `.tmp`, `fs.renameSync` into place)

The tool does not stage or commit changes. The `.todo/` directory is part of the working tree and the agent commits it alongside code changes.

### 11.4 Error Handling

- All errors print to stderr.
- All success output prints to stdout (for agent parsing).
- Exit code 0 = success, 1 = validation/logic error, 2 = not found, 3 = git error.
- Git subprocess errors are caught and translated into meaningful messages (e.g., "not a git repository", "commit SHA not found").

### 11.5 Testing Strategy for `todo` Itself

- Unit tests for schema validation, state machine transitions, fingerprinting, dedup. Use `vitest` or Node's built-in test runner (`node:test`).
- Integration tests using temporary git repos (`fs.mkdtempSync` + `git init`).
- No mocking of git — always test against real git operations.
- CI runs tests on Node 18, 20, and 22.

---

## Appendix A: Example Agent Session

```
# Agent receives a failing test from CI
$ pytest tests/test_parser.py::test_unicode_handling 2>&1 | \
  todo new --type bug --source test --pipe
Created: d4e2f1a7

# Agent triages
$ todo show d4e2f1a7
# ... reads ticket ...
$ todo edit d4e2f1a7 --tags "parser,unicode,crash"

# Agent claims ticket and creates a branch
$ todo work d4e2f1a7
# Created branch todo/d4e2f1a7 — ticket d4e2f1a7 is now active

# Agent investigates
$ todo analyze d4e2f1a7 --type blame --content "$(git blame src/parser.py -L 80,90)"
$ todo analyze d4e2f1a7 --type hypothesis --confidence high \
  --content "Unicode normalization not applied before tokenization"
$ todo analyze d4e2f1a7 --type conclusion \
  --content "Confirmed: NFC normalization missing in tokenize()" \
  --supporting 0,1

# Agent implements fix — commit code first
$ git add src/parser.py tests/test_parser.py .todo/
$ git commit -m "todo:d4e2f1a7 — add NFC normalization to tokenizer"

# Close ticket (--commit defaults to HEAD, which is now the fix commit)
$ todo close d4e2f1a7 \
  --test tests/test_parser.py::test_unicode_handling \
  --note "Added NFC normalization before tokenization."
$ git add .todo/ && git commit -m "todo:d4e2f1a7 — closed"

# Merge to mainline (regular merge preserves commit SHAs)
$ git checkout main
$ git merge todo/d4e2f1a7
$ git branch -d todo/d4e2f1a7
```

### Quick Fix Example

```
# Agent spots and fixes a trivial bug in one shot
$ todo new --type bug --source agent "Off-by-one in pagination limit"
Created: e1b4c7f2

# Commit the fix, then close the ticket
$ git add src/paginator.py tests/test_paginator.py .todo/
$ git commit -m "todo:e1b4c7f2 — fix off-by-one in pagination"
$ todo close e1b4c7f2 --test tests/test_paginator.py::test_pagination_boundary
$ git add .todo/ && git commit -m "todo:e1b4c7f2 — closed"
```

---

## Appendix B: Example `config.json`

```json
{
  "project": {
    "name": "my-project"
  },
  "behavior": {
    "commit_prefix": "todo:"
  },
  "intake": {
    "dedup_strategy": "fingerprint",
    "scan_patterns": ["TODO", "FIXME", "HACK", "XXX"],
    "scan_exclude": [".todo", "node_modules", ".venv", "__pycache__", ".git", "dist", "build"]
  },
  "display": {
    "id_length": 8,
    "date_format": "relative"
  }
}
```
