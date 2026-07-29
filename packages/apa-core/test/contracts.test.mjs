import assert from "node:assert/strict";
import test from "node:test";

import { canonicalJson, canonicalSha256 } from "../canonical.mjs";
import { contractNames, validateContract } from "../contracts.mjs";

test("canonical JSON is stable and rejects non-JSON values", () => {
  assert.equal(canonicalJson({ z: 1, a: { y: 2, x: 3 } }), '{"a":{"x":3,"y":2},"z":1}');
  assert.equal(
    canonicalSha256({ a: 1, b: 2 }),
    canonicalSha256({ b: 2, a: 1 }),
  );
  assert.throws(() => canonicalJson({ value: undefined }), /does not permit undefined/);
  assert.throws(() => canonicalJson({ value: Number.NaN }), /non-finite/);
});

test("harness contracts are registered and reject undeclared properties", () => {
  assert.deepEqual(contractNames().sort(), [
    "apa-artifact-envelope-v1",
    "apa-artifact-proposal-v1",
    "apa-matter-v1",
    "apa-review-decision-v1",
    "apa-skill-v1",
    "apa-source-record-v1",
    "apa-workflow-event-v1",
  ]);
  const matter = {
    schema: "apa-matter-v1",
    matter_id: "sample-matter",
    jurisdiction: "USPTO",
    application_type: "provisional",
    user_role: "unknown",
    created_at: "2026-07-29T12:00:00.000Z",
  };
  assert.equal(validateContract(matter.schema, matter).ok, true);
  const invalid = validateContract(matter.schema, { ...matter, surprise: true });
  assert.equal(invalid.ok, false);
  assert.ok(invalid.errors.some((error) => error.keyword === "additionalProperties"));
});
