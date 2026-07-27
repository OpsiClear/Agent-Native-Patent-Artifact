import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildReviewTargetFingerprint,
  compareReviewTargetFingerprint,
  unansweredRequiredQuestions,
} from "./review_fingerprint.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const EXAMPLE = join(HERE, "..", "..", "..", "examples", "minimal-patent-artifact");

test("review fingerprints bind IDS counts and human-produced PDF bytes", () => {
  const matter = mkdtempSync(join(tmpdir(), "apa-review-fingerprint-"));
  try {
    cpSync(EXAMPLE, matter, { recursive: true });
    mkdirSync(join(matter, "assembled"), { recursive: true });
    writeFileSync(join(matter, "assembled", "IDS_SB08.md"), "1. [PA01] Reference one\n");
    writeFileSync(join(matter, "assembled", "specification.pdf"), "%PDF-1.4\nfirst");
    const stored = buildReviewTargetFingerprint(matter);
    assert.equal(stored.counts.ids_references, 1);
    assert.equal(stored.counts.pdf_docx_files, 1);
    assert.equal(stored.pdf_targets[0].path, "assembled/specification.pdf");
    assert.equal(compareReviewTargetFingerprint(stored, matter).ok, true);

    writeFileSync(
      join(matter, "assembled", "IDS_SB08.md"),
      `${readFileSync(join(matter, "assembled", "IDS_SB08.md"), "utf8")}2. [PA02] Reference two\n`,
    );
    let freshness = compareReviewTargetFingerprint(stored, matter);
    assert.equal(freshness.ok, false);
    assert.ok(freshness.reasons.includes("ids_references count differs"), JSON.stringify(freshness));

    const rebound = buildReviewTargetFingerprint(matter);
    writeFileSync(join(matter, "assembled", "specification.pdf"), "%PDF-1.4\nchanged");
    freshness = compareReviewTargetFingerprint(rebound, matter);
    assert.equal(freshness.ok, false);
    assert.ok(freshness.reasons.includes("review target digest differs"), JSON.stringify(freshness));
  } finally {
    rmSync(matter, { recursive: true, force: true });
  }
});

test("required questionnaire answers are counted without interpreting legal consequences", () => {
  const queue = {
    questions: [
      { id: "DISC-001", requiredForReadiness: true },
      { id: "IDS-PA01", requiredForReadiness: false },
      { id: "DATE-OWN-001", requiredForReadiness: true },
    ],
  };
  const answers = { answers: [{ id: "DISC-001" }, { id: "IDS-PA01" }] };
  assert.deepEqual(unansweredRequiredQuestions(queue, answers), ["DATE-OWN-001"]);
});

test("review fingerprints reject a symlinked ancestor without reading outside targets", (t) => {
  const matter = mkdtempSync(join(tmpdir(), "apa-review-link-matter-"));
  const outside = mkdtempSync(join(tmpdir(), "apa-review-link-target-"));
  try {
    cpSync(EXAMPLE, matter, { recursive: true });
    writeFileSync(join(outside, "claims.md"), "### CLM99\noutside private claim\n");
    rmSync(join(matter, "logic"), { recursive: true, force: true });
    try {
      symlinkSync(outside, join(matter, "logic"), "junction");
    } catch (error) {
      t.skip(`junction creation unavailable: ${error.code || error.message}`);
      return;
    }
    const fingerprint = buildReviewTargetFingerprint(matter);
    assert.ok(fingerprint.unsafe_paths.includes("logic/claims.md"), JSON.stringify(fingerprint));
    assert.equal(fingerprint.files.some((file) => file.path === "logic/claims.md"), false);
    assert.equal(fingerprint.counts.claims, 0);
  } finally {
    rmSync(matter, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});
