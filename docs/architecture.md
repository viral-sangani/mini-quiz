# Architecture

> Last updated: **2026-05-25** (DigitalOcean Load Balancer entrypoint).
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
│              DigitalOcean Load Balancer                        │
│                         ▼                                      │
│ ┌──────────────────────────────────────────────────────┐      │
│ │ DigitalOcean Kubernetes (DOKS, NYC3, 1-4 nodes)       │      │
│ │  ingress-nginx ───────────────► api / realtime Svc    │      │
│ │                                  ▲                    │      │
│ │  ┌─────────────┐                  │                   │      │
│ │  │ apps/api    │ ◄─ DATABASE_URL─┼─► PgBouncer       │      │
│ │  │ REST Fastify│ ◄─ REDIS_URL ───┼─► Redis hot scores│      │
│ │  │ Prisma      │ ◄─ NATS_URL ────┼─► NATS JetStream  │      │
│ │  └─────────────┘                  │                   │      │
│ │  realtime-gateway ─► SSE clients                       │      │
│ │  api-worker ───────► scheduler/finalizer               │      │
│ │  score-worker ─────► answer stream → hot scores        │      │
│ │  payout-worker ────► prize transfer commands           │      │
│ │  capacity-prewarmer ► HPA + DOKS node pool min         │      │
│ └──────────────────────────────────────────────────────┘      │
│                         │                                      │
│                  viem (CELO gas for prize transfers)           │
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
  - `rooms.ts` — player joins, answers, and leaderboard reads.
  - `room-events.ts` — SSE event stream, mounted by the realtime gateway and
    optionally by the web API for local/dev.
  - `quizzes.public.ts` — anonymous read-only quiz info.
  - `leaderboard.public.ts` — anonymous leaderboard read.
  - `profile.public.ts` — player profile + onboarding.
  - `quizzes.admin.ts` — full CRUD (admin JWT required).
  - `payouts.admin.ts` — payout ledger + retry on FAILED.
  - `users.admin.ts` — user list + flag/unflag.
  - `admin-stats.admin.ts` — dashboard KPIs.
  - `ai-gen.admin.ts` — admin-only AI topic suggestions + question generation.
- Services (`apps/api/src/services/`): business logic, called by routes.
- Runtime split:
  - `server.ts` starts REST/admin/player Fastify routes. In production it sets
    `ENABLE_EMBEDDED_SSE=false` so long-lived SSE is not held by web pods.
  - `realtime-gateway.ts` starts only health + `/rooms/:code/events` and owns
    SSE fanout for connected clients.
  - `worker.ts` starts the scheduler/finalizer. Legacy `APP_ROLE=worker`
    still combines scheduler + payout commands for local/dev.
  - `score-worker.ts` consumes accepted answer events from NATS JetStream and
    updates hot live leaderboard state.
  - `payout-worker.ts` consumes payout commands and signs/sends prize
    transfers.
  - `capacity-prewarmer.ts` runs as a once-per-minute CronJob. It watches paid
    live quizzes and raises HPA minimums plus the DOKS node pool minimum around
    active game windows, then returns to idle capacity.
  - `sse/broker.ts` keeps local SSE clients per pod, but broadcasts through
    NATS room event subjects first, with Redis pub/sub as fallback.
  - `live-score.service.ts` stores LIVE leaderboard rows in Redis Sorted Sets
    and hashes. Postgres remains the final source of truth.
  - `nats.ts` owns JetStream streams for room events, accepted answers, and
    payout event subjects.

### `apps/quiz` — MiniPay player

- Entry-point page is `/play/[code]` after the player joins via QR or
  deep link. Lobby → Question → Reveal → Leaderboard cycle.
- Talks to API via `NEXT_PUBLIC_API_BASE_URL`. SSE for live state.
- MiniPay-specific: `lib/minipay.ts` detects `window.ethereum.isMiniPay`
  and auto-connects the wallet (no connect button).

### `apps/admin` — admin console

- Desktop-first (mobile gate at <768px).
- NextAuth v5 Credentials provider, JWT-only sessions, no Prisma adapter.
  Password verification lives in the api (`/admin/auth/login`) against
  `AdminCredential` bcrypt hashes. The login endpoint rate-limits failed
  attempts by normalized email + requester IP using Redis when available,
  with an in-memory fallback for local/dev.
