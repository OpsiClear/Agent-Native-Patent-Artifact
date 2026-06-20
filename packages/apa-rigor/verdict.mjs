/**
 * Deterministic rigor verdict + report validation (DESIGN.md §7.3). The verdict is computed from the
 * six dimension scores by code (NOT chosen by the LLM): mean band, hardened by a per-dimension floor -
 * any dimension scoring 1 caps the result at Do-Not-File regardless of mean; a 2 caps at Major-Rework.
 * Node >=21, ESM, zero deps.
 */

import { DIM_IDS, SEVERITIES } from "./dimensions.mjs";

// ascending severity: index 0 = worst
export const VERDICTS = ["Do-Not-File", "Major-Rework", "File-With-Revisions", "File-Ready"];
export const VERDICT_DISPLAY_ALIASES = {
  "Do-Not-File": "Artifact-Quality: Blocked",
  "Major-Rework": "Artifact-Quality: Major Rework",
  "File-With-Revisions": "Artifact-Quality: High With Human Revisions",
  "File-Ready": "Artifact-Quality: High For Human Final Review",
};
const rank = (v) => VERDICTS.indexOf(v);
const worse = (a, b) => (rank(a) <= rank(b) ? a : b);
export const displayVerdict = (verdict) => VERDICT_DISPLAY_ALIASES[verdict] || verdict;

/** Per-dimension floor: a low score caps the achievable verdict no matter how high the mean is. */
function capForScore(n) {
  if (n <= 1) return "Do-Not-File";
  if (n <= 2) return "Major-Rework";
  return "File-Ready";
}

/**
 * @param {Object} scores  { P1:1-5, ... P6:1-5 }
 * @returns {{ verdict, mean, meanBand, cap, capped, missing, scoreCaps, effectiveScores, display }}
 */
export function computeVerdict(scores, opts = {}) {
  const priorArt = evaluatePriorArtState(opts.priorArtState);
  const effectiveScores = { ...(scores || {}) };
  const scoreCaps = [];
  if (priorArt.cap_required && typeof effectiveScores.P5 === "number" && effectiveScores.P5 > priorArt.max_p5_score) {
    scoreCaps.push({
      dimension: "P5",
      original_score: effectiveScores.P5,
      effective_score: priorArt.max_p5_score,
      reasons: priorArt.cap_reasons,
    });
    effectiveScores.P5 = priorArt.max_p5_score;
  }

  const vals = [];
  const missing = [];
  for (const id of DIM_IDS) {
    const n = effectiveScores ? effectiveScores[id] : undefined;
    if (typeof n === "number" && n >= 1 && n <= 5) vals.push(n);
    else missing.push(id);
  }
  if (missing.length) return {
    verdict: "Incomplete",
    display: "Artifact-Quality: Incomplete",
    mean: null,
    meanBand: null,
    cap: null,
    capped: false,
    missing,
    scoreCaps,
    effectiveScores,
    priorArt,
  };

  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const meanBand = mean >= 4.5 ? "File-Ready" : mean >= 3.5 ? "File-With-Revisions" : mean >= 2.5 ? "Major-Rework" : "Do-Not-File";
  let cap = "File-Ready";
  for (const n of vals) cap = worse(cap, capForScore(n));
  const verdict = worse(meanBand, cap);
  return {
    verdict,
    display: displayVerdict(verdict),
    mean: Math.round(mean * 100) / 100,
    meanBand,
    cap,
    capped: rank(cap) < rank(meanBand) || scoreCaps.length > 0,
    missing: [],
    scoreCaps,
    effectiveScores,
    priorArt,
  };
}

