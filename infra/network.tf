resource "digitalocean_vpc" "miniquiz" {
  name     = "${var.cluster_name}-vpc"
  region   = var.region
  ip_range = "10.20.0.0/20"
}

# Firewall on the cluster's worker nodes.
# Allows: 80/443 from anywhere (ingress-nginx hostNetwork)
#         all intra-VPC traffic (cluster pod-to-pod)
# DOKS adds its own implicit rules for the control plane → kubelet path.
resource "digitalocean_firewall" "nodes" {
  name        = "${var.cluster_name}-nodes"
  droplet_ids = []
  tags        = ["k8s:${digitalocean_kubernetes_cluster.miniquiz.id}"]

  inbound_rule {
    protocol         = "tcp"
    port_range       = "80"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }
  inbound_rule {
    protocol         = "tcp"
    port_range       = "443"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "tcp"
    port_range            = "1-65535"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }
  outbound_rule {
    protocol              = "udp"
    port_range            = "1-65535"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }
  outbound_rule {
    protocol              = "icmp"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }
}
