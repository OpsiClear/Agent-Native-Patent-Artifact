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

test("apa-run status reads missing/present inputs without failing", () => {
  const status = statusForMatter({ matter: "examples/minimal-patent-artifact", domains: ["software"] });
  assert.equal(status.schema, "apa-run-status-v1");
  assert.equal(status.runlog_ok, true);
  assert.ok(status.steps.length > 0);
});
