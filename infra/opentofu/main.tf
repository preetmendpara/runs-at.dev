locals {
  hosts = {
    ns1 = { private_ip = "10.53.1.11", cloud_init = "${path.module}/../cloud-init/ns1.yaml" }
    ns2 = { private_ip = "10.53.1.12", cloud_init = "${path.module}/../cloud-init/ns2.yaml" }
  }
  is_flex = var.shape == "VM.Standard.A1.Flex"
}

data "oci_identity_availability_domains" "ads" {
  compartment_id = var.tenancy_ocid
}

data "oci_core_images" "ubuntu" {
  compartment_id           = var.compartment_ocid
  operating_system         = "Canonical Ubuntu"
  operating_system_version = "24.04"
  shape                    = var.shape
  sort_by                  = "TIMECREATED"
  sort_order               = "DESC"
}

resource "oci_core_vcn" "dns" {
  compartment_id = var.compartment_ocid
  cidr_blocks    = ["10.53.0.0/16"]
  display_name   = "runs-at-dns"
  dns_label      = "rundns"
}

resource "oci_core_internet_gateway" "igw" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.dns.id
  display_name   = "runs-at-dns-igw"
}

resource "oci_core_route_table" "public" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.dns.id
  route_rules {
    destination       = "0.0.0.0/0"
    network_entity_id = oci_core_internet_gateway.igw.id
  }
}

resource "oci_core_security_list" "dns" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.dns.id
  display_name   = "runs-at-dns"

  egress_security_rules {
    destination = "0.0.0.0/0"
    protocol    = "all"
  }

  ingress_security_rules {
    source   = "0.0.0.0/0"
    protocol = "17" # UDP
    udp_options {
      min = 53
      max = 53
    }
  }

  ingress_security_rules {
    source   = "0.0.0.0/0"
    protocol = "6" # TCP (AXFR/IXFR, truncated answers)
    tcp_options {
      min = 53
      max = 53
    }
  }

  ingress_security_rules {
    source   = var.ssh_allowed_cidr
    protocol = "6"
    tcp_options {
      min = 22
      max = 22
    }
  }

  # Path MTU discovery.
  ingress_security_rules {
    source   = "0.0.0.0/0"
    protocol = "1"
    icmp_options {
      type = 3
      code = 4
    }
  }
}

resource "oci_core_subnet" "public" {
  compartment_id    = var.compartment_ocid
  vcn_id            = oci_core_vcn.dns.id
  cidr_block        = "10.53.1.0/24"
  display_name      = "runs-at-dns-public"
  dns_label         = "pub"
  route_table_id    = oci_core_route_table.public.id
  security_list_ids = [oci_core_security_list.dns.id]
}

resource "oci_core_instance" "ns" {
  for_each            = local.hosts
  compartment_id      = var.compartment_ocid
  availability_domain = data.oci_identity_availability_domains.ads.availability_domains[0].name
  display_name        = each.key
  shape               = var.shape

  dynamic "shape_config" {
    for_each = local.is_flex ? [1] : []
    content {
      ocpus         = var.a1_ocpus
      memory_in_gbs = var.a1_memory_gbs
    }
  }

  create_vnic_details {
    subnet_id        = oci_core_subnet.public.id
    private_ip       = each.value.private_ip
    assign_public_ip = false # the reserved IP below is attached instead
    hostname_label   = each.key
  }

  source_details {
    source_type             = "image"
    source_id               = data.oci_core_images.ubuntu.images[0].id
    boot_volume_size_in_gbs = var.boot_volume_gbs
  }

  metadata = {
    ssh_authorized_keys = var.ssh_public_key
    user_data           = base64encode(file(each.value.cloud_init))
  }

  lifecycle {
    ignore_changes = [source_details[0].source_id, metadata["user_data"]]
  }
}

data "oci_core_vnic_attachments" "ns" {
  for_each       = oci_core_instance.ns
  compartment_id = var.compartment_ocid
  instance_id    = each.value.id
}

data "oci_core_private_ips" "ns" {
  for_each = data.oci_core_vnic_attachments.ns
  vnic_id  = each.value.vnic_attachments[0].vnic_id
}

# Reserved, so the glue at the registrar survives instance rebuilds.
resource "oci_core_public_ip" "ns" {
  for_each       = data.oci_core_private_ips.ns
  compartment_id = var.compartment_ocid
  lifetime       = "RESERVED"
  display_name   = "${each.key}-runs-at-dev"
  private_ip_id  = each.value.private_ips[0].id
  lifecycle {
    prevent_destroy = true
  }
}

output "glue" {
  description = "Feed these to export-zone.mjs (NS1_IPV4/NS2_IPV4) and to the new registrar's host records."
  value       = { for k, ip in oci_core_public_ip.ns : k => ip.ip_address }
}
