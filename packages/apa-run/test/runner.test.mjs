import { test } from "node:test";
import assert from "node:assert/strict";

import { planPipeline, statusForMatter } from "../runner.mjs";

test("apa-run plans the core pipeline", () => {
  const plan = planPipeline({ matter: "examples/minimal-patent-artifact" });
  assert.equal(plan.schema, "apa-run-plan-v1");
  assert.ok(plan.steps.find((s) => s.id === "apa-disclose"));
  assert.ok(plan.steps.find((s) => s.id === "apa-assemble"));
});

test("apa-run inserts enabled software domain hook steps", () => {
  const plan = planPipeline({ matter: "examples/minimal-patent-artifact", domains: ["software"] });
  assert.ok(plan.steps.find((s) => s.id === "apa-software-patent"));
  assert.ok(plan.steps.find((s) => s.hook === "claims.seed"));
});

test("apa-run status reads missing/present inputs without failing", () => {
  const status = statusForMatter({ matter: "examples/minimal-patent-artifact", domains: ["software"] });
  assert.equal(status.schema, "apa-run-status-v1");
  assert.equal(status.runlog_ok, true);
  assert.ok(status.steps.length > 0);
});
