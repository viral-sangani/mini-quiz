# Deployment

> Last updated: **2026-05-25** (automatic live-game capacity prewarmer).
> Update triggers: cluster topology change, region change, new infra
> resource, image registry move, CI workflow change.

## What runs where

| Surface | Where | Why |
|---|---|---|
| `apps/quiz` (Next.js) | Vercel project `mini-quiz`, root `apps/quiz` | Edge + free preview deploys. Pure FE, no DB access. |
| `apps/admin` (Next.js) | Vercel project `mini-quiz-admin`, root `apps/admin` | Same. Auth via ADMIN_EMAILS allowlist (no DB on Vercel). |
| `apps/api` (Fastify) | DOKS | REST API pods, realtime gateway pods, score workers, one scheduler worker, one payout worker, and a capacity prewarmer CronJob |
| Postgres (CNPG) | In-cluster (DOKS) | ~$50/mo cheaper than DO Managed at PoC scale |
| Redis (Bitnami) | In-cluster (DOKS) | Same |
| NATS JetStream | In-cluster (DOKS) | Durable live-event spine for Phase 2 |
| Image registry | Docker Hub `viralsangani/miniquiz-api` (public) | celo-org GHCR is blocked pending PAT approval |
| Argo source repo | `celo-org/mini-quiz` | Argo reads this private repo with a fine-grained read-only token |
| TLS | Cloudflare edge + Let's Encrypt origin (HTTP-01) | Free + DDoS absorption |
| DNS | Cloudflare proxied (orange cloud) | Free + fast |
| Tofu state | Cloudflare R2 `s3://miniquiz-tfstate/infra.tfstate` | Free tier ($0/mo), s3-compatible |

## Cluster facts

| | |
|---|---|
| Cluster name | `miniquiz-prod` |
| Region | `nyc3` |
| K8s version | `1.34.5-do.5` (auto-upgrade Sundays 04:00 UTC) |
| Node pool | `main`, autoscale `1-4`, size `s-4vcpu-8gb` ($48/mo each) |
| Node public IP (current) | `142.93.184.188` |
| Control plane | Single-AZ (free) |

The node IP is stable as long as the node isn't replaced. If the
autoscaler removes + recreates the node (e.g., during scale-down), the
IP changes - **Cloudflare DNS A-record needs updating**. Long-term fix:
add a DO Load Balancer (+$12/mo) or use Cloudflare Tunnel.

Default production shape is intentionally cheap: one node minimum and one pod
each for the scalable services (`api`, `api-realtime`, `api-score-worker`).
The scheduler and payout workers always stay at one pod. The
`api-capacity-prewarmer` CronJob raises HPA minimums and the DOKS node pool
minimum around paid live quizzes, then returns both to idle after the warm
window.

## Two-layer ownership model

```
┌────────────────────────────────────────┐
│ Day-0 — OpenTofu (infra/)              │
│  • DOKS cluster + node pool            │
│  • VPC + firewall                      │
│  • Argo CD bootstrap (helm_release)    │
│  • app-of-apps Application manifest    │
└────────────────────────────────────────┘
                  │
                  ▼  hands off to
┌────────────────────────────────────────┐
│ Day-1+ — Argo CD (deploy/)             │
│  • sealed-secrets controller           │
│  • cert-manager + Let's Encrypt issuer │
│  • ingress-nginx (hostNetwork)         │
│  • CNPG operator + Postgres Cluster CR │
│  • Bitnami Redis + NATS JetStream      │
│  • api Helm chart + REST/realtime/workers/HPA/prewarmer │
│  • migration Job (PreSync hook)        │
└────────────────────────────────────────┘
```

**Tofu does NOT manage app workloads.** Adding a new in-cluster
component goes in `deploy/`, not `infra/`.

## Repo layout for ops

```
infra/
├── main.tf                  # provider config (DO + helm + k8s + kubectl)
├── variables.tf             # do_token, repo URL, node sizing
├── cluster.tf               # DOKS cluster + node pool
├── network.tf               # VPC, firewall (allow 80/443)
├── argocd-bootstrap.tf      # Argo CD helm_release + app-of-apps
├── argocd-values.yaml       # Argo CD chart values
├── app-of-apps.yaml.tpl     # template for the root Application
├── backend.tf               # s3-style backend → Cloudflare R2
└── terraform.tfvars         # GITIGNORED — contains DO_TOKEN

deploy/
├── argocd-app-of-apps.yaml  # reference copy
├── apps/                    # Argo Application per workload (sync waves 0-4)
├── charts/api/              # in-house Helm chart for the Fastify api
│   ├── Chart.yaml
│   ├── values.yaml          # image.tag bumped by CI
│   └── templates/
│       ├── deployment.yaml
│       ├── service.yaml
│       ├── ingress.yaml
│       ├── hpa.yaml
│       ├── phase2-hpas.yaml
│       ├── capacity-prewarmer-cronjob.yaml
│       └── migration-job.yaml  # PreSync hook
└── manifests/
    ├── postgres-cluster.yaml         # CNPG Cluster CR
    ├── cert-manager-issuer.yaml      # ClusterIssuer
    └── sealed-secrets/               # encrypted Secret YAMLs
        ├── api-secrets.yaml
        ├── redis-auth.yaml          # for data namespace
        ├── redis-auth-api.yaml      # for api namespace
        └── miniquiz-pg-app-api.yaml # mirror of CNPG-generated secret
```

