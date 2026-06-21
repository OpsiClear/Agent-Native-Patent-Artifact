import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadYaml } from "../../lib/apa-parse.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DEFAULT_SCENARIOS = "benchmarks/fixtures/software-patent-skill-sim/scenarios.json";
const SKILL_TMPL = "skills/software-patent-review/SKILL.md.tmpl";
const SKILL_GUIDE = "skills/software-patent-review/references/software-patent-review.md";
const SKILL_YAML = "skills/software-patent-review/skill.yaml";

function readJson(root, rel) {
  return JSON.parse(readFileSync(resolve(root, rel), "utf8"));
}

function readText(root, rel) {
  return readFileSync(resolve(root, rel), "utf8");
}

function corpusFor(root) {
  return [
    readText(root, SKILL_TMPL),
    readText(root, SKILL_GUIDE),
  ].join("\n").toLowerCase();
}

function asSet(items) {
  return new Set(Array.isArray(items) ? items : []);
}

function includesAll(actual, expected) {
  const have = asSet(actual);
  return (expected || []).filter((v) => !have.has(v));
}

function claimStatus({ requested, support, supportState, type }) {
  if (!requested.has(type)) return "unsupported";
  if (type === "non_transitory_crm" && !support.non_transitory_storage) return "unsupported";
  return supportState === "supported-now" ? "proposed" : "unsupported";
}

export function simulateSoftwarePatentScenario(scenario) {
  const traits = asSet(scenario.traits);
  const support = scenario.support || {};
  const requested = asSet(scenario.requested_claim_types);
  const eligibility = new Set();
  const supportRisks = new Set();

  if (traits.has("business_automation") || traits.has("math_only") || traits.has("missing_practical_application")) {
    eligibility.add("abstract-idea");
  }
  if (traits.has("generic_computer")) eligibility.add("generic-computer");
  if (traits.has("math_only")) eligibility.add("math-only");
  if (traits.has("field_of_use")) eligibility.add("field-of-use");
  if (traits.has("extra_solution_activity")) eligibility.add("extra-solution-activity");

  if (!support.algorithm || traits.has("missing_model_details")) supportRisks.add("missing-algorithm");
  if (traits.has("result_only") || !support.mechanism) supportRisks.add("overbroad-function");
  if (traits.has("nonce_terms")) supportRisks.add("nonce-term");
  if (requested.has("non_transitory_crm") && !support.non_transitory_storage) supportRisks.add("crm-transitory-risk");

  const supportState =
    support.mechanism && support.algorithm && support.technical_effect &&
    (!requested.has("non_transitory_crm") || support.non_transitory_storage)
      ? "supported-now"
      : "needs-inventor-confirmation";

  return {
    schema: "apa-software-patent-report-v1",
    legal_posture: "flags-not-conclusions",
    scenario_id: scenario.id,
    support_state: {
      overall: supportState,
      notes: supportState === "supported-now"
        ? ["source-backed technical mechanism and technical effect are present in the scenario"]
        : ["do not draft supported claim scope until inventor/practitioner confirms missing technical support"],
    },
    eligibility_flags: [...eligibility].map((risk) => ({
      claim: "CLM01",
      risk,
      evidence_span: `scenario:${scenario.id}`,
      recommended_next_step: "tie the claim to a concrete technical mechanism and practical application",
    })),
    support_flags: [...supportRisks].map((risk) => ({
      limitation: "CLM01.LIM01",
      risk,
      evidence_span: `scenario:${scenario.id}`,
      recommended_next_step: "add source-backed algorithm, data-structure, storage, or implementation support before adoption",
    })),
    claim_family: {
      method: claimStatus({ requested, support, supportState, type: "method" }),
      system: claimStatus({ requested, support, supportState, type: "system" }),
      non_transitory_crm: claimStatus({ requested, support, supportState, type: "non_transitory_crm" }),
    },
    human_checkpoints: [
      { id: "practitioner-eligibility-review", required: true, satisfied: false },
    ],
    proposed_canonical_changes: [],
  };
}

function checkScenario(root, corpus, scenario) {
  const report = simulateSoftwarePatentScenario(scenario);
  const expected = scenario.expected || {};
  const findings = [];
  const missingEligibility = includesAll(report.eligibility_flags.map((f) => f.risk), expected.eligibility_risks);
  const missingSupport = includesAll(report.support_flags.map((f) => f.risk), expected.support_risks);

  if (report.support_state.overall !== expected.support_state) {
    findings.push({
      severity: "blocking",
      path: `${scenario.id}.support_state`,
      message: `expected support_state ${expected.support_state}, got ${report.support_state.overall}`,
    });
  }
  for (const risk of missingEligibility) {
    findings.push({
      severity: "blocking",
      path: `${scenario.id}.eligibility_flags`,
      message: `missing expected eligibility risk '${risk}'`,
    });
  }
  for (const risk of missingSupport) {
    findings.push({
      severity: "blocking",
      path: `${scenario.id}.support_flags`,
      message: `missing expected support risk '${risk}'`,
    });
  }
  for (const [type, status] of Object.entries(expected.claim_family || {})) {
    if (report.claim_family[type] !== status) {
      findings.push({
        severity: "blocking",
        path: `${scenario.id}.claim_family.${type}`,
        message: `expected ${type} ${status}, got ${report.claim_family[type]}`,
      });
    }
  }
  for (const term of expected.required_guide_terms || []) {
    if (!corpus.includes(String(term).toLowerCase())) {
      findings.push({
        severity: "blocking",
        path: `${scenario.id}.required_guide_terms`,
        message: `software patent skill guide is missing required simulation term '${term}'`,
      });
    }
  }

  return {
    id: scenario.id,
    status: findings.length ? "fail" : "pass",
    report,
    findings,
  };
}

function checkDomainOutputContract(root) {
  const skill = loadYaml(readText(root, SKILL_YAML));
  const findings = [];
  for (const output of skill.outputs || []) {
    if (!String(output).startsWith("domain/software/")) {
      findings.push({
        severity: "blocking",
        path: "skills/software-patent-review/skill.yaml",
        message: `domain skill output must stay under domain/software/: ${output}`,
      });
    }
  }
  const corpus = corpusFor(root);
  if (corpus.includes("logic/software_patent_report.json")) {
    findings.push({
      severity: "blocking",
      path: "skills/software-patent-review",
      message: "software patent skill must emit domain/software/software_patent_report.json, not logic/software_patent_report.json",
    });
  }
  return findings;
}

export function runSoftwarePatentSimulation({ root = ROOT, scenarios = DEFAULT_SCENARIOS } = {}) {
  const fixture = readJson(root, scenarios);
  const corpus = corpusFor(root);
  const results = (fixture.scenarios || []).map((scenario) => checkScenario(root, corpus, scenario));
  const contractFindings = checkDomainOutputContract(root);
  const findings = [...contractFindings, ...results.flatMap((r) => r.findings)];
  const passed = results.filter((r) => r.status === "pass").length;
  const total = results.length;
  return {
    schema: "apa-software-patent-simulation-results-v1",
    source_class: fixture.source_class || "synthetic_software_patent",
    status: findings.length ? "fail" : "pass",
    metrics: {
      scenarios: total,
      scenario_passes: passed,
      scenario_failures: total - passed,
      score: total ? Number((passed / total).toFixed(4)) : 0,
      guide_terms_checked: results.reduce((n, r, idx) => n + ((fixture.scenarios[idx]?.expected?.required_guide_terms || []).length), 0),
      domain_output_contract_ok: contractFindings.length === 0,
    },
    findings,
    scenarios: results,
  };
}
