-- RFC 2136 update policy for ns1 (lua-dnsupdate-policy-script).
--
-- The only dynamic update the zone accepts is the ACME DNS-01 challenge for
-- the wildcard/apex certificate: a TXT record at _acme-challenge.runs-at.dev,
-- signed with the dedicated TSIG key acme-runs-at-dev. Everything else is
-- refused: other names, other types, unsigned updates, other keys.
--
-- With this script set, PowerDNS ignores allow-dnsupdate-from,
-- ALLOW-DNSUPDATE-FROM and TSIG-ALLOW-DNSUPDATE: this function is the whole
-- policy, so it checks the key itself. The update reaches ns2 through the
-- normal NOTIFY/TSIG AXFR path.
-- DNSName:equal() takes a string in PowerDNS 4.8.
local ALLOWED_KEY = "acme-runs-at-dev."
local ALLOWED_NAME = "_acme-challenge.runs-at.dev."

function updatepolicy(input)
  local key = input:getTsigName()
  if key == nil or not key:equal(ALLOWED_KEY) then
    return false
  end
  if not input:getQName():equal(ALLOWED_NAME) then
    return false
  end
  -- TXT add/delete; also ANY for "delete all TXT at the name" cleanups.
  local t = input:getQType():getCode()
  return t == pdns.TXT or t == pdns.ANY
end
