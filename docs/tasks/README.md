# Tasks

A lightweight, file-based kanban. **A task's status is the folder it lives in** — there's
no status field to keep in sync; you move the file.

```
tasks/
├── todo/    ← planned, scoped, not started
├── doing/   ← actively being worked on right now
└── done/    ← completed / shipped
```

## Workflow

1. Create a task as `todo/<short-kebab-name>.md` (e.g. `todo/avatar-reuse-across-content.md`).
2. When you start it, **move the file** to `doing/`.
3. When it's shipped, **move the file** to `done/`.

## Task file template

```markdown
# <Task title>

**Created:** YYYY-MM-DD
**Owner:** <name>

## Goal
<one or two sentences on the outcome>

## Why
<the user/business reason>

## Scope
- [ ] step one
- [ ] step two

## Out of scope
- <explicitly not doing>

## Notes
<links, decisions, blockers>
```

> `todo/`, `doing/`, and `done/` each keep a `.gitkeep` so the empty folders stay in git.
