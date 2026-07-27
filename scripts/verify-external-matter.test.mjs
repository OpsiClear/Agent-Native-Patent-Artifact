import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

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
