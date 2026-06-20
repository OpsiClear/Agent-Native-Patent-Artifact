/**
 * Shared machine-readable report schemas for semantic APA skills.
 *
 * These are deterministic structure contracts, not legal-opinion schemas. A valid report records
 * flags, questions, evidence spans, recommendations, and human checkpoints. It never certifies
 * patentability, novelty, validity, FTO, filing readiness, or compliance.
 */

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
      claims_reviewed: [],
      claim_changes: [],
      scope_decisions: [],
      multiple_dependent_claim_policy: "unsupported-unless-deliberately-implemented",
    };
  }

  if (normalized === "patentability") {
    return {
      ...report,
      claim_charts: [],
      statutory_flags: {
        "101": [],
        "102": [],
        "103": [],
        "112": [],
      },
      search_completeness: "not_asserted",
    };
  }

  if (normalized === "examiner_adversary") {
    return {
      ...report,
      critiques: [],
      loop_count: 0,
      max_examiner_loops: 2,
      edit_mode: "none",
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
    };
  }

  throw new Error(`unknown report type: ${type}`);
}

