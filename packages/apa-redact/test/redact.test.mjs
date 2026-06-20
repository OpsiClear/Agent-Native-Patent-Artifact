/**
 * apa-redact test suite — node:test + node:assert, zero dependencies.
 *
 * Planted-secret fixtures cover the headline cases from the spec:
 *   - AWS/API key (HIGH -> exit 3)
 *   - CONFIDENTIAL — DO NOT FILE marker (MEDIUM -> exit 2)
 *   - inventor SSN (HIGH, patent extension)
 *   - public-disclosure bar phrase (MEDIUM, patent extension)
 *   - clean text (exit 0)
 * Plus: applyRedactions keeps offsets correct across multiple findings, and
 * NFKC / zero-width evasion is defeated.
 *
 * Run with:  node --test
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  scan,
  scanFile,
  applyRedactions,
  applyRedactionsDetailed,
  exitCodeFor,
  countsFor,
  isOversize,
  normalizeWithMap,
  maskPreview,
  DEFAULT_MAX_BYTES,
} from "../redact-engine.mjs";
import { PATTERNS, PATTERNS_BY_NAME, actionForTier } from "../redact-patterns.mjs";

// ── Helpers ───────────────────────────────────────────────────────────────────

function names(findings) {
  return findings.map((f) => f.patternName);
}
function hasFinding(findings, name) {
  return findings.some((f) => f.patternName === name);
}

// A genuine-shape AWS access key ID. Deliberately NOT containing "EXAMPLE"
// (which the placeholder suppressor would strip).
const AWS_KEY = "AKIA" + "RJQ7Z3K2NPLMWX9A".slice(0, 16);

// ── Taxonomy sanity ─────────────────────────────────────────────────────────

test("taxonomy: single source of truth has the 3 tiers and derived actions", () => {
  const tiers = new Set(PATTERNS.map((p) => p.tier));
  assert.deepEqual([...tiers].sort(), ["HIGH", "LOW", "MEDIUM"]);
  for (const p of PATTERNS) {
    assert.equal(p.action, actionForTier(p.tier));
    assert.ok(["block", "confirm", "fyi"].includes(p.action));
    assert.ok(p.name && p.description && p.regex instanceof RegExp);
  }
  // action mapping is exactly HIGH->block, MEDIUM->confirm, LOW->fyi.
  assert.equal(actionForTier("HIGH"), "block");
  assert.equal(actionForTier("MEDIUM"), "confirm");
  assert.equal(actionForTier("LOW"), "fyi");
});

test("taxonomy: patent extensions present at the right tiers", () => {
  assert.equal(PATTERNS_BY_NAME["patent.unpublished_serial"].tier, "HIGH");
  assert.equal(PATTERNS_BY_NAME["patent.inventor_ssn"].tier, "HIGH");
  assert.equal(PATTERNS_BY_NAME["patent.trade_secret_codename"].tier, "MEDIUM");
  assert.equal(PATTERNS_BY_NAME["patent.public_disclosure_phrase"].tier, "MEDIUM");
  assert.equal(PATTERNS_BY_NAME["patent.inventor_pii"].tier, "MEDIUM");
});

// ── HIGH: AWS/API key -> exit 3 ───────────────────────────────────────────────

test("HIGH: planted AWS access key blocks (exit 3)", () => {
  const text = `deploy config\nAWS_ACCESS_KEY_ID=${AWS_KEY}\nmore lines\n`;
  const findings = scan(text);
  assert.ok(hasFinding(findings, "aws.access_key"), "should detect aws.access_key");
  assert.equal(exitCodeFor(findings), 3);
  assert.equal(countsFor(findings).HIGH >= 1, true);
  // The raw secret never leaks into the excerpt.
  const f = findings.find((x) => x.patternName === "aws.access_key");
  assert.ok(!f.excerpt.includes(AWS_KEY));
  assert.ok(f.excerpt.startsWith("AKIA"));
});

test("HIGH: planted Anthropic API key blocks (exit 3)", () => {
  const text = "key = sk-ant-api03-AbCdEf0123456789AbCdEf0123456789";
  const findings = scan(text);
  assert.ok(hasFinding(findings, "anthropic.key"));
  assert.equal(exitCodeFor(findings), 3);
});

// ── MEDIUM: CONFIDENTIAL — DO NOT FILE -> exit 2 ──────────────────────────────

test("MEDIUM: 'CONFIDENTIAL — DO NOT FILE' marker confirms (exit 2)", () => {
  const text = "CONFIDENTIAL — DO NOT FILE\nDraft disclosure, attorney work product.\n";
  const findings = scan(text);
  assert.ok(hasFinding(findings, "legal.nda_marker"));
  assert.equal(exitCodeFor(findings), 2);
  assert.equal(countsFor(findings).HIGH, 0);
  assert.ok(countsFor(findings).MEDIUM >= 1);
});

// ── HIGH (patent): inventor SSN ───────────────────────────────────────────────

test("HIGH: inventor SSN blocks (exit 3)", () => {
  const text = "Inventor declaration. SSN: 123-45-6789 on file.";
  const findings = scan(text);
  // Both pii.ssn (MEDIUM) and patent.inventor_ssn (HIGH) shapes match the same
  // span; the patent one is HIGH so the exit code is 3.
  assert.ok(hasFinding(findings, "patent.inventor_ssn"));
  assert.equal(exitCodeFor(findings), 3);
});

test("SSN validator rejects placeholder all-zero / 9xx / 666 shapes", () => {
  for (const bad of ["000-12-3456", "123-00-6789", "123-45-0000", "666-12-3456", "900-12-3456"]) {
    const findings = scan(`SSN ${bad}`);
    assert.ok(!hasFinding(findings, "patent.inventor_ssn"), `${bad} should not match`);
    assert.ok(!hasFinding(findings, "pii.ssn"), `${bad} should not match pii.ssn`);
  }
});

// ── MEDIUM (patent): public-disclosure bar phrase ─────────────────────────────

test("MEDIUM: public-disclosure bar phrase confirms (exit 2)", () => {
  const samples = [
    "We shipped to customer in March, before the filing date.",
    "The prototype was offered for sale at the trade show.",
    "Results were published on arXiv last year.",
    "We demoed publicly at the conference.",
  ];
  for (const text of samples) {
    const findings = scan(text);
    assert.ok(
      hasFinding(findings, "patent.public_disclosure_phrase"),
      `should flag bar phrase in: ${text}`,
    );
    assert.equal(exitCodeFor(findings), 2, `exit 2 for: ${text}`);
  }
});

// ── HIGH (patent): unpublished serial in confidential context ─────────────────

test("HIGH: unpublished serial number near a confidential marker blocks", () => {
  const text = "CONFIDENTIAL draft — application no 18/123,456 not yet filed.";
  const findings = scan(text);
  assert.ok(hasFinding(findings, "patent.unpublished_serial"));
  assert.equal(exitCodeFor(findings), 3);
});

test("serial number WITHOUT a confidential context does not block (proximity gate)", () => {
  const text = "Published patent application 18/123,456 is available on Google Patents.";
  const findings = scan(text);
  assert.ok(!hasFinding(findings, "patent.unpublished_serial"));
});

// ── clean text -> exit 0 ──────────────────────────────────────────────────────

test("clean text yields no findings (exit 0)", () => {
  const text =
    "This is an ordinary paragraph about widgets and gizmos.\n" +
    "It mentions example@example.com (an allowlisted example domain) and nothing secret.\n";
  const findings = scan(text);
  assert.equal(exitCodeFor(findings), 0);
  assert.deepEqual(countsFor(findings), { HIGH: 0, MEDIUM: 0, LOW: 0 });
});

// ── applyRedactions: multiple findings, offsets stay correct ──────────────────

test("applyRedactions keeps offsets correct with multiple findings (returns string)", () => {
  // NOTE: phone/number spans are deliberately NOT immediately followed by a
  // period — the ported gstack pii.phone.e164 pattern uses a (?![\w.]) lookahead
  // that (by design) declines a trailing dot to avoid version/IP false hits.
  const text =
    "Contact alice@example.org or bob@test.net here\n" +
    "Phone 415-555-0132 and SSN 078-05-1120 follow\n";
  const findings = scan(text);
  const out = applyRedactions(text, findings);
  assert.equal(typeof out, "string");

  // Every auto-redactable matched value is gone; tokens are present.
  assert.ok(!out.includes("bob@test.net"));
  assert.ok(!out.includes("415-555-0132"));
  assert.ok(!out.includes("078-05-1120"));
  assert.ok(out.includes("<REDACTED-EMAIL>"));
  assert.ok(out.includes("<REDACTED-PHONE>"));
  assert.ok(out.includes("<REDACTED-SSN>"));

  // Structure around the redactions is intact (right-to-left splice didn't
  // corrupt earlier offsets): the surrounding words survive verbatim.
  assert.ok(out.startsWith("Contact "));
  assert.ok(out.includes(" or "));
  assert.ok(out.includes("Phone "));
  assert.ok(out.includes(" follow"));
});

test("applyRedactions only-names restricts the substitution set", () => {
  const text = "Email a@b.co, phone 415-555-0132 today";
  const findings = scan(text);
  const { body } = applyRedactionsDetailed(text, findings, { onlyNames: ["pii.phone.e164"] });
  assert.ok(body.includes("<REDACTED-PHONE>"));
  assert.ok(body.includes("a@b.co"), "email left untouched when not in onlyNames");
});

test("finding [start,end) offsets point at the real span in the original text", () => {
  const text = "prefix bob@test.net suffix";
  const findings = scan(text);
  const email = findings.find((f) => f.patternName === "pii.email");
  assert.ok(email);
  assert.equal(text.slice(email.start, email.end), "bob@test.net");
});

// ── NFKC / zero-width evasion is defeated ─────────────────────────────────────

test("NFKC normalization defeats fullwidth-character evasion", () => {
  // Fullwidth "CONFIDENTIAL" — NFKC folds these to ASCII before matching.
  const fullwidth = "ＣＯＮＦＩＤＥＮＴＩＡＬ draft";
  assert.notEqual(fullwidth.slice(0, 12), "CONFIDENTIAL"); // genuinely fullwidth
  const findings = scan(fullwidth);
  assert.ok(
    hasFinding(findings, "legal.nda_marker"),
    "NFKC should fold fullwidth letters so the marker matches",
  );
});

test("zero-width characters cannot split a secret to evade the scanner", () => {
  // Insert a zero-width space inside an AWS key. Naive matching would miss it;
  // normalization strips it first.
  const zwsp = "​";
  const evaded = AWS_KEY.slice(0, 8) + zwsp + AWS_KEY.slice(8);
  assert.ok(evaded.includes(zwsp));
  const findings = scan(`KEY=${evaded}`);
  assert.ok(hasFinding(findings, "aws.access_key"), "zero-width split must be defeated");
  assert.equal(exitCodeFor(findings), 3);
});

test("normalizeWithMap maps normalized offsets back to original offsets", () => {
  const zwsp = "​";
  const original = `ab${zwsp}cd`;
  const { normalized, map } = normalizeWithMap(original);
  assert.equal(normalized, "abcd");
  // normalized index 2 ('c') came from original index 3 (after the zwsp at 2).
  assert.equal(original[map[2]], "c");
  // Sentinel maps end-of-string to original length.
  assert.equal(map[map.length - 1], original.length);
});

// ── Fail-closed oversize guard ────────────────────────────────────────────────

test("oversize input fails closed with a synthetic HIGH finding (never silently passes)", () => {
  const big = "x".repeat(2048);
  const findings = scan(big, { maxBytes: 1024 });
  assert.equal(isOversize(findings), true);
  assert.equal(exitCodeFor(findings), 3);
  assert.equal(findings[0].patternName, "engine.input_too_large");
});

test("malformed maxBytes falls back to the default cap (guard not disabled)", () => {
  // NaN / 0 / negative must NOT disable the cap. A small clean input still scans.
  for (const bad of [NaN, 0, -5, undefined]) {
    const findings = scan("hello world", { maxBytes: bad });
    assert.equal(isOversize(findings), false);
  }
  assert.equal(DEFAULT_MAX_BYTES, 1024 * 1024);
});

// ── scanFile: scan-at-sink discipline ─────────────────────────────────────────

test("scanFile scans the exact bytes of a file (scan-at-sink)", () => {
  const dir = mkdtempSync(join(tmpdir(), "apa-redact-"));
  try {
    const p = join(dir, "payload.txt");
    writeFileSync(p, `cloud LLM payload\nAWS_ACCESS_KEY_ID=${AWS_KEY}\n`);
    const findings = scanFile(p);
    assert.ok(hasFinding(findings, "aws.access_key"));
    assert.equal(exitCodeFor(findings), 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("scanFile fails closed when the on-disk file exceeds the cap", () => {
  const dir = mkdtempSync(join(tmpdir(), "apa-redact-"));
  try {
    const p = join(dir, "big.txt");
    writeFileSync(p, "y".repeat(4096));
    const findings = scanFile(p, { maxBytes: 1024 });
    assert.equal(isOversize(findings), true);
    assert.equal(exitCodeFor(findings), 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── No-promotion invariant + masking ──────────────────────────────────────────

test("repo visibility never promotes a MEDIUM finding to HIGH", () => {
  const text = "CONFIDENTIAL — DO NOT FILE";
  const pub = scan(text, { repoVisibility: "public" });
  const priv = scan(text, { repoVisibility: "private" });
  assert.equal(exitCodeFor(pub), 2);
  assert.equal(exitCodeFor(priv), 2);
  for (const f of pub) assert.equal(f.severity, f.tier);
});

test("maskPreview never reveals more than 4 leading chars", () => {
  assert.equal(maskPreview("AKIA1234567890ABCDEF"), "AKIA********…");
  assert.equal(maskPreview("abc"), "abc");
  assert.equal(maskPreview("abcdef"), "abcd**");
});

test("env-style KV only fires on high-entropy values, not placeholders", () => {
  assert.ok(!hasFinding(scan("API_KEY=changeme"), "env.kv"));
  assert.ok(!hasFinding(scan("API_KEY=your-key-here"), "env.kv"));
  assert.ok(hasFinding(scan("API_SECRET=8Fq2zR7vK1pX9mTnW3aL"), "env.kv"));
  // env.kv is MEDIUM (context-variable shape), not HIGH.
  assert.equal(PATTERNS_BY_NAME["env.kv"].tier, "MEDIUM");
});
