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

// AI-inventor heuristic, mirroring the validator (../apa-validate/validate.mjs): case-SENSITIVE
// acronyms (so legitimate human inventors 'Ai'/'Claude'/'Neural' are not hard-blocked) plus
// case-insensitive phrases.
const AI_ACRONYM_RE = /\b(?:DABUS|GPT|LLM|AI)\b|\bA\.I\.(?!\w)/;
const AI_PHRASE_RE = /\b(?:artificial intelligence|language model|large language model)\b/i;
const looksAiInventor = (s) => { const t = String(s || ""); return AI_ACRONYM_RE.test(t) || AI_PHRASE_RE.test(t); };

export function preflight(matterDir, { assembledDir } = {}) {
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
  // A limitation with NO provenance defaults to 'ai-suggested' per protocol §2.4; treat the
  // missing-key case the same as an explicit 'ai-suggested' so it still blocks assembly.
  // .filter(Boolean): the shared parser emits a null element for a bare `-` list item; the validator
  // tolerates it, so this gate must too (a raw null would throw on lim.provenance and crash the gate).
  for (const c of claimsSecs) for (const lim of asArray((extractBindingBlocks(c.body)[0] || {}).limitations).filter(Boolean)) { const prov = lim.provenance || "ai-suggested"; if (prov === "ai-suggested") aiLimits++; }
  if (aiLimits > 0) add("inventorship-integrity", "block", `${aiLimits} claim limitation(s) still provenance 'ai-suggested' - a human must adopt each before assembly.`);
  else add("inventorship-integrity", "pass", "no claim limitation left ai-suggested.");

  // Inventors present and natural. Array-guard a malformed/scalar `inventors:` so .some never throws
  // before validateMatter runs (the validator separately reports INVENTORS_MALFORMED).
  const inv = (Array.isArray(fm.inventors) ? fm.inventors : []).filter(Boolean);
  if (!inv.length) add("inventorship", "block", "zero inventors; at least one natural person is required.");
  else if (inv.some((i) => looksAiInventor(`${i.name || ""} ${i.id || ""}`))) add("inventorship", "block", "an inventor appears AI-named; only natural persons may be inventors.");
  else add("inventorship", "pass", `${inv.length} natural-person inventor(s).`);

  // Mechanical validity (reuse the report computed at the top).
  if (v.errors.length) add("mechanical-validation", "block", `${v.errors.length} validator error(s): ${v.errors.map((e) => e.code).join(", ")}.`);
  else if (v.warnings.length) add("mechanical-validation", "warn", `${v.warnings.length} validator warning(s): ${v.warnings.map((w) => w.code).join(", ")}.`);
  else add("mechanical-validation", "pass", "validator clean.");

  // Claim form lint.
  const l = lintClaims(matterDir);
  const claimLintStatus = l.findings.some((f) => f.code === "LINT_MULTI_DEP") ? "block" : "warn";
  if (l.findings.length) add("claim-form", claimLintStatus, `${l.findings.length} claim-form finding(s): ${l.findings.map((f) => f.code).join(", ")}.`);
  else add("claim-form", "pass", "claim form clean.");

  // Figures / numerals.
  const legend = buildLegend(matterDir);
  if (legend.flags.length) add("drawings", "warn", `${legend.flags.length} numeral flag(s).`);
  else add("drawings", "pass", `${legend.entries.length} numeral(s) reconciled.`);

  // Drawing-quality review: deterministic figure QA is a review aid, not final 1.84 certification.
  if (legend.entries.length > 0) {
    const drawingReviewPath = join(matterDir, "evidence", "drawings", "quality-review.json");
    if (!existsSync(drawingReviewPath)) {
      add("drawing-quality", "warn", "drawing-quality review not found - run /apa-drawing-quality or apa-figure review-dir before final assembly review.");
    } else {
      try {
        const review = JSON.parse(readFileSync(drawingReviewPath, "utf8"));
        if ((review.blocking_count || 0) > 0) add("drawing-quality", "block", `${review.blocking_count} blocking drawing-quality finding(s).`);
        else if ((review.min_score || 100) < 88) add("drawing-quality", "warn", `drawing-quality min_score ${review.min_score}; human/draftsperson review required.`);
        else add("drawing-quality", "pass", `drawing-quality review passed (min_score ${review.min_score}).`);
      } catch (e) {
        add("drawing-quality", "warn", `cannot parse drawing-quality review: ${e.message}`);
      }
    }
  }

  // Rigor review (Phase 5): read patent_rigor_report.json if present and enforce its computed verdict.
  const rigorPath = join(matterDir, "patent_rigor_report.json");
  if (existsSync(rigorPath)) {
    try {
      const report = JSON.parse(readFileSync(rigorPath, "utf8"));
      const { ok, errors, computed } = validateReport(report);
      if (!ok) add("rigor-review", "block", `patent_rigor_report.json invalid: ${errors.slice(0, 3).join("; ")}`);
      else if (computed.verdict === "Incomplete") add("rigor-review", "block", "rigor report incomplete - all six dimensions must be scored.");
      else if (isFileable(computed.verdict)) add("rigor-review", "pass", `rigor verdict ${computed.display || computed.verdict} [${computed.verdict}] (mean ${computed.mean}).`);
      else add("rigor-review", "block", `rigor verdict ${computed.display || computed.verdict} [${computed.verdict}] - resolve findings before assembly.`);
    } catch (e) { add("rigor-review", "block", `cannot parse patent_rigor_report.json: ${e.message}`); }
  } else {
    add("rigor-review", "warn", "rigor review not run - run /apa-rigor (File-Ready or File-With-Revisions required before assembly).");
  }

  // Assembled filing document present.
  if (assembledDir && existsSync(join(assembledDir, "specification.html"))) add("filing-document", "pass", "specification.html assembled (print to PDF in a browser for the filing-faithful copy).");
  else add("filing-document", "warn", "no assembled specification.html yet - run assembly with --write.");

  const blocked = gates.filter((g) => g.status === "block");
  const goNoGo = blocked.length ? "NO-GO" : "GO (pending human review, Print-to-PDF, inventor signature, and rigor review)";

  const uploadSet = [
    "specification.pdf  (produce by Print-to-PDF from specification.html)",
    "drawings.pdf  (from evidence/drawings/*.svg)",
    "ADS.pdf  (from ADS.md, human-completed)",
    "declaration.pdf  (executed/signed by the inventor - NOT generated signed)",
    "IDS_SB08.pdf  (human-verified references)",
  ];

  return { gates, goNoGo, blocked: blocked.length > 0, uploadSet, submitBoundary: "APA stops here. It does not sign, certify, or file. A human files via Patent Center." };
}
