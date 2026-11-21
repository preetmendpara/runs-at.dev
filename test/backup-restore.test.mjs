import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { verifyBackup } from "../scripts/verify-backup-restore.mjs";

let hasTar = true;
try { execFileSync("tar", ["--version"], { stdio: "ignore" }); } catch { hasTar = false; }
const sha = (b) => createHash("sha256").update(b).digest("hex");
const FILES = { "domains/a.json": '{"a":1}\n', "owners/b.json": '{"b":2}\n', "schema/s.json": "{}\n" };

function fixture(mutate) {
  const root = mkdtempSync(join(tmpdir(), "bk-test-"));
  const src = join(root, "src"), bk = join(root, "bk");
  mkdirSync(bk);
  for (const [p, c] of Object.entries(FILES)) { mkdirSync(join(src, p, ".."), { recursive: true }); writeFileSync(join(src, p), c); }
  mutate?.before?.(src);
  const tarBuf = execFileSync("tar", ["-cf", "-", ...Object.keys(FILES).map((p) => p.split("/")[0]).filter((v, i, a) => a.indexOf(v) === i)], { cwd: src });
  writeFileSync(join(bk, "r.tar.gz"), gzipSync(tarBuf));
  writeFileSync(join(bk, "registry-files.sha256"), Object.entries(FILES).map(([p, c]) => `${sha(c)} *${p}\n`).join(""));
  writeFileSync(join(bk, "live-dns-export.json"), "{}");
  writeFileSync(join(bk, "SHA256SUMS"), ["r.tar.gz", "registry-files.sha256", "live-dns-export.json"].map((n) => `${sha(readFileSync(join(bk, n)))} *${n}\n`).join(""));
  mutate?.after?.(bk);
  try { return verifyBackup(bk, { git: false, log: () => {} }); } finally { rmSync(root, { recursive: true, force: true }); }
}

test("clean fixture verifies", { skip: !hasTar && "tar unavailable" }, () => {
  const r = fixture();
  assert.equal(r.ok, true, r.errors.join("\n"));
  assert.equal(r.counts.restored, 3);
});

test("corrupted file in archive is detected", { skip: !hasTar && "tar unavailable" }, () => {
  const r = fixture({ before: (src) => writeFileSync(join(src, "owners/b.json"), '{"b":3}\n') });
  assert.ok(r.errors.some((e) => e.includes("checksum mismatch owners/b.json")), r.errors.join("\n"));
});

test("corrupted checksum is detected", { skip: !hasTar && "tar unavailable" }, () => {
  const r = fixture({ after: (bk) => {
    const p = join(bk, "SHA256SUMS");
    writeFileSync(p, readFileSync(p, "utf8").replace(/^./, (c) => (c === "0" ? "1" : "0")));
  } });
  assert.ok(r.errors.some((e) => e.startsWith("SHA256SUMS: mismatch")), r.errors.join("\n"));
});

test("removed file is detected", { skip: !hasTar && "tar unavailable" }, () => {
  const r = fixture({ before: (src) => unlinkSync(join(src, "schema/s.json")) });
  assert.ok(r.errors.some((e) => e.includes("missing from archive schema/s.json")), r.errors.join("\n"));
});

test("unparseable live export is detected", { skip: !hasTar && "tar unavailable" }, () => {
  const r = fixture({ after: (bk) => writeFileSync(join(bk, "live-dns-export.json"), "{") });
  assert.equal(r.ok, false);
});
