/**
 * Shared machine-readable report schemas for semantic APA skills.
 *
 * These are deterministic structure contracts, not legal-opinion schemas. A valid report records
 * flags, questions, evidence spans, recommendations, and human checkpoints. It never certifies
 * patentability, novelty, validity, FTO, filing readiness, or compliance.
 */

import { rulePackSummary } from "../apa-rules/rule-packs.mjs";

export const REPORT_SCHEMA_VERSION = 1;

export const SEVERITIES = ["blocking", "fix-before-filing", "warning", "info"];
export const FINDING_TYPES = ["flag", "question", "observation"];
export const LEGAL_POSTURE = "flags-not-conclusions";

export const REPORT_TYPES = {
  claims: {
    type: "claims",
    schema: "apa-claims-report-v1",
    skill: "apa-claims",
    defaultPath: "logic/claims_report.json",
    title: "Claims drafting report",
  },
  patentability: {
    type: "patentability",
    schema: "apa-patentability-report-v1",
    skill: "apa-analyze",
    defaultPath: "logic/patentability_report.json",
    title: "Patentability flags report",
  },
  disclosure_capture: {
    type: "disclosure_capture",
    schema: "apa-disclosure-session-report-v1",
    skill: "apa-disclose",
    defaultPath: "staging/disclosure_session_report.json",
    title: "Disclosure capture session report",
  },
  compile: {
    type: "compile",
    schema: "apa-compile-report-v1",
    skill: "apa-compile",
    defaultPath: "staging/compile_report.json",
    title: "Compile/import report",
  },
  specification: {
    type: "specification",
    schema: "apa-specification-report-v1",
    skill: "apa-spec",
    defaultPath: "src/specification_report.json",
    title: "Specification drafting report",
  },
  examiner_adversary: {
    type: "examiner_adversary",
    schema: "apa-examiner-adversary-report-v1",
    skill: "apa-examiner",
    defaultPath: "trace/examiner_adversary_report.json",
    title: "Examiner adversary report",
  },
  office_action: {
    type: "office_action",
    schema: "apa-office-action-report-v1",
    skill: "apa-office-action",
    defaultPath: "prosecution/office_action_report.json",
    title: "Office Action report",
  },
};

const ALIASES = {
  claim: "claims",
  claims_report: "claims",
  "claims-report": "claims",
  analyze: "patentability",
  patentability_report: "patentability",
  "patentability-report": "patentability",
  disclose: "disclosure_capture",
  disclosure: "disclosure_capture",
  disclosure_capture_report: "disclosure_capture",
  disclosure_session_report: "disclosure_capture",
  "disclosure-capture": "disclosure_capture",
  "disclosure-session-report": "disclosure_capture",
  compile_report: "compile",
  "compile-report": "compile",
  compiler: "compile",
  spec: "specification",
  specification_report: "specification",
  "specification-report": "specification",
  examiner: "examiner_adversary",
  examiner_adversary_report: "examiner_adversary",
  "examiner-adversary": "examiner_adversary",
  "examiner-adversary-report": "examiner_adversary",
  oa: "office_action",
  office: "office_action",
  "office-action": "office_action",
  office_action_report: "office_action",
  "office-action-report": "office_action",
};

export function normalizeReportType(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  return REPORT_TYPES[raw] ? raw : (ALIASES[raw] || "");
}

export function reportTypeFromSchema(schema) {
  return Object.values(REPORT_TYPES).find((cfg) => cfg.schema === schema)?.type || "";
}

export function expectedReportPath(type) {
  const cfg = REPORT_TYPES[normalizeReportType(type)];
  if (!cfg) throw new Error(`unknown report type: ${type}`);
  return cfg.defaultPath;
}

function commonBase(type, { matter = "", inputs = [], outputs = [] } = {}) {
  const cfg = REPORT_TYPES[normalizeReportType(type)];
  if (!cfg) throw new Error(`unknown report type: ${type}`);
  return {
    schema: cfg.schema,
    schema_version: REPORT_SCHEMA_VERSION,
    report_type: cfg.type,
    skill: cfg.skill,
    title: cfg.title,
    matter: String(matter || ""),
    generated_at: new Date().toISOString(),
    rule_pack: rulePackSummary(),
    legal_posture: LEGAL_POSTURE,
    inputs,
    outputs,
    human_checkpoints: [
      {
        id: `${cfg.type}-human-review`,
        required: true,
        satisfied: false,
      },
    ],
    findings: [],
    questions_for_attorney: [],
    questions_for_inventor: [],
    next_allowed_steps: [],
  };
}

export function defaultReportFor(type, opts = {}) {
  const normalized = normalizeReportType(type);
  const report = commonBase(normalized, opts);

  if (normalized === "claims") {
    return {
      ...report,
      user_role: "unknown",
      possible_organization_options: [],
      claims_reviewed: [],
      claim_changes: [],
      scope_decisions: [],
      multiple_dependent_claim_policy: "unsupported-unless-deliberately-implemented",
      unsupported_features: [],
    };
  }

  if (normalized === "patentability") {
    return {
      ...report,
      claim_charts: [],
      obviousness_combinations: [],
      statutory_flags: {
        "101": [],
        "102": [],
        "103": [],
        "112": [],
      },
      search_completeness: "not_asserted",
    };
  }

  if (normalized === "disclosure_capture") {
    return {
      ...report,
      session: {
        source: "conversation",
        started_at: "",
        ended_at: "",
      },
      promoted_observations: [],
      bar_date_facts: [],
      limitation_inventorship: [],
      raw_fact_boundaries: [],
      relaxed_import_notes: [],
    };
  }

  if (normalized === "compile") {
    return {
      ...report,
      documents: [],
      claim_extractions: [],
      provenance_labels: [],
      ocr_text_quality_flags: [],
      unrecoverable_provenance: [],
      conception_reconstruction_policy: "not-recoverable-unless-source-evidenced",
    };
  }

  if (normalized === "specification") {
    return {
      ...report,
      conditional_sections: [],
      spec_paragraphs: [],
      unsupported_domains: [],
      source_span_policy: "warning",
    };
  }

  if (normalized === "examiner_adversary") {
    return {
      ...report,
      critiques: [],
      loop_count: 0,
      max_examiner_loops: 2,
      edit_mode: "none",
      dead_end_arguments: [],
      proposed_amendments: [],
    };
  }

  if (normalized === "office_action") {
    return {
      ...report,
      office_action: {
        source_file: "",
        oa_number: "",
        rejection_count: 0,
      },
      response_mode: "summary_only",
      authoritative_deadline: false,
      deadline_estimate: null,
      deadline_support: {
        action_type: "unknown",
        supported: false,
        basis: "not computed",
      },
    };
  }

  throw new Error(`unknown report type: ${type}`);
}
