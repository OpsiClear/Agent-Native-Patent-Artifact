import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildCompositionEnablementReview,
  buildFormulationClaimSeeds,
  buildFormulationSummary,
  buildRangesAndExamplesReview,
} from "../formulation-domain.mjs";
import { validateRunlog } from "../../apa-trace/runlog.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..", "..");
const CLI = join(HERE, "..", "cli.mjs");
const EXAMPLE = join(ROOT, "examples", "minimal-patent-artifact");

function makeFormulationSource(dir) {
  const src = join(dir, "formulation-source");
  mkdirSync(src, { recursive: true });
  writeFileSync(join(src, "composition.md"), [
    "# Hydrogel formulation source",
    "",
    "| Ingredient | Role | Range |",
    "|---|---|---|",
    "| hyaluronic acid | polymer | 0.5-2.0 wt% |",
    "| lidocaine | active | 1-5 mg/ml |",
    "| phosphate buffer | buffer | 10-40 parts |",
    "| polysorbate 80 | surfactant | 0.01-0.1 wt% |",
    "",
    "Working Example 1",
    "The polymer and phosphate buffer were mixed, the active was dissolved, and the surfactant was blended before sterile filtration.",
    "The gel viscosity was 1200 cP and release remained stable after 30 days.",
    "",
    "Comparative Example A",
    "A formulation without surfactant showed phase separation and reduced stability.",
    "",
  ].join("\n"));
  writeFileSync(join(src, "protocol.txt"), [
    "Protocol P1: heat buffer to 40 C, dissolve lidocaine, cool to room temperature, and mix with polymer.",
    "Adjust pH to 7.2 and filter through a sterile membrane.",
  ].join("\n"));
  return src;
}

test("formulation summary extracts ingredients, ranges, examples, procedures, and properties", () => {
  const d = mkdtempSync(join(tmpdir(), "apa-domain-formulation-"));
  try {
    const summary = buildFormulationSummary(makeFormulationSource(d));
    assert.equal(summary.schema, "apa-formulation-domain-artifact-v1");
    assert.equal(summary.artifact, "formulation_summary");
    assert.ok(summary.ingredients.length >= 4);
    assert.ok(summary.ingredients.some((i) => i.name.includes("hyaluronic acid")));
    assert.ok(summary.ranges.some((r) => r.unit === "wt%" && r.low === 0.5 && r.high === 2));
    assert.ok(summary.examples.some((e) => e.kind === "working"));
    assert.ok(summary.examples.some((e) => e.kind === "comparative"));
    assert.ok(summary.procedures.some((p) => /dissolve/i.test(p.step)));
    assert.ok(summary.measured_properties.some((p) => p.property === "viscosity"));
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("formulation builders emit claim seeds and review reports without legal conclusions", () => {
  const d = mkdtempSync(join(tmpdir(), "apa-domain-formulation-"));
  try {
    const summary = buildFormulationSummary(makeFormulationSource(d));
    const seeds = buildFormulationClaimSeeds(summary);
    const enablement = buildCompositionEnablementReview(summary, seeds);
    const ranges = buildRangesAndExamplesReview(summary);
    assert.equal(seeds.composition_seed.candidate_limitations.every((l) => l.adoption_state === "ai-suggested"), true);
    assert.match(seeds.legal_posture, /not a claim-scope recommendation/);
    assert.equal(enablement.legal_posture.includes("no legal conclusion"), true);
    assert.notEqual(enablement.verdict, "blocking-findings");
    assert.equal(ranges.verdict, "ready-for-human-range-review");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("formulation enablement review blocks empty ingredient disclosures", () => {
  const review = buildCompositionEnablementReview({ ingredients: [], ranges: [], examples: [], measured_properties: [] });
  assert.equal(review.verdict, "blocking-findings");
  assert.ok(review.findings.some((f) => f.severity === "blocking"));
});

test("formulation domain CLI run-all writes hook outputs under domain/formulation and appends runlog", () => {
  const d = mkdtempSync(join(tmpdir(), "apa-domain-formulation-cli-"));
  try {
    cpSync(EXAMPLE, d, { recursive: true });
    const source = makeFormulationSource(d);
    execFileSync(process.execPath, [CLI, "run-all", "--matter", d, "--source", source], { stdio: "pipe" });
    for (const name of [
      "formulation_summary.json",
      "formulation_claim_seeds.json",
      "composition_enablement_review.json",
      "ranges_and_examples_review.json",
    ]) {
      assert.ok(existsSync(join(d, "domain", "formulation", name)), `${name} should exist`);
    }
    const seeds = JSON.parse(readFileSync(join(d, "domain", "formulation", "formulation_claim_seeds.json"), "utf8"));
    assert.equal(seeds.composition_seed.candidate_limitations[0].adoption_state, "ai-suggested");
    const runlog = validateRunlog(d);
    assert.equal(runlog.ok, true, JSON.stringify(runlog.errors));
    assert.equal(runlog.entries.at(-1).skill, "apa-domain-formulation");
    assert.ok(runlog.entries.at(-1).outputs.some((o) => /domain\/formulation\/formulation_summary\.json$/.test(o.path)));
    assert.equal(runlog.entries.at(-1).human_checkpoints[0].id, "formulation-domain-human-adoption");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});
