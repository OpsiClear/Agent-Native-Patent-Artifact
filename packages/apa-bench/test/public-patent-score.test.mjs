import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  scorePublicPatentFixture,
  scorePublicSoftwarePatentFixtures,
} from "../public-patent-score.mjs";

const ROOT = resolve(".");
const FIXTURE_ROOT = "benchmarks/fixtures";
const PAGERANK = "public-software-patent-pagerank";

function tempRootWithCase(caseId = PAGERANK) {
  const root = mkdtempSync(join(tmpdir(), "apa-public-patent-score-"));
  const dst = join(root, FIXTURE_ROOT, caseId);
  mkdirSync(join(root, FIXTURE_ROOT), { recursive: true });
  cpSync(join(ROOT, FIXTURE_ROOT, caseId), dst, { recursive: true });
  return { root, caseDir: dst };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function pagerankReportPath(caseDir) {
  return join(caseDir, "runs", "advisory-2026-06-21", "software_patent_report.json");
}

test("committed real public software patent fixtures score above the advisory threshold", () => {
  const summary = scorePublicSoftwarePatentFixtures();
  assert.equal(summary.status, "pass", JSON.stringify(summary.cases.flatMap((c) => c.findings), null, 2));
  assert.equal(summary.metrics.cases, 3);
  assert.equal(summary.metrics.blocking_failures, 0);
  assert.ok(summary.metrics.average_score >= 0.85);
});

test("stale source_hash creates a blocking source-integrity finding", () => {
  const { root, caseDir } = tempRootWithCase();
  const expectedPath = join(caseDir, "expected.json");
  const expected = readJson(expectedPath);
  expected.source_hash = "0".repeat(64);
  writeJson(expectedPath, expected);

  const result = scorePublicPatentFixture({ root, caseId: PAGERANK });
  assert.equal(result.status, "fail");
  assert.ok(result.findings.some((f) => f.severity === "blocking" && f.message.includes("source_hash mismatch")));
});

test("missing mechanism terms lower technical mechanism coverage without becoming a legal conclusion", () => {
  const { root, caseDir } = tempRootWithCase();
  const reportPath = pagerankReportPath(caseDir);
  const report = readJson(reportPath);
  report.technical_improvement.mechanism = "Generic software processing.";
  writeJson(reportPath, report);

  const result = scorePublicPatentFixture({ root, caseId: PAGERANK });
  assert.equal(result.blocking_failures, 0);
  assert.ok(result.score < 1);
  assert.ok(result.dimensions.technical_mechanism_coverage < 1);
  assert.ok(result.findings.some((f) => f.dimension === "technical_mechanism_coverage"));
});

test("forbidden legal conclusion phrases are blocking", () => {
  const { root, caseDir } = tempRootWithCase();
  const reportPath = pagerankReportPath(caseDir);
  const report = readJson(reportPath);
  report.notes = ["This claim is patent eligible."];
  writeJson(reportPath, report);

  const result = scorePublicPatentFixture({ root, caseId: PAGERANK });
  assert.equal(result.status, "fail");
  assert.ok(result.findings.some((f) => f.dimension === "legal_overclaim_avoidance" && f.severity === "blocking"));
});

test("missing expected CRM risk lowers risk coverage", () => {
  const { root, caseDir } = tempRootWithCase();
  const reportPath = pagerankReportPath(caseDir);
  const report = readJson(reportPath);
  report.support_flags = [];
  writeJson(reportPath, report);

  const result = scorePublicPatentFixture({ root, caseId: PAGERANK });
  assert.ok(result.score < 1);
  assert.ok(result.dimensions.risk_flag_coverage < 1);
  assert.ok(result.findings.some((f) => f.message.includes("crm-transitory-risk")));
});

test("missing evidence spans lower source-span discipline", () => {
  const { root, caseDir } = tempRootWithCase();
  const reportPath = pagerankReportPath(caseDir);
  const report = readJson(reportPath);
  delete report.technical_improvement.evidence_span;
  writeJson(reportPath, report);

  const result = scorePublicPatentFixture({ root, caseId: PAGERANK });
  assert.ok(result.score < 1);
  assert.ok(result.dimensions.source_span_discipline < 1);
  assert.ok(result.findings.some((f) => f.dimension === "source_span_discipline"));
});

test("invalid report JSON returns structured findings instead of a raw throw", () => {
  const { root, caseDir } = tempRootWithCase();
  writeFileSync(pagerankReportPath(caseDir), "{ invalid json", "utf8");

  const result = scorePublicPatentFixture({ root, caseId: PAGERANK });
  assert.equal(result.status, "fail");
  assert.ok(result.findings.some((f) => f.message.includes("invalid JSON")));
});

test("real software patent scorer is reachable through apa-bench CLI", () => {
  const stdout = execFileSync(process.execPath, [
    "packages/apa-bench/cli.mjs",
    "--mock",
    "--real-software-patents",
    "--json",
    "--case",
    PAGERANK,
  ], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const summary = JSON.parse(stdout);
  assert.equal(summary.schema, "apa-real-public-patent-score-v1");
  assert.equal(summary.metrics.cases, 1);
  assert.equal(summary.status, "pass");
});
