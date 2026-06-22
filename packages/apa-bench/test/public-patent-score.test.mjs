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
import { generateSoftwarePatentCandidateReports } from "../software-patent-tune.mjs";

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

test("fresh software patent tuning reports are scored from a candidate root, not committed advisory runs", () => {
  const tuneRoot = mkdtempSync(join(tmpdir(), "apa-software-patent-tune-"));
  const run = generateSoftwarePatentCandidateReports({
    root: ROOT,
    cases: [PAGERANK],
    runId: "unit-test",
    tuneRoot,
    reviewedAt: "2026-06-21T00:00:00.000Z",
  });
  const summary = scorePublicSoftwarePatentFixtures({
    root: ROOT,
    cases: [PAGERANK],
    candidateRoot: run.candidateRoot,
    enforceFloors: true,
  });
  assert.equal(summary.mode, "fresh-candidate");
  assert.equal(summary.status, "pass", JSON.stringify(summary.cases[0].findings, null, 2));
  assert.equal(summary.metrics.warning_count, 0);
  assert.ok(!summary.metrics.candidate_source.includes("benchmarks/fixtures"));
  assert.ok(summary.cases[0].report.replace(/\\/g, "/").endsWith("public-software-patent-pagerank/software_patent_report.json"));
});

test("apa-bench CLI can run the fresh software patent tuning metric", () => {
  const tuneRoot = mkdtempSync(join(tmpdir(), "apa-software-patent-cli-"));
  const stdout = execFileSync(process.execPath, [
    "packages/apa-bench/cli.mjs",
    "--mock",
    "--real-software-patents",
    "--fresh",
    "--tune-root",
    tuneRoot,
    "--run-id",
    "unit-test-cli",
    "--json",
    "--case",
    PAGERANK,
  ], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const summary = JSON.parse(stdout);
  assert.equal(summary.mode, "fresh-candidate");
  assert.equal(summary.metrics.cases, 1);
  assert.equal(summary.status, "pass", JSON.stringify(summary.cases[0].findings, null, 2));
  assert.equal(summary.tuning_run.runId, "unit-test-cli");
});
