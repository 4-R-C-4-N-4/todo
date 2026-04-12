# `todo` Implementation Plan

## Project Setup

### Phase 0: Scaffold

- [ ] Initialize npm project with TypeScript (`npm init`, `tsconfig.json`)
- [ ] Configure build: TypeScript → JavaScript compilation targeting Node 18+
- [ ] Configure `bin` entry in `package.json` pointing to compiled CLI entrypoint
- [ ] Install dev dependencies: `typescript`, `vitest`, `@types/node`
- [ ] Install runtime dependency: `commander`
- [ ] Set up project structure:
  ```
  src/
  ├── cli.ts              # entrypoint, commander setup
  ├── types.ts            # all type definitions
  ├── git.ts              # git read operations
  ├── state.ts            # state machine + transition validation
  ├── ticket.ts           # ticket CRUD (read, write, move, ID generation)
  ├── config.ts           # config read + defaults
  ├── scan.ts             # comment extraction
  ├── dedup.ts            # fingerprinting + dedup strategies
  ├── format.ts           # human-readable output formatting
  └── commands/
      ├── init.ts
      ├── new.ts
      ├── list.ts
      ├── show.ts
      ├── edit.ts
      ├── transition.ts
      ├── close.ts
      ├── work.ts
      ├── analyze.ts
      ├── link.ts
      ├── scan.ts
      ├── dedup.ts
      └── export.ts
  tests/
  ├── helpers.ts          # temp git repo setup/teardown
  ├── types.test.ts
  ├── state.test.ts
  ├── ticket.test.ts
  ├── git.test.ts
  └── commands/
      └── *.test.ts
  ```
- [ ] Add `.gitignore` for `node_modules/`, `dist/`
- [ ] Verify `npm run build` compiles and `node dist/cli.js --help` runs

---

## Core Library

### Phase 1: Types

- [ ] Define `TicketType` union: `"bug" | "feature" | "refactor" | "chore" | "debt"`
- [ ] Define `State` union: `"open" | "active" | "blocked" | "done" | "wontfix" | "duplicate"`
- [ ] Define `SourceType` union: `"log" | "test" | "agent" | "human" | "comment"`
- [ ] Define `AnalysisType` union: `"blame" | "hypothesis" | "evidence" | "conclusion"`
- [ ] Define `Source` interface with discriminated union on `type` for per-source fields
- [ ] Define `FileReference` interface (`path`, `lines`, `commit?`, `note?`)
- [ ] Define `AnalysisEntry` interface (`timestamp`, `author`, `type`, `content`, `confidence?`, `supporting_evidence?`)
- [ ] Define `Relationships` interface (`depends_on`, `blocks`, `related`, `duplicates`, `parent`, `children`, `linked_commits`)
- [ ] Define `Work` interface (`branch`, `base_branch`, `started_at`, `started_by`)
- [ ] Define `Resolution` interface (`commit`, `test_file?`, `test_function?`, `resolved_at`, `resolved_by`, `note?`)
- [ ] Define `Ticket` interface composing all of the above
- [ ] Define `Config` interface matching `config.json` schema
- [ ] Write unit tests: validate type guards for discriminated unions
- [ ] Write unit tests: validate optional field handling (missing keys = absent)

### Phase 2: Git Read Layer

- [ ] Implement `isGitRepo()`: check if CWD is inside a git repository
- [ ] Implement `getRepoRoot()`: return the repo root path
- [ ] Implement `commitExists(sha)`: validate a commit SHA via `git cat-file -t`
- [ ] Implement `resolveHEAD()`: return current HEAD SHA
- [ ] Implement `getCurrentBranch()`: return current branch name
- [ ] Implement `branchExists(name)`: check if a branch exists
- [ ] Implement `getDefaultBranch()`: try `git symbolic-ref refs/remotes/origin/HEAD`, fall back to `main`, `master`
- [ ] Implement `getMergeBase(branch1, branch2)`: return merge-base commit
- [ ] Implement `getCommitsAhead(branch, base)`: count commits ahead
- [ ] Implement `isAncestor(ancestor, descendant)`: check reachability via `git merge-base --is-ancestor`
- [ ] Implement `showFileAtCommit(commit, path)`: return file content via `git show`
- [ ] Implement `getLastCommitForFile(path)`: return last commit touching a file via `git log -1`
- [ ] Implement `createBranch(name)`: `git checkout -b`
- [ ] Implement `checkoutBranch(name)`: `git checkout`
- [ ] Implement `getGitUserName()`: read `git config user.name`
- [ ] Wrap all subprocess calls in try/catch with meaningful error messages
- [ ] Write integration tests against a temporary git repo

### Phase 3: Config

- [ ] Implement `loadConfig(repoRoot)`: read `.todo/config.json`, merge with defaults
- [ ] Define default config values (all fields have sensible defaults)
- [ ] Handle missing config file gracefully (use all defaults)
- [ ] Write unit tests: defaults, overrides, missing file

