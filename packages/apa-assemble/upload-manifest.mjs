/**
 * Machine-readable upload-manifest draft for the assembled package.
 *
 * This is an audit aid, not a filing act. It hashes the generated local files and records the intended
 * human-produced upload papers that still require Print-to-PDF, signatures, IDS verification, and
 * Patent Center submission by a human.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, relative } from "node:path";

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

const rel = (from, to) => relative(from, to).replace(/\\/g, "/");

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function fileRecord(matterDir, path, generatedAt) {
  const s = statSync(path);
  return {
    path: rel(matterDir, path),
    sha256: sha256File(path),
    bytes: s.size,
    generated_at: generatedAt,
    human_verified: false,
  };
}

function intendedUploadEntry(name) {
  const lower = name.toLowerCase();
  let source = "human-provided";
  let status = "human action required";
  if (lower.startsWith("specification.pdf")) {
    source = "assembled/specification.html";
    status = "print-to-pdf required";
  } else if (lower.startsWith("drawings.pdf")) {
    source = "evidence/drawings/*.svg";
    status = "render/export to PDF required";
  } else if (lower.startsWith("ads.pdf")) {
    source = "assembled/ADS.md";
    status = "human completion and PDF conversion required";
  } else if (lower.startsWith("declaration.pdf")) {
    source = "assembled/declaration_UNSIGNED.md";
    status = "inventor execution/signature required";
  } else if (lower.startsWith("ids_sb08.pdf")) {
    source = "assembled/IDS_SB08.md";
    status = "human IDS verification and PDF conversion required";
  }
  return {
    document: name,
    source,
    status,
    human_verified: false,
  };
}

export function buildUploadManifest(matterDir, assembledDir, preflight, { generatedAt = new Date().toISOString() } = {}) {
  const generatedFiles = [];
  for (const p of GENERATED_FILES) {
    const abs = join(assembledDir, ...p.split("/"));
    if (existsSync(abs)) generatedFiles.push(fileRecord(matterDir, abs, generatedAt));
  }
  return {
    schema: "apa-upload-manifest-v1",
    generated_at: generatedAt,
    go_no_go: preflight.goNoGo,
    submit_boundary: preflight.submitBoundary,
    generated_files: generatedFiles,
    intended_upload_set: (preflight.uploadSet || []).map(intendedUploadEntry),
    human_verification_required: [
      "Print or export generated HTML/SVG sources to filing-faithful PDF and inspect the rendered output.",
      "Complete ADS required fields and verify inventor, applicant, benefit, and priority data.",
      "Verify every IDS reference under 37 CFR 1.97/1.98; this manifest is not an admission of materiality or search completeness.",
      "Obtain inventor-executed declaration signatures; APA never signs or generates an executed oath.",
      "Verify current fees, entity status, and Patent Center upload state before any filing act.",
    ],
  };
}
