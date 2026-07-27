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
const CLI = join(HERE, "ask_review_questions.mjs");
const EXAMPLE = join(HERE, "..", "..", "..", "examples", "minimal-patent-artifact");

test("questionnaire CLI emits fingerprint-bound queues and rejects stale answers", () => {
  const matter = mkdtempSync(join(tmpdir(), "apa-questionnaire-cli-"));
  try {
    cpSync(EXAMPLE, matter, { recursive: true });
    mkdirSync(join(matter, "assembled"), { recursive: true });
    writeFileSync(join(matter, "assembled", "IDS_SB08.md"), "1. [PA01] Example reference **[UNVERIFIED]**\n");
    const baseArgs = [
      CLI,
      "--matter", matter,
      "--topic", "all",
      "--limit", "3",
    ];
    const generated = spawnSync(process.execPath, [...baseArgs, "--mode", "json"], { encoding: "utf8" });
    assert.equal(generated.status, 0, generated.stderr);
    const queue = JSON.parse(generated.stdout);
    assert.equal(queue.schema, "apa-agent-question-queue-v2");
    assert.match(queue.targetFingerprint.sha256, /^[0-9a-f]{64}$/);
    assert.ok(queue.questions.some((question) => question.requiredForReadiness));

    const recorded = spawnSync(process.execPath, [
      ...baseArgs,
      "--mode", "agent",
      "--record", "Q1=1; reviewed factual answer",
    ], { encoding: "utf8" });
    assert.equal(recorded.status, 0, recorded.stderr);
    const answersPath = join(matter, "assembled", "agent_question_answers.json");
    const answers = JSON.parse(readFileSync(answersPath, "utf8"));
    assert.equal(answers.schema, "apa-agent-question-answers-v2");
    assert.equal(answers.targetFingerprint.sha256, queue.targetFingerprint.sha256);
    assert.equal(answers.answers.length, 1);

    const claimsPath = join(matter, "logic", "claims.md");
    writeFileSync(claimsPath, `${readFileSync(claimsPath, "utf8")}\n<!-- changed target -->\n`);
    const stale = spawnSync(process.execPath, [
      ...baseArgs,
      "--mode", "agent",
      "--record", "Q2=1; second answer",
    ], { encoding: "utf8" });
    assert.equal(stale.status, 1);
    assert.match(stale.stderr, /answers are stale/);
  } finally {
    rmSync(matter, { recursive: true, force: true });
  }
});
