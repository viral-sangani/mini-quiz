# Tofu state lives in Cloudflare R2 (S3-compatible, $0/mo on free tier).
# Bucket: miniquiz-tfstate — create once via the Cloudflare dashboard.
# Credentials come from AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY env vars
# (set them to your R2 access key + secret).
terraform {
  backend "s3" {
    endpoints                   = { s3 = "https://820430406dd10c2cb0106885a314d550.r2.cloudflarestorage.com" }
    bucket                      = "miniquiz-tfstate"
    key                         = "infra.tfstate"
    region                      = "auto"
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_s3_checksum            = true
    use_path_style              = false
  }
}
