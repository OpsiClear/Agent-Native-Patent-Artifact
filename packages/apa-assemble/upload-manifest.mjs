/**
 * Machine-readable upload-manifest draft for the assembled package.
 *
 * This is an audit aid, not a filing act. It hashes the generated local files and records the intended
 * human-produced upload papers that still require Print-to-PDF, signatures, IDS verification, and
 * Patent Center submission by a human.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, relative } from "node:path";
import { parseFrontmatter } from "../../lib/apa-parse.mjs";
import { loadSchedule } from "./fees.mjs";
import { confidentialWorkflowModeOf, shareableExportPolicy } from "../apa-redact/confidential-workflow.mjs";

const GENERATED_FILES = [
  "specification.md",
  "specification.html",
  "ADS.md",
  "IDS_SB08.md",
  "declaration_UNSIGNED.md",
  "FEE_WORKSHEET.md",
  "PREFLIGHT.md",
  "upload_set/MANIFEST.txt",
];

const UPLOAD_DOCUMENTS = [
  {
    id: "specification-pdf",
    document: "specification.pdf  (produce by Print-to-PDF from specification.html)",
    source: "assembled/specification.html",
    source_path: "assembled/specification.html",
    status: "print-to-pdf required",
    actions: ["export-specification-pdf", "pdf-render-review"],
  },
  {
    id: "drawings-pdf",
    document: "drawings.pdf  (from evidence/drawings/*.svg)",
    source: "evidence/drawings/*.svg",
    source_path: "evidence/drawings/*.svg",
    status: "render/export to PDF required",
    actions: ["export-drawings-pdf", "pdf-render-review"],
  },
  {
    id: "ads-pdf",
    document: "ADS.pdf  (from ADS.md, human-completed)",
    source: "assembled/ADS.md",
    source_path: "assembled/ADS.md",
    status: "human completion and PDF conversion required",
    actions: ["complete-ads", "export-ads-pdf", "pdf-render-review"],
  },
  {
    id: "declaration-pdf",
    document: "declaration.pdf  (executed/signed by the inventor - NOT generated signed)",
    source: "assembled/declaration_UNSIGNED.md",
    source_path: "assembled/declaration_UNSIGNED.md",
    status: "inventor execution/signature required",
    actions: ["execute-inventor-declaration", "export-declaration-pdf", "pdf-render-review"],
  },
  {
    id: "ids-sb08-pdf",
    document: "IDS_SB08.pdf  (human-verified references)",
    source: "assembled/IDS_SB08.md",
    source_path: "assembled/IDS_SB08.md",
    status: "human IDS verification and PDF conversion required",
    actions: ["verify-ids-references", "export-ids-pdf", "pdf-render-review"],
  },
];

const UPLOAD_BY_PREFIX = new Map(UPLOAD_DOCUMENTS.map((entry) => [
  entry.document.toLowerCase().split(/\s+/)[0],
  entry,
]));

const ACTION_DEFS = [
  {
    id: "export-specification-pdf",
    label: "Export specification HTML to filing-faithful PDF",
    kind: "pdf-export",
    linked_manifest_fields: ["intended_upload_set.specification-pdf", "generated_files.assembled/specification.html"],
    evidence_expected: "human-produced specification.pdf opened and visually checked",
  },
  {
    id: "export-drawings-pdf",
    label: "Export drawings to a single filing-faithful PDF",
    kind: "pdf-export",
    linked_manifest_fields: ["intended_upload_set.drawings-pdf", "generated_files.evidence/drawings/*.svg"],
    evidence_expected: "human-produced drawings.pdf opened and visually checked",
  },
  {
    id: "complete-ads",
    label: "Complete and verify ADS fields",
    kind: "form-completion",
    linked_manifest_fields: ["forms.ads", "intended_upload_set.ads-pdf"],
    evidence_expected: "human-completed ADS PDF or current USPTO ADS form",
  },
  {
    id: "export-ads-pdf",
    label: "Export completed ADS to PDF",
    kind: "pdf-export",
    linked_manifest_fields: ["intended_upload_set.ads-pdf", "forms.ads.local_source"],
    evidence_expected: "human-produced ADS.pdf",
  },
  {
    id: "execute-inventor-declaration",
    label: "Obtain inventor-executed declaration signature",
    kind: "signature",
    linked_manifest_fields: ["forms.declaration_template.executed_by_inventor", "intended_upload_set.declaration-pdf"],
    evidence_expected: "inventor-signed declaration retained by applicant/practitioner",
  },
  {
    id: "export-declaration-pdf",
    label: "Export executed declaration to PDF",
    kind: "pdf-export",
    linked_manifest_fields: ["intended_upload_set.declaration-pdf", "forms.declaration_template.local_source"],
    evidence_expected: "human-produced declaration.pdf with signature",
  },
  {
    id: "verify-ids-references",
    label: "Verify IDS references, dates, and forms",
    kind: "ids-verification",
    linked_manifest_fields: ["forms.ids", "intended_upload_set.ids-sb08-pdf"],
    evidence_expected: "human-verified IDS reference list and current IDS form",
  },
  {
    id: "export-ids-pdf",
    label: "Export verified IDS to PDF",
    kind: "pdf-export",
    linked_manifest_fields: ["intended_upload_set.ids-sb08-pdf", "forms.ids.local_source"],
    evidence_expected: "human-produced IDS_SB08.pdf or current USPTO equivalent",
  },
  {
    id: "pdf-render-review",
    label: "Open every PDF after export and visually compare against source",
    kind: "pdf-visual-qa",
    linked_manifest_fields: ["intended_upload_set.*.pdf_export_verification"],
    evidence_expected: "page size/count and visual QA recorded for each uploaded PDF",
  },
  {
    id: "fee-entity-status-verification",
    label: "Verify fees, entity status, and discount eligibility",
    kind: "fee-verification",
    linked_manifest_fields: ["forms.fee_schedule", "patent_center_upload_checklist.items.fee-entity-status"],
    evidence_expected: "current USPTO fee schedule and entity-status review",
  },
  {
    id: "patent-center-human-upload",
    label: "Human uploads, certifies, and pays through Patent Center",
    kind: "human-filing-act",
    linked_manifest_fields: ["patent_center_upload_checklist", "intended_upload_set"],
    evidence_expected: "Patent Center confirmation receipt saved by human",
  },
];

const rel = (from, to) => relative(from, to).replace(/\\/g, "/");

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function sha256Text(text) {
  return createHash("sha256").update(String(text)).digest("hex");
}

function fileRecord(matterDir, path, generatedAt) {
  const s = statSync(path);
  return {
    path: rel(matterDir, path),
    artifact_class: "apa-generated-local-source",
    sha256: sha256File(path),
    bytes: s.size,
    generated_at: generatedAt,
    human_verified: false,
  };
}

function intendedUploadEntry(name) {
  const canonical = UPLOAD_BY_PREFIX.get(String(name || "").toLowerCase().split(/\s+/)[0]) || {};
  const id = canonical.id || slugUploadId(name);
  return {
    id,
    document: name,
    artifact_class: "human-produced-upload-pdf",
    generated_by_apa: false,
    source: canonical.source || "human-provided",
    source_path: canonical.source_path || "",
    source_artifact_class: canonical.source_path ? "apa-generated-local-source-or-disclosure-source" : "human-provided",
    upload_artifact_class: "human-produced-upload-pdf",
    status: canonical.status || "human action required",
    deferred_human_actions: canonical.actions || [],
    completed: false,
    completed_at: null,
    completed_by: "",
    evidence_path: "",
    pdf_export_verification: {
      page_size: "",
      page_count: null,
      visual_qa_completed: false,
      reviewer: "",
      reviewed_at: null,
    },
    human_verified: false,
  };
}

function slugUploadId(name) {
  const base = String(name || "upload-document").split(/\s+/)[0].replace(/\.[^.]+$/, "");
  return base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "upload-document";
}

function feeScheduleMetadata(generatedAt) {
  try {
    const schedule = loadSchedule();
    const path = schedule._path || "";
    const raw = path && existsSync(path) ? readFileSync(path, "utf8") : JSON.stringify(schedule);
    return {
      effective_date: schedule.effectiveDate || null,
      retrieved_date: schedule.retrievedDate || null,
      generated_at: generatedAt,
      source: schedule.source || null,
      source_path: path ? rel(join(dirname(path), ".."), path) : "",
      source_hash_sha256: sha256Text(raw),
      currency: schedule.currency || "USD",
      unverified_fields: Array.isArray(schedule._unverified) ? schedule._unverified : [],
      human_verified_current: false,
      note: "Fee amounts are estimates; verify against the live USPTO fee schedule before any filing act.",
    };
  } catch (e) {
    return {
      effective_date: null,
      retrieved_date: null,
      generated_at: generatedAt,
      source: null,
      source_path: "",
      source_hash_sha256: "",
      currency: "USD",
      unverified_fields: [],
      human_verified_current: false,
      error: e.message,
      note: "Fee schedule metadata could not be loaded; a human must verify all fees before any filing act.",
    };
  }
}

function formMetadata(generatedAt) {
  return {
    generated_at: generatedAt,
    ads: {
      local_source: "assembled/ADS.md",
      expected_form: "Application Data Sheet (37 CFR 1.76; current USPTO ADS form to be verified by human)",
      form_version_status: "human-verify-current-version",
      human_completed: false,
      human_verified: false,
    },
    ids: {
      local_source: "assembled/IDS_SB08.md",
      expected_form: "Information Disclosure Statement (37 CFR 1.97/1.98; SB/08 or current USPTO equivalent to be verified by human)",
      form_version_status: "human-verify-current-version",
      not_admission_of_materiality: true,
      not_search_completeness_representation: true,
      human_verified_references: false,
      human_verified: false,
    },
    declaration_template: {
      local_source: "assembled/declaration_UNSIGNED.md",
      expected_form: "Inventor oath/declaration under 37 CFR 1.63; current USPTO declaration form to be verified by human",
      form_version_status: "human-verify-current-version",
      unsigned_template_only: true,
      executed_by_inventor: false,
      human_verified: false,
    },
    fee_schedule: feeScheduleMetadata(generatedAt),
  };
}

function patentCenterChecklist() {
  return {
    apa_performs_filing: false,
    submitted_by_human: false,
    submitted_at: null,
    confirmation_receipt_saved: false,
    items: [
      { id: "patent-center-account", label: "Identity-verified Patent Center account available", human_verified: false },
      { id: "application-data-review", label: "Application data, benefit, priority, applicant, and correspondence fields reviewed", human_verified: false },
      { id: "pdf-render-review", label: "All PDFs opened after export and visually checked against source documents", human_verified: false },
      { id: "upload-documents-match-manifest", label: "Uploaded documents match this manifest and generated-file hashes where applicable", human_verified: false },
      { id: "ids-verification", label: "IDS references verified; filing is not treated as an admission of materiality or search completeness", human_verified: false },
      { id: "declaration-signatures", label: "Inventor declarations executed by the named inventor(s)", human_verified: false },
      { id: "fee-entity-status", label: "Fee amounts, entity status, and any discounts verified against current USPTO sources", human_verified: false },
      { id: "human-submit-boundary", label: "A human performs any Patent Center submission, certification, and fee payment", human_verified: false },
    ],
  };
}

function deferredHumanActions() {
  return ACTION_DEFS.map((action) => ({
    ...action,
    required: true,
    completed: false,
    completed_at: null,
    completed_by: "",
    evidence_path: "",
    notes: "",
  }));
}

function frontmatterOf(matterDir) {
  try {
    return parseFrontmatter(readFileSync(join(matterDir, "PATENT.md"), "utf8"));
  } catch {
    return {};
  }
}

export function buildUploadManifest(matterDir, assembledDir, preflight, { generatedAt = new Date().toISOString() } = {}) {
  const generatedFiles = [];
  for (const p of GENERATED_FILES) {
    const abs = join(assembledDir, ...p.split("/"));
    if (existsSync(abs)) generatedFiles.push(fileRecord(matterDir, abs, generatedAt));
  }
  const workflowMode = confidentialWorkflowModeOf(frontmatterOf(matterDir));
  const shareablePolicy = shareableExportPolicy(matterDir, { mode: workflowMode.mode });
  return {
    schema: "apa-upload-manifest-v1",
    generated_at: generatedAt,
    go_no_go: preflight.goNoGo,
    submit_boundary: preflight.submitBoundary,
    confidential_workflow: {
      mode: workflowMode.mode,
      explicit_in_patent_manifest: workflowMode.explicit,
      label: workflowMode.label,
      shareable_export_policy: shareablePolicy,
    },
    forms: formMetadata(generatedAt),
    generated_files: generatedFiles,
    intended_upload_set: (preflight.uploadSet || []).map(intendedUploadEntry),
    deferred_human_actions: deferredHumanActions(),
    patent_center_upload_checklist: patentCenterChecklist(),
    human_verification_required: [
      "Print or export generated HTML/SVG sources to filing-faithful PDF and inspect the rendered output.",
      "Complete ADS required fields and verify inventor, applicant, benefit, and priority data.",
      "Verify every IDS reference under 37 CFR 1.97/1.98; this manifest is not an admission of materiality or search completeness.",
      "Obtain inventor-executed declaration signatures; APA never signs or generates an executed oath.",
      "Verify current fees, entity status, and Patent Center upload state before any filing act.",
    ],
  };
}