- All page data flows through the api over HTTPS (`adminApi` in
  `lib/admin-api.ts`). Admin app does not touch Postgres directly.
- Pages: `/overview`, `/quizzes`, `/quizzes/[id]/live`, `/daily`,
  `/practice`, `/players`, `/payouts`, `/payouts/[id]`.
- Quiz creation flows for live, daily, and practice can ask AI for topic
  suggestions, or use a manually typed topic, then generate editable
  multiple-choice questions via the API.
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
- LIVE quizzes have quorum controls: `minParticipants` and
  `lobbyOpenLeadMs`. A `SCHEDULED` quiz whose start time has passed remains
  joinable until `RoomPlayer` count reaches quorum.
- `Payout.status`: `PENDING | APPROVED | BROADCAST | CONFIRMED | FAILED`.
  Auto-payouts skip PENDING — they're created at APPROVED.
- `Quiz.prizeAmounts` is a `String[]` of human-readable USDT amounts;
  index `i` maps to leaderboard rank `i+1`.

## Request flows

### Player joins + plays

1. Player taps QR / deep link → `apps/quiz/play/[code]`.
2. Frontend `POST /rooms/:code/join` with display name + wallet.
3. Server creates `RoomPlayer` row, returns `roomPlayerId` + JWT.
4. Frontend opens SSE `/rooms/:code/events?token=...`; production ingress
   routes this path to the realtime gateway service.
5. Scheduler tick flips quiz to LIVE only after `scheduledStart` has passed
   and `playerCount >= minParticipants`. If quorum is missing, the quiz stays
   `SCHEDULED`, the lobby stays joinable, and SSE broadcasts `lobby_updated`.
   When quorum is reached, `quiz_started` moves clients to the question screen.
6. Each question: server broadcasts `question_started` with
   `endsAt` timestamp. Frontend counts down locally.
7. Player answers: `POST /rooms/:code/answer`. Server validates identity,
   timing, and idempotency, inserts `Answer`, then publishes an accepted-answer
   event to NATS. The score worker refreshes that player's Redis live score and
   broadcasts a capped `leaderboard` + `answer_distribution`. Local/dev without
   NATS falls back to the Phase 1 inline refresh.
8. Question time-up: server broadcasts `question_ended` with
   correct answer; client shows reveal.
9. Last question + buffer: scheduler tick flips quiz to ENDED →
   broadcasts `quiz_ended` → server enqueues auto-payouts.

### Admin creates + runs a quiz

1. Admin signs in via NextAuth Credentials; the api verifies the password.
2. `apps/admin` mints a backend JWT signed with `NEXTAUTH_SECRET`.
3. Optional: admin uses `POST /admin/ai/suggest-topics`, then
   `POST /admin/ai/generate-questions` to seed editable questions.
4. `POST /admin/quizzes` with body, including `prizeAmounts`.
5. Quiz lands at `DRAFT`. Admin transitions to `SCHEDULED` with
   `scheduledStart`.
6. Scheduler picks it up at the start time only if quorum is met; otherwise
   it waits in `SCHEDULED` until enough players join.
7. Admin can `POST /admin/quizzes/:id/end` to manually end early
   (also auto-payouts).
8. Admin live-monitor page consumes SSE for real-time KPIs +
   answer distribution.

### Live leaderboard payloads

`GET /rooms/:code/leaderboard` returns a capped leaderboard response:
`rows`, `totalPlayers`, `limit`, `partial`, and an optional `viewer` row when
`viewerUserId` is provided and the viewer is outside the returned top rows.
The default limit is 50 and the public max is 100. SSE `leaderboard` events
use the same capped `rows` plus `totalPlayers`, `limit`, and `partial`; they
do not include viewer-specific rows.

Player polling is now a fallback instead of the primary realtime path: after
the initial hydrate, the player app polls only when SSE is disconnected or no
data event has arrived for 10 seconds.

For LIVE games, leaderboard reads use Redis when the live score set is fully
seeded. If Redis is unavailable, incomplete, or the quiz is not LIVE, the API
falls back to the DB aggregation path.

