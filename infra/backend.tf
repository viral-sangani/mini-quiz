# Tofu state lives in DO Spaces (S3-compatible).
# Bucket: miniquiz-tfstate (region nyc3) — created once via:
#   aws --endpoint-url=https://nyc3.digitaloceanspaces.com s3 mb s3://miniquiz-tfstate
# Credentials come from AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY env vars.
terraform {
  backend "s3" {
    endpoints                   = { s3 = "https://nyc3.digitaloceanspaces.com" }
    bucket                      = "miniquiz-tfstate"
    key                         = "infra.tfstate"
    region                      = "us-east-1"
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_s3_checksum            = true
    use_path_style              = false
  }
}
