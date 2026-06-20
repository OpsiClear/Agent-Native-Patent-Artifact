import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  confidentialWorkflowModeOf,
  isConfidentialWorkflowMode,
  sensitiveCritiqueArtifactsPresent,
  shareableExportPolicy,
} from "../confidential-workflow.mjs";

test("confidential workflow modes default local and validate known modes", () => {
  assert.deepEqual(confidentialWorkflowModeOf({}), {
    mode: "ordinary_local",
    explicit: false,
    valid: true,
    label: "ordinary local workflow",
  });
  assert.equal(isConfidentialWorkflowMode("counsel_controlled"), true);
  assert.equal(isConfidentialWorkflowMode("public_release"), false);
});

test("shareable policy excludes sensitive critique artifacts by default", () => {
  const d = mkdtempSync(join(tmpdir(), "apa-confidential-"));
  try {
    mkdirSync(join(d, "logic"), { recursive: true });
    mkdirSync(join(d, "trace"), { recursive: true });
    writeFileSync(join(d, "logic", "patentability_report.json"), "{}\n");
    writeFileSync(join(d, "trace", "examiner_adversary_report.json"), "{}\n");

    const present = sensitiveCritiqueArtifactsPresent(d);
    assert.deepEqual(present.map((x) => x.path).sort(), [
      "logic/patentability_report.json",
      "trace/examiner_adversary_report.json",
    ]);
    assert.ok(present.every((x) => x.shareable_default === "exclude"));

    const policy = shareableExportPolicy(d, { mode: "shareable_redacted" });
    assert.equal(policy.include_sensitive_critique_artifacts_by_default, false);
    assert.equal(policy.human_review_required_before_external_sharing, true);
    assert.deepEqual(policy.excluded_from_shareable_exports.map((x) => x.path).sort(), [
      "logic/patentability_report.json",
      "trace/examiner_adversary_report.json",
    ]);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});
