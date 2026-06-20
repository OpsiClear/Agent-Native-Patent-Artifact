import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { lintClaims } from "../claim-lint.mjs";
import { validateReport } from "../../apa-reports/validate.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const EXAMPLE = join(HERE, "..", "..", "..", "examples", "minimal-patent-artifact");
const CLI = join(HERE, "..", "claim-lint.mjs");
const codes = (r) => r.findings.map((f) => f.code);

function clone() { const d = mkdtempSync(join(tmpdir(), "apa-lint-")); cpSync(EXAMPLE, d, { recursive: true }); return d; }
function edit(d, fn) { const p = join(d, "logic", "claims.md"); writeFileSync(p, fn(readFileSync(p, "utf8"))); }

test("clean example: claim-lint finds nothing", () => {
  const r = lintClaims(EXAMPLE);
  assert.equal(r.findings.length, 0, JSON.stringify(r.findings));
});

test("missing transitional phrase -> LINT_TRANSITION", () => {
  const d = clone();
  try { edit(d, (t) => t.replace("insert comprising:", "insert with:")); assert.ok(codes(lintClaims(d)).includes("LINT_TRANSITION")); }
  finally { rmSync(d, { recursive: true, force: true }); }
});

test("nonce 'means for' -> LINT_112F", () => {
  const d = clone();
  try {
    edit(d, (t) => t.replace("a valve coupled to the float and configured to close when the float rises to a selected level.", "a means for closing an inlet when the float rises."));
    assert.ok(codes(lintClaims(d)).includes("LINT_112F"));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("multiple-dependent form -> LINT_MULTI_DEP", () => {
  const d = clone();
  try {
    edit(d, (t) => t.replace("insert of claim 1, further", "insert of claims 1 or 2, further"));
    const result = lintClaims(d);
    assert.ok(codes(result).includes("LINT_MULTI_DEP"));
    assert.match(result.findings.find((f) => f.code === "LINT_MULTI_DEP").msg, /unsupported in APA MVP/);
  }
  finally { rmSync(d, { recursive: true, force: true }); }
});

test("numbering gap -> LINT_NUMBERING", () => {
  const d = clone();
  try { edit(d, (t) => t.replace("### CLM02 ", "### CLM03 ")); assert.ok(codes(lintClaims(d)).includes("LINT_NUMBERING")); }
  finally { rmSync(d, { recursive: true, force: true }); }
});

test("two sentences -> LINT_ONE_SENTENCE", () => {
  const d = clone();
  try { edit(d, (t) => t.replace("to an exterior of the insert.", "to an exterior of the insert. The wick is fibrous.")); assert.ok(codes(lintClaims(d)).includes("LINT_ONE_SENTENCE")); }
  finally { rmSync(d, { recursive: true, force: true }); }
});

test("claim-lint --report-out writes a valid claims_report.json", () => {
  const d = clone();
  try {
    const out = join(d, "logic", "claims_report.json");
    const res = spawnSync(process.execPath, [CLI, d, "--report-out", out, "--json"], { encoding: "utf8" });
    assert.equal(res.status, 0, res.stderr);
    const report = JSON.parse(readFileSync(out, "utf8"));
    const check = validateReport(report, { kind: "claims" });
    assert.equal(check.ok, true, JSON.stringify(check.errors));
    assert.equal(report.report_type, "claims");
    assert.equal(report.legal_posture, "flags-not-conclusions");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("claim-lint report records multiple-dependent claims as unsupported features", () => {
  const d = clone();
  try {
    edit(d, (t) => t.replace("insert of claim 1, further", "insert of claims 1 or 2, further"));
    const out = join(d, "logic", "claims_report.json");
    const res = spawnSync(process.execPath, [CLI, d, "--report-out", out, "--json"], { encoding: "utf8" });
    assert.equal(res.status, 1, res.stderr);
    const report = JSON.parse(readFileSync(out, "utf8"));
    const check = validateReport(report, { kind: "claims" });
    assert.equal(check.ok, true, JSON.stringify(check.errors));
    assert.equal(report.findings.find((f) => f.code === "LINT_MULTI_DEP").severity, "fix-before-filing");
    assert.equal(report.unsupported_features[0].feature, "multiple-dependent-claims");
    assert.equal(report.unsupported_features[0].status, "unsupported-in-apa-mvp");
    assert.match(report.unsupported_features[0].recommendation, /Rewrite as singly dependent claims/);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});
