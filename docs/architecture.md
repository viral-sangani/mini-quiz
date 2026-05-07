# Architecture

> Last updated: **2026-05-07** (storage section + R2 migration).
> Update triggers: new service, new request flow, schema change, on-chain
> change, scaling change. See `maintenance.md`.

## Mental model

```
┌─────────────────────────────────────────────────────────────────┐
│ MiniPay wallet (mobile)            Desktop browser              │
│         │                                  │                    │
│         ▼                                  ▼                    │
│ ┌─────────────────┐            ┌────────────────────┐          │
│ │ apps/quiz       │            │ apps/admin         │          │
│ │ (Next.js, Vercel)            │ (Next.js, Vercel)  │          │
│ │ Player UI       │            │ NextAuth admin CMS │          │
│ └────────┬────────┘            └─────────┬──────────┘          │
│          │ NEXT_PUBLIC_API_BASE_URL                             │
│          └──────────────┬───────────────┘                      │
│                         ▼                                      │
│              https://api.miniquiz.club                         │
│                  (Cloudflare proxy)                            │
│                         ▼                                      │
│ ┌──────────────────────────────────────────────────────┐      │
│ │ DigitalOcean Kubernetes (DOKS, NYC3, 1 node)         │      │
│ │  ingress-nginx (hostNetwork) ─► api Service           │      │
│ │                                  ▲                    │      │
│ │  ┌─────────────┐                  │                   │      │
│ │  │ apps/api    │ ◄─ DATABASE_URL─┼─► Postgres (CNPG) │      │
│ │  │ Fastify     │ ◄─ REDIS_URL ───┼─► Redis (Bitnami) │      │
│ │  │ Prisma      │                  │                   │      │
│ │  │ in-proc     │                  │                   │      │
│ │  │  scheduler  │                  │                   │      │
│ │  │  SSE broker │                  │                   │      │
│ │  └─────────────┘                  │                   │      │
│ └──────────────────────────────────────────────────────┘      │
│                         │                                      │
│                  viem (CIP-64 fee abstraction)                 │
│                         ▼                                      │
│              Celo mainnet (USDT payouts)                       │
└─────────────────────────────────────────────────────────────────┘
```

## The four units

### `apps/api` — the Fastify backend

- Entry: `apps/api/src/server.ts` (binds `0.0.0.0:4000`)
- Auth: shared JWT (`jose`), signed by admin app, verified here.
- Routes (`apps/api/src/routes/`):
  - `health.ts` — readiness/liveness probe.
  - `rooms.ts` — player joins, answers, SSE event stream.
  - `quizzes.public.ts` — anonymous read-only quiz info.
  - `leaderboard.public.ts` — anonymous leaderboard read.
  - `profile.public.ts` — player profile + onboarding.
  - `quizzes.admin.ts` — full CRUD (admin JWT required).
  - `payouts.admin.ts` — payout ledger + retry on FAILED.
  - `users.admin.ts` — user list + flag/unflag.
  - `admin-stats.admin.ts` — dashboard KPIs.
