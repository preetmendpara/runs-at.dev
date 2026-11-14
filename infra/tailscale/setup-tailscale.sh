#!/bin/bash
# Join this host to the tailnet and, on ns1, publish the loopback-only
# PowerDNS API to the tailnet (only) on :8081. The tailnet policy
# (infra/tailscale/policy.hujson) lets tag:ci-dns reach that port and nothing
# else. The API stays bound to 127.0.0.1; nothing is opened on the public
# interface, and the API key is still required on every request.
#
#   TS_AUTHKEY=tskey-... TS_TAG=tag:pdns-ns1 setup-tailscale.sh
#
# TS_AUTHKEY: a REAL pre-authorized, tag-scoped auth key from the tailnet
# admin console; the operator supplies it at setup time, it is never stored.
set -euo pipefail
: "${TS_AUTHKEY:?TS_AUTHKEY (tag-scoped auth key) is required}"
: "${TS_TAG:?TS_TAG, e.g. tag:pdns-ns1}"
command -v tailscale > /dev/null || curl -fsSL https://tailscale.com/install.sh | sh
tailscale up --auth-key="$TS_AUTHKEY" --advertise-tags="$TS_TAG" --hostname="$(hostname -s)" --ssh=false
unset TS_AUTHKEY
if [ "$TS_TAG" = "tag:pdns-ns1" ]; then
  # TCP passthrough from the tailnet to the loopback API (PowerDNS sees
  # 127.0.0.1, which webserver-allow-from permits).
  tailscale serve --bg --tcp 8081 tcp://127.0.0.1:8081
fi
tailscale status --self
