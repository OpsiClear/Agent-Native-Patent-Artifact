/**
 * Parse locally extracted USPTO correspondence text into a privacy-minimized record.
 *
 * The record intentionally excludes the source text and applicant/application identifiers. It stores
 * only the source filename/hash and procedural facts needed for human verification.
 */

import { createHash } from "node:crypto";
import { basename } from "node:path";
import { classifyNoticeText, noticeTypeById } from "./taxonomy.mjs";

export const CORRESPONDENCE_SCHEMA = "apa-correspondence-record-v1";

const MONTH_WORDS = Object.freeze({
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
});

const ISSUE_PATTERNS = Object.freeze([
  {
    id: "provisional-cover-sheet",
    pattern: /provisional application cover sheet (?:was|has) not (?:been )?provided|cover sheet requirement/i,
    label: "Provisional cover sheet or qualifying ADS is missing or deficient",
    rule_anchor: "37 CFR 1.51(c)",
  },
  {
    id: "ads-signature",
    pattern: /(?:application data sheet|ADS)[\s\S]{0,180}not properly signed|not properly signed[\s\S]{0,180}(?:application data sheet|ADS)/i,
    label: "Application Data Sheet signature is deficient",
    rule_anchor: "37 CFR 1.4; 37 CFR 1.76",
  },
  {
    id: "inventorship-not-established",
    pattern: /inventorship (?:has|is) not (?:been )?(?:set|established)/i,
    label: "Inventorship has not been established by the submitted paper",
    rule_anchor: "37 CFR 1.41; 37 CFR 1.76",
  },
  {
    id: "priority-claim-ineffective",
    pattern: /(?:foreign priority|domestic benefit)[\s\S]{0,180}(?:ineffective|not effective)/i,
    label: "Benefit or priority information in the deficient ADS is not effective",
    rule_anchor: "37 CFR 1.55; 37 CFR 1.78",
  },
  {
    id: "late-provisional-surcharge",
    pattern: /surcharge[\s\S]{0,120}1\.16\(g\)|surcharge[\s\S]{0,160}(?:late submission|cover sheet)/i,
    label: "Late provisional filing-fee or cover-sheet surcharge is due",
    rule_anchor: "37 CFR 1.16(g)",
  },
  {
    id: "filing-fee",
    pattern: /(?:basic )?filing fee (?:has )?not (?:been )?received/i,
    label: "Filing fee is missing or deficient",
    rule_anchor: "37 CFR 1.16",
  },
  {
    id: "oath-declaration",
    pattern: /(?:inventor'?s? )?(?:oath|declaration)[\s\S]{0,120}(?:not (?:been )?(?:submitted|received)|missing)/i,
    label: "Inventor oath or declaration is missing or deficient",
    rule_anchor: "37 CFR 1.63",
  },
  {
    id: "abstract",
    pattern: /abstract[\s\S]{0,100}(?:not (?:been )?received|missing)/i,
    label: "Abstract is missing",
    rule_anchor: "37 CFR 1.72",
  },
  {
    id: "claim",
    pattern: /(?:claim|claims)[\s\S]{0,100}(?:not (?:been )?received|missing)/i,
    label: "One or more claims are missing",
    rule_anchor: "37 CFR 1.75",
  },
]);

const normalizeWhitespace = (value) => String(value || "").replace(/\s+/g, " ").trim();
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const FORBIDDEN_EMBEDDED_KEYS = new Set([
  "source_text",
  "raw_text",
  "extracted_text",
  "notice_text",
  "full_text",
  "application_number",
  "application_no",
  "confirmation_number",
  "applicant",
  "applicants",
  "inventor",
  "inventors",
  "address",
  "correspondence_address",
  "customer_number",
  "docket",
  "matter_docket",
]);

function parseDateToIso(value) {
  const raw = String(value || "").trim();
  let match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
  if (match) return `${match[3]}-${match[1]}-${match[2]}`;
  match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  return match ? raw : null;
}

function uniqueMatches(text, pattern, transform) {
  const values = [];
  for (const match of String(text || "").matchAll(pattern)) {
    const value = transform(match);
    if (value != null && !values.includes(value)) values.push(value);
  }
  return values;
}

function extractMailingDates(text) {
  return uniqueMatches(
    text,
    /(?:date\s+mailed|mailing[_ ]date)\s*[:\-]?\s*(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})/gi,
    (match) => parseDateToIso(match[1]),
  );
}

