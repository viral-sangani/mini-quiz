# Mini Quiz — Agent Guide

> Read this first. It's the front door for every agent session in this repo.
> Last updated: **2026-05-07** (Vercel projects + DB-free admin).

## What this is

Mini Quiz is a real-time multiplayer quiz app for Celo's MiniPay wallet (~14M
users). Hosts schedule games with USDT prize pools, players join via deep
links, top finishers get auto-paid on-chain when the game ends.

There are 4 deployable units:

| App | Stack | Where it runs |
|---|---|---|
| `apps/quiz` | Next.js 14 App Router | **Vercel** (mobile MiniPay player UI) |
| `apps/admin` | Next.js 14 App Router | **Vercel** (desktop admin console, NextAuth) |
| `apps/api` | Fastify 5 + Prisma + viem | **DOKS** (long-lived single-region) |
| `packages/shared` | TypeScript types + utils | consumed by all three |

The API is **stateful** by design: in-process scheduler tick + in-process
SSE broker. Don't refactor those into Vercel Functions — that's the whole
reason the API lives on a VPS-style host.

## Where to start, by task type

Skim only what you need. Most tasks touch one or two of these.

| If you're doing... | Read |
|---|---|
| Backend feature / fixing API code | `docs/architecture.md` → `docs/runbooks.md` |
| Schema change | `docs/architecture.md` (Data model) → `docs/runbooks.md` (Migrations) |
| Frontend in `apps/quiz` (MiniPay player) | `docs/architecture.md` (Player flow) + read the file before editing |
| Frontend in `apps/admin` (CMS) | `docs/architecture.md` (Admin flow) + the relevant page under `apps/admin/app/` |
| Anything Celo / on-chain | `docs/architecture.md` (Payouts) + `packages/shared/src/celo.ts` |
| Deploying / cluster changes | `docs/deployment.md` → `docs/runbooks.md` |
| Setting up a new env / disaster recovery | `docs/runbooks.md` (Bootstrap) |
| Just debugging a Pod | `docs/runbooks.md` (Debug a failing Pod) |
| Adding a third-party integration | `docs/decisions.md` first — it may already be discussed |

## House rules for agents in this repo

These are real, not theoretical. Each one exists because we got burned
without it.

1. **Never commit secrets.** `.env`, `.local/`, `infra/terraform.tfvars` are
   gitignored. Any new secret goes through `kubeseal` → committed as
   SealedSecret. See `docs/runbooks.md` for the exact recipe.
2. **The API must remain ESM-correct.** `@prisma/client` is CommonJS — never
   add a named import from it. Always `import pkg from "@prisma/client"`
   in `apps/api/src/db.ts` and re-export. Same goes for any other CJS dep.
   Note: **`apps/admin` does NOT depend on `@prisma/client`** — auth is
   ADMIN_EMAILS allowlist + api calls only. Don't reintroduce Prisma there.
3. **Schema changes use `prisma migrate dev` locally, then `migrate deploy`
   in CI.** Never edit `apps/api/prisma/migrations/*` by hand.
4. **`packages/shared` is ESM-built.** When you add a new file there, the
   `.js` extension on relative imports is mandatory (NodeNext-style). The
   build emits `dist/`; the package's `main` points there.
5. **The scheduler in `apps/api/src/services/scheduler.ts` runs every 1s
   in-process.** It's a SINGLE replica today. If you add HPA-driven
   horizontal scale on the api Deployment, the scheduler must move to a
   leader-elected single-replica StatefulSet first or you'll get duplicate
   broadcasts.
6. **The SSE broker is in-process** (`apps/api/src/sse/broker.ts`,
   `globalThis` registry). With horizontal api replicas, fan-out across
   pods does NOT work. Move to Redis pub/sub before scaling api beyond 1
   replica during a live game.
7. **Don't introduce new test infra** without asking. There are no tests
   today, and adding Jest/Vitest mid-feature has compounded with TS-config
   pain in the past. If you write a test, use `node --test` for now.
