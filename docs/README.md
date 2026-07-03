# Docs

Internal documentation for OpenShorts. This folder is for planning, research, and
process notes — not user-facing product docs (those live in the root `README.md`).

## Structure

```
docs/
├── README.md                  ← you are here (documents the docs conventions)
├── naming-ideas.md            ← app name candidates + starred shortlist
├── competitor-analysis/       ← one .md per competitor, plus a README index
│   ├── README.md
│   ├── reelfarm.md
│   ├── heygen.md
│   └── …
└── tasks/                     ← lightweight kanban for work-in-progress
    ├── README.md
    ├── todo/                  ← planned, not started
    ├── doing/                 ← actively in progress
    └── done/                  ← shipped / completed
```

## Conventions

- **One concern per file.** A competitor, a task, a research note — each gets its own
  Markdown file with a short kebab-case filename (`reelfarm.md`, `add-avatar-reuse.md`).
- **Folder = status.** In `tasks/`, a file's *location* is its status. Moving work forward
  means moving the file from `todo/` → `doing/` → `done/` (don't add a "status:" field).
- **READMEs are indexes.** Each subfolder's `README.md` lists what's inside and the
  template/conventions for that folder. Keep it current when you add a file.
- **Date things.** When a doc captures a point-in-time snapshot (pricing, feature set),
  note the date so future readers know how stale it is.

## Folders

| Folder | What goes here |
|---|---|
| [`competitor-analysis/`](./competitor-analysis/) | Deep-dive on each competing product — what they do, strengths/gaps, and what's worth stealing for OpenShorts. |
| [`tasks/`](./tasks/) | Kanban-style task tracking (`todo` / `doing` / `done`). |

| File | What it is |
|---|---|
| [`naming-ideas.md`](./naming-ideas.md) | Running list of app name candidates, the founder-starred shortlist, and web-verified top picks. |
| [`api-keys.md`](./api-keys.md) | Every API key ClipZoo uses, with step-by-step generation links (Gemini, Upload-Post, ElevenLabs, fal.ai, Supabase, S3). |
