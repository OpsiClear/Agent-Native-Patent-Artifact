import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { preflight } from "../preflight.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const EXAMPLE = join(HERE, "..", "..", "..", "examples", "minimal-patent-artifact");

// Fix #F9: the inventorship-integrity gate runs BEFORE validateMatter; a null limitation list item
// (which the shared parser emits for a bare `-`, and which the validator tolerates) must not crash it.
test("preflight tolerates a null limitation list item the validator tolerates", () => {
  const d = mkdtempSync(join(tmpdir(), "pf-"));
  try {
    cpSync(EXAMPLE, d, { recursive: true });
    const p = join(d, "logic", "claims.md");
    writeFileSync(p, readFileSync(p, "utf8").replace("limitations:\n  - id: LIM01", "limitations:\n  -\n  - id: LIM01"));
    let res;
    assert.doesNotThrow(() => { res = preflight(d, {}); });
    assert.ok(res && Array.isArray(res.gates), "preflight returns a gates report, not a crash");
    assert.ok(res.gates.some((g) => g.name === "inventorship-integrity"), "the gate that used to crash now reports");
  } finally { rmSync(d, { recursive: true, force: true }); }
});

// R2-3: preflight must also tolerate a non-array scalar `limitations:` (container guard, not just a null
// element). The inventorship-integrity gate runs before validateMatter, so a raw throw escapes the gate.
test("preflight tolerates a non-array scalar limitations field", () => {
  const d = mkdtempSync(join(tmpdir(), "pf2-"));
  try {
    mkdirSync(join(d, "logic"), { recursive: true });
    writeFileSync(join(d, "PATENT.md"), "---\ntitle: Widget\napplication_type: utility\ninventors:\n  - id: INV1\n    name: Real Person\n---\n");
    writeFileSync(join(d, "logic", "claims.md"), "### CLM01 - widget\nA widget comprising a frame.\n\n```binding\ntype: claim-independent\nlimitations: notalist\n```\n");
    let res;
    assert.doesNotThrow(() => { res = preflight(d, {}); });
    assert.ok(res && Array.isArray(res.gates));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

// R4: a tab-indented (parser-throwing) binding must not crash the pre-filing gate; preflight short-circuits
// to a structured NO-GO via the guarded validateMatter (which it now calls FIRST).
test("preflight returns a structured NO-GO (not a crash) on a tab-indented binding", () => {
  const d = mkdtempSync(join(tmpdir(), "pf3-"));
  try {
    mkdirSync(join(d, "logic"), { recursive: true });
    writeFileSync(join(d, "PATENT.md"), "---\ntitle: Widget\napplication_type: utility\ninventors:\n  - id: INV1\n    name: Real Person\n---\n");
    writeFileSync(join(d, "logic", "claims.md"), "### CLM01 - widget\nA widget comprising a frame.\n\n```binding\ntype: claim-independent\n\tnote: x\n```\n");
    let res;
    assert.doesNotThrow(() => { res = preflight(d, {}); });
    assert.equal(res.goNoGo, "NO-GO");
    assert.ok(res.gates.some((g) => g.name === "matter-parse" && g.status === "block"), JSON.stringify(res.gates));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

// R6: the structural inventorship-integrity gate must BLOCK a same-indent ai-suggested limitation - the
// same-indent block-list misparse previously dropped the limitations and the gate passed it as clean.
test("preflight inventorship-integrity gate blocks a SAME-INDENT ai-suggested limitation", () => {
  const d = mkdtempSync(join(tmpdir(), "si-pf-"));
  try {
    mkdirSync(join(d, "logic"), { recursive: true });
    writeFileSync(join(d, "PATENT.md"), "---\ntitle: Widget\napplication_type: utility\ninventors:\n  - id: INV1\n    name: Real Person\n---\n");
    writeFileSync(join(d, "logic", "claims.md"),
      "### CLM01 - widget\nA widget comprising a frame.\n\n```binding\ntype: claim-independent\nlimitations:\n- id: LIM01\n  introduces: frame\n  provenance: ai-suggested\n```\n");
    const res = preflight(d, {});
    const g = res.gates.find((x) => x.name === "inventorship-integrity");
    assert.equal(g.status, "block", JSON.stringify(g));
  } finally { rmSync(d, { recursive: true, force: true }); }
});
