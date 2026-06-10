# Scalability plan

> Last updated: **2026-06-10**.
> Scope: roadmap for 50k-100k DAUs and high-concurrency live games.
> Explicit exclusion: this document does **not** include Postgres backups to R2.

Mini Quiz is still cost-aware, but Phase 2 introduces the event-ready shape:
REST API pods, a dedicated realtime gateway, score workers, one scheduler/
finalizer worker, one Postgres primary, Redis hot scores, NATS JetStream, and
Cloudflare in front. The target is 100k-ready architecture shipped through
10k, 25k, 50k, and 100k rehearsal gates.

## Current architecture snapshot

| Surface | Current state |
|---|---|
| Player app | Next.js on Vercel, talks to `https://api.miniquiz.club` |
| Admin app | Next.js on Vercel, API-only auth/data access |
| API | Fastify web pods on DOKS, HPA target 2-4 pods |
| Worker | One scheduler/finalizer pod, one conservative payout worker pod |
| Realtime | Dedicated SSE gateway pods on DOKS |
| Event spine | NATS JetStream stores room events, accepted answers, and payout event subjects |
| Scheduler | 1s tick in the worker pod only |
| Database | Single CNPG Postgres primary behind a CNPG PgBouncer Pooler for app traffic; Prisma schema carries query-shaped composite indexes for current hot paths |
| Cache/rate limit | Single Redis master; rate limits, worker-command fallback, and hot live scores |
| Ingress | Cloudflare to one DOKS node via ingress-nginx host networking |
| Autoscaling | API, realtime, and score-worker HPAs scale independently; scheduler worker stays 1 |

## Known scaling limits

- **Always-on polling**: joined players previously polled quiz state,
  leaderboard, and payouts every 3 seconds. At tens of thousands of players,
  this alone can overwhelm the API.
- **Single Redis**: Redis remains on the hot leaderboard path. It is no longer
  the durable event spine, but it can still bottleneck score reads at major
  event scale.
- **Single scheduler/finalizer**: correctness is safe, but timer transitions
  are still owned by one pod until leader election exists.
- **Answer ingest still writes Postgres inline**: the API now publishes accepted
  answers to JetStream for async scoring, but still writes `Answer` before
  queue publish so DB remains the source of truth.
- **Postgres is indexed, not partitioned**: current scale posture is composite
  indexing around the hot query shapes. Partitioning `Answer`/`Payout` remains a
  later step once production row counts or write amplification justify the
  operational cost.
- **Observability is still basic**: metrics-server exists, but production event
  lag, consumer lag, and SSE connection dashboards are still follow-up work.

## Phase 0: stabilize the current architecture

Goal: reduce waste and remove the biggest bottlenecks while keeping the current
single-API process model.

- Replace always-on player polling with stale-only fallback polling: one initial
  hydrate after join, then fallback only when SSE is disconnected or has no data
  event for 10 seconds.
- Cap public live leaderboard responses and SSE broadcasts to top rows. Default
  to top 50, cap client-provided `limit` at 100, and expose a viewer-specific row
  only through the HTTP endpoint.
- Compute live leaderboard rows with DB-side aggregation instead of loading all
  players and all answers into Node.js.
- Stop broadcasting per-answer `answer_submitted` events to every client. Keep
  aggregate `answer_distribution` and capped `leaderboard` events.
- Add metrics-server through Argo so HPA and `kubectl top` have metrics, but
  keep API HPA `maxReplicas=1` until Phase 1.
- Add a lightweight load-test runner for join, SSE connection, answer submit,
  and leaderboard fallback checks.

### Phase 0 acceptance gates

| Scenario | Target |
|---|---|
| 500 simulated players | No 5xx spike, p95 answer submit under 500ms locally or in staging |
| 2k simulated players | SSE connections stay open, fallback polling remains sparse |
| 5k simulated players | API and Postgres remain stable enough for a rehearsal, or bottlenecks are measured clearly |
| Leaderboard response | Default 50 rows, max 100 rows, `partial=true` when more players exist |
| HPA metrics | `kubectl top nodes` and `kubectl top pods` work after metrics-server syncs |

## Phase 1: distributed realtime and safe API scale

Goal: allow multiple API pods without losing scheduler correctness or realtime
fanout.

- Move live event fanout from process memory to Redis pub/sub.
- Split scheduler and payout work from stateless REST API pods into one worker.
- Add a CNPG PgBouncer Pooler between Prisma and Postgres for app traffic.
- Use Redis Sorted Sets + hashes for hot LIVE leaderboard reads.
- Enable API HPA at 2-4 pods after Redis fanout, worker split, and PgBouncer
  are deployed.
- Keep worker replicas at 1 until Phase 2 queue/worker autoscaling work.

## Phase 2: major live-event architecture

Goal: support 50k-100k concurrent live players during promoted events.

- Dedicated realtime gateway tier now owns `/rooms/:code/events`; production
  web API pods set `ENABLE_EMBEDDED_SSE=false`.
- NATS JetStream is the durable event spine with subjects:
  `room.{quizId}.events`, `room.{quizId}.answers`,
  `room.{quizId}.scores`, `payout.commands`, and `payout.events`.
- Live answer submit validates and writes the `Answer` row, then publishes an
  accepted-answer event. Score workers consume durable answer events, refresh
  Redis hot scores, and broadcast capped leaderboard/distribution updates.
- API, realtime gateway, and score workers have separate HPAs. Scheduler/
  finalizer and payout workers remain conservative single-owner background work.
- Ingress routes `/rooms/{code}/events` to realtime gateway pods and all other
  API traffic to REST API pods.
- Final payout standings continue to use Postgres-backed aggregation after the
  quiz is `ENDED`; Redis is never payout truth.
- Remaining Phase 2 work: production dashboards/alerts for event lag,
  JetStream consumer lag, SSE connection count, DB latency, Redis pressure, and
  payout latency; plus 10k/25k/50k/100k rehearsal gates.

## Operating defaults

- Keep SSE. Do not switch to WebSockets until there is a concrete
  bidirectional realtime requirement.
- Keep REST API HPA at 2-4 pods until load tests justify higher limits.
- Keep scheduler/finalizer and payout workers at one replica. Scale score
  workers, realtime gateways, and REST API pods independently around live
  windows.
- Exclude Postgres backups to R2 from this plan per product direction.
