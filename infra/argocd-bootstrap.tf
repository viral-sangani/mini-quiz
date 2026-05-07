# Installs Argo CD into the freshly-built cluster, then hands cluster-state
# ownership over to the `deploy/` repo. After this resource lands, OpenTofu
# does NOT manage in-cluster Helm releases — Argo CD does.

resource "kubernetes_namespace" "argocd" {
  metadata { name = "argocd" }
  depends_on = [digitalocean_kubernetes_cluster.miniquiz]
}

resource "helm_release" "argocd" {
  name       = "argocd"
  repository = "https://argoproj.github.io/argo-helm"
  chart      = "argo-cd"
  version    = "7.7.5"
  namespace  = kubernetes_namespace.argocd.metadata[0].name

  values = [file("${path.module}/argocd-values.yaml")]

  depends_on = [digitalocean_kubernetes_cluster.miniquiz]
}

# The single root Application that points Argo at deploy/. Everything else
# (ingress-nginx, cert-manager, sealed-secrets, CNPG, redis, api) is
# discovered + reconciled by Argo from there.
resource "kubectl_manifest" "app_of_apps" {
  yaml_body = templatefile("${path.module}/app-of-apps.yaml.tpl", {
    repo_url = var.argocd_repo_url
    revision = var.argocd_repo_revision
    path     = var.argocd_app_path
  })

  depends_on = [helm_release.argocd]
}
