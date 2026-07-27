import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { planPipeline, statusForMatter } from "../runner.mjs";
import {
  appendRunlog,
  buildRunlogEntry,
  commandRecord,
  existingFileRecords,
  humanCheckpoint,
} from "../../apa-trace/runlog.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, "..", "cli.mjs");

test("apa-run plans the core pipeline", () => {
  const plan = planPipeline({ matter: "examples/minimal-patent-artifact" });
  assert.equal(plan.schema, "apa-run-plan-v1");
  assert.ok(plan.steps.find((s) => s.id === "apa-disclose"));
  assert.ok(plan.steps.find((s) => s.id === "apa-assemble"));
});

test("apa-run inserts enabled software domain hook steps", () => {
  const plan = planPipeline({ matter: "examples/minimal-patent-artifact", domains: ["software"] });
  assert.ok(plan.steps.find((s) => s.id === "apa-software-patent"));
  const claimSeed = plan.steps.find((s) => s.hook === "claims.seed");
  assert.ok(claimSeed);
  assert.equal(claimSeed.runner, "node packages/apa-domain-software/cli.mjs claim-seeds");
});

test("apa-run inserts enabled device domain hook steps", () => {
  const plan = planPipeline({ matter: "examples/minimal-patent-artifact", domains: ["device"] });
  const figureReview = plan.steps.find((s) => s.id === "apa-reference-numeral-review");
  assert.ok(figureReview);
  assert.equal(figureReview.hook, "figures.review");
  assert.equal(figureReview.runner, "node packages/apa-domain-device/cli.mjs numeral-review");
});

test("apa-run inserts enabled formulation domain hook steps", () => {
  const plan = planPipeline({ matter: "examples/minimal-patent-artifact", domains: ["formulation"] });
  const review = plan.steps.find((s) => s.id === "apa-composition-enablement-review");
  assert.ok(review);
  assert.equal(review.hook, "analysis.domain");
  assert.equal(review.runner, "node packages/apa-domain-formulation/cli.mjs enablement-review");
});

test("apa-run inserts enabled drawing support hook steps", () => {
  const plan = planPipeline({
    matter: "examples/minimal-patent-artifact",
    supports: ["apa-svg-upgrader", "apa-tldraw-drawings"],
  });
  const figures = plan.steps.findIndex((s) => s.id === "apa-figures");
  const tldraw = plan.steps.findIndex((s) => s.id === "apa-tldraw-drawings");
  const upgrader = plan.steps.findIndex((s) => s.id === "apa-svg-upgrader");
  const quality = plan.steps.findIndex((s) => s.id === "apa-drawing-quality");
  assert.ok(figures >= 0);
  assert.ok(tldraw > figures);
  assert.ok(upgrader > tldraw);
  assert.ok(quality > upgrader);
  assert.equal(plan.steps.filter((s) => s.id === "apa-tldraw-drawings").length, 1);
  assert.equal(plan.steps.filter((s) => s.id === "apa-svg-upgrader").length, 1);
  assert.equal(plan.steps[tldraw].hook, "figures.review");
  assert.equal(plan.steps[upgrader].enabled_support, true);
});

test("apa-run normalizes support aliases and emits each support once", () => {
  const plan = planPipeline({
    matter: "examples/minimal-patent-artifact",
    supports: ["svg-upgrader", "/apa-svg-upgrader", "/apa-tldraw-drawings", "patent-svg-upgrader", "tldraw-patent-drawing"],
  });
  assert.deepEqual(plan.supports, ["apa-svg-upgrader", "apa-tldraw-drawings"]);
  assert.equal(plan.steps.filter((s) => s.id === "apa-svg-upgrader").length, 1);
  assert.equal(plan.steps.filter((s) => s.id === "apa-tldraw-drawings").length, 1);
});

test("apa-run inserts the review form support before assembly", () => {
  const plan = planPipeline({
    matter: "examples/minimal-patent-artifact",
    supports: ["review-form"],
  });
  const rigor = plan.steps.findIndex((s) => s.id === "apa-rigor");
  const reviewForm = plan.steps.findIndex((s) => s.id === "apa-review-form");
  const assemble = plan.steps.findIndex((s) => s.id === "apa-assemble");
  assert.deepEqual(plan.supports, ["apa-review-form"]);
  assert.ok(reviewForm > rigor);
  assert.ok(assemble > reviewForm);
  assert.equal(plan.steps[reviewForm].hook, "assembly.preflight");
});

test("apa-run fails loud on unknown domains or support skills", () => {
  assert.throws(
    () => planPipeline({ matter: "examples/minimal-patent-artifact", domains: ["not-a-domain"] }),
    /unknown domain\(s\): not-a-domain/
  );
  assert.throws(
    () => planPipeline({ matter: "examples/minimal-patent-artifact", supports: ["svg-upgrade"] }),
    /unknown or non-hookable support skill\(s\): apa-svg-upgrade/
  );
  assert.throws(
    () => planPipeline({ matter: "examples/minimal-patent-artifact", supports: ["apa-office-action"] }),
    /unknown or non-hookable support skill\(s\): apa-office-action/
  );
});

test("apa-run CLI rejects missing values for value flags", () => {
  const res = spawnSync(process.execPath, [CLI, "plan", "--matter", "examples/minimal-patent-artifact", "--support"], {
    encoding: "utf8",
  });
  assert.equal(res.status, 2);
  assert.match(res.stderr, /--support requires a value/);
});

test("apa-run status reads missing/present inputs without failing", () => {
  const status = statusForMatter({ matter: "examples/minimal-patent-artifact", domains: ["software"] });
  assert.equal(status.schema, "apa-run-status-v2");
  assert.equal(status.runlog_ok, true);
  assert.ok(status.steps.length > 0);
  assert.ok(status.steps.every((step) => step.completed === false));
  assert.ok(status.steps.every((step) => step.completion.reasons.length > 0));
});

