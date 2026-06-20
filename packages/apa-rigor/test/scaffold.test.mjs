import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { scaffoldReport } from "../scaffold.mjs";
import { validateReport } from "../verdict.mjs";
import { validateRunlog } from "../../apa-trace/runlog.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const EXAMPLE = join(HERE, "..", "..", "..", "examples", "minimal-patent-artifact");
const CLI = join(HERE, "..", "cli.mjs");

test("scaffoldReport: clean example -> Level-1 passed, mechanical dims prefilled, judgment dims null", () => {
  const s = scaffoldReport(EXAMPLE);
  assert.equal(s.level1.passed, true);
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

test("scaffoldReport records prior-art freshness summary for the dossier used", () => {
  const d = mkdtempSync(join(tmpdir(), "apa-rigor-prior-art-"));
  try {
    cpSync(EXAMPLE, d, { recursive: true });
    const priorDir = join(d, "evidence", "prior_art");
    mkdirSync(priorDir, { recursive: true });
    writeFileSync(join(priorDir, "search-dossier-current.json"), JSON.stringify({
      generated_at: "2026-06-01T00:00:00.000Z",
      closest_art_selection: {
        human_verified: true,
        selected_pa_ids: ["PA02"],
        verified_at: "2026-06-02T00:00:00.000Z",
        verification: { ids_ready: true },
      },
    }, null, 2));
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
  const r = validateReport(s);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  // P3=P4=5, P1=P2=P5=P6=4 -> mean ~4.33 -> File-With-Revisions
  assert.equal(r.computed.verdict, "File-With-Revisions");
});

test("apa-rigor check prints prior-art search age and closest-art verification state", () => {
  const d = mkdtempSync(join(tmpdir(), "apa-rigor-check-prior-art-"));
  try {
    const out = join(d, "patent_rigor_report.json");
    const s = scaffoldReport(EXAMPLE);
    s.prior_art_state = {
      evaluated_at: "2026-06-20T00:00:00.000Z",
      staleness_max_days: 180,
      dossiers_found: 1,
      newest_dossier: { path: "evidence/prior_art/search-dossier-current.json", generated_at: "2026-06-01T00:00:00.000Z" },
      closest_art: { human_verified: true, selected_pa_ids: ["PA01"], verified_at: "2026-06-02T00:00:00.000Z" },
    };
    for (const id of ["P1", "P2", "P5", "P6"]) s.dimensions[id].score = 4;
    writeFileSync(out, JSON.stringify(s, null, 2));
    const res = spawnSync(process.execPath, [CLI, "check", out], { encoding: "utf8" });
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /PRIOR ART: dossier date 2026-06-01T00:00:00\.000Z; age 19d; closest-art human verified: yes/);
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
