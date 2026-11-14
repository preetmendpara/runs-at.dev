variable "tenancy_ocid" {
  type        = string
  description = "Tenancy OCID. No default."
}

variable "compartment_ocid" {
  type        = string
  description = "Compartment for all resources. No default."
}

variable "region" {
  type        = string
  description = "Home region (Always Free E2.1.Micro only exists in the home region). No default."
}

variable "ssh_public_key" {
  type        = string
  description = "OpenSSH public key for the ubuntu user. No default."
}

variable "ssh_allowed_cidr" {
  type        = string
  description = "Only this CIDR may reach port 22, e.g. 203.0.113.7/32. No default; never 0.0.0.0/0."
  validation {
    condition     = can(cidrhost(var.ssh_allowed_cidr, 0)) && var.ssh_allowed_cidr != "0.0.0.0/0"
    error_message = "ssh_allowed_cidr must be a valid CIDR and must not be 0.0.0.0/0."
  }
}

variable "shape" {
  type        = string
  description = "VM.Standard.E2.1.Micro (Always Free, x86) or VM.Standard.A1.Flex (Always Free up to 4 OCPU / 24 GB total)."
  default     = "VM.Standard.E2.1.Micro"
  validation {
    condition     = contains(["VM.Standard.E2.1.Micro", "VM.Standard.A1.Flex"], var.shape)
    error_message = "Only Always Free shapes are allowed."
  }
}

variable "a1_ocpus" {
  type        = number
  description = "Per instance, only for A1.Flex. 2 x 2 = 4 OCPU stays inside Always Free."
  default     = 1
  validation {
    condition     = var.a1_ocpus >= 1 && var.a1_ocpus <= 2
    error_message = "Keep a1_ocpus at 1 or 2 so two instances stay within the 4 OCPU free limit."
  }
}

variable "a1_memory_gbs" {
  type        = number
  description = "Per instance, only for A1.Flex. 2 x 12 = 24 GB stays inside Always Free."
  default     = 6
  validation {
    condition     = var.a1_memory_gbs >= 1 && var.a1_memory_gbs <= 12
    error_message = "Keep a1_memory_gbs at most 12 so two instances stay within 24 GB."
  }
}

variable "boot_volume_gbs" {
  type        = number
  description = "Per instance. Two volumes must stay within the 200 GB Always Free block storage."
  default     = 50
  validation {
    condition     = var.boot_volume_gbs >= 47 && var.boot_volume_gbs <= 100
    error_message = "boot_volume_gbs must be 47-100."
  }
}