export function evaluatePriorArtState(state = {}) {
  const missingState = !state || typeof state !== "object" || Array.isArray(state);
  const s = missingState ? {} : state;
  const evaluatedAt = parseDate(s.evaluated_at) || new Date();
  const maxDays = positiveNumber(s.staleness_max_days, 180);
  const newest = s.newest_dossier && typeof s.newest_dossier === "object" ? s.newest_dossier : {};
  const generatedAtRaw = newest.generated_at || s.generated_at || "";
  const generatedAt = parseDate(generatedAtRaw);
  const closest = s.closest_art && typeof s.closest_art === "object" ? s.closest_art : {};
  const humanVerifiedClosest = Boolean(closest.human_verified);
  const dossiersFound = Number.isFinite(Number(s.dossiers_found)) ? Number(s.dossiers_found) : (generatedAtRaw ? 1 : 0);
  const ageDays = generatedAt ? Math.max(0, Math.floor((evaluatedAt.getTime() - generatedAt.getTime()) / 86400000)) : null;

  const capReasons = [];
  if (missingState) capReasons.push("prior-art-state-missing");
  if (dossiersFound <= 0) capReasons.push("no-search-dossier");
  if (!generatedAt) capReasons.push("prior-art-search-date-missing");
  if (ageDays != null && ageDays > maxDays) capReasons.push(`prior-art-search-stale:${ageDays}d>${maxDays}d`);
  if (!humanVerifiedClosest) capReasons.push("no-human-verified-closest-art");

  return {
    evaluated_at: evaluatedAt.toISOString(),
    staleness_max_days: maxDays,
    dossiers_found: dossiersFound,
    newest_dossier_generated_at: generatedAt ? generatedAt.toISOString() : "",
    newest_dossier_age_days: ageDays,
    closest_art_human_verified: humanVerifiedClosest,
    stale: ageDays != null && ageDays > maxDays,
    cap_required: capReasons.length > 0,
    max_p5_score: capReasons.length > 0 ? 2 : 5,
    cap_reasons: capReasons,
  };
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function positiveNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Is this verdict acceptable to proceed to filing-assembly? (the filing gate uses this) */
export function isFileable(verdict) {
  return verdict === "File-Ready" || verdict === "File-With-Revisions";
}

/**
 * Structurally validate a patent_rigor_report.json and recompute the authoritative verdict.
 * @returns {{ ok:boolean, errors:string[], computed }}
 */
export function validateReport(report) {
  const errors = [];
  if (!report || typeof report !== "object") return { ok: false, errors: ["report is not an object"], computed: null };
  const dims = report.dimensions || {};
  const scores = {};
  for (const id of DIM_IDS) {
    const d = dims[id];
    if (!d || typeof d !== "object") { errors.push(`missing dimension ${id}`); continue; }
    if (typeof d.score !== "number" || d.score < 1 || d.score > 5) errors.push(`${id}.score must be 1-5`);
    else scores[id] = d.score;
    if (!("weaknesses" in d)) errors.push(`${id} should record weaknesses (may be empty)`);
  }
  if (!Array.isArray(report.findings || [])) {
    errors.push("findings must be an array");
  } else {
    for (const [i, f] of (report.findings || []).entries()) {
      // A bounded-YAML stray `-` yields a null element; tolerate it as an error, not a throw.
      if (!f || typeof f !== "object") { errors.push(`finding[${i}] is not an object`); continue; }
      if (!DIM_IDS.includes(f.dimension)) errors.push(`finding[${i}].dimension '${f.dimension}' is not a known dimension`);
      if (!SEVERITIES.includes(f.severity)) errors.push(`finding[${i}].severity '${f.severity}' invalid (${SEVERITIES.join("|")})`);
      if (!f.evidence_span) errors.push(`finding[${i}] needs a verbatim evidence_span`);
      if (!f.amendment) errors.push(`finding[${i}] needs a concrete amendment suggestion`);
    }
  }
  if (!Array.isArray(report.questions_for_attorney)) errors.push("questions_for_attorney must be an array");
  if (!Array.isArray(report.read_order)) errors.push("read_order must be an array (the files you reviewed, in order)");

  if ("prior_art_state" in report && (!report.prior_art_state || typeof report.prior_art_state !== "object" || Array.isArray(report.prior_art_state))) {
    errors.push("prior_art_state must be an object when present");
  }
  const computed = computeVerdict(scores, { priorArtState: report.prior_art_state });
  if (report.verdict && report.verdict !== computed.verdict) {
    errors.push(`report.verdict '${report.verdict}' != computed '${computed.verdict}' (verdict is computed, not chosen)`);
  }
  return { ok: errors.length === 0, errors, computed };
}
