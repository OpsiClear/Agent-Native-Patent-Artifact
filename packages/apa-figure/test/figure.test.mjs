import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { renderFigure, figCaption } from "../render.mjs";
import { buildLegend } from "../numerals.mjs";
import { main as figureCli } from "../cli.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const EXAMPLE = join(HERE, "..", "..", "..", "examples", "minimal-patent-artifact");

// -------------------------------------------------------------------------------------------------
// (a) renderFigure on a small fixture DSL
// -------------------------------------------------------------------------------------------------

const FIXTURE = {
  fig: "FIG01",
  title: "Sectional view",
  representative: true,
  width: 800,
  height: 600,
  parts: [
    { numeral: "10", label: "reservoir", shape: "box", x: 60, y: 80, w: 220, h: 160 },
    { numeral: "12", label: "float", shape: "ellipse", x: 340, y: 120, w: 120, h: 90 },
    { numeral: "14", label: "valve", shape: "box", x: 540, y: 90, w: 160, h: 140 },
  ],
  arrows: [
    { from: "12", to: "14", kind: "flow", label: "rises" },
    { self: "14", kind: "loop", label: "closes" },
  ],
};

test("renderFigure: caption derivation FIG01 -> FIG. 1", () => {
  assert.equal(figCaption("FIG01"), "FIG. 1");
  assert.equal(figCaption("FIG12"), "FIG. 12");
});

test("figCaption: a fig id with no trailing digits returns the raw id (matches numerals.figOrdinal)", () => {
  // No malformed "FIG. FIG10A"; the bare id is returned so the two helpers agree.
  assert.equal(figCaption("FIG10A"), "FIG10A");
  assert.equal(figCaption("SCHEMATIC"), "SCHEMATIC");
});

test("renderFigure: a null element in parts does not throw and still renders the valid parts", () => {
  const fig = {
    fig: "FIG01",
    width: 800,
    height: 600,
    parts: [
      { numeral: "10", label: "reservoir", shape: "box", x: 60, y: 80, w: 220, h: 160 },
      null, // hand-authored / partial JSON can leave a null entry
      { numeral: "12", label: "float", shape: "ellipse", x: 340, y: 120, w: 120, h: 90 },
    ],
  };
  let svg;
  assert.doesNotThrow(() => { svg = renderFigure(fig); });
  assert.ok(svg.includes(">10<"), "expected the first valid numeral to render");
  assert.ok(svg.includes(">12<"), "expected the second valid numeral to render");
});

