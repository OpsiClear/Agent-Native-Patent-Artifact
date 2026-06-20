import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
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
  assert.ok(s.dimensions.P1.anchors && s.dimensions.P1.anchors[1]);
  assert.deepEqual(s.findings, []);
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