## Argo Applications + sync waves

| Wave | Application | What it deploys |
|---|---|---|
| 0 | `sealed-secrets` | Bitnami Sealed Secrets controller |
| 0 | `sealed-secret-payloads` | The encrypted Secret YAMLs from `deploy/manifests/sealed-secrets/` |
| 1 | `cert-manager` | cert-manager + Let's Encrypt ClusterIssuer |
| 1 | `ingress-nginx` | ingress-nginx (DaemonSet, hostNetwork) |
| 1 | `metrics-server` | Kubernetes resource metrics for `kubectl top` + HPA |
| 2 | `cnpg-operator` | CloudNativePG operator |
| 3 | `postgres-cluster` | CNPG `Cluster` CR + PgBouncer Pooler |
| 3 | `redis` | Bitnami legacy Redis 8.2.1 (standalone, AOF on) |
| 3 | `nats` | NATS JetStream with a 10 GiB file-store PVC |
| 4 | `api` | Fastify web, realtime gateway, scheduler worker, score worker, payout worker, capacity prewarmer, migration/seed hooks |

## API capacity profile

Idle defaults in `deploy/charts/api/values.yaml`:

| Component | Idle pods | Warm pods | Max pods |
|---|---:|---:|---:|
| `api` | 1 | 2 | 4 |
| `api-realtime` | 1 | 2 | 8 |
| `api-score-worker` | 1 | 2 | 8 |
| `api-worker` | 1 | 1 | 1 |
| `api-payout-worker` | 1 | 1 | 1 |

The capacity prewarmer runs once per minute. For paid live quizzes it warms
capacity from 10 minutes before scheduled start, keeps it warm while live, and
returns to idle 10 minutes after the quiz ends. If a scheduled quiz misses
quorum and stays `SCHEDULED`, warm capacity is kept only until
`scheduledStart + 10 minutes`.

Warm mode patches:

- HPA minimums for `api`, `api-realtime`, and `api-score-worker` from `1` to
  `2`.
- DOKS node pool `main` autoscale settings from `min_nodes=1,max_nodes=4` to
  `min_nodes=2,max_nodes=4`.

Idle mode patches the same resources back to `min_nodes=1` and HPA
`minReplicas=1`. Scheduler and payout workers are never scaled by the
prewarmer.

OpenTofu still declares the node pool default as `min_nodes = 1`. Runtime
prewarming may temporarily drift the node pool minimum to `2`; avoid running
`tofu apply` during a live game unless you intend to reset that runtime value.

`sealed-secret-payloads` is in the same wave as `sealed-secrets` because
the encrypted YAMLs reference the controller namespace; the controller
must be running to decrypt them, but Argo retries until it succeeds.

## Vercel projects

Two projects, both under team `viral-sanganis-projects-d6d25698`. Both
deploy from the **repo root** (CLI run from `mini-quiz/`); each project
has `rootDirectory` set so Vercel scopes the build to its subdir.

| Project | Root | Production URL | Custom domain |
|---|---|---|---|
| `mini-quiz` | `apps/quiz` | `mini-quiz-ph.vercel.app` | `miniquiz.club`, `www.miniquiz.club` |
| `mini-quiz-admin` | `apps/admin` | `mini-quiz-admin.vercel.app` | `admin.miniquiz.club` |

### Env vars (set per project, production target)

`mini-quiz` (quiz):
- `NEXT_PUBLIC_API_BASE_URL=https://api.miniquiz.club`

`mini-quiz-admin`:
- `NEXT_PUBLIC_API_BASE_URL=https://api.miniquiz.club`
- `NEXT_PUBLIC_QUIZ_BASE_URL=https://miniquiz.club`
- `NEXTAUTH_URL=https://admin.miniquiz.club`
- `NEXTAUTH_SECRET` — same string the api Pod uses (must match for JWT verification)
- `ADMIN_EMAILS` — comma-separated, lowercased; same set the api Pod uses
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `EMAIL_FROM` (Nodemailer email magic-link disabled until `EMAIL_SERVER` is set)

### To deploy a Vercel app from the CLI

```bash
# From the repo root, link to the right project, then deploy:
echo '{"projectId":"prj_RqikSLgHIAcUb9DvCvrPMetcBpK4","orgId":"team_H2565VzmcSsgDCQ6jzUSbo8x","projectName":"mini-quiz"}' > .vercel/project.json
vercel --prod --yes      # quiz

# To switch to admin:
echo '{"projectId":"prj_Tq79B9zywjLVjdVeS1AUnk4YiUX5","orgId":"team_H2565VzmcSsgDCQ6jzUSbo8x","projectName":"mini-quiz-admin"}' > .vercel/project.json
vercel --prod --yes      # admin
```

