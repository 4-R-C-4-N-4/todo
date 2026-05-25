# todo Skills

Agent skill definitions for the `todo` CLI tool, following the [agentskills.io specification](https://agentskills.io/specification).

Each skill maps to one phase of the work lifecycle.

## Skills

| Skill | Phase | Use when... |
|---|---|---|
| [todo-capture](todo-capture/) | Intake | You have a single-ticket signal to record |
| [todo-triage](todo-triage/) | Classify / Investigate | Ticket isn't ready: metadata is incomplete OR root cause is unknown |
| [todo-plan](todo-plan/) | Decompose | Work spans multiple commits or needs ordered subtasks (subsumes capture for the parent) |
| [todo-implement](todo-implement/) | Execute | Root cause is known, time to write code and close the ticket |

The `todo analyze` CLI command is a structured-note primitive used inside both `todo-triage` (Deep Investigation mode) and `todo-implement` step 2b. It is not its own skill.

## Decision Tree

```
Got something to do?
│
├─ Single fix, cause already known
│   todo-capture → todo-implement
│
├─ Single fix, cause unknown OR metadata incomplete
│   todo-capture → todo-triage → todo-implement
│
└─ Multi-step feature or spec
    todo-plan → todo-implement × N children → close parent
```

## What's Not Here

**todo-scan** is a CLI command (`todo scan`), not a standalone skill. It's covered in
todo-capture under "Using `todo scan`". The command is useful in narrow contexts
(onboarding a new codebase, explicit debt audits) but not a default part of the agent
workflow — real codebases have hundreds of stale comments and scanning reflexively creates
ticket floods. Use it deliberately, always with `--dry-run` first.

## Closure Ceremony

All paths end with the same two-commit closure pattern, enforced by todo-implement:

```bash
git add <code files>
git commit -m "todo:<id> — describe the change"

todo close <id>          # captures HEAD as resolution commit
git add .todo/
git commit -m "todo:<id> — close"
```

This is non-negotiable. The linked commit is the proof mechanism.

## Hermes Integration

Load a skill by name in your Hermes session or cron job. Skills follow the
`agentskills.io/specification` format with Hermes-specific metadata under
the `metadata.hermes` key (tags and related_skills).
