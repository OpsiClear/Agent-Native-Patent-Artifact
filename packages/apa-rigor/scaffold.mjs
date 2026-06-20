/**
 * Build a patent_rigor_report.json SKELETON for a matter. Runs the Level-1 mechanical validator and
 * the claim-form lint, pre-fills the mechanical dimensions (P3 antecedent basis, P4 support/numeral)
 * from those signals, and leaves the judgment dimensions (P1/P2/P5/P6) for the /apa-rigor skill to
 * score semantically. Read-only. Node >=21, ESM, zero deps.
 */

import { validateMatter } from "../apa-validate/validate.mjs";
import { lintClaims } from "../apa-draft/claim-lint.mjs";
import { DIMENSIONS } from "./dimensions.mjs";

export function scaffoldReport(matterDir) {
  const v = validateMatter(matterDir);
  const lint = lintClaims(matterDir);
  const errCodes = new Set(v.errors.map((e) => e.code));
  const warnCodes = v.warnings.map((w) => w.code);

  const antecedentBroken = [...errCodes].some((c) => /^ANTECEDENT_(BROKEN|UNRESOLVED|OUT_OF_SCOPE|NOT_EARLIER)$/.test(c));
  const antecedentUndeclared = warnCodes.includes("ANTECEDENT_UNDECLARED");
  const numeralBroken = errCodes.has("NUMERAL_NO_SPEC");
  const unsupportedEdge = warnCodes.includes("UNSUPPORTED_EDGE");
  const undefinedTermish = warnCodes.includes("UNRESOLVED_EDGE") || warnCodes.includes("TERM_NO_BOUND");

  const p3 = antecedentBroken ? 1 : antecedentUndeclared ? 4 : 5;
  const p4 = numeralBroken ? 1 : (unsupportedEdge || undefinedTermish) ? 3 : 5;

  const dimensions = {};
  for (const d of DIMENSIONS) {
    const entry = { name: d.name, ara_from: d.araFrom, mechanical: d.mechanical, anchors: d.anchors, strengths: [], weaknesses: [] };
    if (d.id === "P3") { entry.score = p3; entry.mechanical_signal = antecedentBroken ? "validator: broken antecedent basis" : antecedentUndeclared ? "validator: undeclared references" : "validator: clean antecedent basis"; }
    else if (d.id === "P4") { entry.score = p4; entry.mechanical_signal = numeralBroken ? "validator: numeral with no SPEC" : unsupportedEdge ? "validator: dangling §112 support edge" : "validator: links resolve"; }
    else { entry.score = null; entry.mechanical_signal = "judgment - score semantically against the anchors"; }
    dimensions[d.id] = entry;
  }

  return {
    apa_rigor_version: "0.1",
    note: "ARA Seal Level 2 (semantic). Assumes Level 1 (mechanical) passed. READ-ONLY. Every finding is a flag/question for a registered practitioner - NEVER a patentability conclusion or §112 clearance. The verdict is computed deterministically from the scores (apa-rigor check), not chosen.",
    level1: { passed: v.errors.length === 0, errorCodes: [...errCodes], warningCount: v.warnings.length, claimFormFindings: lint.findings.map((f) => f.code) },
    dimensions,
    findings: [],                 // [{ dimension, severity: critical|major|minor|suggestion, evidence_span, weakness, amendment }]
    questions_for_inventor: [],
    questions_for_attorney: [],
    read_order: [],               // the files reviewed, in order
    verdict: null,                // set by `apa-rigor check`
  };
}
