import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { assembleMatter } from "../assemble.mjs";
import { assembleAds } from "../ads.mjs";
import { assembleIds } from "../ids.mjs";
import { preflight } from "../preflight.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const EXAMPLE = join(HERE, "..", "..", "..", "examples", "minimal-patent-artifact");
function clone() { const d = mkdtempSync(join(tmpdir(), "apa-asm-")); cpSync(EXAMPLE, d, { recursive: true }); return d; }

test("assembleMatter builds a 1.77 doc with claims, numbered paragraphs, abstract, and print CSS", () => {
  const { markdown, html } = assembleMatter(EXAMPLE);
  assert.match(markdown, /## CLAIMS/);
  assert.match(markdown, /What is claimed is:/);
  assert.match(markdown, /1\. /);                 // claim 1 numbered
  assert.doesNotMatch(markdown, /\*\[none\]\*/);
  assert.doesNotMatch(markdown, /\n-\s+a reservoir/);
  assert.match(markdown, /\n    a reservoir configured to hold water;/);
  assert.match(markdown, /\[0001\]/);             // detailed-description paragraph numbering
  assert.match(markdown, /## ABSTRACT/);
  assert.match(html, /@page/);                    // USPTO print stylesheet present
  assert.match(html, /class="claims"/);
  assert.doesNotMatch(html, /DRAFT - not legal advice/);
  assert.doesNotMatch(html, /APA does not sign or file/);
  assert.doesNotMatch(html, /-\s+a reservoir configured to hold water/);
  assert.match(html, /class="claim-step">a reservoir configured to hold water;/);
  assert.match(html, /reservoir to an exterior of the insert/);
  assert.doesNotMatch(html, /reservoirto an exterior/);
});

test("assembleMatter renders field text and figure legend object lines", () => {
  const d = clone();
  try {
    const problemPath = join(d, "logic", "problem.md");
    writeFileSync(problemPath, readFileSync(problemPath, "utf8")
      .replace("Self-watering plant containers", "**Self-watering plant containers**"));
    const { markdown, html } = assembleMatter(d, {
      legend: {
        briefDescription: [
          { fig: "FIG01", ordinal: "FIG. 1", title: "Widget view", line: "FIG. 1 - Widget view" },
          { fig: "FIG02", ordinal: "FIG. 2", title: "Flowchart", line: "FIG. 2 - Flowchart" },
        ],
      },
    });
    assert.doesNotMatch(markdown, /\[object Object\]/);
    assert.match(markdown, /FIG\. 1 - Widget view/);
    assert.match(html, /FIG\. 2 - Flowchart/);
    assert.doesNotMatch(html, /\*\*Self-watering plant containers\*\*/);
    assert.match(html, /<strong>Self-watering plant containers<\/strong>/);
    assert.doesNotMatch(markdown, /## FIELD OF THE INVENTION\n# Problem/);
    assert.match(markdown, /## FIELD OF THE INVENTION\n[\s\S]*Self-watering plant containers/i);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("assembleAds surfaces the inventor and flags address as required", () => {
  const { markdown } = assembleAds(EXAMPLE);
  assert.match(markdown, /Application Data Sheet/);
  assert.match(markdown, /Alex Example/);
  assert.match(markdown, /address \[REQUIRED\]/);
});

test("assembleIds seeds from prior art (PA01) with verification status", () => {
  const ids = assembleIds(EXAMPLE);
  assert.equal(ids.count, 1);
  assert.match(ids.markdown, /PA01/);
});

test("preflight: clean example is GO with a rigor-review warning", () => {
  const pf = preflight(EXAMPLE, {});
  assert.equal(pf.blocked, false);
  assert.match(pf.goNoGo, /^GO/);
  assert.ok(pf.gates.some((g) => g.name === "rigor-review" && g.status === "warn"));
  assert.ok(pf.gates.some((g) => g.name === "inventorship-integrity" && g.status === "pass"));
});

test("preflight: a File-Ready rigor report makes the rigor gate PASS; Do-Not-File BLOCKS", () => {
  const okDims = (n) => { const d = {}; for (const id of ["P1", "P2", "P3", "P4", "P5", "P6"]) d[id] = { score: n, weaknesses: [] }; return d; };
  const mk = (dims) => ({ dimensions: dims, findings: [], questions_for_attorney: [], questions_for_inventor: [], read_order: ["logic/claims.md"] });

  const d1 = clone();
  try {
    writeFileSync(join(d1, "patent_rigor_report.json"), JSON.stringify(mk(okDims(5))));
    const pf = preflight(d1, {});
    assert.ok(pf.gates.some((g) => g.name === "rigor-review" && g.status === "pass"), JSON.stringify(pf.gates));
    assert.equal(pf.blocked, false);
  } finally { rmSync(d1, { recursive: true, force: true }); }

  const d2 = clone();
  try {
    const dims = okDims(5); dims.P5.score = 1;           // a single 1 -> Do-Not-File
    writeFileSync(join(d2, "patent_rigor_report.json"), JSON.stringify(mk(dims)));
    const pf = preflight(d2, {});
    assert.ok(pf.gates.some((g) => g.name === "rigor-review" && g.status === "block"));
    assert.equal(pf.blocked, true);
  } finally { rmSync(d2, { recursive: true, force: true }); }
});

test("preflight: blocking drawing-quality findings block assembly", () => {
  const d = clone();
  try {
    writeFileSync(join(d, "evidence", "drawings", "quality-review.json"), JSON.stringify({
      blocking_count: 1,
      min_score: 92,
      verdict: "redraw",
    }));
    const pf = preflight(d, {});
    assert.equal(pf.blocked, true);
    assert.ok(pf.gates.some((g) => g.name === "drawing-quality" && g.status === "block"), JSON.stringify(pf.gates));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("preflight: an ai-suggested claim limitation BLOCKS assembly (NO-GO)", () => {
  const d = clone();
  try {
    const p = join(d, "logic", "claims.md");
    writeFileSync(p, readFileSync(p, "utf8").replace(
      "introduces: \"reservoir\"\n    supported_by: [SPEC0002]\n    illustrated_by: [FIG01#10]\n    provenance: inventor:AINVENTOR",
      "introduces: \"reservoir\"\n    supported_by: [SPEC0002]\n    illustrated_by: [FIG01#10]\n    provenance: ai-suggested"));
    const pf = preflight(d, {});
    assert.equal(pf.blocked, true);
    assert.equal(pf.goNoGo, "NO-GO");
    assert.ok(pf.gates.some((g) => g.name === "inventorship-integrity" && g.status === "block"));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

// Fix 1: a limitation with NO provenance key defaults to 'ai-suggested' (protocol §2.4) and must BLOCK.
test("preflight: a claim limitation with NO provenance key BLOCKS (defaults to ai-suggested)", () => {
  const d = clone();
  try {
    const p = join(d, "logic", "claims.md");
    // Delete the provenance line of the LIM01 limitation, leaving NO provenance key on it.
    const out = readFileSync(p, "utf8").replace(
      "introduces: \"reservoir\"\n    supported_by: [SPEC0002]\n    illustrated_by: [FIG01#10]\n    provenance: inventor:AINVENTOR",
      "introduces: \"reservoir\"\n    supported_by: [SPEC0002]\n    illustrated_by: [FIG01#10]");
    assert.ok(!/provenance: inventor:AINVENTOR\n  - id: LIM02/.test(out), "LIM01 provenance line should be removed");
    writeFileSync(p, out);
    const pf = preflight(d, {});
    assert.equal(pf.blocked, true);
    assert.equal(pf.goNoGo, "NO-GO");
    assert.ok(pf.gates.some((g) => g.name === "inventorship-integrity" && g.status === "block"),
      JSON.stringify(pf.gates.find((g) => g.name === "inventorship-integrity")));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

// Fix 2: case-sensitive AI heuristic - human inventors named 'Claude'/'Ai'/'Neural' must NOT block,
// but an AI acronym like 'DABUS' must.
test("preflight: 'Claude Monet' is NOT AI-named but 'DABUS' IS blocked", () => {
  const human = clone();
  try {
    const p = join(human, "PATENT.md");
    writeFileSync(p, readFileSync(p, "utf8").replace('name: "Alex Example"', 'name: "Claude Monet"'));
    const pf = preflight(human, {});
    const g = pf.gates.find((x) => x.name === "inventorship");
    assert.equal(g.status, "pass", JSON.stringify(g));
    assert.match(pf.goNoGo, /^GO/);
  } finally { rmSync(human, { recursive: true, force: true }); }

  const ai = clone();
  try {
    const p = join(ai, "PATENT.md");
    writeFileSync(p, readFileSync(p, "utf8").replace('name: "Alex Example"', 'name: "DABUS"'));
    const pf = preflight(ai, {});
    assert.ok(pf.gates.some((x) => x.name === "inventorship" && x.status === "block"),
      JSON.stringify(pf.gates.find((x) => x.name === "inventorship")));
    assert.equal(pf.blocked, true);
    assert.equal(pf.goNoGo, "NO-GO");
  } finally { rmSync(ai, { recursive: true, force: true }); }
});
