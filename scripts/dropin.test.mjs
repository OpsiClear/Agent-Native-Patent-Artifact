import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dropin, upsertBlock, pointerBlock, START, END, KIT_ROOT } from "./dropin.mjs";

function tmpProject() { return mkdtempSync(join(tmpdir(), "apa-dropin-")); }

test("dropin writes the pointer block into CLAUDE.md AND AGENTS.md (creating them)", () => {
  const d = tmpProject();
  try {
    const out = dropin(d);
    assert.deepEqual(out.results.map((r) => r.status).sort(), ["created", "created"]);
    for (const f of ["CLAUDE.md", "AGENTS.md"]) {
      const txt = readFileSync(join(d, f), "utf8");
      assert.ok(txt.includes(START) && txt.includes(END), `${f} has the markers`);
      assert.ok(txt.includes("APA") && txt.includes("disclosure-capture") && txt.includes("autoprep"), `${f} names the skills`);
      assert.ok(/never sign, file/.test(txt), `${f} carries the guardrails`);
    }
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("dropin preserves existing project instructions (appends, does not clobber)", () => {
  const d = tmpProject();
  try {
    writeFileSync(join(d, "CLAUDE.md"), "# My project\n\nExisting rules here.\n");
    const out = dropin(d);
    assert.equal(out.results.find((r) => r.file === "CLAUDE.md").status, "appended");
    const txt = readFileSync(join(d, "CLAUDE.md"), "utf8");
    assert.ok(txt.includes("Existing rules here."), "pre-existing content preserved");
    assert.ok(txt.includes(START), "pointer appended");
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("dropin is idempotent and updates in place (no duplication on re-run)", () => {
  const d = tmpProject();
  try {
    dropin(d);
    const out2 = dropin(d);
    assert.ok(out2.results.every((r) => r.status === "unchanged"), JSON.stringify(out2.results));
    const txt = readFileSync(join(d, "CLAUDE.md"), "utf8");
    assert.equal(txt.split(START).length - 1, 1, "exactly one APA block, not duplicated");
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("upsertBlock refreshes a stale block in place when the kit path changes", () => {
  const d = tmpProject();
  try {
    const f = join(d, "CLAUDE.md");
    upsertBlock(f, pointerBlock("old/path"));
    const status = upsertBlock(f, pointerBlock("new/relative/path"));
    assert.equal(status, "updated");
    const txt = readFileSync(f, "utf8");
    assert.ok(txt.includes("new/relative/path") && !txt.includes("old/path"), "path refreshed in place");
    assert.equal(txt.split(START).length - 1, 1, "still exactly one block");
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("dropin refuses to point the kit at itself, and fails loud on a missing dir", () => {
  assert.throws(() => dropin(KIT_ROOT), /kit itself/);
  assert.throws(() => dropin(join(tmpdir(), "apa-does-not-exist-xyz")), /not found/);
});
