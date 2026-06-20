import { test } from "node:test";
import assert from "node:assert/strict";
import { scan, applyRedactions } from "../redact-engine.mjs";

// Fix #3: a trailing lone UTF-16 surrogate must NOT let a fixed-length HIGH secret evade the scan.
// Deleting the surrogate would collapse the \b boundary the AWS-key pattern relies on; the fix
// neutralizes it with U+FFFD (a non-word char) so detection is unchanged.
test("lone surrogate does not create a scan-at-sink bypass (boundary preserved)", () => {
  const control = scan("note AKIA1234567890ABCDEF end").map((f) => f.patternName).sort();
  assert.ok(control.includes("aws.access_key"), "sanity: control must detect the AWS key");
  const evaded = scan("note AKIA1234567890ABCDEF\uD800end").map((f) => f.patternName).sort();
  assert.deepEqual(evaded, control, "a lone surrogate must not change detection (no evasion)");
});

// Fix #4: overlapping auto-redactable spans must not splice on each other's stale offsets (which
// corrupted output and mislabeled the larger secret). Only one non-overlapping span is applied,
// preferring the longer/higher-tier one, and surrounding text is left intact.
test("overlapping auto-redactable spans do not corrupt the output", () => {
  const text = "card 4111111111111111 here";
  const findings = [
    { patternName: "pii.cc", severity: "MEDIUM", start: 5, end: 21, autoRedactable: true },
    { patternName: "pii.phone.e164", severity: "MEDIUM", start: 5, end: 19, autoRedactable: true },
  ];
  const body = applyRedactions(text, findings);
  assert.ok(body.startsWith("card "), "leading text intact");
  assert.ok(body.endsWith(" here"), "trailing word must not be eaten by a stale-offset splice");
  assert.ok(!/\d/.test(body), "the whole card span is replaced; no stray digits from a second splice");
  // exactly one redaction token (the longer span), not two overlapping ones
  assert.equal((body.match(/<REDACTED/gi) || []).length <= 1 ? true : false, true);
});

// Fix #F4: with REAL scan() output (not hand-built findings), the credit-card span must end on the
// last digit so the trailing separator is not spliced out, which would merge the token with the next
// word. Previously the pii.cc regex captured the trailing space into the span.
test("real scan() output does not merge the CC redaction with the following word", () => {
  const text = "card 4111111111111111 here";
  const body = applyRedactions(text, scan(text));
  assert.match(body, / here$/, "trailing word must stay separated: " + body);
  assert.ok(!/4111/.test(body), "the card digits must be redacted: " + body);
});

// Non-overlapping spans are still both redacted (the fix only removes OVERLAPS, not all multi-span).
test("two non-overlapping auto-redactable spans are both redacted", () => {
  const text = "a 4111111111111111 b 5500005555555559 c";
  const findings = [
    { patternName: "pii.cc", severity: "MEDIUM", start: 2, end: 18, autoRedactable: true },
    { patternName: "pii.cc", severity: "MEDIUM", start: 21, end: 37, autoRedactable: true },
  ];
  const body = applyRedactions(text, findings);
  assert.ok(!/\d/.test(body), "both card spans redacted");
  assert.ok(body.startsWith("a ") && body.includes(" b ") && body.endsWith(" c"));
});
