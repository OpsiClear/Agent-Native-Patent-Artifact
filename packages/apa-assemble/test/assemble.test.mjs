import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { assembleMatter } from "../assemble.mjs";
import { assembleAds } from "../ads.mjs";
import { assembleIds } from "../ids.mjs";
import { preflight } from "../preflight.mjs";
import { buildUploadManifest } from "../upload-manifest.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const EXAMPLE = join(HERE, "..", "..", "..", "examples", "minimal-patent-artifact");
function clone() { const d = mkdtempSync(join(tmpdir(), "apa-asm-")); cpSync(EXAMPLE, d, { recursive: true }); return d; }

test("assembleMatter builds a 1.77 doc with claims, numbered paragraphs, abstract, and print CSS", () => {
  const { markdown, html } = assembleMatter(EXAMPLE);
  assert.match(markdown, /## CLAIMS/);
  assert.match(markdown, /What is claimed is:/);
  assert.match(markdown, /1\. /);                 // claim 1 numbered
  assert.doesNotMatch(markdown, /\*\[none\]\*/);
  assert.doesNotMatch(markdown, /\n-\s+a reservoir/);
  assert.match(markdown, /\n    a reservoir configured to hold water;/);
  assert.match(markdown, /\[0001\]/);             // detailed-description paragraph numbering
  assert.match(markdown, /## ABSTRACT/);
  assert.match(html, /@page/);                    // USPTO print stylesheet present
  assert.match(html, /class="claims"/);
  assert.doesNotMatch(html, /DRAFT - not legal advice/);
  assert.doesNotMatch(html, /APA does not sign or file/);
  assert.doesNotMatch(html, /-\s+a reservoir configured to hold water/);
  assert.match(html, /class="claim-step">a reservoir configured to hold water;/);
  assert.match(html, /reservoir to an exterior of the insert/);
  assert.doesNotMatch(html, /reservoirto an exterior/);
});

test("assembleMatter renders field text and figure legend object lines", () => {
  const d = clone();
  try {
    const problemPath = join(d, "logic", "problem.md");
    writeFileSync(problemPath, readFileSync(problemPath, "utf8")
      .replace("Self-watering plant containers", "**Self-watering plant containers**"));
    const { markdown, html } = assembleMatter(d, {
      legend: {
        briefDescription: [
          { fig: "FIG01", ordinal: "FIG. 1", title: "Widget view", line: "FIG. 1 - Widget view" },
          { fig: "FIG02", ordinal: "FIG. 2", title: "Flowchart", line: "FIG. 2 - Flowchart" },
        ],
      },
    });
    assert.doesNotMatch(markdown, /\[object Object\]/);
    assert.match(markdown, /FIG\. 1 - Widget view/);
    assert.match(html, /FIG\. 2 - Flowchart/);
    assert.doesNotMatch(html, /\*\*Self-watering plant containers\*\*/);
    assert.match(html, /<strong>Self-watering plant containers<\/strong>/);
    assert.doesNotMatch(markdown, /## FIELD OF THE INVENTION\n# Problem/);
    assert.match(markdown, /## FIELD OF THE INVENTION\n[\s\S]*Self-watering plant containers/i);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("assembleAds surfaces the inventor and flags address as required", () => {
  const { markdown } = assembleAds(EXAMPLE);
  assert.match(markdown, /Application Data Sheet/);
  assert.match(markdown, /Alex Example/);
  assert.match(markdown, /address \[REQUIRED\]/);
});

test("assembleIds seeds from prior art (PA01) with verification status", () => {
  const ids = assembleIds(EXAMPLE);
  assert.equal(ids.count, 1);
  assert.match(ids.markdown, /PA01/);
});

test("preflight: clean example is GO with a rigor-review warning", () => {
  const pf = preflight(EXAMPLE, {});
  assert.equal(pf.blocked, false);
  assert.match(pf.goNoGo, /^GO/);
  assert.ok(pf.gates.some((g) => g.name === "rigor-review" && g.status === "warn"));
  assert.ok(pf.gates.some((g) => g.name === "inventorship-integrity" && g.status === "pass"));
});

test("preflight: a File-Ready rigor report makes the rigor gate PASS; Do-Not-File BLOCKS", () => {
  const okDims = (n) => { const d = {}; for (const id of ["P1", "P2", "P3", "P4", "P5", "P6"]) d[id] = { score: n, weaknesses: [] }; return d; };
  const priorArtState = {
    evaluated_at: "2026-06-20T00:00:00.000Z",
    staleness_max_days: 180,
    dossiers_found: 1,
    newest_dossier: { path: "evidence/prior_art/search-dossier-current.json", generated_at: "2026-06-01T00:00:00.000Z" },
    closest_art: { human_verified: true, selected_pa_ids: ["PA01"], verified_at: "2026-06-02T00:00:00.000Z" },
  };
  const mk = (dims) => ({ dimensions: dims, prior_art_state: priorArtState, findings: [], questions_for_attorney: [], questions_for_inventor: [], read_order: ["logic/claims.md"] });

  const d1 = clone();
  try {
    writeFileSync(join(d1, "patent_rigor_report.json"), JSON.stringify(mk(okDims(5))));
    const pf = preflight(d1, {});
    assert.ok(pf.gates.some((g) => g.name === "rigor-review" && g.status === "pass"), JSON.stringify(pf.gates));
    assert.equal(pf.blocked, false);
  } finally { rmSync(d1, { recursive: true, force: true }); }

  const d2 = clone();
  try {
    const dims = okDims(5); dims.P5.score = 1;           // a single 1 -> Do-Not-File
    writeFileSync(join(d2, "patent_rigor_report.json"), JSON.stringify(mk(dims)));
    const pf = preflight(d2, {});
    assert.ok(pf.gates.some((g) => g.name === "rigor-review" && g.status === "block"));
    assert.equal(pf.blocked, true);
  } finally { rmSync(d2, { recursive: true, force: true }); }
});

test("preflight: unsupported multiple-dependent claim form blocks assembly", () => {
  const d = clone();
  try {
    const p = join(d, "logic", "claims.md");
    writeFileSync(p, readFileSync(p, "utf8")
      .replace("insert of claim 1, further", "insert of claims 1 or 2, further"));
    const pf = preflight(d, {});
    const gate = pf.gates.find((g) => g.name === "claim-form");
    assert.equal(gate.status, "block", JSON.stringify(pf.gates));
    assert.match(gate.msg, /LINT_MULTI_DEP/);
    assert.equal(pf.blocked, true);
    assert.equal(pf.goNoGo, "NO-GO");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("preflight: blocking drawing-quality findings block assembly", () => {
  const d = clone();
  try {
    writeFileSync(join(d, "evidence", "drawings", "quality-review.json"), JSON.stringify({
      blocking_count: 1,
      min_score: 92,
      verdict: "redraw",
    }));
    const pf = preflight(d, {});
    assert.equal(pf.blocked, true);
    assert.ok(pf.gates.some((g) => g.name === "drawing-quality" && g.status === "block"), JSON.stringify(pf.gates));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("preflight: shareable_redacted mode warns and excludes sensitive critique reports", () => {
  const d = clone();
  try {
    const patent = join(d, "PATENT.md");
    writeFileSync(patent, readFileSync(patent, "utf8")
      .replace('confidential_workflow_mode: "ordinary_local"', 'confidential_workflow_mode: "shareable_redacted"'));
    writeFileSync(join(d, "trace", "examiner_adversary_report.json"), "{}\n");
    const pf = preflight(d, {});
    const gate = pf.gates.find((g) => g.name === "confidential-workflow");
    assert.equal(gate.status, "warn", JSON.stringify(pf.gates));
    assert.match(gate.msg, /sensitive critique artifact/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("preflight: an ai-suggested claim limitation BLOCKS assembly (NO-GO)", () => {
  const d = clone();
  try {
    const p = join(d, "logic", "claims.md");
    writeFileSync(p, readFileSync(p, "utf8").replace(
      "introduces: \"reservoir\"\n    supported_by: [SPEC0002]\n    illustrated_by: [FIG01#10]\n    provenance: inventor:AINVENTOR",
      "introduces: \"reservoir\"\n    supported_by: [SPEC0002]\n    illustrated_by: [FIG01#10]\n    provenance: ai-suggested"));
    const pf = preflight(d, {});
    assert.equal(pf.blocked, true);
    assert.equal(pf.goNoGo, "NO-GO");
    assert.ok(pf.gates.some((g) => g.name === "inventorship-integrity" && g.status === "block"));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

// Fix 1: a limitation with NO provenance key defaults to 'ai-suggested' (protocol §2.4) and must BLOCK.
test("preflight: a claim limitation with NO provenance key BLOCKS (defaults to ai-suggested)", () => {
  const d = clone();
  try {
    const p = join(d, "logic", "claims.md");
    // Delete the provenance line of the LIM01 limitation, leaving NO provenance key on it.
    const out = readFileSync(p, "utf8").replace(
      "introduces: \"reservoir\"\n    supported_by: [SPEC0002]\n    illustrated_by: [FIG01#10]\n    provenance: inventor:AINVENTOR",
      "introduces: \"reservoir\"\n    supported_by: [SPEC0002]\n    illustrated_by: [FIG01#10]");
    assert.ok(!/provenance: inventor:AINVENTOR\n  - id: LIM02/.test(out), "LIM01 provenance line should be removed");
    writeFileSync(p, out);
    const pf = preflight(d, {});
    assert.equal(pf.blocked, true);
    assert.equal(pf.goNoGo, "NO-GO");
    assert.ok(pf.gates.some((g) => g.name === "inventorship-integrity" && g.status === "block"),
      JSON.stringify(pf.gates.find((g) => g.name === "inventorship-integrity")));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

// Fix 2: case-sensitive AI heuristic - human inventors named 'Claude'/'Ai'/'Neural' must NOT block,
// but an AI acronym like 'DABUS' must.
test("preflight: 'Claude Monet' is NOT AI-named but 'DABUS' IS blocked", () => {
  const human = clone();
  try {
    const p = join(human, "PATENT.md");
    writeFileSync(p, readFileSync(p, "utf8").replace('name: "Alex Example"', 'name: "Claude Monet"'));
    const pf = preflight(human, {});
    const g = pf.gates.find((x) => x.name === "inventorship");
    assert.equal(g.status, "pass", JSON.stringify(g));
    assert.match(pf.goNoGo, /^GO/);
  } finally { rmSync(human, { recursive: true, force: true }); }

  const ai = clone();
  try {
    const p = join(ai, "PATENT.md");
    writeFileSync(p, readFileSync(p, "utf8").replace('name: "Alex Example"', 'name: "DABUS"'));
    const pf = preflight(ai, {});
    assert.ok(pf.gates.some((x) => x.name === "inventorship" && x.status === "block"),
      JSON.stringify(pf.gates.find((x) => x.name === "inventorship")));
    assert.equal(pf.blocked, true);
    assert.equal(pf.goNoGo, "NO-GO");
  } finally { rmSync(ai, { recursive: true, force: true }); }
});

test("buildUploadManifest hashes generated files and marks human filing acts unverified", () => {
  const d = clone();
  try {
    const assembled = join(d, "assembled");
    mkdirSync(join(assembled, "upload_set"), { recursive: true });
    writeFileSync(join(assembled, "specification.html"), "<html>spec</html>");
    writeFileSync(join(assembled, "ADS.md"), "# ADS");
    writeFileSync(join(assembled, "IDS_SB08.md"), "# IDS");
    writeFileSync(join(assembled, "declaration_UNSIGNED.md"), "# Declaration");
    writeFileSync(join(assembled, "FEE_WORKSHEET.md"), "# Fees");
    writeFileSync(join(assembled, "PREFLIGHT.md"), "# Preflight");
    writeFileSync(join(assembled, "upload_set", "MANIFEST.txt"), "specification.pdf\n");
    const pf = preflight(d, { assembledDir: assembled });
    const manifest = buildUploadManifest(d, assembled, pf, { generatedAt: "2026-06-20T00:00:00.000Z" });
    assert.equal(manifest.schema, "apa-upload-manifest-v1");
    assert.equal(manifest.confidential_workflow.mode, "ordinary_local");
    assert.equal(manifest.confidential_workflow.shareable_export_policy.include_sensitive_critique_artifacts_by_default, false);
    assert.ok(manifest.generated_files.some((f) => (
      f.path === "assembled/specification.html" &&
      f.artifact_class === "apa-generated-local-source" &&
      /^[0-9a-f]{64}$/.test(f.sha256)
    )));
    assert.ok(manifest.generated_files.every((f) => !/\.pdf$/i.test(f.path)), "APA generated-file list must not pretend to contain upload PDFs");
    assert.ok(manifest.intended_upload_set.every((x) => (
      x.artifact_class === "human-produced-upload-pdf" &&
      x.upload_artifact_class === "human-produced-upload-pdf" &&
      x.generated_by_apa === false &&
      x.completed === false
    )));
    assert.ok(manifest.intended_upload_set.some((x) => (
      x.id === "declaration-pdf" &&
      x.document.startsWith("declaration.pdf") &&
      x.artifact_class === "human-produced-upload-pdf" &&
      x.generated_by_apa === false &&
      x.human_verified === false &&
      x.deferred_human_actions.includes("execute-inventor-declaration")
    )));
    const declarationAction = manifest.deferred_human_actions.find((x) => x.id === "execute-inventor-declaration");
    assert.ok(declarationAction);
    assert.equal(declarationAction.kind, "signature");
    assert.equal(declarationAction.completed, false);
    assert.ok(declarationAction.linked_manifest_fields.includes("forms.declaration_template.executed_by_inventor"));
    assert.ok(declarationAction.linked_manifest_fields.includes("intended_upload_set.declaration-pdf"));
    const patentCenterAction = manifest.deferred_human_actions.find((x) => x.id === "patent-center-human-upload");
    assert.ok(patentCenterAction);
    assert.equal(patentCenterAction.completed, false);
    assert.equal(patentCenterAction.kind, "human-filing-act");
    assert.ok(patentCenterAction.linked_manifest_fields.includes("patent_center_upload_checklist"));
    const specPdf = manifest.intended_upload_set.find((x) => x.document.startsWith("specification.pdf"));
    assert.equal(specPdf.id, "specification-pdf");
    assert.equal(specPdf.source_path, "assembled/specification.html");
    assert.ok(specPdf.deferred_human_actions.includes("export-specification-pdf"));
    assert.equal(specPdf.pdf_export_verification.visual_qa_completed, false);
    assert.equal(specPdf.pdf_export_verification.page_count, null);
    assert.equal(specPdf.pdf_export_verification.reviewer, "");
    assert.equal(manifest.forms.ids.not_admission_of_materiality, true);
    assert.equal(manifest.forms.ids.not_search_completeness_representation, true);
    assert.equal(manifest.forms.declaration_template.unsigned_template_only, true);
    assert.equal(manifest.forms.fee_schedule.effective_date, "2025-01-19");
    assert.equal(manifest.forms.fee_schedule.source_path, "docs/fee-schedule.2026-06-15.json");
    assert.match(manifest.forms.fee_schedule.source_hash_sha256, /^[0-9a-f]{64}$/);
    assert.equal(manifest.patent_center_upload_checklist.apa_performs_filing, false);
    assert.equal(manifest.patent_center_upload_checklist.submitted_by_human, false);
    assert.ok(manifest.patent_center_upload_checklist.items.every((x) => x.human_verified === false));
    assert.ok(manifest.deferred_human_actions.every((x) => x.required === true && x.completed === false));
    assert.match(manifest.human_verification_required.join("\n"), /IDS reference/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("buildUploadManifest records shareable export exclusions for critique artifacts", () => {
  const d = clone();
  try {
    const patent = join(d, "PATENT.md");
    writeFileSync(patent, readFileSync(patent, "utf8")
      .replace('confidential_workflow_mode: "ordinary_local"', 'confidential_workflow_mode: "shareable_redacted"'));
    writeFileSync(join(d, "logic", "patentability_report.json"), "{}\n");
    writeFileSync(join(d, "trace", "examiner_adversary_report.json"), "{}\n");
    const assembled = join(d, "assembled");
    mkdirSync(join(assembled, "upload_set"), { recursive: true });
    writeFileSync(join(assembled, "specification.html"), "<html>spec</html>");
    writeFileSync(join(assembled, "upload_set", "MANIFEST.txt"), "specification.pdf\n");
    const manifest = buildUploadManifest(d, assembled, preflight(d, { assembledDir: assembled }), {
      generatedAt: "2026-06-20T00:00:00.000Z",
    });
    const policy = manifest.confidential_workflow.shareable_export_policy;
    assert.equal(manifest.confidential_workflow.mode, "shareable_redacted");
    assert.deepEqual(policy.excluded_from_shareable_exports.map((x) => x.path).sort(), [
      "logic/patentability_report.json",
      "trace/examiner_adversary_report.json",
    ]);
    assert.ok(policy.excluded_from_shareable_exports.every((x) => x.redaction_required_before_sharing));
  } finally { rmSync(d, { recursive: true, force: true }); }
});
