# Runbooks

> Last updated: **2026-05-22**.
> Update triggers: new procedure, change to existing one, command no
> longer works as written. Each runbook is meant to be runnable as-is.

> **Where credentials live**: `.local/credentials.env` (gitignored).
> Source it with `set -a; . .local/credentials.env; set +a`.

## Authenticate locally

```bash
# Source creds
set -a; . .local/credentials.env; set +a

# DO CLI
mkdir -p ~/Library/Application\ Support/doctl
cat > ~/Library/Application\ Support/doctl/config.yaml <<EOF
access-token: $DO_TOKEN
context: default
EOF

# Pull kubeconfig
doctl kubernetes cluster kubeconfig save miniquiz-prod
kubectl get nodes
```

## Deploy a code change to the api

99% of changes are: edit `apps/api/src/...` → push to `main` → wait.

1. Edit the code.
2. `git add . && git commit -m "..." && git push origin HEAD:main`
3. GitHub Actions builds + pushes the image, then bumps
   `deploy/charts/api/values.yaml`'s `image.tag` and commits.
4. Argo notices within ~30s, runs the PreSync migration Job, then
   rolls the api Deployment.

Watch:

```bash
gh run watch --repo celo-org/mini-quiz
# After workflow finishes:
git pull viral main --ff-only
kubectl -n api rollout status deploy/api
```

If something breaks: `docs/runbooks.md` → "Debug a failing Pod" below.

## Trigger a manual rebuild

```bash
gh workflow run api-image.yml --ref main --repo celo-org/mini-quiz
gh run watch --repo celo-org/mini-quiz
```

## Apply a Prisma schema change

```bash
# 1. Edit apps/api/prisma/schema.prisma

# 2. Generate migration locally against your dev DB
pnpm --filter @mini-quiz/api prisma migrate dev --name describe_change

# 3. Verify migration SQL — `apps/api/prisma/migrations/<ts>_<name>/migration.sql`

# 4. Commit + push
git add apps/api/prisma/ && git commit -m "feat: <change>" && git push origin HEAD:main

# 5. CI builds new image. Argo's PreSync hook auto-runs `prisma migrate deploy`
#    against the cluster Postgres. The api Pod won't roll until migrations succeed.

# 6. Verify in-cluster
kubectl -n data exec -it miniquiz-pg-1 -- psql -U miniquiz miniquiz -c '\dt'
```

**Never edit a migration SQL file after it's been applied.** If you
need to rollback, write a new migration that reverses the change.

## Generate / rotate a sealed secret

```bash
# 1. Pull cluster's sealing public key (one-time per cluster)
kubeseal --fetch-cert \
  --controller-namespace kube-system \
  --controller-name sealed-secrets \
  > /tmp/sealed-secrets.pub

# 2. Build plaintext Secret manifest. NEVER commit this file.
#    Example for api-secrets:
set -a; . .env; set +a       # load NEXTAUTH_SECRET etc. from local .env

cat > /tmp/api-secrets-plain.yaml <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: api-secrets
  namespace: api
type: Opaque
stringData:
  NEXTAUTH_SECRET: "$NEXTAUTH_SECRET"
  ADMIN_EMAILS: "$ADMIN_EMAILS"
  TREASURY_PRIVATE_KEY: "$TREASURY_PRIVATE_KEY"
  CELO_RPC_URL: "$CELO_RPC_URL"
  CORS_ORIGIN: "https://miniquiz.club,https://admin.miniquiz.club"
  LOG_LEVEL: "info"
EOF

# 3. Seal it
kubeseal --format yaml --cert /tmp/sealed-secrets.pub \
  < /tmp/api-secrets-plain.yaml \
  > deploy/manifests/sealed-secrets/api-secrets.yaml

# 4. Delete plaintext IMMEDIATELY
rm /tmp/api-secrets-plain.yaml

# 5. Commit + push
git add deploy/manifests/sealed-secrets/api-secrets.yaml
git commit -m "secrets: rotate api-secrets" && git push viral HEAD:main

# 6. Argo applies it; controller decrypts; api Pods get new env on next roll.
#    Force a roll:
kubectl -n api rollout restart deploy/api
```

