import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, appendFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendRunlog,
  buildRunlogEntry,
  commandRecord,
  existingFileRecords,
  externalSinkRecord,
  humanCheckpoint,
  runlogPath,
  sha256,
  validateRunlog,
} from "../runlog.mjs";

test("appendRunlog creates trace/runlog.jsonl and appends without rewriting prior entries", () => {
  const d = mkdtempSync(join(tmpdir(), "apa-runlog-"));
  try {
    writeFileSync(join(d, "input.md"), "alpha");
    const first = buildRunlogEntry({
      timestamp: "2026-06-20T00:00:00.000Z",
      skill: "apa-test",
      inputs: existingFileRecords(d, [join(d, "input.md")]),
      commands: [commandRecord({ argv: ["node", "x.mjs"], exitCode: 0 })],
      humanCheckpoints: [humanCheckpoint({ id: "review", required: true, satisfied: false })],
    });
    const path = appendRunlog(d, first);
    const before = readFileSync(path, "utf8");
    appendRunlog(d, buildRunlogEntry({ timestamp: "2026-06-20T00:01:00.000Z", skill: "apa-test-2" }));
    const lines = readFileSync(path, "utf8").trim().split(/\r?\n/);
    assert.equal(lines.length, 2);
    assert.equal(lines[0], before.trim(), "first entry must not be rewritten");
    const parsed = validateRunlog(d);
    assert.equal(parsed.ok, true, JSON.stringify(parsed.errors));
    assert.equal(parsed.entries[0].inputs[0].sha256, sha256("alpha"));
    assert.equal(parsed.entries[0].human_checkpoints[0].satisfied, false);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("externalSinkRecord hashes exact bytes and captures scan approval state", () => {
  const rec = externalSinkRecord({
    kind: "prior-art-query",
    bytes: "secret-free query",
    scanVerdict: { blocked: false, needsConfirm: true, high: [], medium: [{ tier: "MEDIUM" }] },
    humanApproved: true,
  });
  assert.equal(rec.bytes_sha256, sha256("secret-free query"));
  assert.equal(rec.approval_required, true);
  assert.equal(rec.human_approved, true);
  assert.equal(rec.scan_verdict.medium_count, 1);
});

test("existingFileRecords ignores directory candidates", () => {
  const d = mkdtempSync(join(tmpdir(), "apa-runlog-dir-"));
  try {
    writeFileSync(join(d, "input.md"), "alpha");
    mkdirSync(join(d, "drawings"));
    const records = existingFileRecords(d, [join(d, "input.md"), join(d, "drawings")]);
    assert.equal(records.length, 1);
    assert.equal(records[0].path, "input.md");
    assert.equal(records[0].sha256, sha256("alpha"));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("validateRunlog reports malformed JSONL with line numbers only when asked", () => {
  const d = mkdtempSync(join(tmpdir(), "apa-runlog-bad-"));
  try {
    mkdirSync(join(d, "trace"), { recursive: true });
    appendFileSync(runlogPath(d), JSON.stringify(buildRunlogEntry({ skill: "ok" })) + "\n");
    appendFileSync(runlogPath(d), "{bad json}\n");
    assert.ok(existsSync(runlogPath(d)));
    const parsed = validateRunlog(d);
    assert.equal(parsed.ok, false);
    assert.deepEqual(parsed.errors.map((e) => e.line), [2]);
    assert.match(parsed.errors[0].message, /JSON|property|position|token/i);
  } finally { rmSync(d, { recursive: true, force: true }); }
});
