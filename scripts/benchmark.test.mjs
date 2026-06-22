import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { runBenchmarks } from "./benchmark.mjs";

test("benchmark runner passes the committed public/synthetic fixtures offline", () => {
  const summary = runBenchmarks({ mock: true });
  assert.equal(summary.ok, true, JSON.stringify(summary.cases, null, 2));
  assert.equal(summary.totals.cases, 5);
  assert.equal(summary.totals.passed, 5);
  assert.ok(summary.cases.find((c) => c.id === "public-utility-patent-compile"));
  assert.ok(summary.cases.find((c) => c.id === "public-office-action"));
  assert.ok(summary.cases.find((c) => c.id === "synthetic-disclosure-to-assembly"));
  assert.ok(summary.cases.find((c) => c.id === "software-patent-skill-sim"));
  assert.ok(summary.cases.find((c) => c.id === "synthetic-codebase-domain"));
});

test("benchmark CLI writes a JSON summary artifact in mock mode", () => {
  const dir = mkdtempSync(join(tmpdir(), "apa-benchmark-"));
  try {
    const out = join(dir, "summary.json");
    const res = spawnSync(process.execPath, ["scripts/benchmark.mjs", "--mock", "--json", "--out", out], {
      encoding: "utf8",
    });
    assert.equal(res.status, 0, res.stderr);
    const stdout = JSON.parse(res.stdout);
    const file = JSON.parse(readFileSync(out, "utf8"));
    assert.equal(stdout.ok, true);
    assert.equal(file.ok, true);
    assert.equal(file.totals.passed, 5);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("benchmark policy rejects non-public/non-synthetic source classes", () => {
  const dir = mkdtempSync(join(tmpdir(), "apa-benchmark-policy-"));
  try {
    const expected = join(dir, "expected.json");
    writeFileSync(expected, JSON.stringify({ schema: "apa-benchmark-expected-v1", case_id: "bad" }), "utf8");
    const index = join(dir, "index.json");
    writeFileSync(index, JSON.stringify({
      schema: "apa-benchmark-index-v1",
      cases: [{
        id: "bad",
        kind: "compiled-public-patent",
        source_class: "confidential_client_disclosure",
        expected,
      }],
    }), "utf8");
    const summary = runBenchmarks({ mock: true, index });
    assert.equal(summary.ok, false);
    assert.match(summary.cases[0].findings[0].message, /unsupported benchmark source_class/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