For Redis or Postgres mirror secrets, same pattern with different
plaintext. Names + namespaces matter — SealedSecret encryption is
bound to namespace+name.

`REDIS_URL` is cluster-injected from the mirrored `redis-auth` Secret in
the api Deployment. Keep it set in production because admin login
rate-limits use Redis for cross-pod counters; local/dev falls back to
process memory.

## Admin login lockout

`POST /admin/auth/login` rate-limits failed attempts for 15 minutes:

- 5 failed attempts per normalized email locks that email.
- 20 failed attempts per requester IP blocks that IP window.
- Responses stay generic (`Invalid email or password`) so callers cannot
  distinguish unknown emails, wrong passwords, or lockout state.

To clear a production lockout for a known admin, delete the Redis keys by
hash from a Redis shell after confirming the request is legitimate:

```bash
EMAIL_HASH=$(printf '%s' 'admin@example.com' | shasum -a 256 | cut -c1-16)
kubectl -n data exec -it redis-master-0 -- redis-cli \
  -a "$REDIS_PASSWORD" DEL \
  "admin-login:email:$EMAIL_HASH" \
  "admin-login:lock:$EMAIL_HASH"
```

## Mirror the CNPG-generated postgres Secret into `api` namespace

CNPG creates `miniquiz-pg-app` in `data` namespace on first bootstrap.
The api Pod (in `api` namespace) needs the same credentials. Re-run
this if `Cluster` is recreated.

```bash
PG_USER=$(kubectl -n data get secret miniquiz-pg-app -o jsonpath='{.data.username}' | base64 -d)
PG_PW=$(kubectl -n data get secret miniquiz-pg-app -o jsonpath='{.data.password}' | base64 -d)

cat > /tmp/pg-app-api.yaml <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: miniquiz-pg-app
  namespace: api
type: Opaque
stringData:
  username: "$PG_USER"
  password: "$PG_PW"
EOF

kubeseal --format yaml --cert /tmp/sealed-secrets.pub \
  < /tmp/pg-app-api.yaml \
  > deploy/manifests/sealed-secrets/miniquiz-pg-app-api.yaml

rm /tmp/pg-app-api.yaml
git add deploy/manifests/sealed-secrets/miniquiz-pg-app-api.yaml
git commit -m "secrets: re-mirror postgres creds" && git push viral HEAD:main
```

## Apply Tofu changes

When you edit anything in `infra/`:

```bash
cd infra
set -a; . ../.local/credentials.env; set +a
export AWS_ACCESS_KEY_ID=$SPACES_ACCESS_ID
export AWS_SECRET_ACCESS_KEY=$SPACES_SECRET_KEY
export AWS_DEFAULT_REGION=us-east-1
export TF_VAR_do_token=$DO_TOKEN

tofu plan
tofu apply        # confirm only after reviewing the plan
```

State lives in `s3://miniquiz-tfstate/infra.tfstate` (DO Spaces).

## Bootstrap a new cluster from zero

If you destroyed everything and want it back:

```bash
cd infra
set -a; . ../.local/credentials.env; set +a
export AWS_ACCESS_KEY_ID=$SPACES_ACCESS_ID
export AWS_SECRET_ACCESS_KEY=$SPACES_SECRET_KEY
export AWS_DEFAULT_REGION=us-east-1
export TF_VAR_do_token=$DO_TOKEN

tofu init
tofu apply        # ~7-9 min: VPC + cluster + node + Argo CD bootstrap

doctl kubernetes cluster kubeconfig save miniquiz-prod
kubectl -n argocd get applications -w   # wait for Synced+Healthy

# Get new node IP and update Cloudflare DNS A-record (api.miniquiz.club)
kubectl get nodes -o wide
# Then: dashboard → DNS → edit api A-record → new IP → save (proxied)

# CNPG randomly generates miniquiz-pg-app password on bootstrap.
# Mirror it into the api namespace (see "Mirror the CNPG-generated
# postgres Secret" above), then push.

# Trigger first image build (or wait for the next code push)
gh workflow run api-image.yml --ref main --repo celo-org/mini-quiz

# Verify
curl https://api.miniquiz.club/health
```

