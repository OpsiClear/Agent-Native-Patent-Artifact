/**
 * apa-assemble/preflight - the pre-filing readiness gate. Enforces the structural guardrails (DESIGN.md
 * §7.4 / §11): the inventorship-integrity gate (no claim limitation may remain `ai-suggested`), no
 * AI/zero inventors, mechanical validity, and a submit-boundary stop (APA never signs or files). Returns
 * a go/no-go + a frozen upload-set manifest. Node >=21, ESM, zero deps.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter, iterEntitySections, extractBindingBlocks, asArray } from "../../lib/apa-parse.mjs";
import { validateMatter } from "../apa-validate/validate.mjs";
import { lintClaims } from "../apa-draft/claim-lint.mjs";
import { buildLegend } from "../apa-figure/numerals.mjs";
import { validateReport, isFileable } from "../apa-rigor/verdict.mjs";
import { confidentialWorkflowModeOf, shareableExportPolicy } from "../apa-redact/confidential-workflow.mjs";
import { compareAssemblyInputFingerprint } from "./input-fingerprint.mjs";

// AI-inventor heuristic, mirroring the validator (../apa-validate/validate.mjs): case-SENSITIVE
// acronyms (so legitimate human inventors 'Ai'/'Claude'/'Neural' are not hard-blocked) plus
// case-insensitive phrases.
const AI_ACRONYM_RE = /\b(?:DABUS|GPT|LLM|AI)\b|\bA\.I\.(?!\w)/;
const AI_PHRASE_RE = /\b(?:artificial intelligence|language model|large language model)\b/i;
const looksAiInventor = (s) => { const t = String(s || ""); return AI_ACRONYM_RE.test(t) || AI_PHRASE_RE.test(t); };
const ADOPTED_PROVENANCE = new Set(["attorney", "ai-executed", "human-revised"]);

function summarizeFindingCodes(findings) {
  const counts = new Map();
  for (const finding of findings) counts.set(finding.code, (counts.get(finding.code) || 0) + 1);
  return [...counts].map(([code, count]) => `${code} x${count}`).join(", ");
}

export function preflight(matterDir, {
  assembledDir,
  filingDocumentWillBeWritten = false,
  now,
} = {}) {
  const gates = [];
  const add = (name, status, msg) => gates.push({ name, status, msg }); // status: pass | warn | block

  // Parse the matter once through the GUARDED validator FIRST. If it cannot be parsed (tab indent,
  // over-indent orphan, nesting-too-deep), every direct parse below (frontmatter, claim bindings,
  // lintClaims, buildLegend) would throw uncaught - so short-circuit to a structured NO-GO instead of
  // crashing the most safety-critical gate. validateMatter never throws (it returns PARSE_ERROR).
  const v = validateMatter(matterDir);
  const parseErr = v.errors.find((e) => e.code === "PARSE_ERROR");
  if (parseErr) {
    add("matter-parse", "block", `matter failed to parse (cannot assess): ${parseErr.msg}`);
    return { gates, goNoGo: "NO-GO", blocked: true, uploadSet: [], submitBoundary: "APA stops here. It does not sign, certify, or file. A human files via Patent Center." };
  }

  const fm = parseFrontmatter((() => { try { return readFileSync(join(matterDir, "PATENT.md"), "utf8"); } catch { return ""; } })());
  const workflowMode = confidentialWorkflowModeOf(fm);
  const shareablePolicy = shareableExportPolicy(matterDir, { mode: workflowMode.mode });

  if (fm.application_type === "utility") {
    add("application-type", "pass", "utility application supported by the deterministic assembler.");
  } else {
    const type = fm.application_type || "missing";
    add("application-type", "block", `application_type '${type}' is not supported by filing assembly; type-aware assembly is not implemented.`);
  }

  if (fm.user_role === "registered_practitioner") {
    add("user-role", "pass", "registered-practitioner workflow confirmed.");
  } else if (fm.user_role === "pro_se") {
    add("user-role", "warn", "pro-se workflow: assembly is neutral document collation only and does not recommend whether or when to file; consult a registered practitioner.");
  } else {
    add("user-role", "block", "user_role must be confirmed as registered_practitioner or pro_se before assembly; an unknown role cannot receive a filing-package GO.");
  }

  if (!workflowMode.valid) {
    add("confidential-workflow", "block", `unknown confidential_workflow_mode '${workflowMode.mode}'.`);
  } else if (workflowMode.mode === "shareable_redacted" && shareablePolicy.sensitive_critique_artifacts_present.length > 0) {
    add(
      "confidential-workflow",
      "warn",
      `${shareablePolicy.sensitive_critique_artifacts_present.length} sensitive critique artifact(s) excluded from shareable exports by default.`,
    );
  } else {
    add("confidential-workflow", "pass", `${workflowMode.label}; shareable exports require redaction guard and human approval.`);
  }

  // Inventorship-integrity gate: any claim limitation still ai-suggested blocks assembly.
  const claimsSecs = iterEntitySections((() => { try { return readFileSync(join(matterDir, "logic", "claims.md"), "utf8"); } catch { return ""; } })());
  let aiLimits = 0;
  let invalidLimits = 0;
  const declaredInventorIds = new Set(
    (Array.isArray(fm.inventors) ? fm.inventors : []).map((inventor) => inventor && inventor.id).filter(Boolean),
  );
  // A limitation with NO provenance defaults to 'ai-suggested' per protocol §2.4; treat the
  // missing-key case the same as an explicit 'ai-suggested' so it still blocks assembly.
  // .filter(Boolean): the shared parser emits a null element for a bare `-` list item; the validator
  // tolerates it, so this gate must too (a raw null would throw on lim.provenance and crash the gate).
  for (const c of claimsSecs) {
    for (const lim of asArray((extractBindingBlocks(c.body)[0] || {}).limitations).filter(Boolean)) {
      const prov = lim.provenance || "ai-suggested";
      if (prov === "ai-suggested") aiLimits++;
      else if (
        !ADOPTED_PROVENANCE.has(prov)
        && !(typeof prov === "string" && prov.startsWith("inventor:") && declaredInventorIds.has(prov.slice("inventor:".length)))
      ) invalidLimits++;
    }
  }
  if (invalidLimits > 0) add("inventorship-integrity", "block", `${invalidLimits} claim limitation(s) have invalid or undeclared provenance - use an allowed adopted provenance value before assembly.`);
  else if (aiLimits > 0) add("inventorship-integrity", "block", `${aiLimits} claim limitation(s) still provenance 'ai-suggested' - a human must adopt each before assembly.`);
  else add("inventorship-integrity", "pass", "no claim limitation left ai-suggested.");

  // Inventors present and natural. Array-guard a malformed/scalar `inventors:` so .some never throws
  // before validateMatter runs (the validator separately reports INVENTORS_MALFORMED).
  const inv = (Array.isArray(fm.inventors) ? fm.inventors : []).filter(Boolean);
  if (!inv.length) add("inventorship", "block", "zero inventors; at least one natural person is required.");
  else if (inv.some((i) => looksAiInventor(`${i.name || ""} ${i.id || ""}`))) add("inventorship", "block", "an inventor appears AI-named; only natural persons may be inventors.");
  else add("inventorship", "pass", `${inv.length} natural-person inventor(s).`);

  // Mechanical validity (reuse the report computed at the top).
  if (v.errors.length) add("mechanical-validation", "block", `${v.errors.length} validator error(s): ${summarizeFindingCodes(v.errors)}.`);
  else if (v.warnings.length) add("mechanical-validation", "warn", `${v.warnings.length} validator warning(s): ${summarizeFindingCodes(v.warnings)}.`);
  else add("mechanical-validation", "pass", "validator clean.");

  // Claim form lint.
  const l = lintClaims(matterDir);
  const claimLintStatus = l.findings.some((f) => f.code === "LINT_MULTI_DEP") ? "block" : "warn";
  if (l.findings.length) add("claim-form", claimLintStatus, `${l.findings.length} claim-form finding(s): ${l.findings.map((f) => f.code).join(", ")}.`);
  else add("claim-form", "pass", "claim form clean.");

  // Figures / numerals.
  const legend = buildLegend(matterDir);
  const numeralValidationErrors = v.errors.filter((error) => (
    error.code === "NUMERAL_NO_SPEC"
    || error.code === "NUMERAL_SPEC_RECIPROCAL_MISSING"
    || error.code === "NUMERAL_SPEC_RECIPROCAL_MISMATCH"
  ));
  if (numeralValidationErrors.length) {
    add("drawings", "block", `${numeralValidationErrors.length} drawing/SPEC numeral error(s): ${summarizeFindingCodes(numeralValidationErrors)}.`);
  } else if (legend.flags.length) add("drawings", "warn", `${legend.flags.length} numeral flag(s).`);
  else add("drawings", "pass", `${legend.entries.length} numeral(s) reconciled.`);

  // Drawing-quality review: deterministic figure QA is a review aid, not final 1.84 certification,
  // but known fix-before-filing defects should not pass a filing-readiness gate.
  if (legend.entries.length > 0) {
    const drawingReviewPath = join(matterDir, "evidence", "drawings", "quality-review.json");
    if (!existsSync(drawingReviewPath)) {
      add("drawing-quality", "warn", "drawing-quality review not found - run /apa-drawing-quality or apa-figure review-dir before final assembly review.");
    } else {
      try {
        const review = JSON.parse(readFileSync(drawingReviewPath, "utf8"));
        if ((review.blocking_count || 0) > 0) add("drawing-quality", "block", `${review.blocking_count} blocking drawing-quality finding(s).`);
        else if ((review.fix_before_filing_count || 0) > 0) add("drawing-quality", "block", `${review.fix_before_filing_count} fix-before-filing drawing-quality finding(s).`);
        else if ((review.min_score || 100) < 88) add("drawing-quality", "warn", `drawing-quality min_score ${review.min_score}; human/draftsperson review required.`);
        else add("drawing-quality", "pass", `drawing-quality review passed (min_score ${review.min_score}; fixes 0).`);
      } catch (e) {
        add("drawing-quality", "warn", `cannot parse drawing-quality review: ${e.message}`);
      }
    }

    const sheetReviewPath = join(matterDir, "evidence", "drawings", "sheet-review.json");
    if (!existsSync(sheetReviewPath)) {
      add("drawing-sheet-composition", "warn", "drawing sheet-review not found - run apa-figure sheet-review before final assembly review.");
    } else {
      try {
        const sheetReview = JSON.parse(readFileSync(sheetReviewPath, "utf8"));
        const findingCount = Array.isArray(sheetReview.findings) ? sheetReview.findings.length : 0;
        if (findingCount > 0) add("drawing-sheet-composition", "block", `${findingCount} drawing sheet-composition finding(s).`);
        else add("drawing-sheet-composition", "pass", `drawing sheet-composition review passed (${sheetReview.sheet_count || "unknown"} sheet(s)).`);
      } catch (e) {
        add("drawing-sheet-composition", "warn", `cannot parse drawing sheet-review: ${e.message}`);
      }
    }
  }

  // Rigor review (Phase 5): read patent_rigor_report.json if present and enforce its computed verdict.
  const rigorPath = join(matterDir, "patent_rigor_report.json");
  if (existsSync(rigorPath)) {
    try {
      const report = JSON.parse(readFileSync(rigorPath, "utf8"));
      const { ok, errors, computed } = validateReport(report, { now });
      if (!ok) add("rigor-review", "block", `patent_rigor_report.json invalid: ${errors.slice(0, 3).join("; ")}`);
      else if (computed.verdict === "Incomplete") add("rigor-review", "block", "rigor report incomplete - all six dimensions must be scored.");
      else if (isFileable(computed.verdict)) add("rigor-review", "pass", `rigor verdict ${computed.display || computed.verdict} [${computed.verdict}] (mean ${computed.mean}).`);
      else add("rigor-review", "block", `rigor verdict ${computed.display || computed.verdict} [${computed.verdict}] - resolve findings before assembly.`);
    } catch (e) { add("rigor-review", "block", `cannot parse patent_rigor_report.json: ${e.message}`); }
  } else {
    add("rigor-review", "block", "rigor review not run - patent_rigor_report.json with File-Ready or File-With-Revisions is required before assembly.");
  }

  // Assembled filing document present.
  if (filingDocumentWillBeWritten) add("filing-document", "pass", "write requested; specification.html will be assembled only if all other preflight gates pass (then export a filing-faithful PDF/DOCX and visually review).");
  else if (assembledDir && existsSync(join(assembledDir, "specification.html"))) add("filing-document", "pass", "specification.html assembled (export a filing-faithful PDF/DOCX and visually review before filing).");
  else add("filing-document", "warn", "no assembled specification.html yet - run assembly with --write.");

  // Existing packages are historical evidence, not current authority. A saved GO is current only when
  // its source-input fingerprint matches this exact matter and safety contract. During --write the
  // package will be regenerated after all other gates pass, so an older package does not block renewal.
  if (!filingDocumentWillBeWritten && assembledDir) {
    const manifestPath = join(assembledDir, "upload_manifest.json");
    if (existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
        const freshness = compareAssemblyInputFingerprint(manifest.input_fingerprint, matterDir);
        if (!freshness.ok) {
          add("assembled-package-freshness", "block", `existing upload manifest is STALE and cannot carry forward GO: ${freshness.reasons.join("; ")}.`);
        } else {
          add("assembled-package-freshness", "pass", `existing upload manifest matches ${freshness.current.file_count} canonical input file(s).`);
        }
      } catch (e) {
        add("assembled-package-freshness", "block", `cannot verify existing upload manifest freshness: ${e.message}`);
      }
    } else if (existsSync(join(assembledDir, "specification.html"))) {
      add("assembled-package-freshness", "warn", "assembled specification exists without an upload manifest; rerun assembly before treating it as a current package.");
    }
  }

  const blocked = gates.filter((g) => g.status === "block");
  const goNoGo = blocked.length ? "NO-GO" : "GO (pending human review, filing-document export/review, and inventor signature)";

  const uploadSet = [
    "specification.pdf or DOCX  (export/review from specification.html; DOCX preferred where applicable)",
    "drawings.pdf  (export/review from evidence/drawings/*.svg)",
    "ADS.pdf  (from ADS.md, human-completed)",
    "declaration.pdf  (executed/signed by the inventor - NOT generated signed)",
    "IDS_SB08.pdf  (human-verified references)",
  ];

  return { gates, goNoGo, blocked: blocked.length > 0, uploadSet, submitBoundary: "APA stops here. It does not sign, certify, or file. A human files via Patent Center." };
}
