# Doc maintenance for agents

> Last updated: **2026-05-07**.
> This file tells agents (and humans) when to update which doc, and how.

## Why this exists

These docs are the **front-loaded context** for every agent session.
If they go stale, every new session re-pays the discovery tax. Keeping
them current is part of the job, not optional cleanup.

## What counts as a "structural change"

If your PR/commit does any of the following, **update the docs in the
same change**:

| Change | Update |
|---|---|
| Add / remove a service, app, or package | `CLAUDE.md` repo map + `docs/architecture.md` |
| Add / change / remove a Prisma model or enum | `docs/architecture.md` (Data model) — point to schema, don't paraphrase |
| Add a new request flow / API route group | `docs/architecture.md` (Request flows) |
| Change runtime behavior of scheduler / SSE / payouts | `docs/architecture.md` + `CLAUDE.md` house rules if behavior contract changes |
| Add a new env var | `docs/architecture.md` (Environment variables) + `apps/api/.env.example` if the api needs it |
| Add a new infra resource (Tofu) | `docs/deployment.md` (Cluster facts / Repo layout) |
| Add an Argo Application | `docs/deployment.md` (Argo Applications + sync waves) + add to `deploy/apps/` |
| Change image registry / source repo | `docs/deployment.md` (What runs where) + `CLAUDE.md` Quick links |
| Change Cloudflare config / DNS | `docs/deployment.md` (Cluster facts) + `docs/runbooks.md` if a procedure changes |
| Add / change a runbook procedure | `docs/runbooks.md` — procedure must be runnable as-is |
| Make a non-obvious choice that future-you will question | `docs/decisions.md` — append-only entry |
| Override a previous decision | `docs/decisions.md` — new entry referencing the superseded one |
| Change cost profile materially | `docs/deployment.md` (Cost) + `CLAUDE.md` if budget discipline rules change |

## What NOT to update

- **Code-derivable facts** (file locations, function signatures, exact
  Prisma field types). Point at the file. If an agent needs the field,
  they'll read it.
- **Git history / commits / who-changed-what.** `git log` is canonical.
- **Bug fixes that don't change architecture.** The fix is in the code;
  the why is in the commit message.

## How to update

1. **Same PR / commit** as the change itself. A separate "docs update"
   PR will be forgotten.
2. **Bump the `Last updated` date** at the top of each doc you touched.
3. **Be honest about state.** If something's deliberately not done,
   say so and put it in the relevant "Out of scope" or "What's
   deliberately not here" section.
4. **Keep it scannable.** Short paragraphs, tables for facts, prose
   only for "why".
5. **Link to source files** instead of inlining code. Code drifts;
   filenames don't (much).

## Format expectations

- Each doc opens with a `Last updated` date and `Update triggers` list.
- Headings use `#`/`##`/`###` — agents skim by heading.
- Code blocks are **runnable** when they appear in `runbooks.md`.
  Don't put pseudocode or "fill-in-the-blank" snippets there; if
  values come from elsewhere, sourcing them must be the first step.
- Tables for any "what fact applies in what state" content.
- No emojis unless the user explicitly asked.

## Self-test before merging a doc change

Ask yourself:

1. If a brand-new agent landed in this repo cold, would these docs
   answer the question I just had to figure out?
2. Does my change in `architecture.md` paraphrase anything that lives
   in a code file? If yes, replace with a pointer to the file.
3. Did I add a runbook? Will it run as written, or does it assume
   knowledge another agent doesn't have?
4. Did I overturn a previous decision? Is there a new entry in
   `decisions.md` with `[SUPERSEDED-BY]` markers?

## When in doubt

Default to writing it down. A future agent reading too much
documentation will skim past it; one reading too little will ask the
user the same question for the third time.

## What's NOT in these docs by design

- API-key values, treasury keys, anything from `.env`. Even
  `decisions.md` only refers to **where** secrets live, not what they
  are.
- Frontend implementation details for `apps/quiz` and `apps/admin`.
  Those apps ship their own UI; if behavior changes, update
  `architecture.md`'s "Request flows" only when the **contract** with
  the API changes.
- Vercel project config. Lives in the Vercel dashboard. Agents that
  need it can read `apps/quiz/next.config.mjs` and the env vars the
  code reads.