`.vercel/` is gitignored. API deploys now come from `celo-org/mini-quiz`.
The player/admin Vercel projects may still be connected to the Viral mirror
until the Celo-owned Vercel setup is ready.

## CI: image build

`.github/workflows/api-image.yml`:

- Triggers on push to `main` with paths `apps/api/**` or `packages/shared/**`.
- Builds `apps/api/Dockerfile` with `linux/amd64` (DOKS nodes are amd64).
- Pushes `docker.io/viralsangani/miniquiz-api:<sha12>` and `:latest`.
- Subsequent job sed-bumps `deploy/charts/api/values.yaml` `image.tag`,
  commits with `github-actions[bot]`, pushes to `main`.
- Argo notices the tag bump within ~30s and rolls the api Deployment.
  PreSync hook runs Prisma migrations first.

Required GitHub Actions secrets on the `celo-org/mini-quiz` repo:

- `DOCKERHUB_USERNAME` — `viralsangani`
- `DOCKERHUB_TOKEN` — `dckr_pat_...` (Read+Write)

The default `GITHUB_TOKEN` covers the `git push` step (it has `contents:
write` from the workflow's `permissions:` block).

The workflow is guarded with `github.repository == 'celo-org/mini-quiz'` so
the Viral mirror cannot accidentally build and bump the API chart after this
change lands there.

## Secrets pipeline

Two layers:

1. **Bootstrap secrets** (one-time per cluster):
   - DO API token + Cloudflare R2 access key/secret → in
     `.local/credentials.env` (gitignored)
   - Read by Tofu via `TF_VAR_do_token` (DO API) and `AWS_ACCESS_KEY_ID`
     / `AWS_SECRET_ACCESS_KEY` env vars (R2 backend)

2. **Runtime secrets** (sealed at rest in git):
   - `api-secrets` (api ns): `NEXTAUTH_SECRET`, `ADMIN_EMAILS`,
     `TREASURY_PRIVATE_KEY`, `CELO_RPC_URL`, `CORS_ORIGIN`, `LOG_LEVEL`
   - `redis-auth` (data ns + api ns mirror): `password`
   - `miniquiz-pg-app` (api ns mirror): `username`, `password`
     (CNPG generates the original in `data` ns)

To rotate or add a secret: see `runbooks.md` ("Generate / rotate a
sealed secret").

## Known gotchas

1. **SealedSecrets are namespace-bound.** A Secret encrypted for
   namespace `A` can't decrypt in namespace `B`. We mirror `redis-auth`
   and `miniquiz-pg-app` into the `api` namespace via separate sealed
   files. Annoying, but the trade-off for Sealed Secrets being
   simpler than ESO + Vault.

2. **CNPG-generated Secret can't be re-sealed reproducibly.** The
   password CNPG sets on first bootstrap is random. We fetch it once
   after first deploy, seal it into the `api` namespace, and commit.
   If CNPG ever regenerates it (e.g., `Cluster` recreated from
   scratch), the api will fail to connect — re-run the seal step.

3. **Cloudflare orange cloud + cert-manager HTTP-01.** First cert
   issuance worked in our case, but if it fails: temporarily flip the
   DNS record to grey cloud (DNS only), let cert issue, flip back to
   orange. Or switch to DNS-01 with a Cloudflare API token (better
   long-term).

4. **`pnpm deploy --prod` doesn't include the Prisma generated
   client.** It lives in pnpm's `.pnpm` virtual store outside the
   package boundary. We re-run `prisma generate` in the runtime stage
   of the Dockerfile. Don't remove that line.

5. **`@prisma/client` is CJS.** ESM `import { Prisma }` from it fails
   at runtime in Node 20 ESM. Always go through
   `apps/api/src/db.ts`'s re-export.

## Cost (reality, not budget)

| Line | $/mo |
|---|---|
| 1× `s-4vcpu-8gb` node | $48.00 |
| Block storage (~35 GiB) | ~$3.50 |
| **Total** | **~$51.50/mo** |

Free: Cloudflare DNS+proxy+TLS, Cloudflare R2 (Tofu state, ~18 KiB out
of 10 GiB free tier), Docker Hub, Let's Encrypt, GitHub Actions
(public repo).

## Out of scope (do not add without asking)

- HA control plane (+$40/mo)
- Postgres replica + dedicated node pool (+$300/mo)
- Postgres backups to R2 (low cost, but PoC accepted no-backup risk)
- Prometheus / Loki / Grafana
- DO Load Balancer
- Snapshots
- REST API HPA above 4 replicas before Phase 2 load gates are rehearsed
- Realtime or score-worker HPA above 8 replicas before load gates are rehearsed
- Bandwidth-paid CDN (Cloudflare free is enough)
