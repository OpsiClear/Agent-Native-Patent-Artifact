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
    assert.equal(report.rule_pack.id, "uspto-v1");
    assert.equal(report.rule_pack.effective_date, "2026-06-15");
    const result = validateReport(report, { kind });
    assert.equal(result.ok, true, `${kind}: ${JSON.stringify(result.errors)}`);
  }
});

test("reports require rule-pack metadata", () => {
  const report = defaultReportFor("claims", { matter: EXAMPLE });
  delete report.rule_pack.effective_date;
  const result = validateReport(report, { kind: "claims" });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.path === "rule_pack.effective_date"));
});

test("findings require severity, rule anchor, evidence span, and recommendation", () => {
  const report = defaultReportFor("claims", { matter: EXAMPLE });
  report.findings.push({ finding_type: "flag", severity: "warning", rule_anchor: "37-cfr-1.75" });
  const result = validateReport(report);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.path === "findings[0].evidence_span"));
  assert.ok(result.errors.some((e) => e.path === "findings[0].recommendation"));
});

test("claims reports validate unsupported-feature entries", () => {
  const report = defaultReportFor("claims", { matter: EXAMPLE });
  report.unsupported_features.push({
    feature: "multiple-dependent-claims",
    status: "unsupported-in-apa-mvp",
    rule_anchor: "37-cfr-1.75",
    evidence_span: "CLM02 appears to depend from claims 1 or 2.",
    recommendation: "Rewrite as singly dependent claims.",
  });
  let result = validateReport(report, { kind: "claims" });
  assert.equal(result.ok, true, JSON.stringify(result.errors));

  delete report.unsupported_features[0].recommendation;
  result = validateReport(report, { kind: "claims" });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.path === "unsupported_features[0].recommendation"));
});

test("claims reports disallow strategic claim changes in pro-se mode", () => {
  const report = defaultReportFor("claims", { matter: EXAMPLE });
  report.user_role = "pro_se";
  report.possible_organization_options.push({
    label: "one independent apparatus claim plus dependent fallback claims",
    neutral_question: "Ask counsel whether this organization matches the intended filing strategy.",
  });
  let result = validateReport(report, { kind: "claims" });
  assert.equal(result.ok, true, JSON.stringify(result.errors));

  report.claim_changes.push({ claim: "CLM01", change: "narrow to hardware decoder path" });
  report.scope_decisions.push({ claim: "CLM01", decision: "choose narrow path" });
  result = validateReport(report, { kind: "claims" });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.path === "claim_changes"));
  assert.ok(result.errors.some((e) => e.path === "scope_decisions"));
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

test("patentability claim-chart cells must be quote-backed", () => {
  const report = defaultReportFor("patentability", { matter: EXAMPLE });
  report.claim_charts.push({
    claim: "CLM01",
    reference: "PA01",
    cells: [
      {
        limitation: "LIM01",
        appears_teaches: "yes",
        quote: "A reservoir holds water.",
        page_or_para: "PA01 para. 3",
        confidence: "high",
        human_verified: false,
      },
      {
        limitation: "LIM02",
        appears_teaches: "no",
        quote: "not located",
        page_or_para: "not located",
        confidence: "medium",
        human_verified: false,
      },
    ],
  });
  const result = validateReport(report, { kind: "patentability" });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

test("patentability yes/partial chart cells reject missing quotes or locations", () => {
  const report = defaultReportFor("patentability", { matter: EXAMPLE });
  report.claim_charts.push({
    claim: "CLM01",
    reference: "PA01",
    cells: [
      {
        limitation: "LIM01",
        appears_teaches: "partial",
        quote: "not located",
        page_or_para: "not located",
        confidence: "high",
        human_verified: false,
      },
    ],
  });
  const result = validateReport(report, { kind: "patentability" });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.path === "claim_charts[0].cells[0].quote"));
  assert.ok(result.errors.some((e) => e.path === "claim_charts[0].cells[0].page_or_para"));
});

test("patentability obviousness combinations require rationale, expectation, and nexus evidence", () => {
  const report = defaultReportFor("patentability", { matter: EXAMPLE });
  report.obviousness_combinations.push({
    claim: "CLM02",
    references: ["PA01", "PA02"],
    rationale: "Known wick transport combined with known float valves.",
    rationale_source: "record-evidence",
    reasonable_expectation_of_success: "Both references use passive water-level components.",
    counter_teaching: "none identified",
    human_verified: false,
    secondary_considerations: [
      { type: "long-felt need", nexus: "asserted nexus to LIM03", evidence_span: "inventor interview p. 2" },
    ],
  });
  let result = validateReport(report, { kind: "patentability" });
  assert.equal(result.ok, true, JSON.stringify(result.errors));

  delete report.obviousness_combinations[0].reasonable_expectation_of_success;
  delete report.obviousness_combinations[0].secondary_considerations[0].evidence_span;
  result = validateReport(report, { kind: "patentability" });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.path === "obviousness_combinations[0].reasonable_expectation_of_success"));
  assert.ok(result.errors.some((e) => e.path === "obviousness_combinations[0].secondary_considerations[0].evidence_span"));
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

test("examiner reports enforce loop caps unless explicitly overridden", () => {
  const report = defaultReportFor("examiner_adversary", { matter: EXAMPLE });
  report.loop_count = 3;
  report.max_examiner_loops = 2;
  let result = validateReport(report, { kind: "examiner_adversary" });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.path === "loop_count"));

  report.human_checkpoints.push({ id: "examiner-loop-override", required: true, satisfied: true });
  result = validateReport(report, { kind: "examiner_adversary" });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

test("examiner reports validate dead-end arguments for do-not-reuse tracking", () => {
  const report = defaultReportFor("examiner_adversary", { matter: EXAMPLE });
  report.dead_end_arguments.push({
    argument: "Argue that reference PA01 lacks any transport step.",
    reason: "PA01 expressly discloses passive transport at para. 12.",
    affected_claims: ["CLM01"],
    do_not_reuse: true,
    evidence_span: "trace/prosecution.yaml PH03; PA01 para. 12",
  });
  let result = validateReport(report, { kind: "examiner_adversary" });
  assert.equal(result.ok, true, JSON.stringify(result.errors));

  delete report.dead_end_arguments[0].do_not_reuse;
  result = validateReport(report, { kind: "examiner_adversary" });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.path === "dead_end_arguments[0].do_not_reuse"));
});

test("examiner reports keep amendments proposal-only and disallow them in pro-se mode", () => {
  const report = defaultReportFor("examiner_adversary", { matter: EXAMPLE });
  report.proposed_amendments.push({
    claim: "CLM01",
    proposal: "Add an explicit hardware decoder limitation.",
    rationale: "Addresses the strongest 103 combination while preserving dependent fallback scope.",
    evidence_span: "trace/prosecution_rationale.md Critique 2",
    status: "proposal-only",
    requires_practitioner_approval: true,
    human_adopted: false,
  });
  let result = validateReport(report, { kind: "examiner_adversary" });
  assert.equal(result.ok, true, JSON.stringify(result.errors));

  report.edit_mode = "pro_se_summary";
  result = validateReport(report, { kind: "examiner_adversary" });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.path === "proposed_amendments"));

  report.edit_mode = "none";
  report.proposed_amendments[0].human_adopted = true;
  result = validateReport(report, { kind: "examiner_adversary" });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.path === "proposed_amendments[0].human_adopted"));
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
