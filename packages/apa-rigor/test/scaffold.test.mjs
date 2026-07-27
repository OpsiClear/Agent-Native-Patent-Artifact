import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPriorArtState, scaffoldReport } from "../scaffold.mjs";
import { validateReport } from "../verdict.mjs";
import { validateRunlog } from "../../apa-trace/runlog.mjs";
import { buildSearchDossier, idsVerificationStatus } from "../../apa-search/writers.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const EXAMPLE = join(HERE, "..", "..", "..", "examples", "minimal-patent-artifact");
const CLI = join(HERE, "..", "cli.mjs");

function validDossier({ generatedAt, humanVerified = true, selectedPaIds = ["PA01"] }) {
  const dossier = buildSearchDossier({
    query: { keywords: ["fixture"], cpc: [] },
    result: {
      verdict: { text: "fixture", high: [], medium: [] },
      ranked: [],
      rawRecords: [],
      deduped: [],
      perSource: [],
    },
    assigned: selectedPaIds.map((paId) => ({ paId, docNumber: `US-${paId}`, title: `Fixture ${paId}` })),
    generatedAt,
  });
  dossier.closest_art_selection = {
    human_verified: humanVerified,
    selected_pa_ids: humanVerified ? selectedPaIds : [],
    verified_at: humanVerified ? generatedAt : "",
    verification: idsVerificationStatus({
      human_verified: humanVerified,
      title: humanVerified,
      venue: humanVerified,
      canonical_link: humanVerified,
      relied_on_passage: humanVerified,
      verified_at: humanVerified ? generatedAt : "",
    }),
  };
  return dossier;
}

test("scaffoldReport: clean example -> Level-1 passed, mechanical dims prefilled, judgment dims null", () => {
  const s = scaffoldReport(EXAMPLE);
  assert.equal(s.level1.passed, true);
  assert.equal(s.level1.errorCount, 0);
  assert.deepEqual(s.level1.errorCounts, {});
  assert.equal(s.dimensions.P3.score, 5);     // clean antecedent basis
  assert.equal(s.dimensions.P4.score, 5);     // links resolve
  assert.equal(s.dimensions.P1.score, null);  // judgment - left for the skill
  assert.equal(s.dimensions.P5.score, null);
  assert.equal(s.prior_art_state.dossiers_found, 0);
  assert.equal(s.prior_art_state.cap_required, true);
  assert.ok(s.prior_art_state.cap_reasons.includes("no-search-dossier"));
  assert.equal(s.prior_art_state.freshness_summary.status, "missing-dossier");
  assert.equal(s.prior_art_state.freshness_summary.dossier_used, "");
  assert.equal(s.rule_pack.id, "uspto-v1");
  assert.equal(s.rule_pack.effective_date, "2026-06-15");
  assert.ok(s.dimensions.P1.anchors && s.dimensions.P1.anchors[1]);
  assert.deepEqual(s.findings, []);
});

