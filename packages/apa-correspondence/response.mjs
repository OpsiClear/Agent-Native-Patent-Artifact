/**
 * Build a missing-parts response checklist and machine manifest.
 *
 * The output is deliberately incomplete. It organizes human work but never chooses between legal
 * document routes, inserts a signature, certifies entity status, pays, or files.
 */

import { createHash } from "node:crypto";
import { noticeTypeById } from "./taxonomy.mjs";
import { validateCorrespondenceRecord } from "./parse.mjs";
import { computeNoticeDeadlines } from "./deadlines.mjs";

export const MISSING_PARTS_RESPONSE_SCHEMA = "apa-missing-parts-response-v1";

const sha256Json = (value) => createHash("sha256")
  .update(`${JSON.stringify(value, null, 2)}\n`)
  .digest("hex");

const COMMON_ACTIONS = Object.freeze([
  {
    id: "verify-notice-record",
    label: "Compare every extracted requirement against every page of the original notice",
    kind: "notice-review",
  },
  {
    id: "verify-deadline",
    label: "Verify the response date against the original notice and Patent Center",
    kind: "deadline-verification",
  },
  {
    id: "verify-form-versions",
    label: "Use current official USPTO forms and verify their versions",
    kind: "form-version-review",
  },
  {
    id: "verify-signer-authority",
    label: "Verify who is authorized to sign each selected paper",
    kind: "signature-authority-review",
  },
  {
    id: "verify-fees-and-entity-status",
    label: "Verify every fee and entity-status assertion against current USPTO records",
    kind: "fee-review",
  },
  {
    id: "inspect-final-pdfs",
    label: "Open every final PDF and inspect every page before upload",
    kind: "pdf-visual-review",
  },
  {
    id: "human-patent-center-submission",
    label: "A human uploads, certifies, pays, and submits through Patent Center",
    kind: "human-filing-act",
  },
  {
    id: "save-confirmation-receipt",
    label: "Save and audit the Patent Center confirmation and updated filing receipt",
    kind: "post-submission-evidence",
  },
]);

function documentOptions(type) {
  if (type.id === "provisional-missing-parts") {
    return [
      {
        id: "provisional-cover-sheet",
        form_code: "SB/16",
        label: "Current provisional application cover sheet",
        selected: false,
        human_choice_required: true,
      },
      {
        id: "corrected-ads",
        form_code: "AIA/14",
        label: "Properly signed and marked corrected Application Data Sheet, if applicable",
        selected: false,
        human_choice_required: true,
      },
      {
        id: "provisional-extension-petition",
        form_code: "AIA/22P",
        label: "Provisional extension petition only if an extension is actually required and approved by the human filer",
        selected: false,
        human_choice_required: true,
        conditional: true,
      },
    ];
  }
  return [
    {
      id: "corrected-ads",
      form_code: "AIA/14",
      label: "Current Application Data Sheet or corrected ADS when required by the notice",
      selected: false,
      human_choice_required: true,
    },
    {
      id: "inventor-declaration",
      form_code: "AIA/01",
      label: "Inventor oath/declaration when required by the notice",
      selected: false,
      human_choice_required: true,
      conditional: true,
    },
    {
      id: "utility-transmittal",
      form_code: "AIA/15",
      label: "Utility application transmittal or notice-specific response cover paper when applicable",
      selected: false,
      human_choice_required: true,
      conditional: true,
    },
  ];
}

function issueAction(issue, type) {
  const mapping = {
    "provisional-cover-sheet": "Provide a current SB/16 cover sheet or a qualifying properly signed/marked ADS; a human must select the route.",
    "ads-signature": "Prepare the appropriate signed ADS paper and verify post-filing change markings against the official filing receipt.",
    "inventorship-not-established": "Verify inventor data and the paper used to establish it; do not infer inventorship.",
    "priority-claim-ineffective": "Audit benefit/priority data and timing; route any correction or delayed claim to a registered practitioner.",
    "late-provisional-surcharge": "Verify and pay the current 37 CFR 1.16(g) surcharge through the human filing flow.",
    "filing-fee": "Verify the notice-stated filing/search/examination fee balance and current entity status.",
    "oath-declaration": "Obtain the appropriate inventor-executed oath/declaration; APA never signs it.",
    abstract: "Prepare a notice-compliant abstract from the filed disclosure without adding new matter.",
    claim: "Route missing-claim correction to a registered practitioner and preserve the as-filed disclosure.",
  };
  return mapping[issue.id]
    || `Resolve this ${type.application_type || "patent"} application issue exactly as stated in the notice and verify with a human reviewer.`;
}