function responseMonthToken(token) {
  const normalized = String(token || "").toLowerCase();
  return MONTH_WORDS[normalized] || Number(normalized) || null;
}

function extractResponsePeriods(text) {
  const direct = uniqueMatches(
    text,
    /(?:given|period (?:for|of) reply(?: is)?)\s+(?:a\s+period\s+of\s+)?(one|two|three|four|five|six|\d+)\s+months?/gi,
    (match) => responseMonthToken(match[1]),
  );
  const fallback = uniqueMatches(
    text,
    /\b(one|two|three|four|five|six|\d+)\s+months?\s+from\s+the\s+date\s+of\s+(?:this|the)\s+notice/gi,
    (match) => responseMonthToken(match[1]),
  );
  return [...new Set([...direct, ...fallback])];
}

function extractTotalFee(text) {
  const match = /\$\s*([\d,]+(?:\.\d{2})?)\s+(?:TOTAL\s+)?FEE\s+BALANCE\s+DUE/i.exec(text)
    || /TOTAL\s+FEE\s+BALANCE\s+DUE\s*[:\-]?\s*\$\s*([\d,]+(?:\.\d{2})?)/i.exec(text);
  if (!match) return null;
  const amount = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(amount) ? amount : null;
}

function issueRows(text) {
  return ISSUE_PATTERNS
    .filter((row) => row.pattern.test(text))
    .map((row) => ({
      id: row.id,
      label: row.label,
      rule_anchor: row.rule_anchor,
      extraction_confidence: "high",
      human_verified: false,
      resolution_status: "unresolved",
    }));
}

function safeResponseDocumentDescription(text) {
  const match = /document\s+description[\s\S]{0,120}["\u201c]([^"\u201d]+)["\u201d]/i.exec(text);
  return match ? normalizeWhitespace(match[1]) : null;
}

function embeddedPrivateFieldErrors(value, path = "$", seen = new Set()) {
  const errors = [];
  if (!value || typeof value !== "object" || seen.has(value)) return errors;
  seen.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      errors.push(...embeddedPrivateFieldErrors(value[index], `${path}[${index}]`, seen));
    }
    return errors;
  }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_EMBEDDED_KEYS.has(key.toLowerCase())) {
      errors.push({
        code: "EMBEDDED_PRIVATE_SOURCE_FIELD",
        path: path === "$" ? key : `${path}.${key}`,
        message: `field '${key}' is forbidden in the privacy-minimized correspondence record`,
      });
      continue;
    }
    errors.push(...embeddedPrivateFieldErrors(child, path === "$" ? key : `${path}.${key}`, seen));
  }
  return errors;
}

