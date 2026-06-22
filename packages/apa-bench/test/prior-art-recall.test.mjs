import { execFileSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";

import { scorePriorArtRecallFixture } from "../prior-art-recall.mjs";

test("public software prior-art recall fixture passes fixed retrieval floors", async () => {
  const summary = await scorePriorArtRecallFixture();
  assert.equal(summary.schema, "apa-prior-art-recall-score-v1");
  assert.equal(summary.status, "pass", JSON.stringify(summary.scenarios, null, 2));
  assert.equal(summary.metrics.scenarios, 7);
  assert.equal(summary.metrics.blocking_failures, 0);
  assert.ok(summary.metrics.average_recall_at_20 >= 0.8);
  assert.ok(summary.metrics.average_recall_at_5 >= 0.7);
  assert.ok(summary.metrics.average_mean_known_reciprocal_rank >= 0.7);
  assert.ok(summary.metrics.average_top_expected_slot_precision >= 1);
  assert.ok(summary.metrics.total_citation_expansion_added >= 1);
  assert.ok(summary.scenarios.every((s) => s.metrics.dossier_completeness === 1));
  assert.ok(summary.scenarios.every((s) => s.metrics.quote_handoff_coverage === 1));
  assert.ok(summary.scenarios.every((s) => s.metrics.rank_explanation_coverage === 1));
  assert.ok(summary.scenarios.every((s) => s.metrics.candidate_type_diversity >= 2));
  assert.ok(summary.scenarios.some((s) => s.metrics.citation_expansion_recall_gain >= 0.5));
});

test("prior-art recall scorer is reachable through apa-bench CLI", () => {
  const stdout = execFileSync(process.execPath, [
    "packages/apa-bench/cli.mjs",
    "--mock",
    "--prior-art-recall",
    "--json",
  ], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const summary = JSON.parse(stdout);
  assert.equal(summary.schema, "apa-prior-art-recall-score-v1");
  assert.equal(summary.status, "pass");
  assert.equal(summary.metrics.scenarios, 7);
  assert.ok(summary.metrics.average_recall_at_5 >= 0.7);
  assert.ok(summary.metrics.average_mean_known_reciprocal_rank >= 0.7);
});
