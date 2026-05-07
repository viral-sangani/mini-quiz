# deploy/ — Argo CD source

Everything in here is reconciled into the cluster by Argo CD. The bootstrap
`Application` (the "app of apps") is applied once by `infra/argocd-bootstrap.tf`;
after that, every change to this directory ships to the cluster on push to `main`.

## Layout

```
deploy/
├── argocd-app-of-apps.yaml        # reference copy of the root Application
├── apps/                          # one Argo Application per workload
│   ├── sealed-secrets.yaml        # wave 0 — controller
│   ├── sealed-secret-payloads.yaml # wave 0 — your encrypted Secrets
│   ├── cert-manager.yaml          # wave 1
│   ├── ingress-nginx.yaml         # wave 1
│   ├── cnpg-operator.yaml         # wave 2
│   ├── postgres-cluster.yaml      # wave 3
│   ├── redis.yaml                 # wave 3
│   └── api.yaml                   # wave 4
├── charts/
│   └── api/                       # in-house Helm chart for the Fastify API
└── manifests/
    ├── postgres-cluster.yaml      # CNPG Cluster CR
    ├── cert-manager-issuer.yaml   # Let's Encrypt ClusterIssuer
    └── sealed-secrets/            # encrypted Secrets (commit-safe)
```

## Replace before first apply

Search the directory for `celo-org` — these are the GitHub repo path. Set
them to your fork URL (e.g. `celo-org/mini-quiz`).

```bash
grep -rl celo-org deploy/ | xargs sed -i '' 's|celo-org|celo-org|g'
```

## Promote a new api image

Push to `main` with changes under `apps/api/**` or `packages/shared/**`. The
`api-image` GitHub Actions workflow builds, pushes to ghcr.io, and bumps
`charts/api/values.yaml` `image.tag`. Argo notices within ~30s and rolls.

## Verify

```bash
kubectl -n argocd get applications
# All should be Synced + Healthy after ~3-5 min on first apply.
```
