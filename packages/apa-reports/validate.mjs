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

const TEACHING_STATUS = ["yes", "partial", "no", "unknown"];
const CONFIDENCE = ["high", "medium", "low", "unknown"];
const RATIONALE_SOURCES = ["record-evidence", "common-sense", "design-need", "market-pressure", "other"];

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

function validateRulePack(errors, path, rulePack) {
  if (!isObject(rulePack)) return push(errors, path, "must be an object");
  for (const key of ["id", "jurisdiction", "effective_date", "status", "source"]) {
    if (!rulePack[key] || typeof rulePack[key] !== "string") {
      push(errors, pathOf(path, key), "must be a non-empty string");
    }
  }
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
  validateRulePack(errors, "rule_pack", report.rule_pack);
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
    for (const key of ["claims_reviewed", "claim_changes", "scope_decisions", "unsupported_features"]) {
      if (!Array.isArray(report[key])) push(errors, key, "must be an array");
    }
    asArray(report.unsupported_features).forEach((feature, i) => validateUnsupportedFeature(errors, `unsupported_features[${i}]`, feature));
    return;
  }

  if (type === "patentability") {
    if (!Array.isArray(report.claim_charts)) push(errors, "claim_charts", "must be an array");
    else report.claim_charts.forEach((chart, i) => validateClaimChart(errors, `claim_charts[${i}]`, chart));
    if (report.obviousness_combinations !== undefined) {
      if (!Array.isArray(report.obviousness_combinations)) push(errors, "obviousness_combinations", "must be an array");
      else report.obviousness_combinations.forEach((combo, i) => validateObviousnessCombination(errors, `obviousness_combinations[${i}]`, combo));
    }
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
    validateDeadlineSupport(errors, "deadline_support", report.deadline_support);
  }
}

function validateDeadlineSupport(errors, path, support) {
  if (!isObject(support)) return push(errors, path, "must be an object");
  if (!support.action_type || typeof support.action_type !== "string") {
    push(errors, pathOf(path, "action_type"), "must be a non-empty string");
  }
  if (typeof support.supported !== "boolean") {
    push(errors, pathOf(path, "supported"), "must be boolean");
  }
  if (!support.basis || typeof support.basis !== "string") {
    push(errors, pathOf(path, "basis"), "must be a non-empty string");
  }
}

function validateClaimChart(errors, path, chart) {
  if (!isObject(chart)) return push(errors, path, "must be an object");
  if (!chart.claim || typeof chart.claim !== "string") push(errors, pathOf(path, "claim"), "must be a non-empty string");
  if (!chart.reference || typeof chart.reference !== "string") push(errors, pathOf(path, "reference"), "must be a non-empty string");
  if (!Array.isArray(chart.cells)) {
    push(errors, pathOf(path, "cells"), "must be an array");
    return;
  }
  chart.cells.forEach((cell, i) => validateChartCell(errors, `${path}.cells[${i}]`, cell));
}

function validateUnsupportedFeature(errors, path, feature) {
  if (!isObject(feature)) return push(errors, path, "must be an object");
  for (const key of ["feature", "status", "rule_anchor", "evidence_span", "recommendation"]) {
    if (!feature[key] || typeof feature[key] !== "string") {
      push(errors, pathOf(path, key), "must be a non-empty string");
    }
  }
  if ("conclusion" in feature) push(errors, pathOf(path, "conclusion"), "must not appear in unsupported feature entries");
}

function validateChartCell(errors, path, cell) {
  if (!isObject(cell)) return push(errors, path, "must be an object");
  if (!cell.limitation || typeof cell.limitation !== "string") push(errors, pathOf(path, "limitation"), "must be a non-empty string");
  if (!TEACHING_STATUS.includes(cell.appears_teaches)) {
    push(errors, pathOf(path, "appears_teaches"), `must be ${TEACHING_STATUS.join("|")}`);
  }
  if (!cell.quote || typeof cell.quote !== "string") push(errors, pathOf(path, "quote"), "must be a non-empty string");
  if (!cell.page_or_para || typeof cell.page_or_para !== "string") push(errors, pathOf(path, "page_or_para"), "must be a non-empty string");
  if (!CONFIDENCE.includes(cell.confidence)) {
    push(errors, pathOf(path, "confidence"), `must be ${CONFIDENCE.join("|")}`);
  }
  if (typeof cell.human_verified !== "boolean") push(errors, pathOf(path, "human_verified"), "must be boolean");
  if (["yes", "partial"].includes(cell.appears_teaches)) {
    if (/^\s*(not located|none|n\/a)\s*$/i.test(String(cell.quote || ""))) {
      push(errors, pathOf(path, "quote"), "yes/partial teaching cells require a real quote, not 'not located'");
    }
    if (/^\s*(not located|none|n\/a)\s*$/i.test(String(cell.page_or_para || ""))) {
      push(errors, pathOf(path, "page_or_para"), "yes/partial teaching cells require a real page/paragraph/location");
    }
  }
}

function validateObviousnessCombination(errors, path, combo) {
  if (!isObject(combo)) return push(errors, path, "must be an object");
  if (!combo.claim || typeof combo.claim !== "string") push(errors, pathOf(path, "claim"), "must be a non-empty string");
  if (!Array.isArray(combo.references) || combo.references.length < 2) {
    push(errors, pathOf(path, "references"), "must list at least two references");
  }
  if (!combo.rationale || typeof combo.rationale !== "string") push(errors, pathOf(path, "rationale"), "must be a non-empty string");
  if (!RATIONALE_SOURCES.includes(combo.rationale_source)) {
    push(errors, pathOf(path, "rationale_source"), `must be ${RATIONALE_SOURCES.join("|")}`);
  }
  if (!combo.reasonable_expectation_of_success || typeof combo.reasonable_expectation_of_success !== "string") {
    push(errors, pathOf(path, "reasonable_expectation_of_success"), "must be a non-empty string");
  }
  if (!combo.counter_teaching || typeof combo.counter_teaching !== "string") {
    push(errors, pathOf(path, "counter_teaching"), "must be a non-empty string or 'none identified'");
  }
  if (typeof combo.human_verified !== "boolean") push(errors, pathOf(path, "human_verified"), "must be boolean");
  if (combo.secondary_considerations !== undefined) {
    if (!Array.isArray(combo.secondary_considerations)) {
      push(errors, pathOf(path, "secondary_considerations"), "must be an array");
    } else {
      combo.secondary_considerations.forEach((item, i) => validateSecondaryConsideration(errors, `${path}.secondary_considerations[${i}]`, item));
    }
  }
}

function validateSecondaryConsideration(errors, path, item) {
  if (!isObject(item)) return push(errors, path, "must be an object");
  for (const key of ["type", "nexus", "evidence_span"]) {
    if (!item[key] || typeof item[key] !== "string") push(errors, pathOf(path, key), "must be a non-empty string");
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
