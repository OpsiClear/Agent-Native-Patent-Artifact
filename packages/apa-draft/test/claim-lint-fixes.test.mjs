import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lintClaims } from "../claim-lint.mjs";

// R2-4: lintClaims must tolerate a malformed scalar `limitations:` (asArray container guard, not just a
// null element). A raw `(scalar).filter` throws an uncaught TypeError; claim-lint is also called by the
// preflight gate, so the throw escapes the gate.
test("lintClaims tolerates a non-array scalar limitations field", () => {
  const d = mkdtempSync(join(tmpdir(), "cl-"));
  try {
    mkdirSync(join(d, "logic"), { recursive: true });
    writeFileSync(join(d, "logic", "claims.md"), "### CLM01 - widget\nA widget comprising a frame.\n\n```binding\ntype: claim-independent\nlimitations: notalist\n```\n");
    let r;
    assert.doesNotThrow(() => { r = lintClaims(d); });
    assert.ok(r && Array.isArray(r.findings));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

// R4: a parser-level malformation (tab indentation) in a binding must not throw out of lintClaims
// (a hub called by preflight, rigor scaffold, eval prePass) - it returns a structured LINT_PARSE_ERROR.
test("lintClaims does not throw on a tab-indented binding (returns LINT_PARSE_ERROR)", () => {
  const d = mkdtempSync(join(tmpdir(), "cl2-"));
  try {
    mkdirSync(join(d, "logic"), { recursive: true });
    writeFileSync(join(d, "logic", "claims.md"), "### CLM01 - widget\nA widget comprising a frame.\n\n```binding\ntype: claim-independent\n\tnote: x\n```\n");
    let r;
    assert.doesNotThrow(() => { r = lintClaims(d); });
    assert.ok(r.findings.some((f) => f.code === "LINT_PARSE_ERROR"), JSON.stringify(r.findings));
  } finally { rmSync(d, { recursive: true, force: true }); }
});
