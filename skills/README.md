# todo Skills

Agent skill definitions for the `todo` CLI tool, following the [agentskills.io specification](https://agentskills.io/specification).

Each skill maps to one phase of the work lifecycle.

## Skills

| Skill | Phase | Use when... |
|---|---|---|
| [todo-capture](todo-capture/) | Intake | You have a signal to record |
| [todo-triage](todo-triage/) | Classify | Ticket arrived with incomplete metadata (raw pipe, bulk scan) |
| [todo-analyze](todo-analyze/) | Investigate | Root cause is unknown — intermittent, regression, unfamiliar code |
| [todo-plan](todo-plan/) | Decompose | Work spans multiple commits or needs ordered subtasks |
| [todo-implement](todo-implement/) | Execute | Root cause is known, time to write code and close the ticket |

## Decision Tree

```
Got something to do?
│
├─ Single fix, cause already known
│   todo-capture → todo-implement
│
├─ Single fix, cause unknown
│   todo-capture → [todo-triage if raw pipe] → todo-analyze → todo-implement
│
└─ Multi-step feature or spec
    todo-capture (parent) → todo-plan → todo-implement × N children → close parent
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
