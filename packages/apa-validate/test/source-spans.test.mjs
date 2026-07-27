import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { sourceSpanFindings } from "../source-spans.mjs";

const sha256 = (text) => createHash("sha256").update(text).digest("hex");

test("strict source-span contract verifies multiple allowed-root artifacts", () => {
  const matter = mkdtempSync(join(tmpdir(), "apa-source-span-"));
  try {
    mkdirSync(join(matter, "evidence"), { recursive: true });
    mkdirSync(join(matter, "staging"), { recursive: true });
    writeFileSync(join(matter, "evidence", "interview.txt"), "inventor statement\n");
    writeFileSync(join(matter, "staging", "drawing-note.txt"), "drawing note\n");
    const findings = sourceSpanFindings({
      source: "inventor-confirmation",
      source_spans: [
        { path: "evidence/interview.txt", locator: "line 1", sha256: sha256("inventor statement\n") },
        { path: "staging/drawing-note.txt", locator: "line 1", sha256: sha256("drawing note\n") },
      ],
    }, "LIM01", { strict: true, matterDir: matter });
    assert.deepEqual(findings, []);
  } finally {
    rmSync(matter, { recursive: true, force: true });
  }
});

test("strict source-span contract rejects changed, missing, and outside-root inputs", () => {
  const matter = mkdtempSync(join(tmpdir(), "apa-source-span-bad-"));
  try {
    mkdirSync(join(matter, "evidence"), { recursive: true });
    writeFileSync(join(matter, "evidence", "source.txt"), "changed\n");
    const findings = sourceSpanFindings({
      source: "upload",
      source_spans: [
        { path: "evidence/source.txt", locator: "p. 1", sha256: sha256("before\n") },
        { path: "evidence/missing.txt", locator: "p. 2", sha256: sha256("missing\n") },
        { path: "../outside.txt", locator: "p. 3", sha256: sha256("outside\n") },
      ],
    }, "SPEC0001", { strict: true, matterDir: matter });
    const codes = findings.map((finding) => finding.code);
    assert.ok(codes.includes("SOURCE_SPAN_HASH_MISMATCH"), JSON.stringify(findings));
    assert.ok(codes.includes("SOURCE_SPAN_FILE_MISSING"), JSON.stringify(findings));
    assert.ok(codes.includes("SOURCE_SPAN_PATH_UNSAFE"), JSON.stringify(findings));
  } finally {
    rmSync(matter, { recursive: true, force: true });
  }
});

test("not-recoverable remains an explicit strict-mode exception", () => {
  assert.deepEqual(
    sourceSpanFindings({ source: "not-recoverable" }, "LIM01", { strict: true, matterDir: "unused" }),
    [],
  );
});
