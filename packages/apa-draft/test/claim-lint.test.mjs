import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { lintClaims } from "../claim-lint.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const EXAMPLE = join(HERE, "..", "..", "..", "examples", "minimal-patent-artifact");
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
  try { edit(d, (t) => t.replace("insert of claim 1, further", "insert of claims 1 or 2, further")); assert.ok(codes(lintClaims(d)).includes("LINT_MULTI_DEP")); }
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
