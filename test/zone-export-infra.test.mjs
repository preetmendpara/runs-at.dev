import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { render } from '../infra/cloud-init/build.mjs';

test('cloud-init yaml is in sync with infra/powerdns', () => {
  for (const role of ['ns1', 'ns2']) {
    assert.equal(readFileSync(`infra/cloud-init/${role}.yaml`, 'utf8'), render(role), `${role}.yaml stale: run node infra/cloud-init/build.mjs`);
  }
});

test('API is loopback-only and transfers need TSIG (no IP may AXFR unsigned)', () => {
  const p = readFileSync('infra/powerdns/pdns-primary.conf', 'utf8');
  assert.match(p, /^webserver-address=127\.0\.0\.1$/m);
  // Any address listed here could AXFR without the key; TSIG-ALLOW-AXFR is
  // the only path. infra/test/pdns-ci.sh checks an unsigned AXFR is refused.
  assert.match(p, /^allow-axfr-ips=$/m);
  assert.match(p, /^also-notify=10\.53\.1\.12$/m);
  assert.match(p, /^gpgsql-host=127\.0\.0\.1$/m);
  assert.doesNotMatch(p, /^\s*(gpgsql-password|api-key)\s*=/m);
});

test('SSH is never open to the world', () => {
  const tf = readFileSync('infra/opentofu/main.tf', 'utf8');
  assert.match(tf, /source\s*=\s*var\.ssh_allowed_cidr/);
  assert.doesNotMatch(readFileSync('infra/opentofu/variables.tf', 'utf8'), /variable "(tenancy_ocid|compartment_ocid|ssh_public_key)"[^}]*\n\s*default\s*=/);
});
