# Scalability plan

> Last updated: **2026-05-22**.
> Scope: roadmap for 50k-100k DAUs and high-concurrency live games.
> Explicit exclusion: this document does **not** include Postgres backups to R2.

Mini Quiz is still optimized for a low-cost launch: two Vercel-hosted
frontends, Fastify web pods on DOKS, one worker pod, one Postgres primary, one
Redis master, and Cloudflare in front. Phase 1 removes the unsafe single-process
realtime/scheduler assumptions while keeping the stack compact.

## Current architecture snapshot

| Surface | Current state |
|---|---|
| Player app | Next.js on Vercel, talks to `https://api.miniquiz.club` |
| Admin app | Next.js on Vercel, API-only auth/data access |
| API | Fastify web pods on DOKS, HPA target 2-4 pods in Phase 1 |
| Worker | One API worker pod owns scheduler + payout background work |
| Realtime | Server-Sent Events with Redis pub/sub cross-pod fanout |
| Scheduler | 1s tick in the worker pod only |
| Database | Single CNPG Postgres primary behind a CNPG PgBouncer Pooler for app traffic |
| Cache/rate limit | Single Redis master; also carries live room pub/sub + hot scores |
| Ingress | Cloudflare to one DOKS node via ingress-nginx host networking |
| Autoscaling | HPA object exists; Phase 0 keeps max replicas at 1 |

## Known scaling limits

- **Always-on polling**: joined players previously polled quiz state,
  leaderboard, and payouts every 3 seconds. At tens of thousands of players,
  this alone can overwhelm the API.
- **Single Redis**: Redis is now on the hot path for realtime and live scores;
  Phase 2 should add stronger eventing/observability before major events.
- **Single worker**: scheduler correctness is safe, but worker saturation is
  still a single-pod bottleneck.
- **Answer ingest still hits Postgres**: every answer remains a DB write before
  Redis score refresh. Queue-based ingest is Phase 2.

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

- Create a dedicated realtime gateway tier for SSE or WebSocket connections.
- Use queue/stream-based answer ingest with backpressure and retry semantics.
- Broadcast small deltas instead of full state: top-row changes, viewer score,
  player counts, question transitions, payout status.
- Persist final standings to Postgres at quiz end and keep hot leaderboard state
  in Redis/NATS-backed live infrastructure during the game.
- Add production observability: event lag, SSE connection count, queue depth,
  Postgres latency, API error rate, payout latency, and pod saturation.
- Use scheduled pre-warm for promoted events, then downscale API/realtime/worker
  tiers independently after the event window.

## Operating defaults

- Keep SSE in Phase 1. Do not switch to WebSockets until there is a concrete
  bidirectional realtime requirement.
- Keep API HPA at 2-4 pods in Phase 1.
- Treat dedicated realtime gateways, answer queues, and worker autoscaling as
  Phase 2 work.
- Exclude Postgres backups to R2 from this plan per product direction.
