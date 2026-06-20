import { test } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { scaffoldReport } from "../scaffold.mjs";
import { validateReport } from "../verdict.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const EXAMPLE = join(HERE, "..", "..", "..", "examples", "minimal-patent-artifact");

test("scaffoldReport: clean example -> Level-1 passed, mechanical dims prefilled, judgment dims null", () => {
  const s = scaffoldReport(EXAMPLE);
  assert.equal(s.level1.passed, true);
  assert.equal(s.dimensions.P3.score, 5);     // clean antecedent basis
  assert.equal(s.dimensions.P4.score, 5);     // links resolve
  assert.equal(s.dimensions.P1.score, null);  // judgment - left for the skill
  assert.equal(s.dimensions.P5.score, null);
  assert.ok(s.dimensions.P1.anchors && s.dimensions.P1.anchors[1]);
  assert.deepEqual(s.findings, []);
});

test("a scaffold completed with scores validates and computes a verdict", () => {
  const s = scaffoldReport(EXAMPLE);
  for (const id of ["P1", "P2", "P5", "P6"]) s.dimensions[id].score = 4;
  const r = validateReport(s);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  // P3=P4=5, P1=P2=P5=P6=4 -> mean ~4.33 -> File-With-Revisions
  assert.equal(r.computed.verdict, "File-With-Revisions");
});
