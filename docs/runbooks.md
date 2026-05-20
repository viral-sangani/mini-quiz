# Runbooks

> Last updated: **2026-05-20**.
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
2. `git add . && git commit -m "..." && git push viral HEAD:main`
3. (Optional) `git push origin HEAD:main` to mirror to celo-org repo.
4. GitHub Actions builds + pushes the image, then bumps
   `deploy/charts/api/values.yaml`'s `image.tag` and commits.
5. Argo notices within ~30s, runs the PreSync migration Job, then
   rolls the api Deployment.

Watch:

```bash
gh run watch --repo viral-sangani/mini-quiz
# After workflow finishes:
git pull viral main --ff-only
kubectl -n api rollout status deploy/api
```

If something breaks: `docs/runbooks.md` → "Debug a failing Pod" below.

## Trigger a manual rebuild

```bash
gh workflow run api-image.yml --ref main --repo viral-sangani/mini-quiz
gh run watch --repo viral-sangani/mini-quiz
```

## Apply a Prisma schema change

```bash
# 1. Edit apps/api/prisma/schema.prisma

# 2. Generate migration locally against your dev DB
pnpm --filter @mini-quiz/api prisma migrate dev --name describe_change

# 3. Verify migration SQL — `apps/api/prisma/migrations/<ts>_<name>/migration.sql`

# 4. Commit + push
git add apps/api/prisma/ && git commit -m "feat: <change>" && git push viral HEAD:main

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
gh workflow run api-image.yml --ref main --repo viral-sangani/mini-quiz

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

## Pre-warm the api before a scheduled game

The first scale-up takes ~3–5 min from cluster autoscaler cold-start.
Don't wait until traffic arrives:

```bash
# 30 min before the scheduled game
kubectl -n api scale deployment/api --replicas=4
kubectl -n api get pods -w     # confirm 4 ready

# Right after the game (or 15 min after if testing)
kubectl -n api scale deployment/api --replicas=1
```

**Caveat (current state)**: SSE fan-out is in-process. Multiple api
replicas will only help with HTTP throughput, not SSE concurrency
across pods. Until SSE moves to Redis pub/sub (see `decisions.md`),
keep replicas=1 during a game; scale up only for the lobby/onboarding
HTTP burst.

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
