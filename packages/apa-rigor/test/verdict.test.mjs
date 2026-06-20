import { test } from "node:test";
import assert from "node:assert/strict";
import { computeVerdict, validateReport, isFileable, VERDICTS } from "../verdict.mjs";

const all = (n) => ({ P1: n, P2: n, P3: n, P4: n, P5: n, P6: n });

test("all 5s -> File-Ready; all 4s -> File-With-Revisions; all 3s -> Major-Rework", () => {
  assert.equal(computeVerdict(all(5)).verdict, "File-Ready");
  assert.equal(computeVerdict(all(4)).verdict, "File-With-Revisions");
  assert.equal(computeVerdict(all(3)).verdict, "Major-Rework");
});

test("a single 1 caps at Do-Not-File regardless of mean", () => {
  const r = computeVerdict({ ...all(5), P1: 1 });
  assert.equal(r.verdict, "Do-Not-File");
  assert.equal(r.capped, true);
});

test("a single 2 caps at Major-Rework even with a high mean", () => {
  const r = computeVerdict({ ...all(5), P2: 2 });
  assert.equal(r.verdict, "Major-Rework");
  assert.equal(r.capped, true);
});

test("an unscored dimension -> Incomplete", () => {
  const r = computeVerdict({ P1: 5, P2: 5, P3: 5, P4: 5, P5: 5 });
  assert.equal(r.verdict, "Incomplete");
  assert.deepEqual(r.missing, ["P6"]);
});

test("isFileable: only File-Ready / File-With-Revisions", () => {
  assert.equal(isFileable("File-Ready"), true);
  assert.equal(isFileable("File-With-Revisions"), true);
  assert.equal(isFileable("Major-Rework"), false);
  assert.equal(isFileable("Do-Not-File"), false);
  assert.deepEqual(VERDICTS, ["Do-Not-File", "Major-Rework", "File-With-Revisions", "File-Ready"]);
});

function report(scores, extra = {}) {
  const dimensions = {};
  for (const [k, v] of Object.entries(scores)) dimensions[k] = { score: v, weaknesses: [] };
  return { dimensions, findings: [], questions_for_attorney: [], questions_for_inventor: [], read_order: ["logic/claims.md"], ...extra };
}

test("validateReport: well-formed report validates and computes the verdict", () => {
  const r = validateReport(report(all(5), { verdict: "File-Ready" }));
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.computed.verdict, "File-Ready");
});

test("validateReport: a finding without evidence_span/amendment is invalid", () => {
  const rep = report(all(4));
  rep.findings = [{ dimension: "P2", severity: "minor" }];
  const r = validateReport(rep);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /evidence_span/.test(e)) && r.errors.some((e) => /amendment/.test(e)));
});

test("validateReport: a hand-set verdict that disagrees with the computed one is flagged", () => {
  const r = validateReport(report(all(5), { verdict: "Do-Not-File" }));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /verdict/.test(e) && /computed/.test(e)));
});

test("validateReport: malformed findings (non-array) is ok:false, not a throw", () => {
  const rep = report(all(5));
  rep.findings = "oops not an array";
  let r;
  assert.doesNotThrow(() => { r = validateReport(rep); });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /findings must be an array/.test(e)));
});

test("validateReport: a null finding element (stray bounded-YAML `-`) is ok:false, not a throw", () => {
  // loadYaml('findings:\n  -\n  - dimension: P1') yields { findings: [null, {...}] }.
  const rep = report(all(5));
  rep.findings = [null, { dimension: "P1", severity: "minor", evidence_span: "x", amendment: "y" }];
  let r;
  assert.doesNotThrow(() => { r = validateReport(rep); });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /finding\[0\] is not an object/.test(e)));
});
