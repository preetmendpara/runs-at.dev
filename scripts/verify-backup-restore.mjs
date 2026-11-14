#!/usr/bin/env node
// Verify a registry backup restores byte-for-byte.
// Usage: node scripts/verify-backup-restore.mjs [backupDir] [--dry-run] [--no-git]
// Read-only for the repo: extracts into a temp dir, compares via git ls-tree blob hashes.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { gunzipSync } from "node:zlib";

const DIRS = ["domains", "owners", "entitlements", "data", "schema"];
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const gitBlob = (b) => createHash("sha1").update(`blob ${b.length}\0`).update(b).digest("hex");

export function parseSums(text) {
  const m = new Map();
  for (const line of text.split(/\r?\n/)) {
    const r = /^([0-9a-f]{64}) [ *](.+)$/.exec(line);
    if (r) m.set(r[2], r[1]);
  }
  return m;
}

function walk(root, dir = root, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(root, p, out);
    else out.push(relative(root, p).split("\\").join("/"));
  }
  return out;
}

export function verifyBackup(backupDir, { repo = process.cwd(), git = true, log = console.log } = {}) {
  const errors = [];
  const fail = (m) => { errors.push(m); log(`FAIL ${m}`); };
  const counts = {};
  const sums = parseSums(readFileSync(join(backupDir, "SHA256SUMS"), "utf8"));
  for (const [name, want] of sums) {
    const p = join(backupDir, name);
    if (!existsSync(p)) { fail(`SHA256SUMS: missing ${name}`); continue; }
    if (sha256(readFileSync(p)) !== want) fail(`SHA256SUMS: mismatch ${name}`);
  }
  counts.sha256sums = sums.size;
  const tarName = [...sums.keys()].find((n) => n.endsWith(".tar.gz"));
  if (!tarName) { fail("no .tar.gz listed in SHA256SUMS"); return { ok: false, errors, counts }; }
  if (sums.has("live-dns-export.json")) {
    try { JSON.parse(readFileSync(join(backupDir, "live-dns-export.json"), "utf8")); counts.liveExport = "parsed"; }
    catch (e) { fail(`live-dns-export.json: ${e.message}`); }
  }

  const tmp = mkdtempSync(join(tmpdir(), "restore-verify-"));
  try {
    // gunzip in node, feed tar via stdin: avoids Windows drive-letter quirks in tar paths.
    execFileSync("tar", ["-xf", "-"], { cwd: tmp, input: gunzipSync(readFileSync(join(backupDir, tarName))) });
    const restored = walk(tmp);
    counts.restored = restored.length;
    const files = parseSums(readFileSync(join(backupDir, "registry-files.sha256"), "utf8"));
    counts.manifest = files.size;
    const have = new Set(restored);
    for (const [name, want] of files) {
      if (!have.has(name)) fail(`manifest: missing from archive ${name}`);
      else if (sha256(readFileSync(join(tmp, name))) !== want) fail(`manifest: checksum mismatch ${name}`);
    }
    for (const f of restored) if (!files.has(f)) fail(`manifest: unlisted file in archive ${f}`);

    if (git) {
      const commit = readFileSync(join(backupDir, "GIT_COMMIT"), "utf8").trim();
      counts.commit = commit;
      const out = execFileSync("git", ["ls-tree", "-r", commit, "--", ...DIRS], { cwd: repo, encoding: "utf8", maxBuffer: 64 << 20 });
      const tree = new Map();
      for (const l of out.split("\n").filter(Boolean)) {
        const [meta, path] = l.split("\t");
        tree.set(path, meta.split(" ")[2]);
      }
      counts.gitTree = tree.size;
      const per = Object.fromEntries(DIRS.map((d) => [d, 0]));
      for (const [path, blob] of tree) {
        if (!have.has(path)) { fail(`git: missing from archive ${path}`); continue; }
        if (gitBlob(readFileSync(join(tmp, path))) !== blob) fail(`git: content differs ${path}`);
        else per[path.split("/")[0]]++;
      }
      for (const f of restored) if (!tree.has(f)) fail(`git: archive file not in ${commit} ${f}`);
      counts.gitMatchedByDir = per;
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  return { ok: errors.length === 0, errors, counts };
}

export function dryRunCommands(backupDir) {
  const commit = readFileSync(join(backupDir, "GIT_COMMIT"), "utf8").trim();
  const tarName = [...parseSums(readFileSync(join(backupDir, "SHA256SUMS"), "utf8")).keys()].find((n) => n.endsWith(".tar.gz"));
  const b = relative(process.cwd(), resolve(backupDir)).split("\\").join("/") || ".";
  return [
    "# Option A (preferred): restore from Git into a clean checkout",
    `git switch -c restore/registry-${commit.slice(0, 8)} origin/main`,
    `git checkout ${commit} -- ${DIRS.join(" ")}`,
    "npm test",
    "# Option B: restore from the archive (run at the repo root)",
    `(cd ${b} && sha256sum -c SHA256SUMS)`,
    `git switch -c restore/registry-archive origin/main`,
    `git rm -r -q --ignore-unmatch ${DIRS.join(" ")}`,
    `tar -xzf ${b}/${tarName}`,
    `sha256sum -c --quiet ${b}/registry-files.sha256`,
    `git diff --stat ${commit} -- ${DIRS.join(" ")}   # expect no output`,
    "npm test",
  ];
}

if (resolve(process.argv[1] ?? "") === resolve(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1"))) {
  const args = process.argv.slice(2);
  const dir = args.find((a) => !a.startsWith("--")) ?? "migration/backup";
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) { console.error(`no backup dir: ${dir}`); process.exit(2); }
  if (args.includes("--dry-run")) { console.log(dryRunCommands(dir).join("\n")); process.exit(0); }
  const r = verifyBackup(dir, { git: !args.includes("--no-git") });
  console.log(JSON.stringify(r.counts, null, 2));
  console.log(r.ok ? "RESTORE VERIFY OK" : `RESTORE VERIFY FAILED: ${r.errors.length} error(s)`);
  process.exit(r.ok ? 0 : 1);
}
