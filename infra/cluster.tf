data "digitalocean_kubernetes_versions" "current" {
  version_prefix = var.k8s_version_prefix
}

resource "digitalocean_kubernetes_cluster" "miniquiz" {
  name         = var.cluster_name
  region       = var.region
  version      = data.digitalocean_kubernetes_versions.current.latest_version
  vpc_uuid     = digitalocean_vpc.miniquiz.id
  auto_upgrade = true

  maintenance_policy {
    start_time = "04:00"
    day        = "sunday"
  }

  node_pool {
    name       = "main"
    size       = var.node_size
    auto_scale = true
    min_nodes  = var.node_min
    max_nodes  = var.node_max
    labels     = { role = "main" }
  }
}
