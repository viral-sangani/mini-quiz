output "cluster_id" {
  value = digitalocean_kubernetes_cluster.miniquiz.id
}

output "cluster_endpoint" {
  value     = digitalocean_kubernetes_cluster.miniquiz.endpoint
  sensitive = true
}

output "kubeconfig_command" {
  value       = "doctl kubernetes cluster kubeconfig save ${digitalocean_kubernetes_cluster.miniquiz.name}"
  description = "Run this to merge the cluster into your local kubeconfig."
}

output "argocd_initial_admin_secret" {
  value       = "kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d"
  description = "Recipe to fetch the initial Argo CD admin password after install."
}