export function parseCorrespondenceText(text, {
  sourceFilename = "notice.txt",
  sourceBytes = null,
} = {}) {
  const source = sourceBytes == null ? Buffer.from(String(text || ""), "utf8") : Buffer.from(sourceBytes);
  const body = String(text || "");
  const type = classifyNoticeText(body);
  const mailingDates = extractMailingDates(body);
  const responsePeriods = extractResponsePeriods(body);
  const mailingDate = mailingDates.length === 1 ? mailingDates[0] : null;
  const responseMonths = responsePeriods.length === 1 ? responsePeriods[0] : null;
  const issues = issueRows(body);
  const totalFee = extractTotalFee(body);
  const extensionMentioned = /extension(?:s)? of time[\s\S]{0,240}1\.136\(a\)|1\.136\(a\)[\s\S]{0,240}extension/i.test(body);
  const abandonmentMentioned = /\b(?:avoid|risk|regarded as)\s+abandon(?:ment|ed)|application shall be regarded as abandoned/i.test(body);
  const electronicReplyMentioned = /reply via electronic filing|electronic filing/i.test(body);
  const documentDescription = safeResponseDocumentDescription(body);

  const missingCore = [
    type.id === "unknown" ? "notice_type" : null,
    mailingDate ? null : "mailing_date",
    responseMonths ? null : "response_period",
    issues.length ? null : "issues",
  ].filter(Boolean);

  return {
    schema: CORRESPONDENCE_SCHEMA,
    source: {
      filename: basename(sourceFilename),
      sha256: sha256(source),
      bytes: source.length,
      source_text_stored: false,
    },
    classification: {
      notice_type: type.id,
      label: type.label,
      application_type: type.application_type,
      confidence: type.confidence,
      supported: type.supported,
      response_workflow: type.response_workflow,
      human_verified: false,
      candidate_types: type.candidate_types || [],
    },
    mailing_date: {
      value: mailingDate,
      confidence: mailingDate ? "high" : "missing",
      human_verified: false,
    },
    response_period: {
      months: responseMonths,
      source: responseMonths ? "notice-stated" : "missing",
      confidence: responseMonths ? "high" : "missing",
      human_verified: false,
    },
    extension: {
      mentioned: extensionMentioned,
      rule_anchor: extensionMentioned ? "37 CFR 1.136(a)" : null,
      maximum_additional_months: extensionMentioned ? 5 : 0,
      human_verified: false,
    },
    issues,
    fees: totalFee == null ? [] : [{
      id: "notice-total-balance",
      label: "Total fee balance stated by the notice",
      amount: totalFee,
      currency: "USD",
      entity_status: "notice-stated",
      human_verified: false,
    }],
    response_channel: {
      electronic_filing_mentioned: electronicReplyMentioned,
      document_description: documentDescription,
      human_verified: false,
    },
    consequences: abandonmentMentioned ? [{
      id: "abandonment-risk",
      label: "The notice states that an incomplete or untimely reply may result in abandonment",
      human_verified: false,
    }] : [],
    extraction: {
      confidence: missingCore.length || mailingDates.length > 1 || responsePeriods.length > 1
        ? "needs-review"
        : "high",
      missing_core_fields: missingCore,
      conflicting_fields: [
        ...(mailingDates.length > 1 ? [{ field: "mailing_date", values: mailingDates }] : []),
        ...(responsePeriods.length > 1 ? [{ field: "response_period.months", values: responsePeriods }] : []),
      ],
      ocr_or_visual_review_required: true,
    },
    authoritative_deadline: false,
    legal_conclusion: false,
    human_filing_required: true,
  };
}