### Phase 4: Ticket CRUD

- [ ] Implement `generateId(sourceType, rawPayload, createdAt)`: SHA256 truncated to `id_length` hex chars
- [ ] Implement `readTicket(id)`: find ticket in `open/` or `done/`, parse JSON, correct state if directory disagrees
- [ ] Implement `readTicketByPrefix(prefix)`: prefix match, error if ambiguous
- [ ] Implement `writeTicket(ticket)`: serialize to JSON with 2-space indent, atomic write (`.tmp` + rename)
- [ ] Implement `moveTicket(id, fromDir, toDir)`: move file between `open/` and `done/`
- [ ] Implement `listTickets(dir, filters?)`: read all tickets from a directory, apply optional filters (state, type, tag, file)
- [ ] Implement `ticketPath(id)`: resolve full path for a ticket ID
- [ ] Write unit tests: ID generation determinism, round-trip read/write, prefix matching, directory-is-truth correction
- [ ] Write integration tests: file operations in a temp repo

### Phase 5: State Machine

- [ ] Define the transition table as data (map of `[fromState, toState] → validation function`)
- [ ] Implement `validateTransition(ticket, targetState, params)`: check transition rules
- [ ] Implement `applyTransition(ticket, targetState, params)`: mutate ticket state, handle side effects (clear `work` on abandon, populate `resolution` on done, set `duplicates` on duplicate)
- [ ] Implement the done contract validation:
  - [ ] Linked commit check (`git cat-file`)
  - [ ] Bug: test_file + test_function required, file must exist
  - [ ] Feature: test or note required
  - [ ] Refactor/chore/debt: commit only
  - [ ] Parent ticket: note required, commit defaults to HEAD
- [ ] Write unit tests: every valid transition, every invalid transition, every done contract variant

---

## CLI Commands

### Phase 6: `init` + `new`

- [ ] Implement `todo init`: create `.todo/`, `open/`, `done/`, `config.json`, print instructions to commit
- [ ] Implement `todo new`:
  - [ ] Parse args: `--type`, `--source`, `--file`, `--lines`, `--tags`, `--parent`, `--pipe`, positional SUMMARY
  - [ ] `--pipe`: read stdin (check for TTY, error if not piped)
  - [ ] Summary extraction heuristics (log: last line, test: test name, other: first non-blank line)
  - [ ] Generate ticket ID from content hash
  - [ ] If `--file`/`--lines`: create permalink-anchored file reference
  - [ ] If `--parent`: set `relationships.parent`, append to parent's `children` array
  - [ ] Dedup check (fingerprint strategy on open tickets)
  - [ ] Write ticket to `.todo/open/<id>.json`
  - [ ] Print ticket ID to stdout
- [ ] Write integration tests: init + new in temp repo, parent/child wiring, pipe input, dedup warning

### Phase 7: `list` + `show` + `export`

- [ ] Implement `todo list`:
  - [ ] Parse filters: `--state`, `--type`, `--tag`, `--file`, `--sort`, `--json`, `--limit`
  - [ ] Default: read `open/`. If terminal state requested, read `done/`
  - [ ] Human output: tabular with branch display for active/blocked
  - [ ] JSON output: array of ticket summary objects
- [ ] Implement `todo show`:
  - [ ] Parse `--raw` flag
  - [ ] ID prefix resolution
  - [ ] Human format: header, description, tags, source, files (with permalink resolution), analysis entries (truncated), resolution
  - [ ] Permalink display: resolve content via `git show`, extract line range, format with line numbers
  - [ ] Raw format: dump JSON file contents
- [ ] Implement `todo export`:
  - [ ] Parse `--state`, `--type`
  - [ ] Output JSON array to stdout
- [ ] Write integration tests: list with filters, show with permalink resolution, export

### Phase 8: `edit` + `transition` + `close`

- [ ] Implement `todo edit`:
  - [ ] Parse `--summary`, `--description`, `--type`, `--tags`, `--add-tag`, `--rm-tag`
  - [ ] Validate immutable fields not changed (`id`, `created_at`, `source`)
  - [ ] Update `updated_at`
  - [ ] Write ticket
- [ ] Implement `todo transition`:
  - [ ] Parse target state and state-specific flags (`--commit`, `--test`, `--note`, `--depends-on`, `--duplicate-of`)
  - [ ] Validate transition via state machine
  - [ ] Apply transition (state change, file move, field population)
  - [ ] Print result to stdout, errors to stderr
  - [ ] Exit codes: 0 success, 1 validation, 2 not found
- [ ] Implement `todo close`:
  - [ ] Shorthand for `transition done`
  - [ ] Default `--commit` to HEAD
  - [ ] `--checkout`: check out base_branch after closing
- [ ] Write integration tests: edit immutability, every transition path, done contract enforcement, close with --checkout

### Phase 9: `work`

