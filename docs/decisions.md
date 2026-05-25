# Decisions

> Last updated: **2026-05-07** (Vercel projects + admin auth allowlist).
> Append-only log of non-obvious choices. Add a new entry when you make
> a structural decision that a future agent (or human) would reasonably
> question. Don't rewrite history; if a decision is overturned, add a
> new entry that supersedes the old one.

Format: `### NN. <Title> [SUPERSEDED-BY: NN]`. Then *Context*, *Decision*,
*Why*, *Alternatives considered*, *Consequences*.

---

### 1. Use OpenTofu + Argo CD over a single tool

**Context**: We needed reproducible infra for a payments-handling
launch on a shoestring budget.

**Decision**: Two-layer model. **OpenTofu** owns Day-0 (the cluster +
its host cloud resources). **Argo CD** owns Day-1+ (everything inside
the cluster). Tofu installs Argo via a single `helm_release`, then
gets out of the way.

**Why**: Mixing in-cluster Helm releases into Tofu state is a known
footgun — Tofu's `helm_release` provider stalls when the cluster API
is briefly unreachable, blocking even Day-0 changes. Separating
concerns lets `tofu apply` finish in seconds for cluster-only edits.

**Alternatives considered**: Pure Tofu (rejected, see above).
Crossplane (overkill for a single cluster). Pulumi (smaller DO
ecosystem). Flux (smaller community + no UI).

**Consequences**: Two repos of config (`infra/`, `deploy/`). Argo
boots itself from Tofu, then the rest of the cluster is GitOps-
managed via the `deploy/` repo. To recover from disaster: `tofu apply`
brings back the cluster + Argo, then Argo reconciles everything.

---

### 2. In-cluster Postgres + Redis (CNPG, Bitnami)

**Context**: User explicitly chose in-cluster over DO Managed.

**Decision**: CNPG operator for Postgres (1 instance, 30 GiB PVC, no
backup, no replica). Bitnami Redis chart, standalone, AOF on, no
Sentinel.

**Why**: PoC budget is ~$56/mo. DO Managed Postgres adds $30/mo
minimum + Redis another $30/mo. CNPG is the most production-grade
Postgres operator (commercial backing from EDB). Bitnami Redis is
battle-tested.

**Alternatives considered**: DO Managed Postgres + Redis (cost),
single-Pod Postgres from a basic chart (no backup/HA story at all),
Crunchy operator (similar to CNPG but heavier).

**Consequences**: We own backups + version upgrades + failover. For
launch we accept the no-backup risk explicitly (see
`architecture.md` "What's deliberately not here"). When the launch
goes well, add `backup.barmanObjectStore` pointing at Cloudflare R2
(free up to 10 GB).

---

### 3. Bitnami Redis from `bitnamilegacy/redis`, not `bitnami/redis`

**Context**: First deploy crashed: `docker.io/bitnami/redis:7.4.2-debian-12-r0`
returned 404.

**Decision**: Use `image.repository: bitnamilegacy/redis` with
`tag: 8.2.1-debian-12-r0` and the chart override
`global.security.allowInsecureImages: true`.

**Why**: Bitnami pulled their main public Docker Hub repos in late
2024 due to a license/IP dispute. The mirror at `bitnamilegacy/*` is
still public + free.

**Alternatives considered**: Switch to `redis:7-alpine` from the
official Redis image (would require rewriting half the Bitnami chart
since it expects bitnami-style image structure). Stand up a private
mirror.

**Consequences**: We're depending on a non-canonical mirror. If
`bitnamilegacy` ever goes away, we'll need to either pin the digest
(possible today) or migrate the chart. Not urgent.

---

### 4. Cloudflare in front, no DO Load Balancer

**Context**: User asked if we can avoid the $12/mo DO Load Balancer.

**Decision**: ingress-nginx runs as a DaemonSet with `hostNetwork: true`
on port 80/443. Cloudflare A-record points (proxied) at the worker
node's public IP.

