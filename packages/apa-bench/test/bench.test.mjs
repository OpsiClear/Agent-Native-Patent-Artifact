import { test } from "node:test";
import assert from "node:assert/strict";

import { runBenchmarks } from "../../../scripts/benchmark.mjs";

test("apa-bench wrapper uses the deterministic benchmark suite", async () => {
  const summary = await runBenchmarks({ mock: true });
  assert.equal(summary.ok, true);
  assert.ok(summary.totals.cases >= 4);
});

test("benchmark runner can target the software patent simulation case", async () => {
  const summary = await runBenchmarks({ mock: true, caseId: "software-patent-skill-sim" });
  assert.equal(summary.ok, true);
  assert.equal(summary.totals.cases, 1);
  assert.equal(summary.cases[0].id, "software-patent-skill-sim");
  assert.equal(summary.cases[0].metrics.score, 1);
});
