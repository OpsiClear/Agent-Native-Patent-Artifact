import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { buildAssemblyInputFingerprint } from "../packages/apa-assemble/input-fingerprint.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..");
const CLI = join(HERE, "verify-external-matter.mjs");
const EXAMPLE = join(REPO, "examples", "minimal-patent-artifact");

function treeHash(root) {
  const records = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name);
      const stat = statSync(path);
      if (stat.isDirectory()) walk(path);
      else records.push(`${path.slice(root.length + 1).replace(/\\/g, "/")}\0${createHash("sha256").update(readFileSync(path)).digest("hex")}`);
    }
  };
  walk(root);
  return createHash("sha256").update(records.join("\n")).digest("hex");
}

test("external verifier is read-only and aggregate-only", () => {
  const matter = mkdtempSync(join(tmpdir(), "apa-private-external-"));
  try {
    cpSync(EXAMPLE, matter, { recursive: true });
    const before = treeHash(matter);
    const result = spawnSync(process.execPath, [
      CLI,
      "--matter", matter,
      "--now", "2026-07-26T12:00:00.000Z",
      "--expect", "no-go",
      "--domain", "software",
      "--support", "apa-review-form",
      "--support", "apa-tldraw-drawings",
      "--support", "apa-svg-upgrader",
      "--json",
    ], { cwd: REPO, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(treeHash(matter), before, "external verifier must not write to the matter");
    assert.doesNotMatch(result.stdout, new RegExp(matter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(result.stdout, /Self-Watering Planter/i, "private title must not appear");
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.filing.go_no_go, "NO-GO");
    assert.equal(parsed.privacy.aggregate_only, true);
    assert.equal(parsed.privacy.unsafe_linked_input_paths, 0);
    assert.equal(parsed.orchestration.schema, "apa-run-status-v2");
    assert.ok(parsed.orchestration.steps > 0);
    assert.equal(parsed.orchestration.runlog_error_count, 0);
    assert.equal(parsed.schema, "apa-external-matter-verification-v2");
    assert.equal(parsed.oracle.checked, false);
    assert.equal(parsed.oracle.canonical_digest_emitted, false);
  } finally {
    rmSync(matter, { recursive: true, force: true });
  }
});

test("external verifier skips safely when no local fixture is configured", () => {
  const env = { ...process.env };
  delete env.APA_EXTERNAL_MATTER;
  const result = spawnSync(process.execPath, [CLI, "--json"], { cwd: REPO, env, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.skipped, true);
});

test("external verifier requires a configured matter when --require is set", () => {
  const env = { ...process.env };
  delete env.APA_EXTERNAL_MATTER;
  const result = spawnSync(process.execPath, [CLI, "--json", "--require"], {
    cwd: REPO,
    env,
    encoding: "utf8",
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /external matter path required/);
});

test("external verifier rejects invalid matter paths without echoing them", () => {
  const missing = join(tmpdir(), `apa-private-missing-${process.pid}`);
  const result = spawnSync(process.execPath, [CLI, "--matter", missing, "--json"], {
    cwd: REPO,
    encoding: "utf8",
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /external matter directory is missing/);
  assert.doesNotMatch(result.stderr, new RegExp(missing.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("fixed-time aggregate oracle matches identically and never emits its canonical digest", () => {
  const matter = mkdtempSync(join(tmpdir(), "apa-private-oracle-matter-"));
  const scratch = mkdtempSync(join(tmpdir(), "apa-private-oracle-config-"));
  try {
    cpSync(EXAMPLE, matter, { recursive: true });
    const now = "2026-07-26T12:00:00.000Z";
    const baseline = spawnSync(process.execPath, [
      CLI, "--matter", matter, "--now", now, "--expect", "no-go", "--json",
    ], { cwd: REPO, encoding: "utf8" });
    assert.equal(baseline.status, 0, baseline.stderr || baseline.stdout);
    const parsed = JSON.parse(baseline.stdout);
    const digest = buildAssemblyInputFingerprint(matter).sha256;
    const oraclePath = join(scratch, "oracle.json");
    writeFileSync(oraclePath, JSON.stringify({
      schema: "apa-external-matter-oracle-v1",
      evaluated_at: now,
      canonical_input_sha256: digest,
      mechanical_error_codes: parsed.mechanical.error_codes,
      mechanical_warning_codes: parsed.mechanical.warning_codes,
      valid_dossiers: {
        rigor: parsed.rigor.valid_dossiers,
        ids: parsed.ids.valid_dossiers,
      },
      blocked_gates: parsed.filing.blocked_gates,
    }));

    const argv = [
      CLI, "--matter", matter, "--now", now, "--expect", "no-go", "--oracle", oraclePath, "--json",
    ];
    const first = spawnSync(process.execPath, argv, { cwd: REPO, encoding: "utf8" });
    const second = spawnSync(process.execPath, argv, { cwd: REPO, encoding: "utf8" });
    assert.equal(first.status, 0, first.stderr || first.stdout);
    assert.equal(second.status, 0, second.stderr || second.stdout);
    assert.equal(first.stdout, second.stdout);
    assert.doesNotMatch(first.stdout, new RegExp(digest));
    const checked = JSON.parse(first.stdout);
    assert.equal(checked.oracle.checked, true);
    assert.equal(checked.oracle.ok, true);
    assert.deepEqual(checked.oracle.mismatches, []);

    const drifted = JSON.parse(readFileSync(oraclePath, "utf8"));
    drifted.mechanical_error_codes = { ORACLE_DRIFT: 1 };
    writeFileSync(oraclePath, JSON.stringify(drifted));
    const mismatch = spawnSync(process.execPath, argv, { cwd: REPO, encoding: "utf8" });
    assert.equal(mismatch.status, 1, mismatch.stderr || mismatch.stdout);
    assert.doesNotMatch(mismatch.stdout, new RegExp(digest));
    assert.deepEqual(JSON.parse(mismatch.stdout).oracle.mismatches, [
      "mechanical error-code histogram differs",
    ]);
  } finally {
    rmSync(matter, { recursive: true, force: true });
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("external verifier fails closed on unsafe linked canonical inputs", (t) => {
  const matter = mkdtempSync(join(tmpdir(), "apa-private-link-matter-"));
  const outside = mkdtempSync(join(tmpdir(), "apa-private-link-target-"));
  try {
    cpSync(EXAMPLE, matter, { recursive: true });
    mkdirSync(join(outside, "nested"), { recursive: true });
    writeFileSync(join(outside, "nested", "outside.md"), "outside");
    rmSync(join(matter, "evidence", "drawings"), { recursive: true, force: true });
    try {
      symlinkSync(outside, join(matter, "evidence", "drawings"), "junction");
    } catch (error) {
      t.skip(`junction creation unavailable: ${error.code || error.message}`);
      return;
    }
    const result = spawnSync(process.execPath, [
      CLI,
      "--matter", matter,
      "--now", "2026-07-26T12:00:00.000Z",
      "--expect", "no-go",
      "--json",
    ], { cwd: REPO, encoding: "utf8" });
    assert.equal(result.status, 1, result.stderr || result.stdout);
    const parsed = JSON.parse(result.stdout);
    assert.ok(parsed.privacy.unsafe_linked_input_paths > 0);
    assert.equal(parsed.ok, false);
    assert.doesNotMatch(result.stdout, /outside\.md/);
  } finally {
    rmSync(matter, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});