function graphWithEvidenceStep() {
  return {
    skills: [{
      id: "apa-evidence-step",
      command: "/apa-evidence-step",
      phase: "review",
      kind: "core",
      inputs: ["input.md"],
      outputs: ["output.json", "trace/runlog.jsonl"],
      gates_after: [],
      human_checkpoints: ["human-review"],
    }],
    domains: [],
    registry: {
      optional: [],
      hooks: [],
      pipeline: { order: ["apa-evidence-step"] },
    },
  };
}

function appendSuccessfulEvidence(matter, { checkpoint = true, exitCode = 0 } = {}) {
  appendRunlog(matter, buildRunlogEntry({
    timestamp: "2026-07-26T12:00:00.000Z",
    skill: "apa-evidence-step",
    inputs: existingFileRecords(matter, [join(matter, "input.md")]),
    outputs: existingFileRecords(matter, [join(matter, "output.json")]),
    commands: [commandRecord({ argv: ["node", "step.mjs"], exitCode })],
    humanCheckpoints: [humanCheckpoint({ id: "human-review", required: true, satisfied: checkpoint })],
  }));
}

test("apa-run completion requires command, current hashes, expected outputs, and human checkpoints", () => {
  const matter = mkdtempSync(join(tmpdir(), "apa-run-evidence-"));
  try {
    writeFileSync(join(matter, "input.md"), "input-v1");
    writeFileSync(join(matter, "output.json"), "{}");
    appendSuccessfulEvidence(matter);

    const status = statusForMatter({ matter, graph: graphWithEvidenceStep() });
    assert.equal(status.steps[0].completed, true, JSON.stringify(status.steps[0].completion, null, 2));
    assert.equal(status.steps[0].completion.status, "completed");
    assert.deepEqual(status.steps[0].completion.reasons, []);
    assert.deepEqual(status.pending_checkpoints, []);
  } finally {
    rmSync(matter, { recursive: true, force: true });
  }
});

test("apa-run reports stale hashes and does not fall back past the latest failed command", () => {
  const matter = mkdtempSync(join(tmpdir(), "apa-run-stale-"));
  try {
    writeFileSync(join(matter, "input.md"), "input-v1");
    writeFileSync(join(matter, "output.json"), "{}");
    appendSuccessfulEvidence(matter);
    writeFileSync(join(matter, "input.md"), "input-v2");
    writeFileSync(join(matter, "output.json"), "{\"changed\":true}");
    appendRunlog(matter, buildRunlogEntry({
      timestamp: "2026-07-26T12:01:00.000Z",
      skill: "apa-evidence-step",
      commands: [commandRecord({ argv: ["node", "step.mjs"], exitCode: 1 })],
    }));

    const step = statusForMatter({ matter, graph: graphWithEvidenceStep() }).steps[0];
    assert.equal(step.completed, false);
    assert.equal(step.completion.status, "failed");
    assert.ok(step.completion.reasons.some((item) => item.code === "COMMAND_FAILED"));
    assert.ok(step.completion.reasons.some((item) => item.code === "INPUT_HASH_MISMATCH"));
    assert.ok(step.completion.reasons.some((item) => item.code === "OUTPUT_HASH_MISMATCH"));
  } finally {
    rmSync(matter, { recursive: true, force: true });
  }
});

test("apa-run keeps a step pending until a later checkpoint record satisfies review", () => {
  const matter = mkdtempSync(join(tmpdir(), "apa-run-checkpoint-"));
  try {
    writeFileSync(join(matter, "input.md"), "input-v1");
    writeFileSync(join(matter, "output.json"), "{}");
    appendSuccessfulEvidence(matter, { checkpoint: false });

    let status = statusForMatter({ matter, graph: graphWithEvidenceStep() });
    assert.equal(status.steps[0].completed, false);
    assert.ok(status.steps[0].completion.reasons.some((item) => item.code === "CHECKPOINT_PENDING"));
    assert.deepEqual(status.pending_checkpoints, [{
      skill: "apa-evidence-step",
      id: "human-review",
      required: true,
    }]);

    appendRunlog(matter, buildRunlogEntry({
      timestamp: "2026-07-26T12:02:00.000Z",
      skill: "apa-evidence-step",
      humanCheckpoints: [humanCheckpoint({ id: "human-review", required: true, satisfied: true })],
    }));
    status = statusForMatter({ matter, graph: graphWithEvidenceStep() });
    assert.equal(status.steps[0].completed, true, JSON.stringify(status.steps[0].completion, null, 2));
  } finally {
    rmSync(matter, { recursive: true, force: true });
  }
});

test("apa-run rejects a name-only runlog entry as completion evidence", () => {
  const matter = mkdtempSync(join(tmpdir(), "apa-run-name-only-"));
  try {
    writeFileSync(join(matter, "input.md"), "input-v1");
    writeFileSync(join(matter, "output.json"), "{}");
    appendRunlog(matter, buildRunlogEntry({ skill: "apa-evidence-step" }));

    const step = statusForMatter({ matter, graph: graphWithEvidenceStep() }).steps[0];
    assert.equal(step.completed, false);
    assert.ok(step.completion.reasons.some((item) => item.code === "COMMAND_EVIDENCE_MISSING"));
    assert.ok(step.completion.reasons.some((item) => item.code === "OUTPUT_EVIDENCE_MISSING"));
    assert.ok(step.completion.reasons.some((item) => item.code === "CHECKPOINT_PENDING"));
  } finally {
    rmSync(matter, { recursive: true, force: true });
  }
});