**Why**: Saves $12/mo. Cloudflare adds DDoS protection + free TLS at
the edge for free. Single-node cluster doesn't need an LB anyway.

**Alternatives considered**: DO Load Balancer ($12/mo, stable IP,
auto-failover when adding nodes). Cloudflare Tunnel (no exposed IP at
all, but more setup).

**Consequences**:
- Node IP is the public attack surface. Cloudflare proxy hides it from
  most observers, but the IP is still in DO's space and discoverable.
- When the autoscaler removes + recreates the node, the public IP
  changes and DNS must be updated. This isn't automated yet.
- ingress-nginx hostNetwork conflicts with anything else binding 80/443
  on that node. Don't run a second ingress controller.

---

### 5. SealedSecrets over External Secrets Operator + Vault

**Context**: We need a way to keep encrypted secret material in git.

**Decision**: Use Bitnami SealedSecrets. Plaintext lives in `.env`
(gitignored) + `.local/credentials.env` (gitignored). Encrypted form
committed to `deploy/manifests/sealed-secrets/`.

**Why**: Single controller, no external dependencies, no Vault to
operate. Good enough for one cluster, one team.

**Alternatives considered**: External Secrets Operator + HashiCorp
Vault / 1Password / AWS Secrets Manager. Sops + age. Plain Secrets
managed manually.

**Consequences**:
- SealedSecret encryption is bound to namespace+name. Mirroring a
  secret across namespaces requires sealing it twice. We do this for
  `redis-auth` and `miniquiz-pg-app`.
- The cluster's sealing key rotates quarterly (controller default).
  If it rotates and we redeploy a stale ciphertext, decryption fails.
  The controller keeps old keys for 30 days; re-seal before then.

---

### 6. Argo source repo is `celo-org/mini-quiz`

**Context**: `celo-org` requires admin approval for fine-grained PATs.
Approval was pending and we needed to ship for a team demo.

**Decision**: Argo initially read from the public
`viral-sangani/mini-quiz` mirror to unblock the demo. After Celo org approval,
Argo was moved to read from `celo-org/mini-quiz` using a fine-grained,
read-only GitHub token.

**Why**: Unblocks the demo without waiting on an org admin. Public mirror
contains zero secrets (everything sensitive is sealed).

**Alternatives considered**: Wait for PAT approval (blocks on a
human). Use a deploy key on `celo-org/mini-quiz` (still needs admin
approval). Pull the repo into a self-hosted Argo Image Updater
config.

**Consequences**:
- API deploys should be pushed to `origin` (`celo-org/mini-quiz`).
- The Viral mirror can remain temporarily for Vercel frontend deploys, but the
  API image workflow is guarded so only `celo-org/mini-quiz` can build and bump
  the backend chart.
- The Argo repo credential lives in the cluster, not in GitHub Actions secrets.

---

### 7. Image registry is Docker Hub `viralsangani/miniquiz-api`, not GHCR

**Context**: We initially planned `ghcr.io/celo-org/miniquiz-api`, but
that requires `write:packages` perms on celo-org which the user
doesn't have without admin approval.

**Decision**: Push images to `docker.io/viralsangani/miniquiz-api`
(public). No `imagePullSecret` needed — the cluster pulls
unauthenticated.

**Why**: Same reason as #6 — unblock the demo. Docker Hub free tier
allows unlimited public repos with no rate limit on authenticated
pulls (cluster pulls unauthenticated, which has rate limits, but the
image is small enough that this is fine for a single-node PoC).

**Alternatives considered**: GHCR under personal account with public
package (similar). Self-hosted registry (overkill).

**Consequences**:
- Public image. Anyone can pull `viralsangani/miniquiz-api:latest` and
  see what's inside (no secrets baked in — they're injected at runtime).
- When org PAT is approved, flip `image.repository` in
  `deploy/charts/api/values.yaml` to `ghcr.io/celo-org/miniquiz-api`,
  add `imagePullSecret`, redeploy.

---

