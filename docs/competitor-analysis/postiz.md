# Postiz

> An open-source, AGPL-licensed multi-channel social media scheduler ("agentic alternative to Buffer") whose value to us is its publicly readable Next.js/NestJS monorepo — a reference for how a multi-channel composer and content library are built.

| | |
|---|---|
| **Website** | [postiz.com](https://postiz.com/) · repo: [github.com/gitroomhq/postiz-app](https://github.com/gitroomhq/postiz-app) |
| **Category** | Scheduling (open-source reference) |
| **Pricing (June 2026)** | Self-host: free (AGPL-3.0). Cloud: Standard $29/mo (5 channels), Team $39/mo (10 channels), Pro $49/mo (30 channels), Ultimate $99/mo (100 channels); 7-day free trial |
| **Best known for** | Free, self-hostable open-source alternative to Buffer/Hypefury with a write-once / post-everywhere composer |

## What they do

Postiz is an open-source social media scheduling tool built by Gitroom (Nevo David). It positions itself as "the ultimate agentic social media scheduling tool" and an open alternative to Buffer.com, Hypefury, and Twitter Hunter. The core job is the classic multi-channel queue: connect your social accounts, write a post once, choose which channels it goes to, optionally tweak the copy/media per channel, and schedule it on a calendar. It also covers analytics (pulled from each network's official insights API), team collaboration (invites, commenting, role-based access), evergreen post recycling, and a marketplace for buying/selling posts.

The defining trait is that it is **fully open source under AGPL-3.0** and self-hostable via Docker — anyone can run the entire product for free on their own infrastructure, and, more usefully for us, **read the whole codebase**. The cloud-hosted version is the monetized path (the AGPL license effectively requires anyone offering it as a network service to also open their source, which protects Gitroom's hosted business).

The more recent positioning leans "agentic": Postiz exposes an API, webhooks, an N8N node, a Make.com integration, and a CLI ("Postiz Agent") so external AI agents (Claude, ChatGPT, OpenClaw, etc.) can draft, approve, and publish posts. There is also an in-app AI copilot/chat that can write captions and hooks per platform and generate images and short videos. None of this overlaps with OpenShorts' V1 — scheduling and social distribution are explicitly out of scope for us — so Postiz is a **lighter-touch reference**, not a head-to-head competitor.

## Core workflow

1. Connect channels via OAuth (one click per network; accounts can be grouped by "customer"/brand).
2. Open the composer and write the base post (text + media).
3. Select the target channels for this post.
4. Per-channel preview: each channel renders its own preview, and you can override copy, media, or hashtags so the LinkedIn version differs from the X version, etc.
5. (Optional) Use the AI copilot to draft/rewrite the caption, hook, or hashtags, or generate an image/short video.
6. Pick a time on the calendar (or set a repeating/evergreen cadence, e.g. every 30 days).
7. Schedule; background workers publish at the chosen time and later pull analytics back per channel/post.

## Key features

- **Multi-channel composer** — write once, fan out to many channels with per-channel overrides and previews.
- **Visual calendar** for scheduling, drag-style editing, and queue management.
- **~20+ supported channels** (see below); cross-posting to all simultaneously.
- **AI copilot / chat** — drafts captions, hooks, hashtags tuned per platform; generates images (plan-capped, ~100–500/mo) and short videos (~3–60/mo).
- **Post recycling / evergreen** — set any post on a repeating cadence per channel.
- **Per-channel analytics** pulled from each network's official insights API (impressions, likes, comments, shares, reach, engagement rate where available).
- **Team collaboration** — member invites, commenting, role-based access (Admin/Member), customer/brand grouping for agencies.
- **Agentic / automation surface** — public REST API, webhooks, RSS auto-post, N8N node, Make.com/Zapier, NodeJS SDK, and the "Postiz Agent" CLI for external AI agents.
- **Self-hostable** via Docker Compose (AGPL-3.0).

## Output / content types

- Scheduled/published social posts (text + image + video) across connected networks.
- Per-channel post variants from a single source post.
- AI-generated captions, hooks, and hashtags.
- AI-generated images and short videos (used as post media, not a standalone editor).
- Analytics reports per channel and per post.

## Strengths

- **Fully open source (AGPL-3.0) and self-hostable** — the entire product is readable and runnable for free; this is the whole reason it's in our docs.
- **Mature multi-channel composer** with per-channel previews/overrides — a clean, well-trodden model for the write-once/post-everywhere pattern.
- **Broad channel coverage** (~20+ networks, including niche ones like Mastodon, Bluesky, Nostr, Farcaster/Warpcast, Lemmy, Dev.to, Hashnode).
- **Modern, conventional TypeScript stack** that's easy to learn from (Next.js + NestJS + Prisma/Postgres + Redis/BullMQ + Temporal, Nx/pnpm monorepo).
- **Strong automation/API story** — first-class API, webhooks, and agent CLI make it composable.
- **Cheaper than incumbents** (Buffer/Hootsuite) on cloud, and free if self-hosted.

## Weaknesses & gaps

- **Not a video creation tool.** Its AI image/video generation exists only to produce post media; there is no UGC ad pipeline, no avatar/actor system, no hook→assembly workflow. It assumes you already have content.
- **Self-hosting has real operational weight** — Postgres + Redis + Temporal (which itself needs Postgres + Elasticsearch) is a non-trivial stack to stand up and keep running.
- **AGPL-3.0 is viral/copyleft** — fine for studying the architecture, but it constrains direct code reuse in a closed-source product.
- **Scheduling-only surface area** — overlaps zero with OpenShorts' V1; useful as a reference, not a feature competitor.
- **Per-channel reliability is at the mercy of each network's API/OAuth churn** — a known pain point for all schedulers.

## Relevant to OpenShorts (steal / avoid)

- **Steal:** The **multi-channel composer model** — one base post, channel selection, then **per-channel preview + override** — is the cleanest reference for any future composer/share surface, even if our "channels" are export targets rather than social accounts. Because the repo is open, it's also a free **architecture reference** for the library/composer: a Next.js front end + NestJS API, **Prisma/Postgres** for the content model, **Redis + BullMQ** for the async job queue, and **Temporal** for longer multi-step background workflows — a directly analogous shape to OpenShorts' own async job queue and clip library. Worth reading their content/library data model and how they structure the per-channel preview components before we design OpenShorts' gallery/composer UX.
- **Avoid / their gap we exploit:** **Scheduling and social distribution are out of scope for OpenShorts V1.** Postiz is built around the calendar/queue; we are not. We don't need its OAuth-per-network surface, its publishing workers, or its analytics pull-back — those are the heavy parts of a scheduler and we should not be lured into building them. Our differentiation is upstream: actually *generating* the UGC ad/video. Postiz assumes the content already exists; that creation gap is exactly what we own.

## What I like

> _TODO (founder to fill in)_

## Out of scope

> _TODO (founder to fill in)_

## Sources

- [Postiz — official site](https://postiz.com/) — accessed June 2026
- [Postiz — pricing](https://postiz.com/pricing) — accessed June 2026
- [gitroomhq/postiz-app — GitHub repo & README](https://github.com/gitroomhq/postiz-app) — accessed June 2026
- [Postiz docs — integrations list (API)](https://docs.postiz.com/public-api/integrations/list) — accessed June 2026
- [Postiz docs — development / monorepo setup](https://docs.postiz.com/installation/development) — accessed June 2026
- [Postiz Agent CLI — GitHub](https://github.com/gitroomhq/postiz-agent) — accessed June 2026
