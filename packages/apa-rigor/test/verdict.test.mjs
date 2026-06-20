import { test } from "node:test";
import assert from "node:assert/strict";
import { computeVerdict, displayVerdict, evaluatePriorArtState, validateReport, isFileable, VERDICTS } from "../verdict.mjs";

const all = (n) => ({ P1: n, P2: n, P3: n, P4: n, P5: n, P6: n });
const verifiedPriorArt = {
  evaluated_at: "2026-06-20T00:00:00.000Z",
  staleness_max_days: 180,
  dossiers_found: 1,
  newest_dossier: { path: "evidence/prior_art/search-dossier-current.json", generated_at: "2026-06-01T00:00:00.000Z" },
  closest_art: { human_verified: true, selected_pa_ids: ["PA01"], verified_at: "2026-06-02T00:00:00.000Z" },
};

function verdict(scores) {
  return computeVerdict(scores, { priorArtState: verifiedPriorArt });
}

test("all 5s -> File-Ready; all 4s -> File-With-Revisions; all 3s -> Major-Rework", () => {
  assert.equal(verdict(all(5)).verdict, "File-Ready");
  assert.equal(verdict(all(4)).verdict, "File-With-Revisions");
  assert.equal(verdict(all(3)).verdict, "Major-Rework");
});

test("a single 1 caps at Do-Not-File regardless of mean", () => {
  const r = verdict({ ...all(5), P1: 1 });
  assert.equal(r.verdict, "Do-Not-File");
  assert.equal(r.capped, true);
});

test("a single 2 caps at Major-Rework even with a high mean", () => {
  const r = verdict({ ...all(5), P2: 2 });
  assert.equal(r.verdict, "Major-Rework");
  assert.equal(r.capped, true);
});

test("an unscored dimension -> Incomplete", () => {
  const r = verdict({ P1: 5, P2: 5, P3: 5, P4: 5, P5: 5 });
  assert.equal(r.verdict, "Incomplete");
  assert.deepEqual(r.missing, ["P6"]);
});

test("isFileable: only File-Ready / File-With-Revisions", () => {
  assert.equal(isFileable("File-Ready"), true);
  assert.equal(isFileable("File-With-Revisions"), true);
  assert.equal(isFileable("Major-Rework"), false);
  assert.equal(isFileable("Do-Not-File"), false);
  assert.deepEqual(VERDICTS, ["Do-Not-File", "Major-Rework", "File-With-Revisions", "File-Ready"]);
});

test("displayVerdict keeps legacy enum but exposes safer quality labels", () => {
  assert.equal(displayVerdict("File-Ready"), "Artifact-Quality: High For Human Final Review");
  assert.equal(displayVerdict("Major-Rework"), "Artifact-Quality: Major Rework");
});

test("missing or stale prior-art state caps P5 and prevents a filing-quality verdict", () => {
  const missing = computeVerdict(all(5));
  assert.equal(missing.verdict, "Major-Rework");
  assert.equal(missing.effectiveScores.P5, 2);
  assert.ok(missing.scoreCaps[0].reasons.includes("no-human-verified-closest-art"));

  const stale = computeVerdict(all(5), {
    priorArtState: {
      evaluated_at: "2026-06-20T00:00:00.000Z",
      staleness_max_days: 180,
      dossiers_found: 1,
      newest_dossier: { generated_at: "2025-01-01T00:00:00.000Z" },
      closest_art: { human_verified: true },
    },
  });
  assert.equal(stale.verdict, "Major-Rework");
  assert.ok(stale.scoreCaps[0].reasons.some((r) => r.startsWith("prior-art-search-stale:")));
});

test("evaluatePriorArtState recognizes current human-verified closest art", () => {
  const state = evaluatePriorArtState(verifiedPriorArt);
  assert.equal(state.cap_required, false);
  assert.equal(state.max_p5_score, 5);
  assert.equal(state.closest_art_human_verified, true);
});

function report(scores, extra = {}) {
  const dimensions = {};
  for (const [k, v] of Object.entries(scores)) dimensions[k] = { score: v, weaknesses: [] };
  return { dimensions, prior_art_state: verifiedPriorArt, findings: [], questions_for_attorney: [], questions_for_inventor: [], read_order: ["logic/claims.md"], ...extra };
}

test("validateReport: well-formed report validates and computes the verdict", () => {
  const r = validateReport(report(all(5), { verdict: "File-Ready" }));
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.computed.verdict, "File-Ready");
});

test("validateReport: a finding without evidence_span/amendment is invalid", () => {
  const rep = report(all(4));
  rep.findings = [{ dimension: "P2", severity: "minor" }];
  const r = validateReport(rep);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /evidence_span/.test(e)) && r.errors.some((e) => /amendment/.test(e)));
});

test("validateReport: a hand-set verdict that disagrees with the computed one is flagged", () => {
  const r = validateReport(report(all(5), { verdict: "Do-Not-File" }));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /verdict/.test(e) && /computed/.test(e)));
});

test("validateReport: malformed findings (non-array) is ok:false, not a throw", () => {
  const rep = report(all(5));
  rep.findings = "oops not an array";
  let r;
  assert.doesNotThrow(() => { r = validateReport(rep); });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /findings must be an array/.test(e)));
});

test("validateReport: a null finding element (stray bounded-YAML `-`) is ok:false, not a throw", () => {
  // loadYaml('findings:\n  -\n  - dimension: P1') yields { findings: [null, {...}] }.
  const rep = report(all(5));
  rep.findings = [null, { dimension: "P1", severity: "minor", evidence_span: "x", amendment: "y" }];
  let r;
  assert.doesNotThrow(() => { r = validateReport(rep); });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /finding\[0\] is not an object/.test(e)));
});