function actionRows() {
  return COMMON_ACTIONS.map((action) => ({
    ...action,
    required: true,
    completed: false,
    completed_at: null,
    completed_by: "",
    evidence_path: "",
    notes: "",
  }));
}

export function buildMissingPartsResponse(record, options = {}) {
  const check = validateCorrespondenceRecord(record, { requireVerified: true });
  if (!check.ok) {
    const error = new Error(`correspondence record is not ready: ${check.errors.map((item) => item.code).join(", ")}`);
    error.code = "CORRESPONDENCE_RECORD_NOT_READY";
    error.findings = check.errors;
    throw error;
  }
  const type = noticeTypeById(record.classification.notice_type);
  if (!["provisional-missing-parts", "nonprovisional-missing-parts"].includes(type.id)) {
    const error = new Error(`missing-parts response does not support notice type '${type.id}'`);
    error.code = "NOTICE_TYPE_UNSUPPORTED";
    throw error;
  }

  const deadline = computeNoticeDeadlines(record, options);
  if (!String(deadline.calculation_status || "").startsWith("estimate-")) {
    const error = new Error("deadline calculation is blocked; verify the record before preparing a response");
    error.code = "DEADLINE_BLOCKED";
    error.findings = deadline.errors || [];
    throw error;
  }

  const issues = record.issues.map((issue) => ({
    id: issue.id,
    label: issue.label,
    rule_anchor: issue.rule_anchor || null,
    required_action: issueAction(issue, type),
    resolution_status: "unresolved",
    human_verified_resolved: false,
    evidence_path: "",
    notes: "",
  }));

  const response = {
    schema: MISSING_PARTS_RESPONSE_SCHEMA,
    generated_at: options.generatedAt || new Date().toISOString(),
    source_record: {
      schema: record.schema,
      sha256: sha256Json(record),
      source_pdf_sha256: record.source.sha256,
      source_filename: record.source.filename,
    },
    notice_type: type.id,
    application_type: type.application_type,
    status: "BLOCKED-HUMAN-ACTIONS",
    authoritative_deadline: false,
    deadline_estimate: deadline,
    issues,
    document_options: documentOptions(type),
    notice_stated_fees: (record.fees || []).map((fee) => ({
      id: fee.id,
      label: fee.label,
      amount: fee.amount,
      currency: fee.currency,
      human_verified_from_notice: fee.human_verified === true,
      payable_amount_verified_current: false,
    })),
    response_channel: {
      electronic_filing_mentioned: record.response_channel?.electronic_filing_mentioned === true,
      document_description: record.response_channel?.document_description || "",
      human_verified: record.response_channel?.human_verified === true,
    },
    deferred_human_actions: actionRows(),
    completion: {
      all_notice_issues_resolved: false,
      document_route_selected: false,
      signer_authority_verified: false,
      current_forms_verified: false,
      current_fees_verified: false,
      deadline_verified_in_patent_center: false,
      pdf_visual_review_completed: false,
      submitted_by_human: false,
      confirmation_receipt_saved: false,
    },
    boundaries: {
      legal_advice: false,
      legal_response_selected_by_apa: false,
      signed_or_certified_by_apa: false,
      entity_status_asserted_by_apa: false,
      fee_paid_by_apa: false,
      patent_center_submission_by_apa: false,
    },
  };

  return {
    response,
    markdown: renderMissingPartsChecklist(response),
  };
}