## Debug a failing Pod

```bash
# Find the pod
kubectl get pods -A --no-headers | grep -E 'CrashLoopBackOff|Error|ImagePullBackOff'

# Logs
kubectl -n <ns> logs <pod> --tail=50
kubectl -n <ns> logs <pod> --previous     # if it just crashed

# Describe (for env / volume / scheduling errors)
kubectl -n <ns> describe pod <pod>

# Events in namespace
kubectl -n <ns> get events --sort-by='.lastTimestamp' | tail -20

# Exec into a running pod
kubectl -n <ns> exec -it <pod> -- /bin/sh
```

For api specifically, look for these failure modes (each has caused a
crash in the past — see `decisions.md` for the fixes):

- `Cannot find module '.prisma/client/default'` → Dockerfile didn't
  re-run `prisma generate` in runtime stage.
- `Named export 'Prisma' not found... CommonJS module` → some service
  added a direct `import { Prisma } from "@prisma/client"`. Switch
  to importing from `../db.js`.
- `Unknown file extension ".ts"` → `packages/shared/package.json`
  `main` reverted to `./src/index.ts` instead of `./dist/index.js`.
- `secret "..." not found` → SealedSecret missing in this namespace.
  Mirror it (see secrets sections).

## Force-resync a stuck Argo Application

```bash
# Hard refresh (re-fetches manifests + diffs)
kubectl -n argocd annotate application <app-name> argocd.argoproj.io/refresh=hard --overwrite

# If hard refresh doesn't help, restart the Argo repo-server (clears its cache)
kubectl -n argocd rollout restart deploy argocd-repo-server

# Manual sync via argocd CLI (gives more error visibility than the controller)
kubectl -n argocd port-forward svc/argocd-server 8080:80 &
ARGO_PW=$(kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d)
argocd login localhost:8080 --username admin --password "$ARGO_PW" --insecure --plaintext
argocd app sync <app-name> --force
```

## Automatic live-game capacity prewarming

The first DOKS scale-up can take a few minutes from a cold node pool. The
`api-capacity-prewarmer` CronJob runs every minute and warms capacity
automatically for paid live quizzes.

Policy:
- Idle default is one DOKS node minimum and one pod each for `api`,
  `api-realtime`, and `api-score-worker`.
- Warm mode starts 10 minutes before a paid live quiz starts.
- Warm mode stays active while the quiz is `LIVE`.
- Warm mode stays active until 10 minutes after the quiz ends.
- If a scheduled quiz misses quorum and stays `SCHEDULED`, warm mode ends at
  `scheduledStart + 10 minutes`.
- Scheduler and payout workers stay exactly one pod.

Warm mode patches:

```text
api                  minReplicas 2, maxReplicas 4
api-realtime         minReplicas 2, maxReplicas 8
api-score-worker     minReplicas 2, maxReplicas 8
DOKS node pool main  auto_scale true, min_nodes 2, max_nodes 4
```

Idle mode patches the same HPAs back to `minReplicas: 1` and the node pool
back to `min_nodes: 1,max_nodes: 4`.

Check the CronJob and latest decision:

```bash
kubectl -n api get cronjob api-capacity-prewarmer
kubectl -n api get jobs --sort-by=.metadata.creationTimestamp | tail
kubectl -n api logs job/<latest-capacity-prewarmer-job>
kubectl -n api get hpa api api-realtime api-score-worker
kubectl -n api get pods -l app.kubernetes.io/component=capacity-prewarmer
```

Run a local dry-run check without patching Kubernetes or DigitalOcean:

```bash
pnpm --filter @mini-quiz/api build
CAPACITY_PREWARMER_DRY_RUN=true \
DATABASE_URL="$DATABASE_URL" \
NATS_URL="$NATS_URL" \
pnpm --filter @mini-quiz/api start:capacity-prewarmer
```

