/**
 * Compare a human-transcribed filing receipt with the local matter manifest.
 *
 * This is a discrepancy detector, not a legal conclusion. Values remain matter-local and the output
 * never claims that a discrepancy was corrected.
 */

import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parseFrontmatter } from "../apa-core/apa-parse.mjs";

export const FILING_RECEIPT_INPUT_SCHEMA = "apa-filing-receipt-input-v1";
export const FILING_RECEIPT_AUDIT_SCHEMA = "apa-filing-receipt-audit-v1";

const collapse = (value) => String(value == null ? "" : value).replace(/\s+/g, " ").trim();
const normalizeText = (value) => collapse(value).toLocaleLowerCase("en-US");
const normalizeApplicationNumber = (value) => collapse(value).replace(/[^\d]/g, "");
const normalizeDate = (value) => collapse(value);
const normalizeEntity = (value) => normalizeText(value).replace(/\s+entity$/, "");

function inventorNames(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => normalizeText(typeof entry === "string" ? entry : entry?.name))
    .filter(Boolean);
}

function relatedNumbers(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => normalizeApplicationNumber(typeof entry === "string"
      ? entry
      : entry?.application_number || entry?.application_no || entry?.number))
    .filter(Boolean);
}

function compareField(discrepancies, {
  code,
  field,
  expected,
  observed,
  normalize = normalizeText,
  adsControlled = false,
}) {
  const expectedNorm = normalize(expected);
  const observedNorm = normalize(observed);
  if (!expectedNorm && !observedNorm) return;
  if (expectedNorm === observedNorm) return;
  discrepancies.push({
    code,
    field,
    expected,
    observed,
    ads_controlled: adsControlled,
    severity: "human-review-required",
    status: "unresolved",
  });
}

export function validateFilingReceiptInput(receipt) {
  const errors = [];
  const push = (code, path, message) => errors.push({ code, path, message });
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) {
    push("RECEIPT_INVALID", "$", "receipt must be an object");
    return { ok: false, errors };
  }
  if (receipt.schema !== FILING_RECEIPT_INPUT_SCHEMA) {
    push("SCHEMA_UNSUPPORTED", "schema", `expected ${FILING_RECEIPT_INPUT_SCHEMA}`);
  }
  if (!/^[0-9a-f]{64}$/.test(String(receipt.source?.sha256 || ""))) {
    push("SOURCE_HASH_INVALID", "source.sha256", "source SHA-256 is required");
  }
  if (!receipt.source?.filename || basename(receipt.source.filename) !== receipt.source.filename) {
    push("SOURCE_FILENAME_INVALID", "source.filename", "source filename must be a basename without a path");
  }
  if (receipt.source?.source_text_stored !== false) {
    push("SOURCE_TEXT_STORAGE_FORBIDDEN", "source.source_text_stored", "must remain false");
  }
  if (receipt.human_verified !== true) {
    push("RECEIPT_UNVERIFIED", "human_verified", "human transcription review is required");
  }
  if (!receipt.fields || typeof receipt.fields !== "object" || Array.isArray(receipt.fields)) {
    push("RECEIPT_FIELDS_MISSING", "fields", "receipt fields are required");
  }
  if (receipt.authoritative_legal_conclusion !== false) {
    push("LEGAL_CONCLUSION_FORBIDDEN", "authoritative_legal_conclusion", "must remain false");
  }
  return { ok: errors.length === 0, errors };
}

