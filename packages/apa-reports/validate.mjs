/**
 * Deterministic validator for APA semantic report JSON.
 */

import {
  FINDING_TYPES,
  LEGAL_POSTURE,
  REPORT_TYPES,
  SEVERITIES,
  normalizeReportType,
  reportTypeFromSchema,
} from "./schemas.mjs";

const FORBIDDEN_TOP_LEVEL = [
  "conclusions",
  "patentability_conclusion",
  "novelty_conclusion",
  "nonobviousness_conclusion",
  "validity_conclusion",
  "infringement_conclusion",
  "fto_clearance",
  "filing_ready",
  "search_complete",
];

function isObject(v) {
  return v && typeof v === "object" && !Array.isArray(v);
}

function pathOf(path, key) {
  return path ? `${path}.${key}` : key;
}

function push(errors, path, message) {
  errors.push({ path, message });
}

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

function validateFileRecord(errors, path, record) {
  if (!isObject(record)) return push(errors, path, "must be an object");
  if (!record.path || typeof record.path !== "string") push(errors, pathOf(path, "path"), "must be a string");
  if (record.sha256 != null && !/^[0-9a-f]{64}$/i.test(String(record.sha256))) {
    push(errors, pathOf(path, "sha256"), "must be a 64-character hex SHA-256 when present");
  }
}

function validateCheckpoint(errors, path, cp) {
  if (!isObject(cp)) return push(errors, path, "must be an object");
  if (!cp.id || typeof cp.id !== "string") push(errors, pathOf(path, "id"), "must be a string");
  if (typeof cp.required !== "boolean") push(errors, pathOf(path, "required"), "must be boolean");
  if (typeof cp.satisfied !== "boolean") push(errors, pathOf(path, "satisfied"), "must be boolean");
}

function validateFinding(errors, path, f) {
  if (!isObject(f)) return push(errors, path, "must be an object");
  if (!FINDING_TYPES.includes(f.finding_type)) {
    push(errors, pathOf(path, "finding_type"), `must be ${FINDING_TYPES.join("|")}`);
  }
  if (!SEVERITIES.includes(f.severity)) {
    push(errors, pathOf(path, "severity"), `must be ${SEVERITIES.join("|")}`);
  }
  if (!f.rule_anchor || typeof f.rule_anchor !== "string") {
    push(errors, pathOf(path, "rule_anchor"), "must be a non-empty string");
  }
  if (!f.evidence_span || typeof f.evidence_span !== "string") {
    push(errors, pathOf(path, "evidence_span"), "must be a non-empty string");
  }
  if (!f.recommendation || typeof f.recommendation !== "string") {
    push(errors, pathOf(path, "recommendation"), "must be a non-empty string");
  }
  if ("conclusion" in f) push(errors, pathOf(path, "conclusion"), "must not appear in findings");
}

function validateCommon(errors, report, cfg) {
  if (report.schema !== cfg.schema) push(errors, "schema", `must be ${cfg.schema}`);
  if (report.report_type !== cfg.type) push(errors, "report_type", `must be ${cfg.type}`);
  if (report.skill !== cfg.skill) push(errors, "skill", `must be ${cfg.skill}`);
  if (!report.matter || typeof report.matter !== "string") push(errors, "matter", "must be a non-empty string");
  if (report.legal_posture !== LEGAL_POSTURE) push(errors, "legal_posture", `must be ${LEGAL_POSTURE}`);
  if (report.legal_conclusion != null && report.legal_conclusion !== false) {
    push(errors, "legal_conclusion", "must be false when present");
  }
  for (const key of FORBIDDEN_TOP_LEVEL) {
    if (Object.prototype.hasOwnProperty.call(report, key)) push(errors, key, "must not appear in an APA report");
  }

  if (!Array.isArray(report.inputs)) push(errors, "inputs", "must be an array");
  else report.inputs.forEach((r, i) => validateFileRecord(errors, `inputs[${i}]`, r));

  if (!Array.isArray(report.outputs)) push(errors, "outputs", "must be an array");
  else report.outputs.forEach((r, i) => validateFileRecord(errors, `outputs[${i}]`, r));

  if (!Array.isArray(report.human_checkpoints)) push(errors, "human_checkpoints", "must be an array");
  else report.human_checkpoints.forEach((cp, i) => validateCheckpoint(errors, `human_checkpoints[${i}]`, cp));

  if (!Array.isArray(report.findings)) push(errors, "findings", "must be an array");
  else report.findings.forEach((f, i) => validateFinding(errors, `findings[${i}]`, f));

  for (const key of ["questions_for_attorney", "questions_for_inventor", "next_allowed_steps"]) {
    if (!Array.isArray(report[key])) push(errors, key, "must be an array");
    else asArray(report[key]).forEach((v, i) => {
      if (typeof v !== "string") push(errors, `${key}[${i}]`, "must be a string");
    });
  }
}

function validateTypeSpecific(errors, report, type) {
  if (type === "claims") {
    for (const key of ["claims_reviewed", "claim_changes", "scope_decisions"]) {
      if (!Array.isArray(report[key])) push(errors, key, "must be an array");
    }
    return;
  }

  if (type === "patentability") {
    if (!Array.isArray(report.claim_charts)) push(errors, "claim_charts", "must be an array");
    if (!isObject(report.statutory_flags)) push(errors, "statutory_flags", "must be an object");
    if (report.search_completeness !== "not_asserted") {
      push(errors, "search_completeness", "must be not_asserted");
    }
    return;
  }

  if (type === "examiner_adversary") {
    if (!Array.isArray(report.critiques)) push(errors, "critiques", "must be an array");
    if (typeof report.loop_count !== "number" || report.loop_count < 0) {
      push(errors, "loop_count", "must be a non-negative number");
    }
    if (!["none", "pro_se_summary", "practitioner-approved"].includes(report.edit_mode)) {
      push(errors, "edit_mode", "must be none|pro_se_summary|practitioner-approved");
    }
    if (report.edit_mode === "practitioner-approved") {
      const ok = asArray(report.human_checkpoints).some((cp) => cp.id === "practitioner-approval" && cp.satisfied === true);
      if (!ok) push(errors, "human_checkpoints", "practitioner-approved edit_mode requires a satisfied practitioner-approval checkpoint");
    }
    return;
  }

  if (type === "office_action") {
    if (!isObject(report.office_action)) push(errors, "office_action", "must be an object");
    if (!["summary_only", "practitioner_scaffold"].includes(report.response_mode)) {
      push(errors, "response_mode", "must be summary_only|practitioner_scaffold");
    }
    if (report.authoritative_deadline !== false) {
      push(errors, "authoritative_deadline", "must be false");
    }
  }
}

export function inferReportType(report, explicitType = "") {
  const explicit = normalizeReportType(explicitType);
  if (explicit) return explicit;
  const byType = normalizeReportType(report?.report_type);
  if (byType) return byType;
  return reportTypeFromSchema(report?.schema);
}

export function validateReport(report, { kind = "" } = {}) {
  if (!isObject(report)) {
    return { ok: false, reportType: "", errors: [{ path: "$", message: "report must be an object" }] };
  }
  const type = inferReportType(report, kind);
  const cfg = REPORT_TYPES[type];
  if (!cfg) {
    return { ok: false, reportType: "", errors: [{ path: "report_type", message: "unknown report type or schema" }] };
  }
  const errors = [];
  validateCommon(errors, report, cfg);
  validateTypeSpecific(errors, report, type);
  return { ok: errors.length === 0, reportType: type, errors };
}

export function formatErrors(errors) {
  return errors.map((e) => `${e.path}: ${e.message}`);
}

