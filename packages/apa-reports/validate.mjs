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
const USER_ROLES = ["registered_practitioner", "pro_se", "unknown"];
const SOURCE_LABELS = [
  "transcript",
  "upload",
  "inventor-confirmation",
  "attorney-note",
  "figure-reconstruction",
  "source-extracted",
  "inferred-from-document",
  "not-recoverable",
];
const ADOPTION_STATES = ["raw", "staged", "human-adopted", "not-recoverable"];
const TEXT_QUALITY = ["native-text", "ocr-high", "ocr-medium", "ocr-low", "unknown"];
const EXTRACTION_CONFIDENCE = ["high", "medium", "low", "unknown"];
const PROVENANCE_LABELS = ["source-extracted", "inferred-from-document", "not-recoverable"];
const CONDITIONAL_SECTION_STATUS = ["supported", "not_applicable", "unsupported", "human_reviewed"];

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

function validateSourceSpanRecord(errors, path, entry, { allowNotRecoverable = false } = {}) {
  if (!isObject(entry)) return push(errors, path, "must be an object");
  if (!SOURCE_LABELS.includes(entry.source)) {
    push(errors, pathOf(path, "source"), `must be ${SOURCE_LABELS.join("|")}`);
  }
  if (entry.source === "not-recoverable" && allowNotRecoverable) return;
  if (!entry.source_span || typeof entry.source_span !== "string") {
    push(errors, pathOf(path, "source_span"), "must be a non-empty string");
  }
  if (!/^[0-9a-f]{64}$/i.test(String(entry.source_sha256 || ""))) {
    push(errors, pathOf(path, "source_sha256"), "must be a 64-character SHA-256 hex digest");
  }
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
    if (report.user_role !== undefined && !USER_ROLES.includes(report.user_role)) {
      push(errors, "user_role", `must be ${USER_ROLES.join("|")}`);
    }
    if (report.possible_organization_options !== undefined && !Array.isArray(report.possible_organization_options)) {
      push(errors, "possible_organization_options", "must be an array");
    }
    for (const key of ["claims_reviewed", "claim_changes", "scope_decisions", "unsupported_features"]) {
      if (!Array.isArray(report[key])) push(errors, key, "must be an array");
    }
    if (report.user_role === "pro_se") {
      if (asArray(report.claim_changes).length > 0) {
        push(errors, "claim_changes", "must be empty for pro_se reports; provide neutral options/questions only");
      }
      if (asArray(report.scope_decisions).length > 0) {
        push(errors, "scope_decisions", "must be empty for pro_se reports; do not select claim scope");
      }
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

  if (type === "disclosure_capture") {
    if (!isObject(report.session)) push(errors, "session", "must be an object");
    if (!Array.isArray(report.promoted_observations)) push(errors, "promoted_observations", "must be an array");
    else report.promoted_observations.forEach((entry, i) => validatePromotedObservation(errors, `promoted_observations[${i}]`, entry));
    if (!Array.isArray(report.bar_date_facts)) push(errors, "bar_date_facts", "must be an array");
    else report.bar_date_facts.forEach((entry, i) => validateBarDateFact(errors, `bar_date_facts[${i}]`, entry));
    if (!Array.isArray(report.limitation_inventorship)) push(errors, "limitation_inventorship", "must be an array");
    else report.limitation_inventorship.forEach((entry, i) => validateLimitationInventorship(errors, `limitation_inventorship[${i}]`, entry));
    for (const key of ["raw_fact_boundaries", "relaxed_import_notes"]) {
      if (!Array.isArray(report[key])) push(errors, key, "must be an array");
    }
    return;
  }

  if (type === "compile") {
    if (!Array.isArray(report.documents)) push(errors, "documents", "must be an array");
    else report.documents.forEach((entry, i) => validateCompileDocument(errors, `documents[${i}]`, entry));
    if (!Array.isArray(report.claim_extractions)) push(errors, "claim_extractions", "must be an array");
    else report.claim_extractions.forEach((entry, i) => validateClaimExtraction(errors, `claim_extractions[${i}]`, entry));
    if (!Array.isArray(report.provenance_labels)) push(errors, "provenance_labels", "must be an array");
    else report.provenance_labels.forEach((entry, i) => validateProvenanceLabel(errors, `provenance_labels[${i}]`, entry));
    for (const key of ["ocr_text_quality_flags", "unrecoverable_provenance"]) {
      if (!Array.isArray(report[key])) push(errors, key, "must be an array");
    }
    if (report.conception_reconstruction_policy !== "not-recoverable-unless-source-evidenced") {
      push(errors, "conception_reconstruction_policy", "must be not-recoverable-unless-source-evidenced");
    }
    return;
  }

  if (type === "specification") {
    if (!Array.isArray(report.conditional_sections)) push(errors, "conditional_sections", "must be an array");
    else report.conditional_sections.forEach((entry, i) => validateConditionalSection(errors, `conditional_sections[${i}]`, entry));
    if (!Array.isArray(report.spec_paragraphs)) push(errors, "spec_paragraphs", "must be an array");
    else report.spec_paragraphs.forEach((entry, i) => validateSpecParagraph(errors, `spec_paragraphs[${i}]`, entry));
    if (!Array.isArray(report.unsupported_domains)) push(errors, "unsupported_domains", "must be an array");
    if (!["warning", "strict", "relaxed"].includes(report.source_span_policy)) {
      push(errors, "source_span_policy", "must be warning|strict|relaxed");
    }
    return;
  }

  if (type === "examiner_adversary") {
    if (!Array.isArray(report.critiques)) push(errors, "critiques", "must be an array");
    if (typeof report.loop_count !== "number" || report.loop_count < 0) {
      push(errors, "loop_count", "must be a non-negative number");
    }
    if (typeof report.max_examiner_loops !== "number" || report.max_examiner_loops < 0) {
      push(errors, "max_examiner_loops", "must be a non-negative number");
    }
    if (
      typeof report.loop_count === "number" &&
      typeof report.max_examiner_loops === "number" &&
      report.loop_count > report.max_examiner_loops
    ) {
      const ok = asArray(report.human_checkpoints).some((cp) => cp.id === "examiner-loop-override" && cp.satisfied === true);
      if (!ok) push(errors, "loop_count", "must not exceed max_examiner_loops without a satisfied examiner-loop-override checkpoint");
    }
    if (!["none", "pro_se_summary", "practitioner-approved"].includes(report.edit_mode)) {
      push(errors, "edit_mode", "must be none|pro_se_summary|practitioner-approved");
    }
    if (!Array.isArray(report.dead_end_arguments)) push(errors, "dead_end_arguments", "must be an array");
    else report.dead_end_arguments.forEach((entry, i) => validateDeadEndArgument(errors, `dead_end_arguments[${i}]`, entry));
    if (!Array.isArray(report.proposed_amendments)) push(errors, "proposed_amendments", "must be an array");
    else report.proposed_amendments.forEach((entry, i) => validateProposedAmendment(errors, `proposed_amendments[${i}]`, entry));
    if (report.edit_mode === "pro_se_summary" && asArray(report.proposed_amendments).length > 0) {
      push(errors, "proposed_amendments", "must be empty in pro_se_summary mode; provide neutral issues/questions only");
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

function validatePromotedObservation(errors, path, entry) {
  validateSourceSpanRecord(errors, path, entry);
  if (!["claim", "embodiment", "spec", "term", "prior-art", "bar-date"].includes(entry.target_artifact)) {
    push(errors, pathOf(path, "target_artifact"), "must be claim|embodiment|spec|term|prior-art|bar-date");
  }
  if (!ADOPTION_STATES.includes(entry.adoption_state)) {
    push(errors, pathOf(path, "adoption_state"), `must be ${ADOPTION_STATES.join("|")}`);
  }
}

function validateBarDateFact(errors, path, entry) {
  validateSourceSpanRecord(errors, path, entry);
  for (const key of ["fact_type", "date", "speaker", "trace_id"]) {
    if (!entry[key] || typeof entry[key] !== "string") push(errors, pathOf(path, key), "must be a non-empty string");
  }
}

function validateLimitationInventorship(errors, path, entry) {
  validateSourceSpanRecord(errors, path, entry);
  if (!entry.limitation || typeof entry.limitation !== "string") push(errors, pathOf(path, "limitation"), "must be a non-empty string");
  if (!Array.isArray(entry.inventors) || entry.inventors.length === 0) {
    push(errors, pathOf(path, "inventors"), "must be a non-empty array");
  }
}

function validateCompileDocument(errors, path, entry) {
  if (!isObject(entry)) return push(errors, path, "must be an object");
  for (const key of ["path", "source_type"]) {
    if (!entry[key] || typeof entry[key] !== "string") push(errors, pathOf(path, key), "must be a non-empty string");
  }
  if (!TEXT_QUALITY.includes(entry.text_quality)) {
    push(errors, pathOf(path, "text_quality"), `must be ${TEXT_QUALITY.join("|")}`);
  }
  if (entry.source_sha256 != null && !/^[0-9a-f]{64}$/i.test(String(entry.source_sha256))) {
    push(errors, pathOf(path, "source_sha256"), "must be a 64-character SHA-256 hex digest when present");
  }
}

function validateClaimExtraction(errors, path, entry) {
  if (!isObject(entry)) return push(errors, path, "must be an object");
  for (const key of ["claim", "original_number", "source_span"]) {
    if (!entry[key] || typeof entry[key] !== "string") push(errors, pathOf(path, key), "must be a non-empty string");
  }
  if (!EXTRACTION_CONFIDENCE.includes(entry.extraction_confidence)) {
    push(errors, pathOf(path, "extraction_confidence"), `must be ${EXTRACTION_CONFIDENCE.join("|")}`);
  }
  if (!TEXT_QUALITY.includes(entry.text_quality)) {
    push(errors, pathOf(path, "text_quality"), `must be ${TEXT_QUALITY.join("|")}`);
  }
}

function validateProvenanceLabel(errors, path, entry) {
  if (!isObject(entry)) return push(errors, path, "must be an object");
  if (!entry.artifact || typeof entry.artifact !== "string") push(errors, pathOf(path, "artifact"), "must be a non-empty string");
  if (!PROVENANCE_LABELS.includes(entry.label)) push(errors, pathOf(path, "label"), `must be ${PROVENANCE_LABELS.join("|")}`);
  if (entry.label === "inferred-from-document" && entry.conception_decision === true) {
    push(errors, pathOf(path, "conception_decision"), "inferred public-document facts must not be upgraded to conception decisions");
  }
}

function validateConditionalSection(errors, path, entry) {
  if (!isObject(entry)) return push(errors, path, "must be an object");
  if (!entry.section || typeof entry.section !== "string") push(errors, pathOf(path, "section"), "must be a non-empty string");
  if (!CONDITIONAL_SECTION_STATUS.includes(entry.status)) {
    push(errors, pathOf(path, "status"), `must be ${CONDITIONAL_SECTION_STATUS.join("|")}`);
  }
  if (!entry.basis || typeof entry.basis !== "string") push(errors, pathOf(path, "basis"), "must be a non-empty string");
}

function validateSpecParagraph(errors, path, entry) {
  validateSourceSpanRecord(errors, path, entry, { allowNotRecoverable: true });
  if (!entry.spec_id || typeof entry.spec_id !== "string") push(errors, pathOf(path, "spec_id"), "must be a non-empty string");
  if (!["transcribed", "reconstructed", "attorney-authored", "human-adopted", "not-recoverable"].includes(entry.grounding)) {
    push(errors, pathOf(path, "grounding"), "must be transcribed|reconstructed|attorney-authored|human-adopted|not-recoverable");
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

function validateDeadEndArgument(errors, path, entry) {
  if (!isObject(entry)) return push(errors, path, "must be an object");
  for (const key of ["argument", "reason", "evidence_span"]) {
    if (!entry[key] || typeof entry[key] !== "string") {
      push(errors, pathOf(path, key), "must be a non-empty string");
    }
  }
  if (!Array.isArray(entry.affected_claims) || entry.affected_claims.length === 0) {
    push(errors, pathOf(path, "affected_claims"), "must be a non-empty array");
  } else {
    entry.affected_claims.forEach((claim, i) => {
      if (!claim || typeof claim !== "string") push(errors, `${path}.affected_claims[${i}]`, "must be a non-empty string");
    });
  }
  if (entry.do_not_reuse !== true) {
    push(errors, pathOf(path, "do_not_reuse"), "must be true so later prosecution work does not reuse the argument");
  }
}

function validateProposedAmendment(errors, path, entry) {
  if (!isObject(entry)) return push(errors, path, "must be an object");
  for (const key of ["claim", "proposal", "rationale", "evidence_span"]) {
    if (!entry[key] || typeof entry[key] !== "string") {
      push(errors, pathOf(path, key), "must be a non-empty string");
    }
  }
  if (entry.status !== "proposal-only") {
    push(errors, pathOf(path, "status"), "must be proposal-only");
  }
  if (entry.requires_practitioner_approval !== true) {
    push(errors, pathOf(path, "requires_practitioner_approval"), "must be true");
  }
  if (entry.human_adopted !== false) {
    push(errors, pathOf(path, "human_adopted"), "must be false until separately adopted through the human review process");
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