### 8. Tofu state in Cloudflare R2 (s3-compatible backend) [SUPERSEDES original DO Spaces choice]

**Context**: Tofu state must survive the laptop being lost.
Originally lived in DO Spaces ($5/mo flat for an 18 KiB file).

**Decision**: s3-style backend pointed at
`https://<acct>.r2.cloudflarestorage.com` bucket `miniquiz-tfstate`,
key `infra.tfstate`. R2 token (Object R/W, scoped to bucket) in
`.local/credentials.env` as `R2_ACCESS_KEY_ID` /
`R2_SECRET_ACCESS_KEY`.

**Why**: Free tier (10 GiB + zero egress) easily covers a single state
file forever. R2 speaks plain s3, so the only Tofu config diff is the
endpoint URL and `region = "auto"`. Saves $5/mo.

**Alternatives considered**: Local state (no durability if laptop is
lost), DO Spaces ($5/mo for 18 KiB is wasteful), Tofu Cloud (vendor
lock-in for a tiny payoff).

**Consequences**: Three credentials to keep alive (DO API token, R2
access key, R2 secret). If state ever gets corrupted, manual recovery
via `tofu state pull` / `push`. Migration from Spaces to R2 done
manually with `aws s3 cp` because Tofu's `init -migrate-state`
requires both backends to be readable simultaneously.

---

### 9. Treasury private key in SealedSecret, signs in-process

**Context**: Auto-payouts require a Celo wallet to send USDT.

**Decision**: `TREASURY_PRIVATE_KEY` in the `api-secrets` SealedSecret.
The api process loads it on boot, signs payouts inline using viem.

**Why**: PoC. Only the api Pod needs the key, and it lives in cluster
memory only after kubelet decrypts the Secret.

**Alternatives considered**: External signer / KMS service (overkill
at PoC). Multi-sig (slows down auto-payout). Hardware wallet (not
suitable for automated signing).

**Consequences**:
- If the api Pod is compromised, the key is too. Mitigation: keep
  treasury balance low (top up between games).
- Key rotation is a redeploy. Rotate via the sealed-secret runbook.
- Auto-payouts run **on the scheduler tick**, blocking SSE for ~1-3s
  per winner. Bad at >20k concurrent — see `architecture.md`'s
  "WARNING" callout.

---

### 10. ESM-correct API runtime — special handling for `@prisma/client`

**Context**: `@prisma/client` is published as CommonJS. Our Fastify
api compiles to ESM (`"type": "module"`). The naive `import { Prisma }
from "@prisma/client"` fails at runtime in Node 20 ESM.

**Decision**: Re-export the Prisma namespace through
`apps/api/src/db.ts` using `export import Prisma = pkg.Prisma`. All
service files import from `../db.js`.

**Why**: TS's `export import` produces a runtime value AND a type
namespace. Direct CJS-style named imports fail at runtime. ESM `*`
imports lose the namespace structure. This is the only pattern that
satisfies both type-checker and Node ESM.

**Alternatives considered**: Compile api to CJS (loses ESM-only deps).
Switch to a non-Prisma ORM (huge yak shave). Rewrite all
`Prisma.UserUpdateInput` types as their underlying types (verbose).

**Consequences**: Anyone adding a new `import { ... } from
"@prisma/client"` will crash the prod Pod. House rule #2 in
`CLAUDE.md` documents this. The Dockerfile also re-runs `prisma
generate` in the runtime stage because pnpm's `deploy --prod` doesn't
copy the generated client out of the `.pnpm` virtual store.

---

### 11. `packages/shared` is built (emits `dist/`), not source-imported

**Context**: Initially `packages/shared/package.json` had
`main: ./src/index.ts`. tsx (dev) handled it; Node (prod) crashed
with `Unknown file extension ".ts"`.

**Decision**: Add a `build` script (tsc) emitting `dist/`. `main` and
`exports` point at `dist/index.js`. Source uses `.js` extensions on
relative imports (NodeNext-style) so the emit is ESM-correct.

