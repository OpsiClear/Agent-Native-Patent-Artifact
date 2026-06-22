import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildComponentInventory,
  buildFigurePlan,
  buildMechanicalClaimSeeds,
  buildReferenceNumeralReview,
} from "../device-domain.mjs";
import { validateRunlog } from "../../apa-trace/runlog.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..", "..");
const CLI = join(HERE, "..", "cli.mjs");
const EXAMPLE = join(ROOT, "examples", "minimal-patent-artifact");

function makeDeviceSource(dir) {
  const src = join(dir, "device-source");
  mkdirSync(src, { recursive: true });
  writeFileSync(join(src, "components.md"), [
    "# Hinge assembly source",
    "",
    "| Ref | Component | Role |",
    "|---|---|---|",
    "| 100 | base plate | fixed support |",
    "| 110 | hinge arm | movable member |",
    "| 120 | pivot pin | rotational axis |",
    "| 130 | torsion spring | biasing element |",
    "",
    "The hinge arm is pivotally connected to the base plate by the pivot pin.",
    "The torsion spring biases the hinge arm toward a closed position.",
    "",
  ].join("\n"));
  writeFileSync(join(src, "drawing_refs.json"), JSON.stringify({
    refs: [
      { ref: "100", label: "base plate" },
      { ref: "110", label: "hinge arm" },
      { ref: "120", label: "pivot pin" },
      { ref: "130", label: "torsion spring" },
    ],
  }, null, 2));
  return src;
}

test("device domain inventory extracts components, relationships, and drawing refs", () => {
  const d = mkdtempSync(join(tmpdir(), "apa-domain-device-"));
  try {
    const inventory = buildComponentInventory(makeDeviceSource(d));
    assert.equal(inventory.schema, "apa-device-domain-artifact-v1");
    assert.equal(inventory.artifact, "component_inventory");
    assert.equal(inventory.components.length, 4);
    assert.ok(inventory.components.some((c) => c.ref === "110" && c.name === "hinge arm"));
    assert.ok(inventory.relationships.some((r) => r.relation === "pivotally connected to"));
    assert.equal(inventory.drawing_refs.length, 4);
    assert.ok(inventory.mechanism_signals.some((s) => /hinge|pivot|spring/.test(s)));
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("device domain builders emit mechanical seeds, figure plans, and numeral review", () => {
  const d = mkdtempSync(join(tmpdir(), "apa-domain-device-"));
  try {
    const inventory = buildComponentInventory(makeDeviceSource(d));
    const seeds = buildMechanicalClaimSeeds(inventory);
    const figures = buildFigurePlan(inventory);
    const review = buildReferenceNumeralReview(inventory);
    assert.equal(seeds.legal_posture.includes("not a claim-scope recommendation"), true);
    assert.ok(seeds.apparatus_seed.candidate_limitations.every((l) => l.adoption_state === "ai-suggested"));
    assert.ok(figures.proposed_figures.some((f) => f.view_type === "exploded"));
    assert.equal(review.verdict, "ready-for-human-drawing-review");
    assert.equal(review.findings.length, 0);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("device domain numeral review blocks inconsistent labels", () => {
  const inventory = {
    components: [{ ref: "100", name: "base plate", source: "component.md" }],
    drawing_refs: [
      { ref: "100", label: "base plate", source: "fig.json" },
      { ref: "100", label: "mounting bracket", source: "fig.json" },
    ],
  };
  const review = buildReferenceNumeralReview(inventory);
  assert.equal(review.verdict, "blocking-findings");
  assert.ok(review.findings.some((f) => /inconsistent labels/.test(f.recommendation)));
});

test("device domain CLI run-all writes hook outputs under domain/device and appends runlog", () => {
  const d = mkdtempSync(join(tmpdir(), "apa-domain-device-cli-"));
  try {
    cpSync(EXAMPLE, d, { recursive: true });
    const source = makeDeviceSource(d);
    execFileSync(process.execPath, [CLI, "run-all", "--matter", d, "--source", source], { stdio: "pipe" });
    for (const name of [
      "component_inventory.json",
      "mechanical_claim_seeds.json",
      "figure_plan.json",
      "reference_numeral_review.json",
    ]) {
      assert.ok(existsSync(join(d, "domain", "device", name)), `${name} should exist`);
    }
    const seeds = JSON.parse(readFileSync(join(d, "domain", "device", "mechanical_claim_seeds.json"), "utf8"));
    assert.equal(seeds.apparatus_seed.candidate_limitations[0].adoption_state, "ai-suggested");
    const runlog = validateRunlog(d);
    assert.equal(runlog.ok, true, JSON.stringify(runlog.errors));
    assert.equal(runlog.entries.at(-1).skill, "apa-domain-device");
    assert.ok(runlog.entries.at(-1).outputs.some((o) => /domain\/device\/component_inventory\.json$/.test(o.path)));
    assert.equal(runlog.entries.at(-1).human_checkpoints[0].id, "device-domain-human-adoption");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});