For staging, set `capacityPrewarmer.dryRun=true` in the chart values before
syncing. Do not enable dry-run in production during a real campaign window
because it logs the intended changes without applying them.

The DigitalOcean node-pool patch requires `DIGITALOCEAN_TOKEN` in the
`api-secrets` SealedSecret. Do not commit the plaintext token. Add it to the
local unsealed source, reseal with `kubeseal`, and commit only the encrypted
SealedSecret. If the token is missing or the DigitalOcean API call fails, the
CronJob still patches the HPAs and logs the node-pool failure.

Safety checks:
- If the Postgres quiz lookup fails, the job fails before patching anything.
- If the desired decision is idle but NATS score-worker lag cannot be checked,
  the job keeps warm capacity instead of downscaling.
- HPA and node-pool patches are idempotent; already-correct resources are
  logged as no-ops.

OpenTofu still declares node pool `main` with `min_nodes = 1`. During live
games the runtime value may drift to `min_nodes = 2`. Avoid running
`tofu apply` during a game unless you intend to reset that runtime warmup.

**Current state**: Phase 2 uses NATS JetStream for room events and accepted
answers, a dedicated realtime gateway for SSE, score workers for async live
score refreshes, one scheduler/finalizer worker for quiz transitions, one
payout worker for prize transfers, Redis for hot live scores, PgBouncer for app
Postgres connections, and one capacity prewarmer CronJob. Keep
`deploy/api-worker` and `deploy/api-payout-worker` at exactly one replica.

## Phase 0 scalability checks

Metrics-server is deployed through Argo so Kubernetes resource metrics are
available:

```bash
kubectl top nodes
kubectl -n api top pods
kubectl -n data top pods
```

Run the lightweight Phase 0 load test against local or staging API targets.
Use a scheduled/live quiz code and tune users/concurrency per rehearsal:

```bash
PHASE0_BASE_URL=http://localhost:4000 \
PHASE0_CODE=<room-code> \
PHASE0_USERS=500 \
PHASE0_CONCURRENCY=50 \
pnpm loadtest:phase0
```

For promoted-game rehearsals, repeat with `PHASE0_USERS=2000` and then
`PHASE0_USERS=5000`. During Phase 1, run these with 2 api web pods and
1 worker pod before raising HPA max to 4.

## Phase 1 scalability checks

Verify ownership and connection routing after deploy:

```bash
kubectl -n data get pooler miniquiz-pg-pooler-rw
kubectl -n api get deploy api api-worker
kubectl -n api get hpa api
kubectl -n api logs deploy/api-worker --tail=50
```

Expected:
- `deploy/api` has 2-4 web replicas managed by HPA.
- `deploy/api-worker` has exactly 1 replica.
- web and worker pods use `miniquiz-pg-pooler-rw` in `DATABASE_URL`.
- migration and seed Jobs use `miniquiz-pg-rw` directly.

Redis checks:

```bash
kubectl -n data exec -it redis-master-0 -- redis-cli -a "$REDIS_PASSWORD" INFO clients
kubectl -n data exec -it redis-master-0 -- redis-cli -a "$REDIS_PASSWORD" INFO memory
kubectl -n data exec -it redis-master-0 -- redis-cli -a "$REDIS_PASSWORD" PUBSUB CHANNELS 'room:*:events'
kubectl -n data exec -it redis-master-0 -- redis-cli -a "$REDIS_PASSWORD" LLEN worker:commands
```

Rollback to single-pod web mode:

```bash
# Edit deploy/charts/api/values.yaml:
# hpa.minReplicas: 1
# hpa.maxReplicas: 1
# worker.enabled: true
git add deploy/charts/api/values.yaml
git commit -m "rollback: pin api hpa to one pod"
git push viral HEAD:main
kubectl -n api rollout status deploy/api
kubectl -n api rollout status deploy/api-worker
```

## Phase 2 event-readiness checks

Verify the event spine and runtime split after deploy:

