import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { defaultReportFor, expectedReportPath } from "../schemas.mjs";
import { validateReport } from "../validate.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, "..", "cli.mjs");
const EXAMPLE = join(HERE, "..", "..", "..", "examples", "minimal-patent-artifact");

function run(args) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
}

test("default reports for all four semantic skills validate", () => {
  for (const kind of ["claims", "patentability", "examiner_adversary", "office_action"]) {
    const report = defaultReportFor(kind, { matter: EXAMPLE });
    const result = validateReport(report, { kind });
    assert.equal(result.ok, true, `${kind}: ${JSON.stringify(result.errors)}`);
  }
});

test("findings require severity, rule anchor, evidence span, and recommendation", () => {
  const report = defaultReportFor("claims", { matter: EXAMPLE });
  report.findings.push({ finding_type: "flag", severity: "warning", rule_anchor: "37-cfr-1.75" });
  const result = validateReport(report);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.path === "findings[0].evidence_span"));
  assert.ok(result.errors.some((e) => e.path === "findings[0].recommendation"));
});

test("reports reject legal-conclusion fields and overbroad search assertions", () => {
  const report = defaultReportFor("patentability", { matter: EXAMPLE });
  report.search_completeness = "complete";
  report.patentability_conclusion = "patentable";
  const result = validateReport(report);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.path === "search_completeness"));
  assert.ok(result.errors.some((e) => e.path === "patentability_conclusion"));
});

test("examiner practitioner-approved edit mode requires a satisfied checkpoint", () => {
  const report = defaultReportFor("examiner_adversary", { matter: EXAMPLE });
  report.edit_mode = "practitioner-approved";
  let result = validateReport(report);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.path === "human_checkpoints"));

  report.human_checkpoints.push({ id: "practitioner-approval", required: true, satisfied: true });
  result = validateReport(report);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

test("CLI scaffolds and checks minimal reports for an example matter", () => {
  const d = mkdtempSync(join(tmpdir(), "apa-reports-"));
  try {
    cpSync(EXAMPLE, d, { recursive: true });
    for (const kind of ["claims", "patentability", "examiner_adversary", "office_action"]) {
      const scaffold = run(["scaffold", kind, "--matter", d]);
      assert.equal(scaffold.status, 0, scaffold.stderr);
      const file = join(d, expectedReportPath(kind));
      const check = run(["check", file, "--kind", kind, "--json"]);
      assert.equal(check.status, 0, check.stderr);
      assert.equal(JSON.parse(check.stdout).ok, true);
      assert.equal(JSON.parse(readFileSync(file, "utf8")).legal_posture, "flags-not-conclusions");
    }
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

