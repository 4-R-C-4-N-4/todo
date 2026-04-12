# Agent Skills — Revisions v2

Based on critique of the v1 skill set from the perspective of a coding agent operating the tool in practice.

---

## Summary of Changes

| Skill | v1 Status | v2 Proposal |
|---|---|---|
| todo-capture | Keep | Keep, minor refinements |
| todo-triage | Keep (mandatory phase) | Demote to optional — only needed after bulk intake or raw pipe |
| todo-analyze | Keep (rigid structure) | Restructure with quick path vs deep path |
| todo-implement | Keep | Keep, minor refinements |
| todo-scan | Keep | **Remove** — wrong abstraction level for a skill |
| todo-plan | Missing | **Add** — feature decomposition into parent + children |

---

## Removed: todo-scan

**Why:** The scan command is a CLI utility, not a lifecycle skill. Running `todo scan` on a real codebase blindly creates 50–200 low-signal tickets from years of aspirational TODO comments, flooding the tracker and requiring a triage sweep just to recover signal. This is circular busy work — create noise, then triage noise.

**What replaces it:** A brief section in todo-capture covering when and how to use `todo scan` selectively. The command stays in the tool; the dedicated skill goes away.

**When scan is appropriate:**
- Taking over a codebase for the first time and wanting a map of known issues
- The explicit task is "audit technical debt in this repo"
- Always run with `--dry-run` first and review before committing

These are narrow enough that they don't warrant a first-class skill agents load by default.

---

## Revised: todo-triage — Demoted to Conditional

**Problem with v1:** Triage was presented as a mandatory second phase after every capture. In practice, an agent that ran `todo new --type bug --source agent --tags "auth,crash" --file src/auth.ts` has already done 80% of triage inline. Running a separate triage pass adds ceremony without adding signal.

**v2 Position:** Triage is an optional skill loaded in two specific situations:

1. **After raw pipe capture** — when the ticket was created from piped log/test output and has no metadata beyond the raw content. The agent didn't have time to classify at intake.

2. **After a bulk scan** — if `todo scan` was run deliberately (see above), the resulting tickets need classification. This is the one scenario where triage earns its keep as a distinct phase.

**For everything else:** Capture and triage collapse into a single `todo new` call with appropriate flags. The skill should say this explicitly at the top rather than implying it is always needed.

---

## Revised: todo-analyze — Quick Path vs Deep Path

**Problem with v1:** The skill required blame → evidence → hypothesis → conclusion for every investigation, even when the root cause was immediately obvious. Agents either skip the structure (defeating the point) or go through the motions (creating low-value entries to satisfy the contract).

**v2 Proposal: Two explicit paths**

### Quick path — root cause is known

Use when the fix is clear without investigation. Skip analyze entirely:

```
todo-capture → todo-implement
```

The ticket moves open → active (via `todo work`) → done. No analysis entries required. This is the correct path for the majority of solo-agent bug fixes.

### Deep path — root cause is unknown

Use when the bug requires actual investigation: intermittent failures, unfamiliar codebase, complex state interactions, regressions without an obvious cause.

The structured entry sequence (blame → evidence → hypothesis → conclusion) is preserved here — it's valuable exactly when the investigation is non-trivial and the reasoning needs to be recorded for future agents or reviewers.

**The skill should open with this fork**, not bury the quick path as a footnote. Most agents should reach for todo-implement directly and only load todo-analyze when they genuinely don't know what's wrong.

---

## Added: todo-plan

**Why:** The BIBLE.md describes the parent + children feature build pattern in detail, but there is no skill for it. Decomposing a requirement or design spec into a tracked feature with ordered child tasks is a real, repeatable workflow that warrants its own skill.

**What it covers:**

1. Create the parent feature ticket
2. Read the requirement or spec
3. Decompose into ordered child tasks — each independently completable, clearly scoped
4. Create child tickets with `--parent <feature-id>`
5. Commit the wired ticket structure before starting work

**Key contract:** Each child ticket must have a summary that describes a completable unit of work — not "authentication" but "add /auth/callback route and return 302 on success". Vague children produce vague PRs.

**The skill also covers:**
- When to use parent + children vs a single ticket (rule of thumb: if the work spans more than one commit, decompose)
- How `todo work <child-id>` routes all children to the parent's branch
- Closing order: close all children before closing the parent
- The `--note` requirement when closing a parent ticket

---

## Proposed Revised Lifecycle

The v1 lifecycle was presented as a linear pipeline:

```
todo-capture → todo-triage → todo-analyze → todo-implement
```

This implied all four phases are required. They are not. The v2 lifecycle should be presented as a decision tree:

```
Got something to do?
│
├─ Simple fix (know what to do)
│   todo-capture → todo-implement
│
├─ Bug needs investigation
│   todo-capture → [todo-triage if raw intake] → todo-analyze → todo-implement
│
└─ Feature or multi-step work
    todo-plan → [todo-implement × N children] → close parent
```

The closure ceremony (commit code → todo close → commit .todo/) is preserved in all paths. That part is non-negotiable — it's the proof mechanism that makes the tool worth using.

---

## Unchanged: todo-implement

The implementation skill is the strongest of the set. The done contract table is clear and correct. The two-commit pattern (code commit then ticket state commit) is necessary and well explained. The feature build section (close children before parent, `--no-ff` merge) is exactly right.

One addition for v2: a note that `todo close` without `--commit` defaults to HEAD, so the canonical flow is always "commit the fix first, then close" — the commit SHA is captured automatically.

---

## Unchanged: todo-capture

The capture skill is solid. Piping failing command output into a ticket, capturing agent observations, wiring `--parent` at intake — these are all correct. The dedup warning behavior is well explained.

One refinement: add guidance on when to include metadata at capture time vs deferring to triage. The rule: if you know the type, tags, and relevant file at capture time, include them. Don't defer to triage what you already know.

---

## Skill Count: v1 vs v2

| v1 | v2 |
|---|---|
| todo-capture | todo-capture |
| todo-triage (mandatory) | todo-triage (conditional) |
| todo-analyze (rigid) | todo-analyze (quick + deep paths) |
| todo-implement | todo-implement |
| todo-scan | _(removed)_ |
| _(missing)_ | todo-plan |

Net: same count, better signal. The set now covers the full agent workflow including feature decomposition, while removing the scan skill that added noise and the rigid analysis structure that added ceremony without value.