export function validateCorrespondenceRecord(record, { requireVerified = false } = {}) {
  const errors = [];
  const findings = [];
  const push = (code, path, message) => errors.push({ code, path, message });

  if (!record || typeof record !== "object" || Array.isArray(record)) {
    push("RECORD_INVALID", "$", "record must be an object");
    return { ok: false, errors, findings };
  }
  if (record.schema !== CORRESPONDENCE_SCHEMA) {
    push("SCHEMA_UNSUPPORTED", "schema", `expected ${CORRESPONDENCE_SCHEMA}`);
  }
  errors.push(...embeddedPrivateFieldErrors(record));
  if (!/^[0-9a-f]{64}$/.test(String(record.source?.sha256 || ""))) {
    push("SOURCE_HASH_INVALID", "source.sha256", "source SHA-256 is required");
  }
  if (!record.source?.filename || basename(record.source.filename) !== record.source.filename) {
    push("SOURCE_FILENAME_INVALID", "source.filename", "source filename must be a basename without a path");
  }
  if (record.source?.source_text_stored !== false) {
    push("SOURCE_TEXT_STORAGE_FORBIDDEN", "source.source_text_stored", "must remain false");
  }
  const type = noticeTypeById(record.classification?.notice_type);
  if (type.id === "unknown") {
    push("NOTICE_TYPE_UNSUPPORTED", "classification.notice_type", "notice type is unknown or unsupported");
  } else if (!type.supported) {
    findings.push({
      code: type.id === "office-action" ? "ROUTE_TO_OFFICE_ACTION" : "NOTICE_WORKFLOW_UNSUPPORTED",
      severity: "blocking",
      message: type.id === "office-action"
        ? "Route this paper to /apa-office-action."
        : `${type.label} is summary-only and requires human/practitioner routing.`,
    });
  }
  if (type.id !== "unknown") {
    if (record.classification?.application_type !== type.application_type) {
      push("APPLICATION_TYPE_MISMATCH", "classification.application_type", "must match the canonical notice taxonomy");
    }
    if (record.classification?.supported !== type.supported) {
      push("NOTICE_SUPPORT_FLAG_MISMATCH", "classification.supported", "must match the canonical notice taxonomy");
    }
  }
  if (!record.mailing_date?.value) {
    push("NOTICE_DATE_MISSING", "mailing_date.value", "mailing date is required before deadline estimation");
  }
  if (!Number.isInteger(record.response_period?.months) || record.response_period.months < 1) {
    push("RESPONSE_PERIOD_MISSING", "response_period.months", "notice-stated response months are required");
  }
  if (!Array.isArray(record.issues) || record.issues.length === 0) {
    push("NOTICE_ISSUES_MISSING", "issues", "at least one notice issue is required");
  }
  if (Array.isArray(record.extraction?.conflicting_fields) && record.extraction.conflicting_fields.length) {
    push("NOTICE_FIELD_CONFLICT", "extraction.conflicting_fields", "conflicting extracted values require human correction");
  }
  if (record.authoritative_deadline !== false) {
    push("AUTHORITATIVE_DEADLINE_FORBIDDEN", "authoritative_deadline", "must remain false");
  }
  if (record.legal_conclusion !== false) {
    push("LEGAL_CONCLUSION_FORBIDDEN", "legal_conclusion", "must remain false");
  }
  if (record.human_filing_required !== true) {
    push("HUMAN_FILING_BOUNDARY_REQUIRED", "human_filing_required", "must remain true");
  }

  if (requireVerified) {
    if (record.classification?.human_verified !== true) {
      push("NOTICE_CLASSIFICATION_UNVERIFIED", "classification.human_verified", "human classification review is required");
    }
    if (record.mailing_date?.human_verified !== true) {
      push("NOTICE_DATE_UNVERIFIED", "mailing_date.human_verified", "human date review is required");
    }
    if (record.response_period?.human_verified !== true) {
      push("RESPONSE_PERIOD_UNVERIFIED", "response_period.human_verified", "human response-period review is required");
    }
    for (let index = 0; index < (record.issues || []).length; index += 1) {
      if (record.issues[index]?.human_verified !== true) {
        push("NOTICE_ISSUE_UNVERIFIED", `issues[${index}].human_verified`, "every issue requires human verification");
      }
    }
    for (let index = 0; index < (record.fees || []).length; index += 1) {
      if (record.fees[index]?.human_verified !== true) {
        push("NOTICE_FEE_UNVERIFIED", `fees[${index}].human_verified`, "every notice-stated fee requires human verification");
      }
    }
    if (record.extension?.mentioned === true && record.extension?.human_verified !== true) {
      push("NOTICE_EXTENSION_UNVERIFIED", "extension.human_verified", "notice extension language requires human verification");
    }
    if (
      (record.response_channel?.electronic_filing_mentioned || record.response_channel?.document_description)
      && record.response_channel?.human_verified !== true
    ) {
      push("RESPONSE_CHANNEL_UNVERIFIED", "response_channel.human_verified", "response-channel details require human verification");
    }
    for (let index = 0; index < (record.consequences || []).length; index += 1) {
      if (record.consequences[index]?.human_verified !== true) {
        push("NOTICE_CONSEQUENCE_UNVERIFIED", `consequences[${index}].human_verified`, "every stated consequence requires human verification");
      }
    }
  }

  return { ok: errors.length === 0, errors, findings };
}