- Services (`apps/api/src/services/`): business logic, called by routes.
- **Stateful runtime singletons** (these are why the API can't be
  serverless and can't horizontally scale today):
  - `scheduler.ts` — `setTimeout` loop, ticks every 1s. Flips quizzes
    SCHEDULED → LIVE → ENDED, broadcasts SSE events, enqueues auto-payouts.
  - `sse/broker.ts` — `globalThis.__sseRegistry` Map of `quizId →
    Set<client>`. SSE clients subscribed to a quiz get fanout from
    `broadcast(quizId, event)`.

### `apps/quiz` — MiniPay player

- Entry-point page is `/play/[code]` after the player joins via QR or
  deep link. Lobby → Question → Reveal → Leaderboard cycle.
- Talks to API via `NEXT_PUBLIC_API_BASE_URL`. SSE for live state.
- MiniPay-specific: `lib/minipay.ts` detects `window.ethereum.isMiniPay`
  and auto-connects the wallet (no connect button).

### `apps/admin` — admin console

- Desktop-first (mobile gate at <768px).
- NextAuth: Google OAuth + email magic link. `ADMIN_EMAILS` env var on
  the API gates who's an admin.
- Pages: `/overview`, `/quizzes`, `/quizzes/[id]/live`, `/players`,
  `/payouts`, `/payouts/[id]`.
- Live monitor uses the same SSE event stream as players, plus an
  admin-only `answer_distribution` event for the per-question vote
  histogram.

### `packages/shared` — cross-app types

- ESM-built (emits `dist/` via tsc, `main` points there).
- Adding a file? Re-export it from `src/index.ts` with `.js` extension.
- Currency / token addresses for Celo mainnet live in `src/celo.ts`.
- Badge catalog in `src/badges.ts`.
- Scoring rules in `src/scoring.ts`.

## Data model

Source of truth: `apps/api/prisma/schema.prisma`. Don't paraphrase here —
read the schema. Key relationships at a glance:

- `User` 1:N `Answer`, has `walletAddress` (lowercased), `flagged` boolean.
- `Quiz` 1:N `Question` 1:N `Choice`. `Question` 1:N `Answer`.
  `Quiz` 1:N `Payout`.
- `Quiz.status`: `DRAFT | SCHEDULED | LIVE | ENDED | ARCHIVED`.
- `Payout.status`: `PENDING | APPROVED | BROADCAST | CONFIRMED | FAILED`.
  Auto-payouts skip PENDING — they're created at APPROVED.
- `Quiz.prizeAmounts` is a `String[]` of human-readable USDT amounts;
  index `i` maps to leaderboard rank `i+1`.

## Request flows

### Player joins + plays

1. Player taps QR / deep link → `apps/quiz/play/[code]`.
2. Frontend `POST /rooms/:code/join` with display name + wallet.
3. Server creates `RoomPlayer` row, returns `roomPlayerId` + JWT.
4. Frontend opens SSE `/rooms/:code/events?token=...`.
5. Scheduler tick eventually flips quiz to LIVE → SSE broadcasts
   `quiz_started` → frontend transitions to question screen.
6. Each question: server broadcasts `question_started` with
   `endsAt` timestamp. Frontend counts down locally.
7. Player answers: `POST /rooms/:code/answer`. Server scores it,
   inserts `Answer`, broadcasts `leaderboard` + `answer_distribution`.
8. Question time-up: server broadcasts `question_ended` with
   correct answer; client shows reveal.
9. Last question + buffer: scheduler tick flips quiz to ENDED →
   broadcasts `quiz_ended` → server enqueues auto-payouts.

### Admin creates + runs a quiz

1. Admin signs in via NextAuth (Google or email).
2. `apps/admin` mints a backend JWT signed with `NEXTAUTH_SECRET`.
3. `POST /admin/quizzes` with body, including `prizeAmounts`.
4. Quiz lands at `DRAFT`. Admin transitions to `SCHEDULED` with
   `scheduledStart`.
5. Scheduler picks it up at the start time → LIVE.
6. Admin can `POST /admin/quizzes/:id/end` to manually end early
   (also auto-payouts).
7. Admin live-monitor page consumes SSE for real-time KPIs +
   answer distribution.

### Auto-payout (LIVE → ENDED)

1. Scheduler tick sees `endedAt <= now` for a LIVE quiz.
2. Updates row to `ENDED`, broadcasts `quiz_ended`.
3. Calls `enqueueAutoPayouts(quizId)`:
   - Reads top-N from `leaderboard(quizId)` where N =
     `quiz.prizeAmounts.length`.
   - For each ranked player with `walletAddress != null`: creates
     `Payout` row at `APPROVED`, then immediately calls
     `broadcastPayout(id)` which signs + sends a USDT transfer via
     viem with CIP-64 fee abstraction (gas paid in USDT itself).
   - On success: row → `CONFIRMED` with `txHash`.
   - On failure: row → `FAILED` with `failureReason`. Admin can
     retry via `POST /admin/payouts/:id/approve`.
4. Best-effort badge eval runs after.

**WARNING**: This whole pipeline runs **inline on the scheduler tick**.
Each on-chain transfer blocks the tick for 1–3s. With many winners +
the in-process SSE broker on the same event loop, the tick gets
delayed and live SSE updates lag. Move payouts to a worker queue
before scaling player count past ~20k concurrent.

## Environment variables

The full list lives in `apps/api/src/config.ts` (it's Zod-validated at
boot). Frontend env vars in each app's `next.config.mjs` and
`apps/{quiz,admin}/.env`. Production values are in:

- **DOKS**: SealedSecret `api-secrets` in the `api` namespace.
  Source-of-truth ciphertext in
  `deploy/manifests/sealed-secrets/api-secrets.yaml`. Plaintext in
  `.env` (gitignored). To regenerate: see `runbooks.md`.
- **Vercel**: project Environment Variables panel for `apps/quiz` and
  `apps/admin`. Set `NEXT_PUBLIC_API_BASE_URL=https://api.miniquiz.club`.
- **Cluster-injected**: `PGUSER`, `PGPASSWORD`, `REDIS_PASSWORD`,
  `DATABASE_URL`, `REDIS_URL` — composed in
  `deploy/charts/api/templates/deployment.yaml` from the `miniquiz-pg-app`
  + `redis-auth` Secrets.

## Storage usage

**Cloudflare R2** (object storage, s3-compatible) — **1 bucket**:

| Bucket | Used for | Size |
|---|---|---|
| `miniquiz-tfstate` | OpenTofu state (`infra.tfstate`) — read+written by `infra/backend.tf` | ~18 KiB / 10 GiB free tier |

Cost: $0/mo (well below R2 free tier of 10 GiB storage + zero egress).
Future use: Postgres WAL backups will land here too — same free tier
covers it for the foreseeable future.

**DO Block Storage** (CSI-provisioned PVCs) — **2 volumes**, both
attached to the single worker node:

| PVC | Namespace | Mounted by | Size | Declared in |
|---|---|---|---|---|
| `miniquiz-pg-1` | `data` | CNPG Postgres pod | 30 GiB | `deploy/manifests/postgres-cluster.yaml` `spec.storage.size` |
| `redis-data-redis-master-0` | `data` | Bitnami Redis master | 5 GiB | `deploy/apps/redis.yaml` Helm values `master.persistence.size` |

StorageClass: `do-block-storage` (default, `Delete` reclaim,
`allowVolumeExpansion: true`). Volumes are real DigitalOcean Volumes
provisioned by `dobs.csi.digitalocean.com` and attached to whichever
Droplet the Pod schedules to. Cost: $0.10/GiB/mo flat.

To grow Postgres storage: bump `spec.storage.size` in
`deploy/manifests/postgres-cluster.yaml`, push. CNPG triggers an
online resize, no downtime.

To switch Postgres to a "delete by accident, restore by hand" reclaim
posture: change to `storageClass: do-block-storage-retain` in the
`Cluster` CR. Existing data is unaffected; the change applies to new
PVCs only.

## What's deliberately not here

- **No Postgres replica.** Single instance. PoC tradeoff.
- **No Postgres backups configured.** Add `backup.barmanObjectStore`
  on the CNPG `Cluster` to ship WAL to Cloudflare R2 (free tier 10 GB).
- **No Prometheus / Loki / Grafana.** Logs via `kubectl logs`.
- **No DO Load Balancer** ($12/mo saved). Cloudflare proxies → node IP
  → ingress-nginx running with `hostNetwork: true`.
- **No PgBouncer.** Prisma connects directly to CNPG's RW Service.
  Add when api hits >100 concurrent connections.
- **No queue / worker tier.** Auto-payouts run inline; see warning above.
- **No HPA on the api Deployment yet.** Single replica. HPA chart
  template exists but minReplicas=maxReplicas=1 effectively until SSE
  fan-out moves to Redis pub/sub.