### Auto-payout (LIVE → ENDED)

1. Scheduler tick sees `endedAt <= now` for a LIVE quiz.
2. Updates row to `ENDED`, broadcasts `quiz_ended`.
3. Calls `enqueueAutoPayouts(quizId)`:
   - Reads top-N from `leaderboard(quizId)` where N =
     `quiz.prizeAmounts.length`.
   - For each ranked player with `walletAddress != null`: creates
     `Payout` row at `APPROVED`, then the worker signs + sends the prize token
     transfer via viem. ERC-20 prize transfers omit `feeCurrency`, so gas is paid in CELO
     and exact USDT/USDC prize balances can be sent without the gas fee
     reducing that same token first.
   - On success: row → `CONFIRMED` with `txHash`.
   - On failure: row → `FAILED` with `failureReason`. Admin can
     retry via `POST /admin/payouts/:id/approve`.
4. Best-effort badge eval runs after.

The scheduler/finalizer runs in the single `api-worker` pod, while payout
transfer commands run in the single `api-payout-worker` pod. Admin manual
payout retries publish worker commands when Redis is available and fall back to
inline processing only for local/dev without Redis. Final standings are read
from Postgres-backed leaderboard aggregation after the quiz is `ENDED`; Redis
live scores are hot-path state, not payout truth.

## Environment variables

The full list lives in `apps/api/src/config.ts` (it's Zod-validated at
boot). Frontend env vars in each app's `next.config.mjs` and
`apps/{quiz,admin}/.env`. Production values are in:

- **DOKS**: SealedSecret `api-secrets` in the `api` namespace.
  Source-of-truth ciphertext in
  `deploy/manifests/sealed-secrets/api-secrets.yaml`. Plaintext in
  `.env` (gitignored). `DIGITALOCEAN_TOKEN` also lives here for the capacity
  prewarmer. To regenerate: see `runbooks.md`.
- **Vercel**: project Environment Variables panel for `apps/quiz` and
  `apps/admin`. Set `NEXT_PUBLIC_API_BASE_URL=https://api.miniquiz.club`.
- **Cluster-injected**: `PGUSER`, `PGPASSWORD`, `REDIS_PASSWORD`,
  `DATABASE_URL`, `REDIS_URL`, `NATS_URL` — composed in
  `deploy/charts/api/templates/deployment.yaml` from the `miniquiz-pg-app`
  + `redis-auth` Secrets and the in-cluster NATS service. Web, realtime, and
  worker pods use PgBouncer; migration and seed Jobs use the direct CNPG
  primary service.

## Storage usage

**Cloudflare R2** (object storage, s3-compatible) — **1 bucket**:

| Bucket | Used for | Size |
|---|---|---|
| `miniquiz-tfstate` | OpenTofu state (`infra.tfstate`) — read+written by `infra/backend.tf` | ~18 KiB / 10 GiB free tier |

Cost: $0/mo (well below R2 free tier of 10 GiB storage + zero egress).

**DO Block Storage** (CSI-provisioned PVCs) — **3 volumes**, attached to
cluster nodes as pods schedule:

| PVC | Namespace | Mounted by | Size | Declared in |
|---|---|---|---|---|
| `miniquiz-pg-1` | `data` | CNPG Postgres pod | 30 GiB | `deploy/manifests/postgres-cluster.yaml` `spec.storage.size` |
| `redis-data-redis-master-0` | `data` | Bitnami Redis master | 5 GiB | `deploy/apps/redis.yaml` Helm values `master.persistence.size` |
| `nats-js-nats-0` | `data` | NATS JetStream | 10 GiB | `deploy/apps/nats.yaml` Helm values `config.jetstream.fileStore.pvc.size` |

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
- **No Prometheus / Loki / Grafana.** Logs via `kubectl logs`.
- **One DO Load Balancer for ingress.** Cloudflare proxies to the stable
  Load Balancer IP, then Kubernetes routes to ingress-nginx.
- **No dedicated WebSocket gateway.** SSE stays the user-facing realtime
  transport until bidirectional client events are actually needed.
- **No queue-based write-behind for Postgres answers yet.** The API still
  writes the `Answer` row before publishing to NATS so Postgres remains the
  source of truth.
