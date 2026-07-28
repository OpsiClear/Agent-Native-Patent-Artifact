import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const EXAMPLE = join(ROOT, "examples", "minimal-patent-artifact");
const GENERATOR = join(ROOT, "skills", "apa-review-form", "scripts", "generate_review_form.mjs");
const QUESTIONS = join(ROOT, "skills", "apa-review-form", "scripts", "ask_review_questions.mjs");
const RECORD = join(ROOT, "packages", "apa-correspondence", "test", "fixtures", "verified-provisional-record.json");

function reviewData(html) {
  const match = html.match(/<script type="application\/json" id="review-data">([\s\S]*?)<\/script>/);
  assert.ok(match, "review data must be embedded");
  return JSON.parse(match[1]);
}

test("review form and questionnaire expose fingerprint-bound correspondence and missing-parts review", () => {
  const matter = mkdtempSync(join(tmpdir(), "apa-review-correspondence-ui-"));
  try {
    cpSync(EXAMPLE, matter, { recursive: true });
    const correspondence = join(matter, "correspondence");
    mkdirSync(correspondence, { recursive: true });
    writeFileSync(join(correspondence, "notice-01.json"), readFileSync(RECORD));
    writeFileSync(join(correspondence, "response-01.json"), JSON.stringify({
      schema: "apa-missing-parts-response-v1",
      notice_type: "provisional-missing-parts",
      status: "BLOCKED-HUMAN-ACTIONS",
      deadline_estimate: { base_due_date_tentative: "2031-04-03" },
      issues: [{ id: "provisional-cover-sheet", resolution_status: "unresolved" }],
      document_options: [{ form_code: "SB/16", selected: false }],
      deferred_human_actions: [{ id: "human-submit", completed: false }],
      completion: { submitted_by_human: false, confirmation_receipt_saved: false },
    }, null, 2));
    writeFileSync(join(correspondence, "filing-receipt-audit.json"), JSON.stringify({
      schema: "apa-filing-receipt-audit-v1",
      status: "DISCREPANCIES-HUMAN-REVIEW-REQUIRED",
      discrepancy_count: 1,
      discrepancies: [{
        code: "TITLE_DIFFERS",
        field: "title",
        expected: "Synthetic expected title",
        observed: "Synthetic receipt title",
      }],
      corrected_ads_review_required: true,
      priority_chain_review_required: false,
    }, null, 2));

    const generated = spawnSync(process.execPath, [GENERATOR, "--matter", matter], {
      cwd: ROOT,
      encoding: "utf8",
    });
    assert.equal(generated.status, 0, generated.stderr);
    const data = reviewData(readFileSync(join(matter, "assembled", "human_review_form.html"), "utf8"));
    const page = data.reviewPages.find((entry) => entry.id === "correspondence");
    assert.ok(page);
    assert.equal(page.cards.length, 3);
    assert.equal(data.reviewTargetFingerprint.contract, "apa-human-review-target-contract-v2");
    assert.equal(data.reviewTargetFingerprint.counts.correspondence_files, 3);
    assert.equal(data.reviewTargetFingerprint.counts.missing_parts_responses, 1);
    assert.equal(data.questionQueues.correspondence.length, 2);
    assert.equal(data.questionQueues["missing-parts"].length, 2);
    assert.ok(data.questionQueues["missing-parts"].every((question) => question.requiredForReadiness));

    for (const topic of ["correspondence", "missing-parts"]) {
      const result = spawnSync(process.execPath, [
        QUESTIONS,
        "--matter", matter,
        "--topic", topic,
        "--mode", "json",
      ], { cwd: ROOT, encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr);
      const queue = JSON.parse(result.stdout);
      assert.equal(queue.topic, topic);
      assert.ok(queue.questions.length > 0);
      assert.ok(queue.questions.every((question) => question.requiredForReadiness));
      assert.equal(queue.targetFingerprint.sha256, data.reviewTargetFingerprint.sha256);
    }
  } finally {
    rmSync(matter, { recursive: true, force: true });
  }
});
