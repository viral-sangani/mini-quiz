# infra/ — OpenTofu (Day-0)

Provisions the DOKS cluster, VPC, firewall, and bootstraps Argo CD.
Everything inside the cluster after that is reconciled by Argo from `../deploy/`.

## One-time setup

```bash
# 1. Create a Cloudflare R2 bucket for Tofu state (free tier).
#    Dashboard → R2 → Create bucket → name "miniquiz-tfstate".
#    Then create an R2 API Token (Object Read & Write, scoped to that
#    bucket). Copy the Access Key ID, Secret Access Key, and S3 endpoint.

# 2. Export R2 creds for the s3 backend
export AWS_ACCESS_KEY_ID=<r2 access key id>
export AWS_SECRET_ACCESS_KEY=<r2 secret access key>
export AWS_DEFAULT_REGION=auto

# 3. Set the R2 endpoint in infra/backend.tf (already pinned to your bucket)

# 4. Set Tofu vars (or use a *.auto.tfvars file)
export TF_VAR_do_token=<DO API token>
export TF_VAR_argocd_repo_url=https://github.com/<you>/mini-quiz
```

## Apply

```bash
tofu init
tofu plan
tofu apply
```

## After apply

```bash
# Pull kubeconfig (printed in outputs)
doctl kubernetes cluster kubeconfig save miniquiz-prod

# Watch Argo finish reconciling everything
kubectl -n argocd get applications -w
```

## What lives where

| Resource | Owner |
|---|---|
| DOKS cluster + node pool | OpenTofu (this dir) |
| VPC + firewall | OpenTofu |
| Argo CD itself | OpenTofu (single `helm_release`) |
| ingress-nginx, cert-manager, sealed-secrets | Argo CD ← `deploy/apps/` |
| CNPG operator + Postgres `Cluster` | Argo CD |
| Redis | Argo CD |
| `api` Deployment / Service / Ingress / HPA | Argo CD ← `deploy/charts/api` |

Don't add Helm releases for app workloads here. Add them in `deploy/`.
