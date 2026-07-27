// node:test suite for build_manifest.mjs.
// Run from the package dir:  node --test
//
// Covers: meta extraction, the canonical claim/limitation nodes, a resolved supported_by edge,
// and the DELIBERATE divergence - an edge to a missing target is EMITTED with resolved:false,
// never dropped.

import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "../build_manifest.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXAMPLE = join(__dirname, "..", "..", "..", "examples", "minimal-patent-artifact");

function edit(dir, rel, transform) {
  const path = join(dir, rel);
  writeFileSync(path, transform(readFileSync(path, "utf8")));
}

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

test("emits limitation-level contributor edges for apa_version 0.2", () => {
  const dir = mkdtempSync(join(tmpdir(), "apa-viewer-contributors-"));
  try {
    cpSync(EXAMPLE, dir, { recursive: true });
    edit(dir, "PATENT.md", (text) => text
      .replace('apa_version: "0.1"', 'apa_version: "0.2"')
      .replace(
        '  - id: "AINVENTOR"\n    name: "Alex Example"',
        '  - id: "AINVENTOR"\n    name: "Alex Example"\n  - id: "COINVENTOR"\n    name: "Casey Example"',
      ));
    edit(dir, "logic/claims.md", (text) => text.replace(
      "    provenance: inventor:AINVENTOR\n    source: inventor-confirmation",
      "    provenance: inventor:AINVENTOR\n    contributors: [AINVENTOR, COINVENTOR]\n    source: inventor-confirmation",
    ));
    const manifest = build(dir);
    assert.equal(manifest.meta.apa_version, "0.2");
    for (const inventor of ["AINVENTOR", "COINVENTOR"]) {
      const edge = manifest.edges.find((candidate) => (
        candidate.kind === "contributed_to_limitation"
        && candidate.from === inventor
        && candidate.to === "LIM01"
      ));
      assert.ok(edge, `${inventor} contribution edge exists`);
      assert.equal(edge.resolved, true);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the clean example produces zero unresolved edges", () => {
  const m = build(EXAMPLE);
  const unresolved = m.edges.filter((e) => e.resolved === false);
  assert.equal(unresolved.length, 0, "example matter is fully resolved");
});

test("review summary surfaces drawing QA state without writeback", () => {
  const m = build(EXAMPLE);
  assert.equal(m.review.schema, "apa-viewer-review-v1");
  assert.equal(m.review.provenance.blocking_count, 0);
  assert.equal(m.review.ids.warning_count, 0);
  assert.equal(m.review.support.warning_count, 0);
  assert.equal(m.review.drawings.status, "missing");
  assert.equal(m.review.drawings.path, "evidence/drawings/quality-review.json");
});

test("review summary surfaces unadopted limitations and unverified prior-art references", () => {
  const dir = mkdtempSync(join(tmpdir(), "apa-view-review-"));
  try {
    cpSync(EXAMPLE, dir, { recursive: true });
    const claims = join(dir, "logic", "claims.md");
    writeFileSync(claims, readFileSync(claims, "utf8").replace(
      "  - id: LIM01\n    text: \"a reservoir configured to hold water\"\n    introduces: \"reservoir\"\n    supported_by: [SPEC0002]\n    illustrated_by: [FIG01#10]\n    provenance: inventor:AINVENTOR",
      "  - id: LIM01\n    text: \"a reservoir configured to hold water\"\n    introduces: \"reservoir\"\n    supported_by: [SPEC0002]\n    illustrated_by: [FIG01#10]\n    provenance: ai-suggested",
    ));
    const priorArt = join(dir, "logic", "prior_art.md");
    writeFileSync(priorArt, readFileSync(priorArt, "utf8").replace(
      "verification: { verified: true, confidence: high }",
      "verification: { verified: false, confidence: low }",
    ));
    const m = build(dir);
    assert.equal(m.review.provenance.blocking_count, 1);
    assert.equal(m.review.provenance.unadopted_limitations[0].id, "LIM01");
    assert.equal(m.review.ids.warning_count, 1);
    assert.equal(m.review.ids.unverified_prior_art[0].id, "PA01");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("review summary treats unknown and undeclared provenance as blocking", () => {
  const dir = mkdtempSync(join(tmpdir(), "apa-view-provenance-"));
  try {
    cpSync(EXAMPLE, dir, { recursive: true });
    edit(dir, "logic/claims.md", (text) => text
      .replace("provenance: inventor:AINVENTOR", "provenance: inventor")
      .replace("provenance: inventor:AINVENTOR", "provenance: inventor:NOT_DECLARED"));

    const manifest = build(dir);
    const review = manifest.review.provenance;
    assert.equal(review.invalid_count, 2);
    assert.equal(review.blocking_count, 2);
    assert.deepEqual(
      review.invalid_provenance.map((entry) => entry.provenance),
      ["inventor", "inventor:NOT_DECLARED"],
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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

test("present targets of the wrong node kind remain visible but unresolved", () => {
  const cases = [
    {
      edgeKind: "supported_by",
      target: "CLM01",
      rel: "logic/claims.md",
      mutate: (text) => text.replace("supported_by: [SPEC0002]", "supported_by: [CLM01]"),
    },
    {
      edgeKind: "defined_by",
      target: "SPEC0002",
      rel: "logic/claims.md",
      mutate: (text) => text.replace(
        "    supported_by: [SPEC0002]",
        "    supported_by: [SPEC0002]\n    defined_by: [SPEC0002]",
      ),
    },
    {
      edgeKind: "illustrated_by",
      target: "FIG01",
      rel: "logic/claims.md",
      mutate: (text) => text.replace("illustrated_by: [FIG01#10]", "illustrated_by: [FIG01]"),
    },
    {
      edgeKind: "practiced_by",
      target: "PA01",
      rel: "logic/claims.md",
      mutate: (text) => text.replace(
        "    supported_by: [SPEC0002]",
        "    supported_by: [SPEC0002]\n    practiced_by: [PA01]",
      ),
    },
    {
      edgeKind: "distinguished_over",
      target: "SPEC0001",
      rel: "logic/claims.md",
      mutate: (text) => text.replace("distinguished_over: [PA01]", "distinguished_over: [SPEC0001]"),
    },
    {
      edgeKind: "depends_on",
      target: "SPEC0001",
      rel: "logic/claims.md",
      mutate: (text) => text.replace("depends_on: CLM01", "depends_on: SPEC0001"),
    },
  ];

  for (const fixture of cases) {
    const dir = mkdtempSync(join(tmpdir(), "apa-viewer-typed-edge-"));
    try {
      cpSync(EXAMPLE, dir, { recursive: true });
      edit(dir, fixture.rel, fixture.mutate);
      const manifest = build(dir);
      const edge = manifest.edges.find(
        (candidate) => candidate.kind === fixture.edgeKind && candidate.to === fixture.target,
      );
      assert.ok(edge, `${fixture.edgeKind} edge is still emitted`);
      assert.equal(edge.resolved, false, `${fixture.edgeKind} wrong-kind target must not resolve`);
      assert.equal(edge.resolution_issue, "wrong-target-kind");
      assert.ok(edge.target_kind);
      assert.ok(edge.expected_target_kind);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("viewer emits a resolved defined_by edge to a TERM node", () => {
  const dir = mkdtempSync(join(tmpdir(), "apa-viewer-defined-by-"));
  try {
    cpSync(EXAMPLE, dir, { recursive: true });
    edit(dir, "logic/claims.md", (text) => text.replace(
      "    supported_by: [SPEC0002]",
      "    supported_by: [SPEC0002]\n    defined_by: [TERM01]",
    ));
    const manifest = build(dir);
    const edge = manifest.edges.find((candidate) => (
      candidate.kind === "defined_by" && bare(candidate.from) === "LIM01" && candidate.to === "TERM01"
    ));
    assert.ok(edge);
    assert.equal(edge.resolved, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an inventor/claim id collision preserves the claim and surfaces a review finding", () => {
  const dir = mkdtempSync(join(tmpdir(), "apa-viewer-node-collision-"));
  try {
    cpSync(EXAMPLE, dir, { recursive: true });
    edit(dir, "PATENT.md", (text) => text.replaceAll("AINVENTOR", "CLM01"));
    edit(dir, "logic/claims.md", (text) => text.replaceAll("AINVENTOR", "CLM01"));
    edit(dir, "src/embodiments.md", (text) => text.replaceAll("AINVENTOR", "CLM01"));

    const manifest = build(dir);
    const clm01Nodes = manifest.nodes.filter((node) => node.id === "CLM01");
    assert.equal(clm01Nodes.length, 1, "manifest retains one canonical node per id");
    assert.equal(clm01Nodes[0].kind, "claim", "the protocol claim node is not dropped");
    assert.equal(manifest.review.ids.collision_count, 1);
    assert.equal(manifest.review.ids.node_collisions[0].id, "CLM01");
    assert.deepEqual(manifest.review.ids.node_collisions[0].kinds, ["inventor", "claim"]);
    assert.equal(manifest.review.ids.node_collisions[0].retained_kind, "claim");
    assert.equal(manifest.review.ids.warning_count, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function bare(id) {
  const s = String(id || "");
  const dot = s.indexOf(".");
  return dot > 0 ? s.slice(dot + 1) : s;
}
