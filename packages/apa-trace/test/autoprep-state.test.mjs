import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  autoprepStatePath,
  blockedStateReport,
  completeAutoprepStage,
  loadAutoprepState,
  recordExaminerLoop,
  restartAutoprepStage,
  shouldSkipAutoprepStage,
} from "../autoprep-state.mjs";
import { validateRunlog } from "../runlog.mjs";

test("completeAutoprepStage writes resumable stage hashes and runlog checkpoints", () => {
  const d = mkdtempSync(join(tmpdir(), "apa-autoprep-state-"));
  try {
    const input = join(d, "PATENT.md");
    const output = join(d, "logic-claims.md");
    writeFileSync(input, "alpha");
    writeFileSync(output, "beta");
    const state = completeAutoprepStage(d, {
      stage: "claims",
      inputPaths: [input],
      outputPaths: [output],
      nextStage: "specification",
      timestamp: "2026-06-20T00:00:00.000Z",
      humanCheckpoints: [{ id: "registered-practitioner-claim-review", required: true, satisfied: false }],
    });
    assert.ok(existsSync(autoprepStatePath(d)));
    assert.equal(state.current_stage, "specification");
    assert.equal(state.last_completed_stage, "claims");
    assert.equal(state.stages.claims.inputs[0].path, "PATENT.md");
    assert.equal(state.stages.claims.outputs[0].path, "logic-claims.md");
    assert.equal(shouldSkipAutoprepStage(d, { stage: "claims", inputPaths: [input], outputPaths: [output] }), true);

    const runlog = validateRunlog(d);
    assert.equal(runlog.ok, true, JSON.stringify(runlog.errors));
    assert.equal(runlog.entries.length, 1);
    assert.equal(runlog.entries[0].skill, "apa-autoprep");
    assert.equal(runlog.entries[0].human_checkpoints[0].id, "registered-practitioner-claim-review");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("stage hash comparison prevents stale skip decisions when inputs change", () => {
  const d = mkdtempSync(join(tmpdir(), "apa-autoprep-skip-"));
  try {
    const input = join(d, "input.md");
    const output = join(d, "output.md");
    writeFileSync(input, "alpha");
    writeFileSync(output, "beta");
    completeAutoprepStage(d, {
      stage: "prior-art-search",
      inputPaths: [input],
      outputPaths: [output],
      appendLog: false,
    });
    assert.equal(shouldSkipAutoprepStage(d, { stage: "prior-art-search", inputPaths: [input], outputPaths: [output] }), true);
    writeFileSync(input, "changed");
    assert.equal(shouldSkipAutoprepStage(d, { stage: "prior-art-search", inputPaths: [input], outputPaths: [output] }), false);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("recordExaminerLoop enforces the loop cap and emits blocked-state recovery options", () => {
  const d = mkdtempSync(join(tmpdir(), "apa-autoprep-loop-"));
  try {
    assert.equal(recordExaminerLoop(d, { maxExaminerLoops: 2 }).allowed, true);
    assert.equal(recordExaminerLoop(d, { maxExaminerLoops: 2 }).allowed, true);
    const blocked = recordExaminerLoop(d, { maxExaminerLoops: 2 });
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.state.status, "blocked");
    assert.match(blocked.state.blocked_reason, /max_examiner_loops/);
    assert.deepEqual(blocked.blocked_report.recovery_options, ["emit-residual-risk-report", "request-human-override"]);
    const override = recordExaminerLoop(d, { maxExaminerLoops: 2, humanOverride: true });
    assert.equal(override.allowed, true);
    assert.equal(override.state.examiner_loops.count, 3);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("restartAutoprepStage clears a completed stage and resumes that stage", () => {
  const d = mkdtempSync(join(tmpdir(), "apa-autoprep-restart-"));
  try {
    const input = join(d, "input.md");
    writeFileSync(input, "alpha");
    completeAutoprepStage(d, { stage: "figures", inputPaths: [input], appendLog: false });
    assert.ok(loadAutoprepState(d).stages.figures);
    const restarted = restartAutoprepStage(d, "figures");
    assert.equal(restarted.current_stage, "figures");
    assert.equal(restarted.next_recommended_stage, "figures");
    assert.equal(restarted.stages.figures, undefined);
    const report = blockedStateReport({
      status: "blocked",
      current_stage: "figures",
      blocked_reason: "test",
      next_recommended_stage: "restart-current-stage",
      recovery_options: ["restart-current-stage"],
    });
    assert.equal(report.schema, "apa-autoprep-blocked-report-v1");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});