test("wrong-kind claim-support edges fail Level 1 and mechanically score P4 as 1", () => {
  const d = mkdtempSync(join(tmpdir(), "apa-rigor-wrong-kind-"));
  try {
    cpSync(EXAMPLE, d, { recursive: true });
    const claimsPath = join(d, "logic", "claims.md");
    writeFileSync(
      claimsPath,
      readFileSync(claimsPath, "utf8").replace("supported_by: [SPEC0002]", "supported_by: [CLM01]"),
    );

    const s = scaffoldReport(d);
    assert.equal(s.level1.passed, false);
    assert.equal(s.level1.errorCounts.EDGE_TARGET_KIND, 1);
    assert.equal(s.dimensions.P4.score, 1);
    assert.match(s.dimensions.P4.mechanical_signal, /wrong-kind/);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("scaffoldReport records prior-art freshness summary for the dossier used", () => {
  const d = mkdtempSync(join(tmpdir(), "apa-rigor-prior-art-"));
  try {
    cpSync(EXAMPLE, d, { recursive: true });
    const priorDir = join(d, "evidence", "prior_art");
    mkdirSync(priorDir, { recursive: true });
    writeFileSync(
      join(priorDir, "search-dossier-current.json"),
      JSON.stringify(validDossier({
        generatedAt: "2026-06-01T00:00:00.000Z",
        selectedPaIds: ["PA02"],
      }), null, 2),
    );
    const s = scaffoldReport(d, { evaluatedAt: "2026-06-20T00:00:00.000Z" });
    const summary = s.prior_art_state.freshness_summary;
    assert.equal(summary.status, "current-human-verified");
    assert.equal(summary.dossier_used, "evidence/prior_art/search-dossier-current.json");
    assert.equal(summary.generated_at, "2026-06-01T00:00:00.000Z");
    assert.equal(summary.age_days, 19);
    assert.equal(summary.closest_art_human_verified, true);
    assert.deepEqual(summary.selected_pa_ids, ["PA02"]);
    assert.equal(summary.ids_ready, true);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("rigor ignores legacy or malformed dossiers and falls back to the newest schema-valid dossier", () => {
  const d = mkdtempSync(join(tmpdir(), "apa-rigor-dossier-schema-"));
  try {
    cpSync(EXAMPLE, d, { recursive: true });
    const priorDir = join(d, "evidence", "prior_art");
    mkdirSync(priorDir, { recursive: true });
    writeFileSync(
      join(priorDir, "search-dossier-valid.json"),
      JSON.stringify(validDossier({ generatedAt: "2026-06-01T00:00:00.000Z" })),
    );
    writeFileSync(join(priorDir, "search-dossier-newer-legacy.json"), JSON.stringify({
      schema: "apa-prior-art-search-dossier-v1",
      generated_at: "2026-06-19T00:00:00.000Z",
      closest_art_selection: {
        human_verified: true,
        selected_pa_ids: ["PA99"],
        verification: { ids_ready: true },
      },
    }));
    writeFileSync(join(priorDir, "search-dossier-malformed.json"), "{");

    const state = buildPriorArtState(d, { evaluatedAt: "2026-06-20T00:00:00.000Z" });
    assert.equal(state.dossiers_found, 1);
    assert.equal(state.newest_dossier.path, "evidence/prior_art/search-dossier-valid.json");
    assert.deepEqual(state.closest_art.selected_pa_ids, ["PA01"]);
    assert.equal(state.cap_required, false);

    rmSync(join(priorDir, "search-dossier-valid.json"));
    const legacyOnly = buildPriorArtState(d, { evaluatedAt: "2026-06-20T00:00:00.000Z" });
    assert.equal(legacyOnly.dossiers_found, 0);
    assert.equal(legacyOnly.cap_required, true);
    assert.ok(legacyOnly.cap_reasons.includes("no-search-dossier"));
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("a scaffold completed with scores validates and computes a verdict", () => {
  const s = scaffoldReport(EXAMPLE);
  s.prior_art_state = {
    evaluated_at: "2026-06-20T00:00:00.000Z",
    staleness_max_days: 180,
    dossiers_found: 1,
    newest_dossier: { path: "evidence/prior_art/search-dossier-current.json", generated_at: "2026-06-01T00:00:00.000Z" },
    closest_art: { human_verified: true, selected_pa_ids: ["PA01"], verified_at: "2026-06-02T00:00:00.000Z" },
  };
  for (const id of ["P1", "P2", "P5", "P6"]) s.dimensions[id].score = 4;
  const r = validateReport(s, { now: "2026-06-20T00:00:00.000Z" });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  // P3=P4=5, P1=P2=P5=P6=4 -> mean ~4.33 -> File-With-Revisions
  assert.equal(r.computed.verdict, "File-With-Revisions");
});

test("apa-rigor check prints prior-art search age and closest-art verification state", () => {
  const d = mkdtempSync(join(tmpdir(), "apa-rigor-check-prior-art-"));
  try {
    const out = join(d, "patent_rigor_report.json");
    const s = scaffoldReport(EXAMPLE);
    const generatedAt = new Date().toISOString();
    s.prior_art_state = {
      evaluated_at: generatedAt,
      staleness_max_days: 180,
      dossiers_found: 1,
      newest_dossier: { path: "evidence/prior_art/search-dossier-current.json", generated_at: generatedAt },
      closest_art: { human_verified: true, selected_pa_ids: ["PA01"], verified_at: generatedAt },
    };
    for (const id of ["P1", "P2", "P5", "P6"]) s.dimensions[id].score = 4;
    writeFileSync(out, JSON.stringify(s, null, 2));
    const res = spawnSync(process.execPath, [CLI, "check", out], { encoding: "utf8" });
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /PRIOR ART: dossier date .*; age 0d; closest-art human verified: yes/);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("apa-rigor scaffold --out appends a runlog entry", () => {
  const d = mkdtempSync(join(tmpdir(), "apa-rigor-runlog-"));
  try {
    cpSync(EXAMPLE, d, { recursive: true });
    const out = join(d, "patent_rigor_report.json");
    const res = spawnSync(process.execPath, [CLI, "scaffold", "--matter", d, "--out", out], {
      encoding: "utf8",
    });
    assert.equal(res.status, 0, res.stderr);
    const log = validateRunlog(d);
    assert.equal(log.ok, true, JSON.stringify(log.errors));
    assert.equal(log.entries.length, 1);
    const entry = log.entries[0];
    assert.equal(entry.skill, "apa-rigor");
    assert.ok(entry.outputs.some((o) => o.path === "patent_rigor_report.json"));
    assert.ok(entry.human_checkpoints.some((c) => c.id === "semantic-rigor-review"));
    assert.ok(entry.human_checkpoints.some((c) => c.id === "prior-art-state-review"));
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});
