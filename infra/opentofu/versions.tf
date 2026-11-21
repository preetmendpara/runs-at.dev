terraform {
  required_version = ">= 1.6.0"
  required_providers {
    oci = {
      source  = "oracle/oci"
      version = "~> 6.0"
    }
  }
}

# Auth comes from ~/.oci/config (or OCI_* env vars). Nothing secret lives here.
provider "oci" {
  tenancy_ocid = var.tenancy_ocid
  region       = var.region
}
