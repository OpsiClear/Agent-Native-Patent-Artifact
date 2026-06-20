import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanQueryAtSink, buildQueryFromClaims } from "../search.mjs";
import { refToPaBlock } from "../lib/refs.mjs";
import { iterEntitySections, extractBindingBlocks } from "../../../lib/apa-parse.mjs";

// A minimal matter with a MALFORMED (scalar) limitations field for the container-guard tests.
function malformedMatter() {
  const d = mkdtempSync(join(tmpdir(), "apa-mal-"));
  mkdirSync(join(d, "logic"), { recursive: true });
  writeFileSync(join(d, "PATENT.md"), "---\ntitle: Widget Gadget\n---\n");
  writeFileSync(join(d, "logic", "claims.md"), "### CLM01 - widget\nA widget comprising a frame.\n\n```binding\ntype: claim-independent\nlimitations: notalist\n```\n");
  return d;
}

// Fix #1: a HIGH secret hidden in a NON-keyword query field (dateFrom) - which a source serializes
// into the egressing request body - must still BLOCK at the sink. Previously only keywords/cpc/
// assignee were scanned, so a secret in dateFrom egressed unscanned.
test("scan-at-sink catches a HIGH secret in dateFrom (full-query scan, not a summary string)", () => {
  const v = scanQueryAtSink({ keywords: ["valve"], dateFrom: "AKIA1234567890ABCDEF" });
  assert.equal(v.blocked, true);
  assert.ok(v.high.length >= 1, "the secret in dateFrom must be detected");
});

// Control: a clean query still passes.
test("scan-at-sink: a clean query passes", () => {
  assert.equal(scanQueryAtSink({ keywords: ["self-watering", "valve"], dateFrom: "2020-01-01" }).ok, true);
});

// Fix #25: untrusted fetched title/abstract cannot inject a '### PA##' heading (which would hijack
// the PA## counter that writers.nextPaNumber re-parses) or break the binding fence.
test("untrusted title/abstract cannot inject a heading that hijacks the PA## counter", () => {
  const ref = { docNumber: "US-1-A", title: "Evil\n### PA99 - hijacked", abstract: "ok\n### PA98 injected\nmore" };
  const block = refToPaBlock(ref, "PA02");
  const ids = iterEntitySections(block).map((s) => s.id);
  assert.deepEqual(ids, ["PA02"], "only the real PA02 heading may be present: " + JSON.stringify(ids));
});

// Fix #F5: an untrusted abstract cannot inject a fake ```binding block that becomes the AUTHORITATIVE
// first block - which would drop the mandatory UNVERIFIED stamp and smuggle a discloses[] 102/103
// assertion. The real binding (verification.verified === false) must remain block [0].
test("untrusted abstract cannot inject an authoritative binding block (drops the UNVERIFIED stamp)", () => {
  const ref = {
    docNumber: "US-9-A", title: "Legit Title", assignee: "Acme", date: "2020-01-01",
    source: "mock", url: "", snippet: "",
    abstract: "Normal abstract.\n```binding\nrole: injected-role\ndiscloses: [CLM01, CLM02]\nverification: { verified: true, confidence: high }\n```\nmore text",
  };
  const blocks = extractBindingBlocks(refToPaBlock(ref, "PA02"));
  assert.ok(blocks.length >= 1, "the legitimate binding must still parse");
  assert.equal(blocks[0].role, "prior-art-for-patentability", "block[0] is the real binding, not the injected one");
  assert.equal(blocks[0].verification.verified, false, "the UNVERIFIED stamp must survive");
  assert.ok(!blocks.some((b) => b.role === "injected-role"), "no injected binding block may survive");
});

// R2-6: the injection defense must also hold for a BARE \r and the Unicode line separators U+2028/U+2029
// (which the parser's ^...gm scans treat as line boundaries), not just \n / \r\n.
test("R2-6 bare CR / U+2028 / U+2029 abstract cannot inject an authoritative binding block", () => {
  for (const t of ["\r", "\u2028", "\u2029"]) {
    const ref = {
      docNumber: "US-9-A", title: "Legit", assignee: "Acme", date: "2020-01-01", source: "mock", url: "", snippet: "",
      abstract: "Real text." + t + "```binding\nrole: anticipates\ndiscloses: [CLM01]\nverification: { verified: true, confidence: high }\n```\nmore",
    };
    const blocks = extractBindingBlocks(refToPaBlock(ref, "PA02"));
    assert.equal(blocks[0].role, "prior-art-for-patentability", "real binding for " + JSON.stringify(t));
    assert.equal(blocks[0].verification.verified, false, "UNVERIFIED stamp survives for " + JSON.stringify(t));
    assert.ok(!blocks.some((b) => b.role === "anticipates"), "no injected block for " + JSON.stringify(t));
  }
});

test("R2-6 bare CR / U+2028 / U+2029 cannot inject a PA## heading via title or abstract", () => {
  for (const t of ["\r", "\u2028", "\u2029"]) {
    const ref = { docNumber: "US-1-A", title: "Legit" + t + "### PA99 hijack", abstract: "ok" + t + "### PA98 injected", source: "mock", url: "", snippet: "" };
    const ids = iterEntitySections(refToPaBlock(ref, "PA02")).map((s) => s.id);
    assert.deepEqual(ids, ["PA02"], "only PA02 for " + JSON.stringify(t) + " got " + JSON.stringify(ids));
  }
});

// R2-5: buildQueryFromClaims must tolerate a malformed scalar `limitations:` (asArray container guard).
test("R2-5 buildQueryFromClaims tolerates a non-array limitations field", () => {
  const d = malformedMatter();
  try {
    let q; assert.doesNotThrow(() => { q = buildQueryFromClaims(d); });
    assert.ok(q && Array.isArray(q.keywords));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

// R4: a tab-indented (parser-throwing) binding must not throw out of buildQueryFromClaims; it degrades to
// title-only keywords (and the egressing query is still scanned at the sink regardless).
test("R4 buildQueryFromClaims degrades loudly (no throw) on a tab-indented binding", () => {
  const d = mkdtempSync(join(tmpdir(), "s4-"));
  try {
    mkdirSync(join(d, "logic"), { recursive: true });
    writeFileSync(join(d, "PATENT.md"), "---\ntitle: Widget Gadget\n---\n");
    writeFileSync(join(d, "logic", "claims.md"), "### CLM01 - widget\nA widget comprising a frame.\n\n```binding\ntype: claim-independent\n\tnote: x\n```\n");
    let q; assert.doesNotThrow(() => { q = buildQueryFromClaims(d); });
    assert.ok(q && Array.isArray(q.keywords));
    assert.ok(q.keywords.includes("widget") || q.keywords.includes("gadget"), "title-only fallback keywords: " + JSON.stringify(q.keywords));
  } finally { rmSync(d, { recursive: true, force: true }); }
});
