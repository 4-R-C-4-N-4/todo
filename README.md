# todo

**Git-native work tracking for coding agents.**

[![npm](https://img.shields.io/npm/v/@4-r-c-4-n-4/todo)](https://www.npmjs.com/package/@4-r-c-4-n-4/todo)

`todo` is a ticket tracker that lives *inside* your repository. Tickets are JSON files committed alongside your code in `.todo/`, so work state travels with the branch, survives clones, and is reviewable in a diff. It's designed so a coding agent can run the whole loop — capture a problem, attach reasoning, do the work, and close with proof — but it's just as usable by hand.

Two things make it more than a TODO list:

- **A rationale trail.** `todo analyze` attaches structured reasoning (blame → hypothesis → evidence → conclusion) to a ticket, turning it into a lightweight ADR that's there when you reopen the work months later.
- **A done contract.** A ticket can't close without proof — a resolution commit, and (for bugs) a test reference. Closes are self-documenting by construction.

---

## Install

```bash
npm install -g @4-r-c-4-n-4/todo
```

Requires **Node ≥ 20** and a **git repository**. Then, from the repo root:

```bash
todo init          # creates .todo/ and a config file
git add .todo && git commit -m "chore: init todo"
```

---

## Quickstart

```bash
# 1. Capture a problem
id=$(todo new "Login throws on empty password" --type bug --source human)

# 2. Start work (creates branch todo/<id>, marks the ticket active)
todo work "$id"

# 3. ...write the fix and a test, then commit with the ticket prefix
git commit -am "todo:$id — guard against empty password"

# 4. Close with proof, recording the .todo/ state in the same step
todo close "$id" \
  --test tests/auth.test.ts::rejects_empty_password \
  --note "Restored the null guard dropped in 3f9a1c2" \
  --commit-state
```

That's the standalone-ticket loop. For multi-step features, see **Feature builds** below.

---

## Core concepts

**Tickets** are JSON files under `.todo/open/` (live) and `.todo/done/` (terminal). Each has a stable 8-char id, a type, a state, a summary, and optional analysis, relationships, and resolution.

**States:** `open` → `active` → `done` (plus `blocked`, and the terminal `wontfix` / `duplicate`).

**Types and what it takes to close each (the done contract):**

| Type | Required to close |
|------|-------------------|
| `bug` | Commit + test file **and** function |
| `feature` | Commit + a test *or* a note |
| `refactor` | Commit |
| `chore` | Commit |
| `debt` | Commit (note recommended) |
| `investigation` | A **note** (the documented conclusion) — commit optional, no test needed |
| *parent* | A note, and every child in a terminal state |

`investigation` exists for work whose deliverable is a *decision*, not code — a benchmark, a design call, a "where should this live?" question. It closes on the conclusion.

---

## Two workflow modes

`todo` does not force a branching workflow on you. Pick the one that matches your repo with `behavior.branch_mode`:

### `per-ticket` (default) — todo manages branches

`todo work <id>` creates `todo/<id>` (children share the parent's branch); you merge it back with `--no-ff` when done. Branch-convention guards run on `close`. Best for agent-driven repos where todo owns the git choreography.

```bash
todo work <id>
git commit -am "todo:<id> — ..."
todo close <id> --note "..." --commit-state
git checkout main && git merge --no-ff todo/<id> && git branch -d todo/<id>
```

### `managed` — you own branches (PRs, protected `main`)

`todo work` performs **no git operations**, and `close` drops the branch guards and records state automatically. `todo` becomes a pure state-and-rationale tracker and leaves git entirely to you and your PR flow.

```jsonc
// .todo/config.json
{ "behavior": { "branch_mode": "managed" } }
```

```bash
git checkout -b feature/login-fix   # your branch, your rules
todo work <id>                       # just marks the ticket active
# ...commit however you like...
todo close <id> --note "..."         # no branch guard; state auto-committed
```

### Strict vs. advisory guards

In `per-ticket` mode, the branch-convention checks (are you on the right branch? does a commit reference this ticket?) are **advisory by default** — they warn and proceed. Set `behavior.guard_mode: "strict"` to make them hard errors (exit 1) when you want git to enforce the conventions. The real done contract (commit exists, test/note present) is always enforced.

---

## Feature builds (parent + children)

Decompose a feature into an ordered parent + children. Children share the parent's branch and are worked in sequence.

```bash
parent=$(todo new "OAuth2 login" --type feature --source agent)
c1=$(todo new "Add /auth/callback route" --type chore --parent "$parent")
c2=$(todo new "Validate session middleware" --type chore --parent "$parent")

todo work "$c1"   # creates todo/<parent>
# ...implement, commit, close $c1 --commit-state...
todo next "$parent"   # activates the next open child on the same branch
# ...repeat...
todo close "$parent" --note "All subtasks shipped" --commit-state
```

---

## Command reference

| Command | What it does |
|---------|--------------|
| `todo init` | Initialize `.todo/` in the current git repo |
| `todo new [summary]` | Create a ticket (`--type`, `--source`, `--parent`, `--tags`, `--file`, `--pipe`) |
| `todo list` | List tickets (`--state`, `--type`, `--tag`, `--file`, `--sort`, `--json`) |
| `todo show <id>` | Show ticket detail (`--raw` for JSON) |
| `todo edit <id>` | Edit fields (`--summary`, `--type`, `--tags`, `--parent`, …) |
| `todo work <id>` | Start/resume work (`--skip-branch`, `--branch`, `--actor`) |
| `todo next <parent>` | Activate the next open child on the current branch |
| `todo analyze <id>` | Append a reasoning entry (`--type`, `--content`, `--confidence`) |
| `todo transition <id> <state>` | Move a ticket to any state |
| `todo close <id>` | Close as done (`--commit`, `--test`, `--note`, `--commit-state`, `--force`) |
| `todo link <id> --to <target>` | Link to a commit, file, or ticket (`--relation`) |
| `todo scan` | Create tickets from `TODO`/`FIXME`/… comments in the tree |
| `todo dedup` | Find potential duplicate tickets |
| `todo doctor` | Reconcile `.todo/` against git reality and report drift |
| `todo export` | Dump tickets to stdout as JSON |
| `todo pr` | Push the `todo/<id>` branch and open/update a GitHub PR |
| `todo sync` | Push ticket state to a Hermes Kanban board |
| `todo install-hooks` | Install git hooks that enforce the conventions |

Run `todo <command> --help` for full options.

---

## Configuration

Settings live in `.todo/config.json` (created by `todo init`). The keys that shape the workflow:

| Key | Values | Default | Effect |
|-----|--------|---------|--------|
| `behavior.commit_prefix` | string | `todo:` | Prefix that ties commits to tickets |
| `behavior.branch_mode` | `per-ticket` \| `managed` | `per-ticket` | Whether todo manages branches or leaves git to you (see above) |
| `behavior.guard_mode` | `advisory` \| `strict` | `advisory` | Whether failed branch guards warn or hard-fail |
| `intake.scan_patterns` | string[] | `TODO, FIXME, HACK, XXX` | Comment markers `todo scan` picks up |
| `intake.dedup_strategy` | `fingerprint` \| `file-line` \| `semantic` | `fingerprint` | How duplicates are detected |
| `display.id_length` | number | `8` | Characters of the id shown in lists |
| `display.date_format` | `relative` \| `iso` | `relative` | Date rendering |

**Profiles at a glance:**
- **PR-based / protected `main`** → `branch_mode: "managed"`.
- **Agent-driven, todo owns branches** → `branch_mode: "per-ticket"` + `guard_mode: "strict"`.
- **Solo / local** → the defaults: structure is there, but a guard never blocks you.

---

## `todo doctor`

Because state lives in git and is edited by agents, the `.todo/` store can drift from reality. `todo doctor` reconciles them and reports:

- done tickets whose resolution commit is missing (orphaned by a squash/rebase) or unreachable from `HEAD`
- done parents with a still-open child
- active tickets whose branch was deleted
- tickets misfiled in the wrong directory for their state
- dangling parent/child/dependency references

It exits non-zero on errors (and on warnings too with `--strict`), so it drops straight into CI. `--json` for machine output.

---

## For coding agents

`todo` ships a set of **skills** (under `skills/`) that drive the lifecycle end-to-end: `todo-capture` (intake any signal into a ticket), `todo-triage` (classify raw captures), `todo-plan` (decompose a feature), and `todo-implement` (write the code and close with proof). They encode the conventions so an agent follows them reliably.

`TODO_ACTOR` sets the identity recorded on transitions when git's `user.name` isn't the right attribution.

---

## Learn more

[**BIBLE.md**](./BIBLE.md) is the full doctrine — the lifecycle, the branch workflow, branch-protection setup, and the reasoning behind the done contract.

## License

MIT — see [LICENSE](./LICENSE).
