import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, "..", "build_manifest.mjs");

// R5: the build_manifest CLI must convert a parser throw (the bounded parser fails loud on a tab-indented /
// over-indented / too-deep matter) into a structured exit 2 + message, never a raw uncaught Node stack.
test("build_manifest CLI exits 2 with a structured message on a malformed matter", () => {
  const d = mkdtempSync(join(tmpdir(), "bmcli-"));
  try {
    mkdirSync(join(d, "logic"), { recursive: true });
    writeFileSync(join(d, "PATENT.md"), "---\ntitle: W\napplication_type: utility\ninventors:\n\t- id: INV1\n---\n");
    writeFileSync(join(d, "logic", "claims.md"), "### CLM01 - w\nA w.\n");
    let status = 0, stderr = "";
    try { execFileSync(process.execPath, [CLI, d, "--out", join(d, "manifest.json")], { stdio: "pipe" }); }
    catch (e) { status = e.status; stderr = String(e.stderr || ""); }
    assert.equal(status, 2, "exit code must be 2 (structured), got " + status);
    assert.match(stderr, /failed to parse/, "stderr must carry a structured message, not a raw stack");
    assert.doesNotMatch(stderr, /at logicalLines|at build \(/, "must NOT print a raw Node stack frame");
  } finally { rmSync(d, { recursive: true, force: true }); }
});
