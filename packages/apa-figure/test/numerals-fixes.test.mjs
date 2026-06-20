import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildLegend } from "../numerals.mjs";

// R4: a tab-indented (parser-throwing) drawing binding must not throw out of buildLegend, which is called
// in-process by the pre-filing preflight gate. It degrades loudly (NUMERAL_PARSE_ERROR flag + skip).
test("buildLegend does not throw on a tab-indented drawing binding (flags it)", () => {
  const d = mkdtempSync(join(tmpdir(), "bl-"));
  try {
    mkdirSync(join(d, "evidence", "drawings"), { recursive: true });
    writeFileSync(join(d, "evidence", "drawings", "fig1.md"), "### FIG01 - housing\n\n```binding\nrepresentative: true\nnumerals:\n  - numeral: 12\n\telement: housing\n```\n");
    let r;
    assert.doesNotThrow(() => { r = buildLegend(d); });
    assert.ok(Array.isArray(r.flags) && r.flags.some((f) => f.code === "NUMERAL_PARSE_ERROR"), JSON.stringify(r.flags));
  } finally { rmSync(d, { recursive: true, force: true }); }
});
