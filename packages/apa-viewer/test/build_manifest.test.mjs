// node:test suite for build_manifest.mjs.
// Run from the package dir:  node --test
//
// Covers: meta extraction, the canonical claim/limitation nodes, a resolved supported_by edge,
// and the DELIBERATE divergence - an edge to a missing target is EMITTED with resolved:false,
// never dropped.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "../build_manifest.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXAMPLE = join(__dirname, "..", "..", "..", "examples", "minimal-patent-artifact");

// ------------------------------------------------------------------------------------------------
// the real example matter
// ------------------------------------------------------------------------------------------------

test("builds a manifest with meta.title from the example matter", () => {
  const m = build(EXAMPLE);
  assert.ok(m.meta, "meta present");
  assert.equal(typeof m.meta.title, "string");
  assert.ok(m.meta.title.length > 0, "meta.title is non-empty");
  assert.equal(m.meta.application_type, "utility");
  assert.equal(m.meta.rule_pack.id, "uspto-v1");
  assert.equal(m.meta.rule_pack.effective_date, "2026-06-15");
});

test("emits a claim node CLM01 and a claim-limitation node LIM03", () => {
  const m = build(EXAMPLE);
  const clm01 = m.nodes.find((n) => n.id === "CLM01");
  assert.ok(clm01, "CLM01 node exists");
  assert.equal(clm01.kind, "claim");

  const lim03 = m.nodes.find((n) => n.id === "LIM03");
  assert.ok(lim03, "LIM03 node exists");
  assert.equal(lim03.kind, "claim-limitation");
  assert.equal(lim03.fields.claim, "CLM01");
});

test("emits a resolved supported_by edge LIM03 -> SPEC0004", () => {
  const m = build(EXAMPLE);
  const edge = m.edges.find(
    (e) => e.kind === "supported_by" && bare(e.from) === "LIM03" && e.to === "SPEC0004"
  );
  assert.ok(edge, "supported_by LIM03 -> SPEC0004 edge exists");
  assert.equal(edge.resolved, true, "edge resolves (SPEC0004 exists)");
});

test("emits depends_on CLM02 -> CLM01 and contributed_to AINVENTOR -> CLM01", () => {
  const m = build(EXAMPLE);
  assert.ok(
    m.edges.some((e) => e.kind === "depends_on" && e.from === "CLM02" && e.to === "CLM01"),
    "depends_on edge present"
  );
  assert.ok(
    m.edges.some(
      (e) => e.kind === "contributed_to" && e.from === "AINVENTOR" && e.to === "CLM01"
    ),
    "contributed_to edge present"
  );
});

test("the clean example produces zero unresolved edges", () => {
  const m = build(EXAMPLE);
  const unresolved = m.edges.filter((e) => e.resolved === false);
  assert.equal(unresolved.length, 0, "example matter is fully resolved");
});

// ------------------------------------------------------------------------------------------------
// the divergence: a dangling supported_by must be EMITTED, not dropped
// ------------------------------------------------------------------------------------------------

test("a dangling supported_by [SPEC9999] is emitted with resolved:false (not dropped)", () => {
  const dir = mkdtempSync(join(tmpdir(), "apa-fixture-"));
  try {
    writeFileSync(
      join(dir, "PATENT.md"),
      [
        "---",
        'apa_version: "0.1"',
        'title: "Dangling-edge fixture"',
        'application_type: "utility"',
        "inventors:",
        '  - id: "AINVENTOR"',
        '    name: "Test Inventor"',
        'status: "drafting"',
        'rules_effective_date: "2026-06-15"',
        "inventorship_matrix:",
        '  CLM01: ["AINVENTOR"]',
        "---",
        "",
        "# Dangling-edge fixture",
      ].join("\n"),
      "utf8"
    );
    mkdirSync(join(dir, "logic"), { recursive: true });
    mkdirSync(join(dir, "src"), { recursive: true });
    // Claim LIM01 points its supported_by at SPEC9999, which does NOT exist.
    writeFileSync(
      join(dir, "logic", "claims.md"),
      [
        "# Claims",
        "",
        "### CLM01 - Fixture claim",
        "A widget comprising a gadget.",
        "",
        "```binding",
        "type: claim-independent",
        "category: apparatus",
        "provenance: attorney",
        "limitations:",
        "  - id: LIM01",
        '    text: "a gadget"',
        "    supported_by: [SPEC9999]",
        "    provenance: attorney",
        "```",
      ].join("\n"),
      "utf8"
    );
    // A real SPEC paragraph that is NOT SPEC9999, so we prove the dangling one is the only miss.
    writeFileSync(
      join(dir, "src", "embodiments.md"),
      [
        "# Specification",
        "",
        "### SPEC0001 - Some support",
        "[0001] A gadget is provided.",
        "",
        "```binding",
        "grounding: transcribed",
        "provenance: attorney",
        "```",
      ].join("\n"),
      "utf8"
    );

    const m = build(dir);

    const dangling = m.edges.find(
      (e) => e.kind === "supported_by" && e.to === "SPEC9999"
    );
    assert.ok(dangling, "the dangling supported_by edge WAS EMITTED (not dropped)");
    assert.equal(dangling.resolved, false, "it is marked resolved:false");
    assert.equal(bare(dangling.from), "LIM01");

    // And no SPEC9999 node was invented.
    assert.ok(!m.nodes.some((n) => n.id === "SPEC9999"), "no phantom SPEC9999 node");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function bare(id) {
  const s = String(id || "");
  const dot = s.indexOf(".");
  return dot > 0 ? s.slice(dot + 1) : s;
}