export function auditFilingReceipt(matterDir, receipt, {
  generatedAt = new Date().toISOString(),
} = {}) {
  const check = validateFilingReceiptInput(receipt);
  if (!check.ok) {
    const error = new Error(`filing receipt input is not ready: ${check.errors.map((item) => item.code).join(", ")}`);
    error.code = "FILING_RECEIPT_NOT_READY";
    error.findings = check.errors;
    throw error;
  }
  const manifest = parseFrontmatter(readFileSync(join(matterDir, "PATENT.md"), "utf8"));
  const fields = receipt.fields;
  const discrepancies = [];

  compareField(discrepancies, {
    code: "APPLICATION_TYPE_DIFFERS",
    field: "application_type",
    expected: manifest.application_type,
    observed: fields.application_type,
  });
  compareField(discrepancies, {
    code: "TITLE_DIFFERS",
    field: "title",
    expected: manifest.title,
    observed: fields.title,
    adsControlled: true,
  });
  compareField(discrepancies, {
    code: "FILING_DATE_DIFFERS",
    field: "filing_date",
    expected: manifest.filing_date,
    observed: fields.filing_date,
    normalize: normalizeDate,
  });
  compareField(discrepancies, {
    code: "APPLICATION_NUMBER_DIFFERS",
    field: "application_number",
    expected: manifest.application_no,
    observed: fields.application_number,
    normalize: normalizeApplicationNumber,
  });
  compareField(discrepancies, {
    code: "APPLICANT_DIFFERS",
    field: "applicant",
    expected: manifest.applicant
      || (manifest.assignee && !/^unassigned$/i.test(String(manifest.assignee))
        ? manifest.assignee
        : inventorNames(manifest.inventors).join("|")),
    observed: fields.applicant,
    adsControlled: true,
  });
  compareField(discrepancies, {
    code: "ENTITY_STATUS_DIFFERS",
    field: "entity_status",
    expected: manifest.entity_status,
    observed: fields.entity_status,
    normalize: normalizeEntity,
  });
  compareField(discrepancies, {
    code: "CORRESPONDENCE_DATA_DIFFERS",
    field: "correspondence",
    expected: manifest.correspondence_address || manifest.customer_number || "",
    observed: fields.correspondence || fields.customer_number || "",
    adsControlled: true,
  });

  const expectedInventors = inventorNames(manifest.inventors);
  const observedInventors = inventorNames(fields.inventors);
  if (JSON.stringify([...expectedInventors].sort()) !== JSON.stringify([...observedInventors].sort())) {
    discrepancies.push({
      code: "INVENTORS_DIFFER",
      field: "inventors",
      expected: (manifest.inventors || []).map((entry) => entry?.name || entry),
      observed: (fields.inventors || []).map((entry) => entry?.name || entry),
      ads_controlled: true,
      severity: "human-review-required",
      status: "unresolved",
    });
  }

  const expectedRelated = relatedNumbers(manifest.related_applications);
  const observedRelated = relatedNumbers(fields.related_applications);
  if (JSON.stringify(expectedRelated) !== JSON.stringify(observedRelated)) {
    discrepancies.push({
      code: expectedRelated.slice().sort().join("|") === observedRelated.slice().sort().join("|")
        ? "RELATED_APPLICATION_ORDER_DIFFERS"
        : "RELATED_APPLICATIONS_DIFFER",
      field: "related_applications",
      expected: manifest.related_applications || [],
      observed: fields.related_applications || [],
      ads_controlled: true,
      severity: "blocking-priority-review",
      status: "unresolved",
    });
  }

  const correctedAdsReview = discrepancies.some((item) => item.ads_controlled);
  return {
    schema: FILING_RECEIPT_AUDIT_SCHEMA,
    generated_at: generatedAt,
    source: {
      filename: receipt.source.filename || "",
      sha256: receipt.source.sha256,
      source_text_stored: false,
    },
    status: discrepancies.length ? "DISCREPANCIES-HUMAN-REVIEW-REQUIRED" : "MATCHED-HUMAN-CONFIRMATION-REQUIRED",
    discrepancy_count: discrepancies.length,
    discrepancies,
    corrected_ads_review_required: correctedAdsReview,
    priority_chain_review_required: discrepancies.some((item) => item.field === "related_applications"),
    completion: {
      discrepancies_resolved: false,
      corrected_ads_review_completed: false,
      priority_chain_review_completed: false,
      patent_center_record_rechecked: false,
    },
    boundaries: {
      legal_conclusion: false,
      correction_selected_by_apa: false,
      corrected_ads_signed_by_apa: false,
      patent_center_submission_by_apa: false,
    },
  };
}

export function validateFilingReceiptAudit(audit) {
  const errors = [];
  const push = (code, path, message) => errors.push({ code, path, message });
  if (audit?.schema !== FILING_RECEIPT_AUDIT_SCHEMA) {
    push("SCHEMA_UNSUPPORTED", "schema", `expected ${FILING_RECEIPT_AUDIT_SCHEMA}`);
  }
  if (!Array.isArray(audit?.discrepancies)) {
    push("DISCREPANCIES_REQUIRED", "discrepancies", "discrepancies must be an array");
  } else if (audit.discrepancy_count !== audit.discrepancies.length) {
    push("DISCREPANCY_COUNT_MISMATCH", "discrepancy_count", "must match discrepancies.length");
  }
  for (const [key, value] of Object.entries(audit?.boundaries || {})) {
    if (value !== false) push("SUBMIT_BOUNDARY_VIOLATION", `boundaries.${key}`, "must remain false");
  }
  return { ok: errors.length === 0, errors };
}