test("renderFigure: SVG contains the FIG caption, every numeral, an arrowhead marker, and is B&W", () => {
  const svg = renderFigure(FIXTURE);

  // a valid-ish SVG document
  assert.match(svg, /^<svg\b/);
  assert.match(svg, /<\/svg>\s*$/);

  // the FIG. 1 caption
  assert.ok(svg.includes("FIG. 1"), "expected the FIG. 1 caption");

  // each reference numeral appears as numeral text
  for (const num of ["10", "12", "14"]) {
    assert.ok(svg.includes(`>${num}<`), `expected numeral ${num} rendered as text`);
  }

  // an arrowhead: a <marker> containing a <polygon>
  assert.match(svg, /<marker\b[^>]*>/, "expected an arrowhead <marker>");
  assert.match(svg, /<polygon\b[^>]*>/, "expected an arrowhead <polygon>");
  assert.match(svg, /marker-end="url\(#/, "expected an arrow to reference the marker");

  // a self/loop feedback path
  assert.match(svg, /-loop"/, "expected a loop arrow path id");

  // lead lines exist
  assert.match(svg, /-lead"/, "expected a numeral lead line");

  // black strokes, white fills, NO color
  assert.ok(svg.includes('stroke="black"'), 'expected stroke="black"');
  assert.ok(svg.includes('fill="white"'), 'expected fill="white"');
  assert.equal(/#[0-9a-fA-F]{3,6}\b/.test(svg), false, "no hex colors allowed");
  assert.equal(/\brgb\s*\(/.test(svg), false, "no rgb() colors allowed");
  // the only color words used must be black/white/none
  const colorAttrs = [...svg.matchAll(/(?:stroke|fill)="([^"]+)"/g)].map((m) => m[1]);
  for (const c of colorAttrs) {
    assert.ok(
      c === "black" || c === "white" || c === "none" || c.startsWith("url("),
      `unexpected color value: ${c}`,
    );
  }
});

test("renderFigure: deterministic - same input yields byte-identical output", () => {
  assert.equal(renderFigure(FIXTURE), renderFigure(FIXTURE));
});

test("renderFigure: ellipse parts emit <ellipse>, box parts emit <rect>", () => {
  const svg = renderFigure(FIXTURE);
  assert.match(svg, /<ellipse\b/);
  assert.match(svg, /<rect\b/);
});

test("renderFigure: numX/numY places a reference numeral manually", () => {
  const svg = renderFigure({
    fig: "FIG01",
    width: 500,
    height: 360,
    parts: [{ numeral: "10", label: "part", shape: "box", x: 120, y: 100, w: 160, h: 80, numX: 80, numY: 140 }],
  });
  assert.match(svg, /id="FIG01-part-10-num" x="80" y="140"/);
  assert.match(svg, /id="FIG01-part-10-lead"/);
});

// -------------------------------------------------------------------------------------------------
// (b) buildLegend on the example matter
// -------------------------------------------------------------------------------------------------

test("buildLegend: example matter yields the 4 numerals, a FIG. 1 brief line, and no flags", () => {
  const legend = buildLegend(EXAMPLE);

  const find = (num) => legend.entries.find((e) => e.numeral === num);
  const e10 = find("10");
  const e16 = find("16");
  assert.ok(e10, "expected numeral 10");
  assert.equal(e10.element, "reservoir");
  assert.equal(e10.defined_in, "SPEC0002");
  assert.ok(e16, "expected numeral 16");
  assert.equal(e16.element, "wick");

  // all four numerals present
  for (const num of ["10", "12", "14", "16"]) {
    assert.ok(find(num), `expected numeral ${num} in the legend`);
  }

  // brief description has a "FIG. 1" line
  assert.ok(
    legend.briefDescription.some((b) => b.line.startsWith("FIG. 1")),
    "expected a 'FIG. 1' brief-description line",
  );

  // a clean example produces no flags
  assert.equal(legend.flags.length, 0, JSON.stringify(legend.flags));
});

// -------------------------------------------------------------------------------------------------
// (c) a synthesized drawings .md with a numeral missing defined_in -> a flag
// -------------------------------------------------------------------------------------------------

test("buildLegend: a numeral missing defined_in is flagged NUMERAL_UNDEFINED", () => {
  const dir = mkdtempSync(join(tmpdir(), "apa-figure-"));
  try {
    const drawings = join(dir, "evidence", "drawings");
    mkdirSync(drawings, { recursive: true });
    writeFileSync(
      join(drawings, "fig02.md"),
      [
        "# FIG02 - Flow diagram",
        "",
        "### FIG02 - Flow diagram",
        "",
        "A method flow.",
        "",
        "```binding",
        "representative: false",
        "numerals:",
        '  - numeral: "20"',
        '    element: "step A"',
        "    defined_in: SPEC0010",
        '  - numeral: "22"',
        '    element: "step B"',
        "```", // numeral 22 has NO defined_in
        "",
      ].join("\n"),
      "utf8",
    );

    const legend = buildLegend(dir);
    const undef = legend.flags.filter((f) => f.code === "NUMERAL_UNDEFINED");
    assert.equal(undef.length, 1, JSON.stringify(legend.flags));
    assert.equal(undef[0].numeral, "22");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// -------------------------------------------------------------------------------------------------
// (d) CLI: `render --out X.svg figdef.json` must resolve figdef.json (not the --out value) as input
// -------------------------------------------------------------------------------------------------

test("cli render: --out before the positional figdef resolves the figdef as input", () => {
  const dir = mkdtempSync(join(tmpdir(), "apa-figure-cli-"));
  try {
    const figPath = join(dir, "figdef.json");
    const outPath = join(dir, "X.svg");
    writeFileSync(
      figPath,
      JSON.stringify({ fig: "FIG01", parts: [{ numeral: "10", shape: "box", x: 10, y: 10, w: 100, h: 60 }] }),
      "utf8",
    );

    // argv layout: node cli.mjs render --out X.svg figdef.json
    const code = figureCli(["node", "cli.mjs", "render", "--out", outPath, figPath]);
    assert.equal(code, 0, "render should succeed (figdef.json resolved, not the --out value)");

    // The SVG was written to --out (proves figPath, not outPath, was parsed as the figdef).
    const svg = readFileSync(outPath, "utf8");
    assert.match(svg, /^<svg\b/);
    assert.ok(svg.includes(">10<"), "expected the figdef's numeral in the rendered SVG");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli review-dir writes quality-review.json with structured findings", () => {
  const dir = mkdtempSync(join(tmpdir(), "apa-figure-review-"));
  try {
    const src = join(dir, "src", "drawing_src");
    const svgDir = join(dir, "evidence", "drawings");
    mkdirSync(src, { recursive: true });
    mkdirSync(svgDir, { recursive: true });
    const figDef = {
      fig: "FIG01",
      width: 600,
      height: 420,
      parts: [
        { numeral: "10", label: "input", shape: "box", x: 80, y: 110, w: 160, h: 80 },
        { numeral: "12", label: "processor", shape: "box", x: 360, y: 110, w: 170, h: 80 },
      ],
      arrows: [{ from: "10", to: "12", kind: "flow" }],
    };
    const figPath = join(src, "fig01.json");
    const svgPath = join(svgDir, "fig01.svg");
    const reportPath = join(svgDir, "quality-review.json");
    writeFileSync(figPath, JSON.stringify(figDef, null, 2), "utf8");
    writeFileSync(svgPath, renderFigure(figDef), "utf8");

    const code = figureCli(["node", "cli.mjs", "review-dir", src, "--svg-dir", svgDir, "--out", reportPath, "--min-score", "88"]);
    assert.equal(code, 0);
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    assert.equal(report.figure_count, 1);
    assert.ok(Array.isArray(report.findings));
    assert.ok(report.measurement_summary.measured >= 1);
    const finding = report.findings[0];
    assert.equal(finding.sheet, "SHEET 1");
    assert.equal(finding.figure, "FIG. 1");
    assert.ok("bbox" in finding);
    assert.ok(finding.issue_type);
    assert.ok(finding.rule_reference);
    assert.match(finding.measured_or_visual, /^(measured|visual)$/);
    assert.ok(finding.suggested_fix);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("buildLegend: the same numeral mapping to different elements is flagged NUMERAL_INCONSISTENT", () => {
  const dir = mkdtempSync(join(tmpdir(), "apa-figure-"));
  try {
    const drawings = join(dir, "evidence", "drawings");
    mkdirSync(drawings, { recursive: true });
    writeFileSync(
      join(drawings, "fig01.md"),
      [
        "### FIG01 - View one",
        "```binding",
        "numerals:",
        '  - numeral: "30"',
        '    element: "rotor"',
        "    defined_in: SPEC0001",
        "```",
        "",
      ].join("\n"),
      "utf8",
    );
    writeFileSync(
      join(drawings, "fig02.md"),
      [
        "### FIG02 - View two",
        "```binding",
        "numerals:",
        '  - numeral: "30"',
        '    element: "stator"', // SAME numeral 30, DIFFERENT element
        "    defined_in: SPEC0002",
        "```",
        "",
      ].join("\n"),
      "utf8",
    );

    const legend = buildLegend(dir);
    const incon = legend.flags.filter((f) => f.code === "NUMERAL_INCONSISTENT");
    assert.equal(incon.length, 1, JSON.stringify(legend.flags));
    assert.equal(incon[0].numeral, "30");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
