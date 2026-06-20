import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateRunlog } from "../../apa-trace/runlog.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, "..", "cli.mjs");
const EXAMPLE = join(HERE, "..", "..", "..", "examples", "minimal-patent-artifact");

// R5: the assemble CLI runs assembleMatter/assembleAds/assembleIds (which parse directly) BEFORE preflight,
// so it must run the GUARDED validator first and short-circuit to the documented exit-2 NO-GO on a malformed
// matter - never crash with a raw stack mid-assembly (exit 1).
test("apa-assemble CLI exits 2 (structured NO-GO) on a malformed matter, not a raw exit-1 crash", () => {
  const d = mkdtempSync(join(tmpdir(), "asmcli-"));
  try {
    mkdirSync(join(d, "logic"), { recursive: true });
    writeFileSync(join(d, "PATENT.md"), "---\ntitle: W\napplication_type: utility\ninventors:\n\t- id: INV1\n---\n");
    writeFileSync(join(d, "logic", "claims.md"), "### CLM01 - w\nA w.\n");
    let status = 0, stderr = "";
    try { execFileSync(process.execPath, [CLI, "--matter", d], { stdio: "pipe" }); }
    catch (e) { status = e.status; stderr = String(e.stderr || ""); }
    assert.equal(status, 2, "exit code must be the documented NO-GO=2, got " + status);
    assert.match(stderr, /NO-GO|failed to parse/, "structured NO-GO message");
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("apa-assemble --write appends a runlog entry with generated outputs and filing checkpoints", () => {
  const d = mkdtempSync(join(tmpdir(), "asmcli-runlog-"));
  try {
    cpSync(EXAMPLE, d, { recursive: true });
    execFileSync(process.execPath, [CLI, "--matter", d, "--write"], { stdio: "pipe" });
    const parsed = validateRunlog(d);
    assert.equal(parsed.ok, true, JSON.stringify(parsed.errors));
    assert.equal(parsed.entries.length, 1);
    const entry = parsed.entries[0];
    assert.equal(entry.skill, "apa-assemble");
    assert.ok(entry.outputs.some((o) => o.path === "assembled/upload_manifest.json" && /^[0-9a-f]{64}$/.test(o.sha256)));
    assert.ok(entry.outputs.some((o) => o.path === "assembled/specification.html"));
    assert.ok(entry.human_checkpoints.some((c) => c.id === "patent-center-human-upload" && c.satisfied === false));
    assert.ok(entry.human_checkpoints.some((c) => c.id === "inventor-declaration-signature" && c.required === true));

    execFileSync(process.execPath, [CLI, "--matter", d, "--write"], { stdio: "pipe" });
    assert.equal(validateRunlog(d).entries.length, 2, "second write appends a second entry");
  } finally { rmSync(d, { recursive: true, force: true }); }
});
