# todo Skills

Agent skill definitions for the `todo` CLI tool, following the [agentskills.io specification](https://agentskills.io/specification).

Each skill maps to one phase of the work lifecycle.

## Skills

| Skill | Phase | Input | Output |
|---|---|---|---|
| [todo-capture](todo-capture/) | Intake | Any signal (log, test, observation, human) | Ticket ID |
| [todo-triage](todo-triage/) | Classify | Open ticket ID | Typed, tagged, linked ticket |
| [todo-analyze](todo-analyze/) | Investigate | Open/active ticket ID | Ticket with analysis + conclusion |
| [todo-implement](todo-implement/) | Execute | Active ticket ID | Closed ticket with resolution proof |
| [todo-scan](todo-scan/) | Sweep | Repository | Tickets for all TODO/FIXME comments |

## Composition

```
todo-capture → todo-triage → todo-analyze → todo-implement
```

Quick fix (root cause already known):
```
todo-capture → todo-implement
```

Feature build:
```
todo-capture (parent) → todo-capture (children) → [todo-work → todo-implement] × N → todo-implement (parent)
```

Intake sweep:
```
todo-scan → todo-triage (for each new ticket)
```

## Hermes Integration

Load a skill by name in your Hermes session or cron job. The skills follow the `agentskills.io/specification` format with Hermes-specific metadata under the `metadata.hermes` key.
