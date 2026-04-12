---
name: todo-plan
description: >
  Decompose a feature, requirement, or design spec into a tracked parent ticket with ordered
  child tasks. Use when a unit of work spans more than one commit, involves multiple distinct
  steps, or needs to be handed off across agent sessions. Output is a committed ticket structure
  ready for todo-implement to work through child by child. Requires git and the todo CLI.
compatibility: Requires git and the todo CLI (npm i -g @todo/cli).
metadata:
  hermes:
    tags: [todo, tickets, planning, decomposition, feature, parent, children]
    related_skills: [todo-capture, todo-implement]
---

# todo-plan

**Purpose:** Turn a feature or spec into an ordered set of independently-workable tickets.

## When to Use

- The work spans more than one commit
- The task has distinct, separable steps (add route, write test, update docs)
- You're working from a design spec or requirements document
- You want another agent session to be able to resume without context from this one

For a single-commit fix, skip planning and go directly to `todo-implement`.

## Rule: What Makes a Good Child Ticket

Each child must be **independently completable** — something that can be committed, closed, and verified on its own.

**Too vague:**
```
"Implement authentication"
```

**Right size:**
```
"Add POST /auth/login endpoint and return JWT on success"
"Add token expiry validation middleware"
"Write integration tests for login + expiry"
```

If you can't write a specific done contract for a child, it's too vague. Break it down further.

## Steps

### 1. Create the parent ticket

The parent represents the feature as a whole. Its summary should describe the outcome, not the steps.

```bash
parent=$(todo new "Add OAuth2 login flow" --type feature --source agent)
git add .todo/ && git commit -m "todo:$parent — capture feature"
```

### 2. Read the spec or requirements

If working from a document, read it fully before decomposing. Identify the distinct deliverables — each becomes a child ticket.

### 3. Create child tickets in order

Children are worked sequentially. Create them in the order they should be done. Each child gets `--parent` to wire the relationship.

```bash
c1=$(todo new "Add /auth/callback route, return 302 on success" --type chore --parent $parent)
c2=$(todo new "Store session token in httpOnly cookie" --type chore --parent $parent)
c3=$(todo new "Add middleware to validate session on protected routes" --type chore --parent $parent)
c4=$(todo new "Write integration tests for full login flow" --type chore --parent $parent)
```

### 4. Commit the ticket structure

```bash
git add .todo/
git commit -m "todo:$parent — plan: 4 subtasks"
```

### 5. Verify the structure

```bash
todo show $parent   # should show children array
todo list           # should show all 4 children as open
```

## Handoff to todo-implement

Once planned, work children in order via `todo-implement`. All children share the parent's branch — `todo work <child-id>` checks out `todo/<parent-id>`, not a new branch.

```
todo work <child-1-id>   → creates branch todo/<parent-id>
todo work <child-2-id>   → resumes branch todo/<parent-id>
...
todo close <parent-id>   → after all children closed
git merge --no-ff todo/<parent-id>
```

## Dependency Ordering

If a child depends on another being done first, use `--depends-on`:

```bash
todo new "Write integration tests" --type chore --parent $parent \
  --depends-on $c3   # can't test middleware that doesn't exist yet
```

`todo work` will warn if a dependency's resolution commit is not reachable from HEAD.

## Output

- One parent ticket in `open` state
- N child tickets in `open` state, all wired to parent via `relationships.parent`
- Parent's `relationships.children` array lists all children in creation order
- All committed to `.todo/`

Hand off to `todo-implement` and work children sequentially.

---

See [CLI reference](references/cli.md) for all flags.
