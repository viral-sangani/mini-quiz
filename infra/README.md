# infra/ — OpenTofu (Day-0)

Provisions the DOKS cluster, VPC, firewall, and bootstraps Argo CD.
Everything inside the cluster after that is reconciled by Argo from `../deploy/`.

## One-time setup

```bash
# 1. Pre-create the state bucket (Spaces, S3-compatible)
doctl spaces create miniquiz-tfstate --region nyc3

# 2. Export DO Spaces creds so the s3 backend can reach the bucket
export AWS_ACCESS_KEY_ID=<spaces access id>
export AWS_SECRET_ACCESS_KEY=<spaces secret key>

# 3. Set Tofu vars (or use a *.auto.tfvars file)
export TF_VAR_do_token=<DO API token>
export TF_VAR_spaces_access_id=$AWS_ACCESS_KEY_ID
export TF_VAR_spaces_secret_key=$AWS_SECRET_ACCESS_KEY
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
