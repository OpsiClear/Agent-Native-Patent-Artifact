import { test } from "node:test";
import assert from "node:assert/strict";

import { runBenchmarks } from "../../../scripts/benchmark.mjs";

test("apa-bench wrapper uses the deterministic benchmark suite", () => {
  const summary = runBenchmarks({ mock: true });
  assert.equal(summary.ok, true);
  assert.ok(summary.totals.cases >= 3);
});
