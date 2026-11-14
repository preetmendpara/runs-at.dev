# Separate edge host for *.runs-at.dev (infra/edge/Caddyfile), so the public
# HTTPS service does not share a machine with the primary nameserver: a
# compromise of the web edge must not reach PowerDNS or its database.
#
# Always Free fit: ns1/ns2 on the default VM.Standard.E2.1.Micro (the 2 free
# AMD micro instances); the edge is one VM.Standard.A1.Flex with 1 OCPU and
# 6 GB (the free Ampere pool is 4 OCPU / 24 GB). Three boot volumes of 50 GB
# stay within the 200 GB free block storage. The edge is optional
# (enable_edge) and refuses to plan if ns1/ns2 already use the Ampere pool in a
# way that would exceed it.

variable "enable_edge" {
  type        = bool
  description = "Create the separate edge instance."
  default     = true
}

data "oci_core_images" "ubuntu_arm" {
  compartment_id           = var.compartment_ocid
  operating_system         = "Canonical Ubuntu"
  operating_system_version = "24.04"
  shape                    = "VM.Standard.A1.Flex"
  sort_by                  = "TIMECREATED"
  sort_order               = "DESC"
}

# Only 80/443 for the edge, through a network security group attached to the
# edge's VNIC alone; ns1/ns2 never accept web traffic.
resource "oci_core_network_security_group" "edge" {
  count          = var.enable_edge ? 1 : 0
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.dns.id
  display_name   = "edge-https"
}

resource "oci_core_network_security_group_security_rule" "edge_in" {
  for_each                  = var.enable_edge ? { http = 80, https = 443 } : {}
  network_security_group_id = oci_core_network_security_group.edge[0].id
  direction                 = "INGRESS"
  protocol                  = "6"
  source                    = "0.0.0.0/0"
  source_type               = "CIDR_BLOCK"
  tcp_options {
    destination_port_range {
      min = each.value
      max = each.value
    }
  }
}

resource "oci_core_instance" "edge" {
  count               = var.enable_edge ? 1 : 0
  compartment_id      = var.compartment_ocid
  availability_domain = data.oci_identity_availability_domains.ads.availability_domains[0].name
  display_name        = "edge"
  shape               = "VM.Standard.A1.Flex"

  shape_config {
    ocpus         = 1
    memory_in_gbs = 6
  }

  create_vnic_details {
    subnet_id        = oci_core_subnet.public.id
    private_ip       = "10.53.1.21"
    assign_public_ip = false
    hostname_label   = "edge"
    nsg_ids          = [oci_core_network_security_group.edge[0].id]
  }

  source_details {
    source_type             = "image"
    source_id               = data.oci_core_images.ubuntu_arm.images[0].id
    boot_volume_size_in_gbs = var.boot_volume_gbs
  }

  metadata = {
    ssh_authorized_keys = var.ssh_public_key
    user_data           = base64encode(file("${path.module}/../cloud-init/edge.yaml"))
  }

  lifecycle {
    ignore_changes = [source_details[0].source_id, metadata["user_data"]]
    precondition {
      condition     = !local.is_flex || var.a1_ocpus * 2 + 1 <= 4 && var.a1_memory_gbs * 2 + 6 <= 24
      error_message = "ns1/ns2 on A1.Flex plus the edge would exceed the free Ampere pool (4 OCPU / 24 GB)."
    }
    precondition {
      condition     = var.boot_volume_gbs * 3 <= 200
      error_message = "Three boot volumes would exceed the 200 GB free block storage."
    }
  }
}

data "oci_core_vnic_attachments" "edge" {
  count          = var.enable_edge ? 1 : 0
  compartment_id = var.compartment_ocid
  instance_id    = oci_core_instance.edge[0].id
}

data "oci_core_private_ips" "edge" {
  count   = var.enable_edge ? 1 : 0
  vnic_id = data.oci_core_vnic_attachments.edge[0].vnic_attachments[0].vnic_id
}

resource "oci_core_public_ip" "edge" {
  count          = var.enable_edge ? 1 : 0
  compartment_id = var.compartment_ocid
  lifetime       = "RESERVED"
  display_name   = "edge-runs-at-dev"
  private_ip_id  = data.oci_core_private_ips.edge[0].private_ips[0].id
  lifecycle {
    prevent_destroy = true
  }
}

output "edge_ip" {
  description = "Point the zone's wildcard (*) A record here at cutover."
  value       = var.enable_edge ? oci_core_public_ip.edge[0].ip_address : null
}
