import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateRunlog } from "../../apa-trace/runlog.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, "..", "cli.mjs");
const EXAMPLE = join(HERE, "..", "..", "..", "examples", "minimal-patent-artifact");

test("apa-search --write appends a runlog entry with query sink hash and closest-art checkpoint", () => {
  const d = mkdtempSync(join(tmpdir(), "apa-search-runlog-"));
  try {
    cpSync(EXAMPLE, d, { recursive: true });
    execFileSync(process.execPath, [CLI, "--matter", d, "--source", "mock", "--limit", "1", "--write"], { stdio: "pipe" });
    const parsed = validateRunlog(d);
    assert.equal(parsed.ok, true, JSON.stringify(parsed.errors));
    assert.equal(parsed.entries.length, 1);
    const entry = parsed.entries[0];
    assert.equal(entry.skill, "apa-priorart");
    assert.equal(entry.external_sinks[0].kind, "prior-art-query");
    assert.match(entry.external_sinks[0].bytes_sha256, /^[0-9a-f]{64}$/);
    assert.equal(entry.human_checkpoints[0].id, "closest-art-selection");
    assert.equal(entry.human_checkpoints[0].satisfied, false);
    assert.ok(entry.outputs.some((o) => /logic\/prior_art\.md$/.test(o.path)));
    assert.ok(entry.outputs.some((o) => /search-dossier-/.test(o.path)));

    execFileSync(process.execPath, [CLI, "--matter", d, "--source", "mock", "--limit", "1", "--write"], { stdio: "pipe" });
    assert.equal(validateRunlog(d).entries.length, 2, "second write appends a second entry");
    assert.ok(existsSync(join(d, "trace", "runlog.jsonl")));
  } finally { rmSync(d, { recursive: true, force: true }); }
});