- [ ] Implement branch name resolution: check `parent` → `todo/<parent_id>`, else `todo/<ticket_id>`
- [ ] Implement `--branch` override
- [ ] Branch does not exist path: transition to active, create branch, checkout, print
- [ ] Branch already exists path: checkout, check state, transition or warn, print with commits-ahead count
- [ ] Terminal state warning: stderr + exit code 1
- [ ] Dependency check: read `depends_on`, check each `resolution.commit` reachability, print warnings
- [ ] Populate `work` block: branch, base_branch, started_at, started_by
- [ ] Actor resolution: `--actor` flag → `TODO_ACTOR` env → `git config user.name`
- [ ] Write integration tests: fresh branch, resume branch, sibling branch (parent-aware), terminal state warning, dependency warning

### Phase 10: `analyze` + `link`

- [ ] Implement `todo analyze`:
  - [ ] Parse `--type`, `--content`, `--confidence`, `--supporting`
  - [ ] Append to `analysis` array (append-only, no edit/delete)
  - [ ] Set `timestamp` and `author` automatically
  - [ ] Write ticket
- [ ] Implement `todo link`:
  - [ ] Parse `--to`, `--relation`, `--as`
  - [ ] Disambiguation: ticket ID prefix → `git cat-file` → file path
  - [ ] Ticket target: add to appropriate `relationships` field
  - [ ] Commit target: add to `linked_commits`
  - [ ] File target: add to `files` array with `commit` set to HEAD
- [ ] Write integration tests: analyze append-only, link disambiguation

### Phase 11: `scan` + `dedup`

- [ ] Implement comment scanner:
  - [ ] File extension → comment syntax mapping
  - [ ] Walk source tree respecting `scan_exclude`
  - [ ] Extract lines matching `scan_patterns`
  - [ ] Parse comment text after the pattern keyword
- [ ] Implement `todo scan`:
  - [ ] Use comment scanner to find TODO/FIXME/etc
  - [ ] Compute content-only fingerprint for dedup against existing tickets
  - [ ] Create tickets for new comments with source type `comment`
  - [ ] Permalink anchor: `git log -1 --format=%H -- <path>`, floating if untracked
  - [ ] `--dry-run`: print what would be created
  - [ ] `--type`: override default type (chore)
- [ ] Implement `todo dedup`:
  - [ ] Fingerprint strategy: compare `traceback_fingerprint` across open tickets
  - [ ] File-line strategy: compare overlapping file/line ranges
  - [ ] Semantic strategy: print "not yet implemented"
  - [ ] `--dry-run` (default): print potential duplicate pairs
  - [ ] Without `--dry-run`: add `relationships.related` links
- [ ] Write integration tests: scan creates tickets, dedup detects duplicates, dry-run is non-destructive

---

## Polish + Ship

### Phase 12: Traceback Fingerprinting

- [ ] Implement normalize function: strip memory addresses, timestamps, PIDs, absolute paths
- [ ] Implement fingerprint: SHA256 of normalized traceback
- [ ] Integrate into `todo new` for log/test sources
- [ ] Write unit tests: normalization edge cases, deterministic fingerprinting

### Phase 13: Error Handling + Edge Cases

- [ ] Audit all commands for consistent exit codes (0, 1, 2, 3)
- [ ] Audit all commands for stdout (success) vs stderr (errors/warnings) separation
- [ ] Handle: not a git repo (exit 3 with message)
- [ ] Handle: `.todo/` not initialized (suggest `todo init`)
- [ ] Handle: ambiguous ID prefix (list matches, exit 1)
- [ ] Handle: ticket not found (exit 2)
- [ ] Handle: `--pipe` on TTY (exit 1 with message)
- [ ] Handle: git subprocess failures (translate to meaningful messages)
- [ ] Handle: invalid JSON in ticket files (error with file path)
- [ ] Handle: concurrent writes (atomic write should handle most cases)

### Phase 14: Build + Distribution

- [ ] Configure `esbuild` or `tsc` for production build (single-file bundle for faster startup)
- [ ] Add `#!/usr/bin/env node` shebang to compiled entrypoint
- [ ] Test global install: `npm link`, verify `todo` command works
- [ ] Write README.md with installation, quickstart, and link to BIBLE.md
- [ ] Choose npm package name (scope + package)
- [ ] Configure `package.json` for publishing: `files`, `bin`, `engines`, `repository`
- [ ] Publish to npm: `npm publish --access public`

### Phase 15: Bible

- [ ] Write `BIBLE.md`:
  - [ ] Two modes of work (standalone vs feature build)
  - [ ] Bug fix lifecycle walkthrough with every command
  - [ ] Feature build lifecycle walkthrough with every command
  - [ ] Ticket types: when to use each
  - [ ] Done contract quick reference
  - [ ] Commit message convention
  - [ ] Common mistakes: closing before committing, forgetting `.todo/`, squash merge
  - [ ] CLI quick reference (all commands, all flags)
- [ ] Ship BIBLE.md inside the npm package
- [ ] Verify agents can read it via file path after install
