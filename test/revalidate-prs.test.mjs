// revalidate-prs: re-running stale validate runs, and the workflow_dispatch
// fallback that publishes a `validate` check on the PR head commit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, chmodSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import yaml from 'js-yaml';

const ROOT = resolve(import.meta.dirname, '..');
const workflow = (name) => yaml.load(readFileSync(join(ROOT, '.github/workflows', name), 'utf8'));
const hasBash = spawnSync('bash', ['-c', 'date -d @0 +%s'], { encoding: 'utf8' }).status === 0;

// ── rerun-validate.sh against a fake `gh` ───────────────────────────────
// The fake logs every call and answers from env: FAKE_RUN is the
// "<id> <status> <created_at>" line find_run would print (empty: no run),
// FAKE_RERUN_EXIT is the exit code of `gh run rerun`.
function runScript({ run = '', rerunExit = 0 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'rerun-'));
  const log = join(dir, 'calls.log');
  const gh = join(dir, 'gh');
  writeFileSync(gh, `#!/usr/bin/env bash
echo "$*" >> "${log.replace(/\\/g, '/')}"
case "$1 $2" in
  "pr view") echo "abc123headsha" ;;
  "api repos/"*) printf '%s' "$FAKE_RUN" ;;
  "run rerun") exit "$FAKE_RERUN_EXIT" ;;
  "run watch") exit 0 ;;
  "workflow run") exit 0 ;;
esac
`);
  chmodSync(gh, 0o755);
  const res = spawnSync('bash', [join(ROOT, 'scripts/rerun-validate.sh'), '42'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${dir}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}`,
      REPO: 'owner/repo',
      FAKE_RUN: run,
      FAKE_RERUN_EXIT: String(rerunExit),
      FIND_ATTEMPTS: '1',
      FIND_DELAY: '0',
    },
  });
  const calls = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [];
  return { status: res.status, out: res.stdout + res.stderr, calls };
}
const daysAgo = (n) => new Date(Date.now() - n * 86400_000).toISOString().replace(/\.\d+Z$/, 'Z');
const dispatched = (calls) => calls.some((c) => c.startsWith('workflow run validate.yml') && c.includes('pr=42'));
const reran = (calls) => calls.some((c) => c.startsWith('run rerun 123'));

test('recent run: re-runs it, no dispatch', { skip: !hasBash }, () => {
  const r = runScript({ run: `123 completed ${daysAgo(3)}` });
  assert.equal(r.status, 0, r.out);
  assert.ok(reran(r.calls));
  assert.ok(!dispatched(r.calls));
});

test('run older than 29 days: fresh dispatch, no rerun attempt', { skip: !hasBash }, () => {
  const r = runScript({ run: `123 completed ${daysAgo(45)}` });
  assert.equal(r.status, 0, r.out);
  assert.ok(dispatched(r.calls), r.out);
  assert.ok(!reran(r.calls));
});

test('rerun refused by GitHub: falls back to dispatch', { skip: !hasBash }, () => {
  const r = runScript({ run: `123 completed ${daysAgo(5)}`, rerunExit: 1 });
  assert.equal(r.status, 0, r.out);
  assert.ok(reran(r.calls));
  assert.ok(dispatched(r.calls), r.out);
});

test('no earlier run: dispatches one', { skip: !hasBash }, () => {
  const r = runScript({ run: '' });
  assert.equal(r.status, 0, r.out);
  assert.ok(dispatched(r.calls), r.out);
});

test('dispatch failure surfaces as a non-zero exit', { skip: !hasBash }, () => {
  // `gh workflow run` failing must not look like success.
  const dir = mkdtempSync(join(tmpdir(), 'rerun-'));
  const gh = join(dir, 'gh');
  writeFileSync(gh, '#!/usr/bin/env bash\ncase "$1 $2" in "pr view") echo sha;; "api repos/"*) ;; "workflow run") exit 1;; esac\n');
  chmodSync(gh, 0o755);
  const res = spawnSync('bash', [join(ROOT, 'scripts/rerun-validate.sh'), '42'], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${dir}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}`, REPO: 'o/r', FIND_ATTEMPTS: '1', FIND_DELAY: '0' },
  });
  assert.notEqual(res.status, 0);
});

// ── validate.yml: dispatch path publishes a PR-associated check ─────────
const v = workflow('validate.yml');

test('validate.yml accepts workflow_dispatch with a pr input', () => {
  assert.ok(v.on.workflow_dispatch.inputs.pr.required);
  assert.deepEqual(v.on.pull_request_target.types, ['opened', 'synchronize', 'reopened']);
});

test('only open/close hold checks: write; the job running code is read-only', () => {
  assert.equal(v.permissions.checks, undefined);
  assert.equal(v.jobs.open.permissions.checks, 'write');
  assert.equal(v.jobs.close.permissions.checks, 'write');
  assert.equal(v.jobs.validate.permissions, undefined, 'validate inherits read-only top-level permissions');
});

test('open/close run only on dispatch; validate keeps the required `validate` name on PR events', () => {
  assert.match(v.jobs.open.if, /workflow_dispatch/);
  assert.match(v.jobs.close.if, /workflow_dispatch/);
  assert.match(v.jobs.validate.name, /'validate'/);
  assert.match(v.jobs.validate.name, /revalidate PR/);
  assert.match(v.jobs.validate.if, /pull_request_target/);
});

test('open resolves the exact head SHA and creates the check in_progress on it', () => {
  const steps = v.jobs.open.steps.map((s) => s.run || '').join('\n');
  assert.match(steps, /\.head\.sha/);
  assert.match(steps, /state.*open/s);
  assert.match(steps, /check-runs" -X POST/);
  assert.match(steps, /head_sha="\$HEAD_SHA"/);
  assert.match(steps, /status=in_progress/);
  assert.equal(v.jobs.open.outputs.check_id, '${{ steps.check.outputs.id }}');
});

test('close completes the same check run (PATCH by id), failure unless validation passed', () => {
  const run = v.jobs.close.steps[0].run;
  assert.match(run, /check-runs\/\$CHECK_ID" -X PATCH/);
  assert.match(run, /conclusion=failure/);
  assert.match(run, /RESULT" = "success" \] && \[ "\$JOB_RESULT" = "success"/);
  assert.match(v.jobs.close.if, /always\(\)/);
});

test('validate never checks out pull request code', () => {
  for (const job of Object.values(v.jobs)) {
    for (const step of job.steps) {
      if (!String(step.uses || '').startsWith('actions/checkout')) continue;
      assert.match(String(step.with.ref), /base_ref/, 'checkout must be the base branch');
      assert.equal(step.with['persist-credentials'], false);
    }
  }
});

test('validate validates the resolved head SHA', () => {
  const step = v.jobs.validate.steps.find((s) => s.run === 'node scripts/validate-pr.mjs');
  assert.equal(step.env.HEAD_SHA, '${{ steps.pr.outputs.head_sha }}');
});

// ── revalidate-prs.yml: one bad PR does not stop the sweep ──────────────
test('revalidate-prs keeps going past a failing PR and fails at the end', () => {
  const r = workflow('revalidate-prs.yml');
  assert.equal(r.permissions.actions, 'write');
  const run = r.jobs.revalidate.steps.find((s) => s.run).run;
  assert.match(run, /rerun-validate\.sh "\$pr" \|\| failed=/);
  assert.match(run, /exit 1/);
});