**Why**: Node ESM cannot import `.ts` files. There's no clean
runtime-only fix.

**Alternatives considered**: Bundle shared into the api's compile
output (would lose tree-shaking + duplicate types in admin/quiz
bundles). Use `tsx` in production (not recommended; adds startup
overhead + isn't tracked).

**Consequences**:
- Dockerfile must run `pnpm --filter @mini-quiz/shared build` before
  building api. It does.
- New files in `packages/shared/src/` need to be re-exported from
  `index.ts` with a `.js` extension on the import path (the source is
  still `.ts`; tsc rewrites the path on emit).

---

### 13. Admin auth via ADMIN_EMAILS allowlist, no Prisma adapter on Vercel

**Context**: Original admin app used `@auth/prisma-adapter` so NextAuth
could persist `User`, `Account`, `VerificationToken` rows. That requires
the admin app to reach Postgres — but Postgres is in DOKS and not
exposed publicly. We did NOT want to put Postgres on the public
internet.

**Decision**: Drop `PrismaAdapter`. NextAuth runs JWT-only sessions.
The `signIn` callback hard-blocks any email not in `ADMIN_EMAILS`
(env var on the admin app). JWT contains `sub: <lowercased-email>`,
`role: ADMIN`. The Fastify api re-checks `email ∈ ADMIN_EMAILS` and
upserts a `User` row by email so foreign keys (`Quiz.createdById`,
`Payout.approvedById`, `User.flaggedById`) still resolve.

**Why**: Admin can stay on Vercel (free, fast, easy preview deploys).
No new infra. No code-side adapter rewrite. The api was already the
sole gate for sensitive operations — doubling up the allowlist on the
admin side just stops fake sign-ins from reaching the api.

**Alternatives considered**:
- Custom NextAuth Adapter that wraps the api over HTTPS (~10 admin
  endpoints + 1 adapter file, way more code).
- Move admin onto DOKS alongside the api (one more workload to
  maintain).
- Expose Postgres publicly via DOKS LoadBalancer (security regression).

**Consequences**:
- **Demoting an admin** = remove email from `ADMIN_EMAILS` in two
  places: the api Sealed Secret (Pod restart, ~1 min) AND the admin
  Vercel project's env var (immediate on next request).
- **No per-user admin role storage.** `User.role` field stays in the
  schema, written by `getOrCreateAdminUser` but ignored on read.
- **JWT `sub` is now an email, not a User.id.** The api translates at
  the boundary. If the email changes (rare for OAuth), a new User row
  is created — old data is still attached to the old User but new
  actions go to the new one.
- **Admin app ships ~3 MB lighter** (Prisma client + adapter dropped
  from the bundle).

---

### 12. Mirror cross-namespace Secrets manually (no Reflector)

**Context**: SealedSecrets are namespace-bound. The api Pod (in `api`
namespace) needs `redis-auth` (created in `data`) and `miniquiz-pg-app`
(created in `data` by CNPG). It can't reference cross-namespace
Secrets directly.

**Decision**: Seal a copy of each secret into the `api` namespace. The
sealed YAMLs are in `deploy/manifests/sealed-secrets/redis-auth-api.yaml`
and `miniquiz-pg-app-api.yaml`. For `miniquiz-pg-app`, we read the
running cluster's Secret to capture CNPG's randomly-generated password,
then seal it.

**Why**: Simplest possible solution. No additional controllers.

**Alternatives considered**:
- **Reflector** (kyverno-incubator) — would auto-mirror. Adds a
  controller for one feature.
- **External Secrets Operator** — overkill if the only "external"
  store is the same cluster.
- **Symlinks via projected volumes** — doesn't work cross-namespace.

**Consequences**:
- If CNPG ever regenerates `miniquiz-pg-app` (e.g., Cluster recreated
  with no PVC), we have to re-mirror manually. See `runbooks.md`.
- The `api` SealedSecret + `data` SealedSecret can drift if you rotate
  one but not the other. Discipline-only safeguard.
