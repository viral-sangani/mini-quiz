variable "do_token" {
  type        = string
  sensitive   = true
  description = "DigitalOcean API token (set via TF_VAR_do_token)."
}

variable "region" {
  type        = string
  default     = "nyc3"
  description = "DO region. Revisit once MiniPay traffic concentration is known."
}

variable "cluster_name" {
  type    = string
  default = "miniquiz-prod"
}

variable "k8s_version_prefix" {
  type        = string
  default     = "1.34."
  description = "Pinned by `data.digitalocean_kubernetes_versions` to latest patch. DOKS supports 1.33–1.35 as of 2026-05."
}

variable "node_size" {
  type        = string
  default     = "s-4vcpu-8gb"
  description = "Basic 4 vCPU / 8 GB — $48/mo. Single-node PoC default."
}

variable "node_min" {
  type    = number
  default = 1
}

variable "node_max" {
  type    = number
  default = 4
}

variable "argocd_repo_url" {
  type        = string
  description = "Git URL Argo CD reconciles for the app-of-apps (e.g. https://github.com/<you>/mini-quiz)."
}

variable "argocd_repo_revision" {
  type    = string
  default = "main"
}

variable "argocd_app_path" {
  type        = string
  default     = "deploy"
  description = "Path within the repo where deploy/argocd-app-of-apps.yaml lives."
}