export function validateMissingPartsResponse(response) {
  const errors = [];
  const push = (code, path, message) => errors.push({ code, path, message });
  if (response?.schema !== MISSING_PARTS_RESPONSE_SCHEMA) push("SCHEMA_UNSUPPORTED", "schema", `expected ${MISSING_PARTS_RESPONSE_SCHEMA}`);
  if (response?.status !== "BLOCKED-HUMAN-ACTIONS") push("RESPONSE_MUST_REMAIN_BLOCKED", "status", "new response packages start blocked");
  if (response?.authoritative_deadline !== false) push("AUTHORITATIVE_DEADLINE_FORBIDDEN", "authoritative_deadline", "must remain false");
  if (!Array.isArray(response?.issues) || !response.issues.length) push("ISSUES_REQUIRED", "issues", "at least one issue is required");
  if (!Array.isArray(response?.deferred_human_actions) || response.deferred_human_actions.length < COMMON_ACTIONS.length) {
    push("HUMAN_ACTIONS_REQUIRED", "deferred_human_actions", "all human actions must be present");
  }
  for (let index = 0; index < (response?.document_options || []).length; index += 1) {
    const document = response.document_options[index];
    if (document.selected !== false || document.human_choice_required !== true) {
      push("LEGAL_DOCUMENT_ROUTE_PRESELECTED", `document_options[${index}]`, "document choices must start unselected and human-owned");
    }
  }
  for (let index = 0; index < (response?.deferred_human_actions || []).length; index += 1) {
    if (response.deferred_human_actions[index]?.completed !== false) {
      push("HUMAN_ACTION_PRECOMPLETED", `deferred_human_actions[${index}].completed`, "human actions must start incomplete");
    }
  }
  for (const [key, value] of Object.entries(response?.completion || {})) {
    if (value !== false) push("COMPLETION_PREASSERTED", `completion.${key}`, "completion gates must start false");
  }
  for (const [key, value] of Object.entries(response?.boundaries || {})) {
    if (value !== false) push("SUBMIT_BOUNDARY_VIOLATION", `boundaries.${key}`, "must remain false");
  }
  return { ok: errors.length === 0, errors };
}

export function renderMissingPartsChecklist(response) {
  const lines = [
    "# Missing-parts response checklist",
    "",
    "> Documentation aid only. This package is BLOCKED pending every listed human action. It is not",
    "> legal advice, an authoritative deadline, a signed paper, a fee payment, or a Patent Center filing.",
    "",
    `- Notice type: \`${response.notice_type}\``,
    `- Application type: \`${response.application_type}\``,
    `- Source notice: \`${response.source_record.source_filename}\` (SHA-256 recorded in the machine manifest)`,
    `- Tentative base date: \`${response.deadline_estimate.base_due_date_tentative}\``,
    "- Date status: estimate - verify against the original notice and Patent Center",
    "",
    "## Notice issues",
    "",
  ];
  for (const issue of response.issues) {
    lines.push(`- [ ] **${issue.label}** (\`${issue.id}\`)`);
    lines.push(`  - Required action: ${issue.required_action}`);
    lines.push("  - Evidence: `[REQUIRED - human-supplied matter-local path]`");
  }
  lines.push("", "## Document route - human selection required", "");
  for (const document of response.document_options) {
    lines.push(`- [ ] ${document.form_code}: ${document.label}${document.conditional ? " (conditional)" : ""}`);
  }
  lines.push("", "## Notice-stated fees", "");
  if (!response.notice_stated_fees.length) {
    lines.push("- [ ] No fee amount was captured; compare the notice and current USPTO fee schedule.");
  } else {
    for (const fee of response.notice_stated_fees) {
      lines.push(`- [ ] ${fee.label}: ${fee.currency} ${fee.amount} - verify entity status and current payable amount.`);
    }
  }
  lines.push("", "## Human completion gates", "");
  for (const action of response.deferred_human_actions) lines.push(`- [ ] ${action.label}`);
  lines.push(
    "",
    "## Submit boundary",
    "",
    "APA stops here. A human reviewer selects the response route, verifies the deadline, completes and",
    "signs any forms, verifies entity status and fees, inspects the final PDFs, submits through Patent",
    "Center, and saves the confirmation receipt.",
    "",
  );
  return lines.join("\n");
}