```bash
kubectl -n data get statefulset nats
kubectl -n data exec deploy/nats-box -- nats stream ls
kubectl -n data exec deploy/nats-box -- nats consumer info ROOM_ANSWERS score-workers
kubectl -n api get deploy api api-realtime api-score-worker api-worker api-payout-worker
kubectl -n api get hpa api api-realtime api-score-worker
kubectl -n api logs deploy/api-realtime --tail=50
kubectl -n api logs deploy/api-score-worker --tail=50
```

Expected:
- `deploy/api` serves REST/admin/player HTTP routes.
- `deploy/api-realtime` owns `/rooms/:code/events` SSE traffic.
- `deploy/api-score-worker` has 2-8 replicas managed by HPA.
- `deploy/api-worker` has exactly 1 replica and owns scheduler/finalizer work.
- `deploy/api-payout-worker` has exactly 1 replica and owns prize transfer commands.
- NATS streams `ROOM_EVENTS`, `ROOM_ANSWERS`, and `PAYOUT_EVENTS` exist.
- `ROOM_ANSWERS` consumer `score-workers` has low pending/ack lag during tests.

Cross-pod smoke test:

```bash
# Open one SSE connection through the public URL, then submit an answer through
# the API. The SSE stream should receive leaderboard/answer_distribution without
# hitting the REST API pod that accepted the answer.
curl -N https://api.miniquiz.club/rooms/<code>/events
```

Phase 2 load-gate runner:

```bash
PHASE2_BASE_URL=https://api.miniquiz.club \
PHASE2_CODE=<room-code> \
PHASE2_USERS=10000 \
PHASE2_CONCURRENCY=250 \
pnpm loadtest:phase2
```

Repeat with `PHASE2_USERS=25000`, `50000`, and `100000` only after the
previous gate is stable and the realtime/score-worker HPAs are pre-warmed.

Rollback to Phase 1-style embedded SSE:

```bash
# Edit deploy/charts/api/values.yaml:
# realtime.enabled: false
# scoreWorker.enabled: false
# embeddedSse: true
# hpa.minReplicas: 1
# hpa.maxReplicas: 1
git add deploy/charts/api
git commit -m "rollback: disable phase two realtime split"
git push viral HEAD:main
kubectl -n api rollout status deploy/api
kubectl -n api rollout status deploy/api-worker
```

## Restart the api without redeploying

```bash
kubectl -n api rollout restart deploy/api
kubectl -n api rollout status deploy/api
```

## Tail logs for an active game

```bash
# Live api logs
kubectl -n api logs deploy/api -f --tail=20

# Postgres slow queries / errors
kubectl -n data logs miniquiz-pg-1 -f --tail=20

# Redis (if you suspect connection issues)
kubectl -n data logs redis-master-0 -f --tail=20
```

## Roll back the api to a previous image

```bash
# Find a known-good tag
git log --oneline deploy/charts/api/values.yaml | head -10

# Edit values.yaml back to that tag, push
sed -i '' 's|tag: ".*"|tag: "<known-good-12char-sha>"|' deploy/charts/api/values.yaml
git add deploy/charts/api/values.yaml
git commit -m "rollback: api to <sha>"
git push viral HEAD:main

# Argo rolls within ~30s
kubectl -n api rollout status deploy/api
```

## Destroy the entire cluster

```bash
cd infra
set -a; . ../.local/credentials.env; set +a
export AWS_ACCESS_KEY_ID=$SPACES_ACCESS_ID
export AWS_SECRET_ACCESS_KEY=$SPACES_SECRET_KEY
export AWS_DEFAULT_REGION=us-east-1
export TF_VAR_do_token=$DO_TOKEN

tofu destroy
# Confirms before deleting. ~5 min.
```

The Spaces state bucket survives `tofu destroy`. Delete from DO
dashboard manually if you want a true blank slate.

**Postgres data is GONE** when the cluster is destroyed (no backups
configured). For real backups: see `architecture.md` ("What's
deliberately not here") + add the CNPG `backup.barmanObjectStore`
block.

## Open the Argo CD UI

```bash
ARGO_PW=$(kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d)
echo "admin password: $ARGO_PW"
kubectl -n argocd port-forward svc/argocd-server 8080:80
# Browse http://localhost:8080
```
