import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, "..", "cli.mjs");

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