8. **Don't break the Dockerfile**. `apps/api/Dockerfile` is multi-stage
   with deliberate ordering: `pnpm install` → build shared → build api →
   `pnpm deploy --prod` → `prisma generate` (re-run in runtime stage,
   crucial — see `docs/decisions.md` for why).
9. **Cost discipline.** This is a launch-week PoC budgeted at ~$56/mo.
   Don't add Postgres replicas, Prometheus, Loki, DO Load Balancers, etc.,
   without explicit user approval. The "out of scope" list in
   `docs/deployment.md` is intentional.
10. **Update these docs.** When you make a *structural* change (new
    service, schema field, env var, route, infra resource, decision
    overturning a previous one) **update the relevant doc in the same PR**.
    See `docs/maintenance.md` for the trigger list.

## Conventions agents should follow

- **Commit messages**: short imperative, optional scope. `feat(api): ...`,
  `fix(shared): ...`, `infra: ...`, `secrets: ...`, `chore(deploy): ...`.
- **Branches**: feature work in feature branches, but currently we land
  on `main` directly because there's only one developer. Don't open PRs
  unless asked.
- **Imports**: relative imports inside a package use `.js` extensions
  (the source is `.ts`, but tsc emits `.js` and Node resolves them).
  Cross-package imports use the package name (`@mini-quiz/shared`).
- **Fastify routes**: each route file in `apps/api/src/routes/` is a
  Fastify plugin (`export async function fooRoutes(app) { ... }`). Wire
  it in `server.ts`.
- **Prisma model names**: PascalCase singular (`Quiz`, `User`, `Answer`).
  Field names: camelCase. Enums in SCREAMING_CASE.
- **No emojis in code or comments** unless the user explicitly asks.

## Repo map

```
mini-quiz/
├── CLAUDE.md                       # YOU ARE HERE
├── docs/
│   ├── architecture.md             # System design, data model, request flows
│   ├── deployment.md               # DOKS topology, what's where, how to deploy
│   ├── runbooks.md                 # Step-by-step ops procedures
│   ├── decisions.md                # ADRs — non-obvious choices + why
│   └── maintenance.md              # When/how to update these docs
├── apps/
│   ├── api/                        # Fastify backend (DOKS)
│   ├── quiz/                       # Next.js player app (Vercel)
│   └── admin/                      # Next.js admin console (Vercel)
├── packages/
│   └── shared/                     # Cross-app TS types + utils
├── infra/                          # OpenTofu (DOKS, VPC, Argo bootstrap)
├── deploy/                         # Argo CD source (Helm chart, manifests)
├── .github/workflows/              # CI (image build, chart bump)
└── .local/                         # GITIGNORED — runtime credentials
```

## Quick links

- **API live URL**: `https://api.miniquiz.club/health`
- **Quiz (player) URL**: `https://miniquiz.club` (Vercel project `mini-quiz`)
- **Admin URL**: `https://admin.miniquiz.club` (Vercel project `mini-quiz-admin`)
- **Argo CD UI**: `kubectl -n argocd port-forward svc/argocd-server 8080:80`
  → `http://localhost:8080` (admin password: `kubectl -n argocd get
  secret argocd-initial-admin-secret -o jsonpath='{.data.password}' |
  base64 -d`)
- **Cluster**: `doctl kubernetes cluster kubeconfig save miniquiz-prod`
- **Image registry**: `docker.io/viralsangani/miniquiz-api`
- **Argo source repo**: `https://github.com/viral-sangani/mini-quiz` (public
  mirror; canonical is `celo-org/mini-quiz` once PAT is approved)
- **Cloudflare DNS**: `api.miniquiz.club` → `142.93.184.188` (proxied)

## Asking the user

Don't ask the user things you can figure out from these docs or by
reading the code. Reserve questions for: authorization decisions
(secrets, payments, destructive ops), genuinely ambiguous requirements,
and missing context that's not in the repo.
