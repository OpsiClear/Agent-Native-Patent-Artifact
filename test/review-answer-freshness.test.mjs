import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const template = readFileSync(new URL("../skills/apa-review-form/assets/review-form-template.html", import.meta.url), "utf8");
const initialization = template.slice(template.indexOf("    const DATA ="), template.indexOf("    function setPath("));
const target = { schema: "apa-human-review-target-fingerprint-v1", contract: "test-contract", sha256: "a".repeat(64) };
const approved = { reviewPages: { claims: { CLM01: { status: "OK" } } } };
const envelope = { schema: "apa-review-answers-v1", matterId: "test", targetFingerprint: target, answers: approved };
function load(data, saved) {
  const storage = new Map(saved ? [["apa-review-form:test", JSON.stringify(saved)]] : []);
  const notice = { textContent: "" };
  const context = { document: { getElementById: id => id === "review-data" ? { textContent: JSON.stringify(data) } : notice },
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) } };
  const result = runInNewContext(initialization + "\n({answers, answerEnvelope, restoreEnvelope});", context);
  return { ...result, storage, notice };
}
test("browser restores only matching matter and target envelopes; stale approvals are quarantined", () => {
  const data = { matterId: "test", reviewTargetFingerprint: target };
  assert.equal(load(data, envelope).answers.reviewPages.claims.CLM01.status, "OK");
  for (const saved of [approved, { ...envelope, matterId: "other" }, { ...envelope, targetFingerprint: { ...target, sha256: "b".repeat(64) } },
    { ...envelope, targetFingerprint: { ...target, contract: "old-contract" } }]) {
    const restored = load(data, saved);
    assert.equal(Object.keys(restored.answers).length, 0);
    assert.match(restored.notice.textContent, /review|revision/i);
    assert.ok([...restored.storage.keys()].some(key => key.includes(":stale:")));
    assert.throws(() => restored.restoreEnvelope(saved), /older or unknown/);
  }
});
test("regenerated form cannot relabel previous approvals with its new fingerprint", () => {
  const data = { matterId: "test", reviewTargetFingerprint: { ...target, sha256: "c".repeat(64) },
    serverMode: true, initialAnswers: approved, initialTargetFingerprint: target };
  const form = load(data, envelope);
  assert.equal(Object.keys(form.answers).length, 0);
  assert.equal(Object.keys(form.answerEnvelope(form.answers).answers).length, 0);
});
