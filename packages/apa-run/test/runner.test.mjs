import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { executePipeline, planPipeline, statusForMatter } from "../runner.mjs";
import {
  appendRunlog,
  buildRunlogEntry,
  commandRecord,
  existingFileRecords,
  humanCheckpoint,
  validateRunlog,
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

test("apa-run inserts form filling after the assembly draft", () => {
  const plan = planPipeline({
    matter: "examples/minimal-patent-artifact",
    supports: ["form-fill"],
  });
  const assemble = plan.steps.findIndex((step) => step.id === "apa-assemble");
  const formFill = plan.steps.findIndex((step) => step.id === "apa-form-fill");
  assert.deepEqual(plan.supports, ["apa-form-fill"]);
  assert.ok(assemble >= 0);
  assert.ok(formFill > assemble);
  assert.equal(plan.steps[formFill].hook, "assembly.postdraft");
  assert.deepEqual(plan.steps[formFill].inputs, ["PATENT.md"]);
  assert.deepEqual(plan.steps[formFill].outputs, ["assembled/forms/"]);
  assert.equal(plan.steps.filter((step) => step.id === "apa-form-fill").length, 1);
});

test("apa-run can satisfy form-fill evidence through the assembled forms directory", () => {
  const matter = mkdtempSync(join(tmpdir(), "apa-run-form-fill-"));
  try {
    writeFileSync(join(matter, "PATENT.md"), "# Synthetic matter\n");
    const forms = join(matter, "assembled", "forms");
    mkdirSync(forms, { recursive: true });
    const draft = join(forms, "sb16_DRAFT.pdf");
    const manifest = join(forms, "sb16_DRAFT.review.json");
    writeFileSync(draft, "%PDF-1.7\n");
    writeFileSync(manifest, "{}\n");
    appendRunlog(matter, buildRunlogEntry({
      timestamp: "2026-07-28T12:00:00.000Z",
      skill: "apa-form-fill",
      inputs: existingFileRecords(matter, [join(matter, "PATENT.md")]),
      outputs: existingFileRecords(matter, [draft, manifest]),
      commands: [commandRecord({ argv: ["node", "patent_form_fill.mjs", "verify"], exitCode: 0 })],
    }));
    const graph = {
      skills: [{
        id: "apa-form-fill",
        command: "/apa-form-fill",
        phase: "filing",
        kind: "support",
        inputs: ["PATENT.md"],
        outputs: ["assembled/forms/"],
        gates_after: [],
        human_checkpoints: [],
      }],
      domains: [],
      registry: {
        optional: ["apa-form-fill"],
        hooks: [{ id: "assembly.postdraft", after: ["apa-form-fill"] }],
        pipeline: { order: ["apa-form-fill"] },
      },
    };
    const status = statusForMatter({ matter, graph });
    assert.equal(status.steps[0].inputs.length, 1);
    assert.equal(status.steps[0].input_status[0].status, "present");
    assert.equal(status.steps[0].completed, true, JSON.stringify(status.steps[0].completion));
  } finally {
    rmSync(matter, { recursive: true, force: true });
  }
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

test("apa-run status exposes gate checkpoints before any step evidence exists", () => {
  const graph = graphWithEvidenceStep();
  graph.skills[0].gates_after = ["validation-clean"];
  const matter = mkdtempSync(join(tmpdir(), "apa-run-gate-status-"));
  try {
    const status = statusForMatter({ matter, graph });
    assert.deepEqual(status.steps[0].completion.pending_checkpoints, [
      { id: "human-review", required: true },
      { id: "gate:validation-clean", required: true },
    ]);
  } finally {
    rmSync(matter, { recursive: true, force: true });
  }
});

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

function executableLifecycleGraph() {
  return {
    skills: [
      {
        id: "apa-disclose",
        command: "/apa-disclose",
        phase: "capture",
        kind: "core",
        inputs: ["staging/disclosure.txt"],
        outputs: ["logic/problem.md"],
        gates_after: [],
        human_checkpoints: [],
        runner: "node runner-fixture.mjs disclose",
      },
      {
        id: "apa-claims",
        command: "/apa-claims",
        phase: "drafting",
        kind: "core",
        inputs: ["logic/problem.md"],
        outputs: ["logic/claims.md"],
        gates_after: [],
        human_checkpoints: ["claim-adoption"],
        runner: "node runner-fixture.mjs claims",
      },
      {
        id: "apa-spec",
        command: "/apa-spec",
        phase: "drafting",
        kind: "core",
        inputs: ["logic/claims.md"],
        outputs: ["src/embodiments.md"],
        gates_after: [],
        human_checkpoints: [],
        runner: "node runner-fixture.mjs spec",
      },
    ],
    domains: [],
    registry: {
      optional: [],
      hooks: [],
      pipeline: { order: ["apa-disclose", "apa-claims", "apa-spec"] },
    },
  };
}

function writeLifecycleRunner(matter) {
  writeFileSync(join(matter, "runner-fixture.mjs"), `
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const stage = process.argv[2];
const matter = process.argv[process.argv.indexOf("--matter") + 1];
if (stage === "fail") process.exit(7);
if (stage === "disclose") {
  const disclosure = readFileSync(join(matter, "staging", "disclosure.txt"), "utf8").trim();
  mkdirSync(join(matter, "logic"), { recursive: true });
  writeFileSync(join(matter, "logic", "problem.md"), "# Problem\\n\\n" + disclosure + "\\n");
} else if (stage === "claims") {
  const problem = readFileSync(join(matter, "logic", "problem.md"), "utf8").trim();
  writeFileSync(join(matter, "logic", "claims.md"), "# Claims\\n\\n" + problem + "\\n");
} else if (stage === "spec") {
  const claims = readFileSync(join(matter, "logic", "claims.md"), "utf8").trim();
  mkdirSync(join(matter, "src"), { recursive: true });
  writeFileSync(join(matter, "src", "embodiments.md"), "# Specification\\n\\n" + claims + "\\n");
} else if (stage === "noop") {
  // Intentionally successful without writing output; used to verify evidence fail-closed behavior.
} else {
  process.exit(9);
}
`, "utf8");
}

test("apa-run executes declared runners from disclosure through claims and specification with checkpoint continuation", () => {
  const matter = mkdtempSync(join(tmpdir(), "apa-run-lifecycle-"));
  try {
    mkdirSync(join(matter, "staging"), { recursive: true });
    writeFileSync(join(matter, "staging", "disclosure.txt"), "A source-backed disclosure.");
    writeLifecycleRunner(matter);
    const graph = executableLifecycleGraph();

    const first = executePipeline({ matter, graph, runnerRoot: matter });
    assert.equal(first.status, "awaiting-checkpoint", JSON.stringify(first, null, 2));
    assert.deepEqual(first.executed.map((step) => step.id), ["apa-disclose", "apa-claims"]);
    assert.deepEqual(first.pending_checkpoints, [{ id: "claim-adoption", required: true }]);
    assert.equal(existsSync(join(matter, "logic", "problem.md")), true);
    assert.equal(existsSync(join(matter, "logic", "claims.md")), true);
    assert.equal(existsSync(join(matter, "src", "embodiments.md")), false);

    appendRunlog(matter, buildRunlogEntry({
      skill: "apa-claims",
      humanCheckpoints: [
        humanCheckpoint({
          id: "claim-adoption",
          required: true,
          satisfied: true,
          reviewer: "fixture-human",
          timestamp: "2026-07-27T12:00:00.000Z",
        }),
      ],
    }));
    const stopped = executePipeline({ matter, graph, runnerRoot: matter });
    assert.equal(stopped.status, "awaiting-continuation", JSON.stringify(stopped, null, 2));
    assert.equal(stopped.step.id, "apa-claims");

    const resumed = executePipeline({
      matter,
      graph,
      runnerRoot: matter,
      continueAfter: ["apa-claims"],
    });
    assert.equal(resumed.status, "complete", JSON.stringify(resumed, null, 2));
    assert.deepEqual(resumed.executed.map((step) => step.id), ["apa-spec"]);
    assert.match(readFileSync(join(matter, "src", "embodiments.md"), "utf8"), /source-backed disclosure/i);
    assert.equal(validateRunlog(matter).ok, true);

    writeFileSync(join(matter, "staging", "disclosure.txt"), "A revised source-backed disclosure.");
    const rerun = executePipeline({ matter, graph, runnerRoot: matter });
    assert.equal(rerun.status, "awaiting-checkpoint", JSON.stringify(rerun, null, 2));
    assert.deepEqual(rerun.executed.map((step) => step.id), ["apa-disclose", "apa-claims"]);
    appendRunlog(matter, buildRunlogEntry({
      skill: "apa-claims",
      humanCheckpoints: [
        humanCheckpoint({
          id: "claim-adoption",
          required: true,
          satisfied: true,
          reviewer: "fixture-human",
          timestamp: "2026-07-27T13:00:00.000Z",
        }),
      ],
    }));
    const freshStop = executePipeline({ matter, graph, runnerRoot: matter });
    assert.equal(freshStop.status, "awaiting-continuation", JSON.stringify(freshStop, null, 2));
    assert.equal(freshStop.step.id, "apa-claims");
    const freshResume = executePipeline({
      matter,
      graph,
      runnerRoot: matter,
      continueAfter: ["apa-claims"],
    });
    assert.equal(freshResume.status, "complete", JSON.stringify(freshResume, null, 2));
    assert.deepEqual(freshResume.executed.map((step) => step.id), ["apa-spec"]);
    assert.match(readFileSync(join(matter, "src", "embodiments.md"), "utf8"), /revised source-backed disclosure/i);
  } finally {
    rmSync(matter, { recursive: true, force: true });
  }
});

test("apa-run records failed attempts with no claimed outputs", () => {
  const matter = mkdtempSync(join(tmpdir(), "apa-run-failure-"));
  try {
    writeLifecycleRunner(matter);
    const graph = {
      skills: [{
        id: "apa-failing-runner",
        command: "/apa-failing-runner",
        phase: "capture",
        kind: "core",
        inputs: [],
        outputs: ["logic/should-not-exist.md"],
        gates_after: [],
        human_checkpoints: [],
        runner: "node runner-fixture.mjs fail",
      }],
      domains: [],
      registry: {
        optional: [],
        hooks: [],
        pipeline: { order: ["apa-failing-runner"] },
      },
    };
    const result = executePipeline({ matter, graph, runnerRoot: matter });
    assert.equal(result.status, "failed", JSON.stringify(result, null, 2));
    assert.equal(result.exit_code, 7);
    const entries = validateRunlog(matter).entries.filter((entry) => entry.skill === "apa-failing-runner");
    assert.equal(entries.length, 1);
    assert.equal(entries[0].commands[0].exit_code, 7);
    assert.deepEqual(entries[0].outputs, []);
    assert.equal(existsSync(join(matter, "logic", "should-not-exist.md")), false);
  } finally {
    rmSync(matter, { recursive: true, force: true });
  }
});

test("apa-run retries a failed checkpointed runner instead of waiting for human review", () => {
  const matter = mkdtempSync(join(tmpdir(), "apa-run-failure-retry-"));
  try {
    writeLifecycleRunner(matter);
    const graph = {
      skills: [{
        id: "apa-failing-runner",
        command: "/apa-failing-runner",
        phase: "capture",
        kind: "core",
        inputs: [],
        outputs: [],
        gates_after: ["runner-success"],
        human_checkpoints: ["human-review"],
        runner: "node runner-fixture.mjs fail",
      }],
      domains: [],
      registry: {
        optional: [],
        hooks: [],
        pipeline: { order: ["apa-failing-runner"] },
      },
    };
    const first = executePipeline({ matter, graph, runnerRoot: matter });
    const second = executePipeline({ matter, graph, runnerRoot: matter });
    assert.equal(first.status, "failed");
    assert.equal(second.status, "failed");
    assert.equal(second.exit_code, 7);
    const entries = validateRunlog(matter).entries.filter((entry) => entry.skill === "apa-failing-runner");
    assert.equal(entries.length, 2, "the second call must execute and record a second attempt");
  } finally {
    rmSync(matter, { recursive: true, force: true });
  }
});

test("apa-run fails incomplete successful evidence before exposing checkpoints", () => {
  const matter = mkdtempSync(join(tmpdir(), "apa-run-incomplete-output-"));
  try {
    writeLifecycleRunner(matter);
    const graph = {
      skills: [{
        id: "apa-incomplete-runner",
        command: "/apa-incomplete-runner",
        phase: "capture",
        kind: "core",
        inputs: [],
        outputs: ["logic/missing-output.md"],
        gates_after: ["output-complete"],
        human_checkpoints: ["human-review"],
        runner: "node runner-fixture.mjs noop",
      }],
      domains: [],
      registry: {
        optional: [],
        hooks: [],
        pipeline: { order: ["apa-incomplete-runner"] },
      },
    };
    const result = executePipeline({ matter, graph, runnerRoot: matter });
    assert.equal(result.status, "failed", JSON.stringify(result, null, 2));
    assert.match(result.error, /declared evidence is incomplete/);
    assert.ok(result.reasons.some((item) => item.code === "OUTPUT_EVIDENCE_MISSING"));
    assert.ok(result.reasons.some((item) => item.code === "CHECKPOINT_PENDING"));
  } finally {
    rmSync(matter, { recursive: true, force: true });
  }
});

test("apa-run rejects a declared runner that overrides the selected matter", () => {
  const matter = mkdtempSync(join(tmpdir(), "apa-run-matter-override-"));
  try {
    writeLifecycleRunner(matter);
    const graph = {
      skills: [{
        id: "apa-override-runner",
        command: "/apa-override-runner",
        phase: "capture",
        kind: "core",
        inputs: [],
        outputs: [],
        gates_after: [],
        human_checkpoints: [],
        runner: "node runner-fixture.mjs noop --matter elsewhere",
      }],
      domains: [],
      registry: {
        optional: [],
        hooks: [],
        pipeline: { order: ["apa-override-runner"] },
      },
    };
    const result = executePipeline({ matter, graph, runnerRoot: matter });
    assert.equal(result.status, "failed");
    assert.equal(result.exit_code, 2);
    assert.match(result.error, /must not override.*--matter/);
  } finally {
    rmSync(matter, { recursive: true, force: true });
  }
});
