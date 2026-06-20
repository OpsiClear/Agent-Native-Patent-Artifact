import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFrontmatter, extractBindingBlocks, loadYaml, iterEntitySections } from "./apa-parse.mjs";

test("frontmatter: nested maps, list-of-maps, inline flow, folded scalar", () => {
  const fm = parseFrontmatter(`---
title: "T"
application_type: "utility"
inventors:
  - id: "A"
    name: "Alex"
provenance_summary: { inventor: 7, ai-suggested: 0 }
inventorship_matrix:
  CLM01: ["A"]
abstract: >
  line one
  line two
status: "drafting"
---
body`);
  assert.equal(fm.title, "T");
  assert.deepEqual(fm.inventors, [{ id: "A", name: "Alex" }]);
  assert.equal(fm.provenance_summary.inventor, 7);
  assert.deepEqual(fm.inventorship_matrix, { CLM01: ["A"] });
  assert.equal(fm.abstract, "line one line two");
});

test("binding blocks + entity sections", () => {
  const md = `### CLM01 - title
prose
\`\`\`binding
type: claim-independent
limitations:
  - id: LIM01
    introduces: "frame"
    supported_by: [SPEC0002]
\`\`\`
### CLM02 - other
\`\`\`binding
type: claim-dependent
depends_on: CLM01
\`\`\``;
  const secs = iterEntitySections(md);
  assert.deepEqual(secs.map((s) => s.id), ["CLM01", "CLM02"]);
  const b1 = extractBindingBlocks(secs[0].body)[0];
  assert.equal(b1.type, "claim-independent");
  assert.equal(b1.limitations[0].id, "LIM01");
  assert.deepEqual(b1.limitations[0].supported_by, ["SPEC0002"]);
  const b2 = extractBindingBlocks(secs[1].body)[0];
  assert.equal(b2.depends_on, "CLM01");
});

test("inline comments and quoted values", () => {
  const y = loadYaml(`role: prior-art-for-patentability   # a comment\ncitation: "X, n.d."\nverification: { verified: true, confidence: high }`);
  assert.equal(y.role, "prior-art-for-patentability");
  assert.equal(y.citation, "X, n.d.");
  assert.equal(y.verification.verified, true);
});

test("fail loud: a stray over-indented map line is a parse error (not silently dropped)", () => {
  // Defect 1: dropping an orphan over-indented line could erase a limitation's `provenance`.
  assert.throws(() => loadYaml("a: 1\n    b: 2"), /unexpected indentation/);
  // A legitimately-consumed child block (correctly nested) must still parse.
  assert.deepEqual(loadYaml("inventors:\n  - id: A\n    name: Alex"), {
    inventors: [{ id: "A", name: "Alex" }],
  });
});

test("block scalar preserves content on an under-indented continuation line", () => {
  // Defect 2: a line indented LESS than the first content line must not have real chars sliced off.
  const folded = loadYaml("abstract: >\n  line one\n line two\n  line three");
  assert.equal(folded.abstract, "line one line two line three");
  // Literal block: the base indent is the MINIMUM across the block (2 here), so the deeper lines
  // keep their relative indent and the under-indented "bbb" line is never over-sliced.
  const literal = loadYaml("note: |\n    aaa\n  bbb\n    ccc");
  assert.equal(literal.note, "  aaa\nbbb\n  ccc");
  // Uniformly-indented folded scalar (the example PATENT.md shape) is unaffected.
  assert.equal(loadYaml("abstract: >\n  line one\n  line two").abstract, "line one line two");
});

test("fail loud: tab indentation is rejected; a tab inside a quoted value is fine", () => {
  // Defect 3: tab-indented children would otherwise become top-level siblings.
  assert.throws(() => loadYaml("a:\n\tb: 2"), /tab indentation is not supported/);
  assert.throws(() => loadYaml("a:\n \tb: 2"), /tab indentation is not supported/);
  // A tab strictly inside a quoted scalar value (not in the indentation) must parse.
  assert.equal(loadYaml('a: "x\ty"').a, "x\ty");
});

test("scalars: leading zeros and out-of-range integers stay strings; normal ints coerce", () => {
  // Defect 4: a docket like 00123 must keep its zeros; a 21-digit number must not become 1e20.
  assert.strictEqual(loadYaml("matter_docket: 00123").matter_docket, "00123");
  assert.strictEqual(loadYaml("x: 100000000000000000000").x, "100000000000000000000");
  // Normal integers and floats still coerce to numbers.
  assert.strictEqual(loadYaml("n: 7").n, 7);
  assert.strictEqual(loadYaml("n: -3").n, -3);
  assert.strictEqual(loadYaml("n: 0").n, 0);
  assert.strictEqual(loadYaml("n: 1.5").n, 1.5);
});
