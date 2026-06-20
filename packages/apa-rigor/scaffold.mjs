/**
 * Build a patent_rigor_report.json SKELETON for a matter. Runs the Level-1 mechanical validator and
 * the claim-form lint, pre-fills the mechanical dimensions (P3 antecedent basis, P4 support/numeral)
 * from those signals, and leaves the judgment dimensions (P1/P2/P5/P6) for the /apa-rigor skill to
 * score semantically. Read-only. Node >=21, ESM, zero deps.
 */

import { validateMatter } from "../apa-validate/validate.mjs";
import { lintClaims } from "../apa-draft/claim-lint.mjs";
import { DIMENSIONS } from "./dimensions.mjs";
import { evaluatePriorArtState } from "./verdict.mjs";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export function scaffoldReport(matterDir, opts = {}) {
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
    rule_pack: v.meta.rule_pack,
    level1: { passed: v.errors.length === 0, errorCodes: [...errCodes], warningCount: v.warnings.length, claimFormFindings: lint.findings.map((f) => f.code) },
    prior_art_state: buildPriorArtState(matterDir, opts),
    dimensions,
    findings: [],                 // [{ dimension, severity: critical|major|minor|suggestion, evidence_span, weakness, amendment }]
    questions_for_inventor: [],
    questions_for_attorney: [],
    read_order: [],               // the files reviewed, in order
    verdict: null,                // set by `apa-rigor check`
  };
}

export function buildPriorArtState(matterDir, {
  evaluatedAt = new Date().toISOString(),
  stalenessMaxDays = 180,
} = {}) {
  const priorDir = join(matterDir, "evidence", "prior_art");
  const dossiers = [];
  if (existsSync(priorDir)) {
    for (const name of readdirSync(priorDir)) {
      if (!/^search-dossier-.*\.json$/.test(name)) continue;
      const path = join(priorDir, name);
      try {
        const json = JSON.parse(readFileSync(path, "utf8"));
        dossiers.push({
          path,
          relPath: relative(matterDir, path).replace(/\\/g, "/"),
          generated_at: json.generated_at || "",
          mtime_ms: statSync(path).mtimeMs,
          closest: json.closest_art_selection || {},
        });
      } catch {
        // Bad dossiers are ignored for newest-selection, which makes the missing/invalid state cap P5.
      }
    }
  }
  dossiers.sort((a, b) => sortTime(b) - sortTime(a));
  const newest = dossiers[0] || null;
  const base = {
    evaluated_at: evaluatedAt,
    staleness_max_days: stalenessMaxDays,
    dossiers_found: dossiers.length,
    newest_dossier: newest ? {
      path: newest.relPath,
      generated_at: newest.generated_at,
    } : null,
    closest_art: newest ? {
      human_verified: Boolean(newest.closest.human_verified),
      selected_pa_ids: Array.isArray(newest.closest.selected_pa_ids) ? newest.closest.selected_pa_ids : [],
      verified_at: newest.closest.verified_at || newest.closest.verification?.verified_at || "",
      ids_ready: Boolean(newest.closest.verification?.ids_ready),
    } : {
      human_verified: false,
      selected_pa_ids: [],
      verified_at: "",
      ids_ready: false,
    },
  };
  const evaluated = evaluatePriorArtState(base);
  return {
    ...base,
    stale: evaluated.stale,
    cap_required: evaluated.cap_required,
    max_p5_score: evaluated.max_p5_score,
    cap_reasons: evaluated.cap_reasons,
    newest_dossier_age_days: evaluated.newest_dossier_age_days,
  };
}

function sortTime(dossier) {
  const t = Date.parse(dossier.generated_at || "");
  return Number.isNaN(t) ? dossier.mtime_ms : t;
}
