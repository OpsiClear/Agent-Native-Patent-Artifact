import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { renderFigure, figCaption } from "../render.mjs";
import { buildLegend } from "../numerals.mjs";
import { main as figureCli } from "../cli.mjs";
import { analyzeDrawingSheets, composeDrawingSheets } from "../sheets.mjs";
import { inspectSvgSafety } from "../svg-safety.mjs";

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

test("renderFigure: auto lead style uses a shallow curved patent leader", () => {
  const svg = renderFigure({
    fig: "FIG01",
    width: 500,
    height: 360,
    parts: [{ numeral: "10", label: "part", shape: "box", x: 120, y: 100, w: 160, h: 80, numX: 80, numY: 140 }],
  });
  assert.match(svg, /<path id="FIG01-part-10-lead"/);
  assert.match(svg, /id="FIG01-part-10-lead" d="M [^"]+ C /);
  assert.doesNotMatch(svg, /id="FIG01-part-10-lead" d="M [^"]+ Q /);
});

test("renderFigure: leadStyle straight keeps a leader straight", () => {
  const svg = renderFigure({
    fig: "FIG01",
    width: 500,
    height: 360,
    parts: [{ numeral: "10", label: "part", shape: "box", x: 120, y: 100, w: 160, h: 80, numX: 80, numY: 140, leadStyle: "straight" }],
  });
  assert.match(svg, /<line id="FIG01-part-10-lead"/);
  assert.doesNotMatch(svg, /id="FIG01-part-10-lead" d=/);
});

test("renderFigure: curved lead style uses a shallow cubic path", () => {
  const svg = renderFigure({
    fig: "FIG01",
    width: 520,
    height: 380,
    parts: [{ numeral: "10", label: "part", shape: "box", x: 260, y: 170, w: 120, h: 80, numX: 90, numY: 70, leadStyle: "curved" }],
  });
  assert.match(svg, /<path id="FIG01-part-10-lead"/);
  assert.match(svg, /id="FIG01-part-10-lead" d="M [^"]+ C /);
  assert.doesNotMatch(svg, /id="FIG01-part-10-lead" d="M [^"]+ Q /);
});

test("renderFigure: labelX/labelY places a part label manually", () => {
  const svg = renderFigure({
    fig: "FIG01",
    width: 500,
    height: 360,
    parts: [{ numeral: "10", label: "container", shape: "box", x: 60, y: 80, w: 360, h: 220, labelX: 240, labelY: 110 }],
  });
  assert.match(svg, /<tspan x="240" y="110">container<\/tspan>/);
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

test("cli review-dir fails when fix-before-filing findings are present", () => {
  const dir = mkdtempSync(join(tmpdir(), "apa-figure-review-fix-"));
  try {
    const src = join(dir, "src", "drawing_src");
    const svgDir = join(dir, "evidence", "drawings");
    mkdirSync(src, { recursive: true });
    mkdirSync(svgDir, { recursive: true });
    const figDef = {
      fig: "FIG11",
      width: 520,
      height: 380,
      styleScale: 1.5,
      parts: [
        { numeral: "10", label: "orientation channel", shape: "box", x: 150, y: 110, w: 145, h: 84 },
        { numeral: "12", label: "output", shape: "box", x: 340, y: 110, w: 120, h: 84 },
      ],
      arrows: [{ from: "10", to: "12", kind: "flow" }],
    };
    const figPath = join(src, "fig11.json");
    const svgPath = join(svgDir, "fig11.svg");
    const reportPath = join(svgDir, "quality-review.json");
    writeFileSync(figPath, JSON.stringify(figDef, null, 2), "utf8");
    writeFileSync(svgPath, renderFigure(figDef), "utf8");

    const code = figureCli(["node", "cli.mjs", "review-dir", src, "--svg-dir", svgDir, "--out", reportPath, "--min-score", "88"]);
    assert.equal(code, 1);
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    assert.equal(report.blocking_count, 0);
    assert.ok(report.fix_before_filing_count > 0, JSON.stringify(report, null, 2));
    assert.equal(report.verdict, "polish-before-filing");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli sheet-html composes fixed patent sheets and top-biases wide figures", () => {
  const dir = mkdtempSync(join(tmpdir(), "apa-figure-sheets-"));
  try {
    const svgDir = join(dir, "svgs");
    mkdirSync(svgDir, { recursive: true });
    writeFileSync(join(svgDir, "fig01.svg"), renderFigure({ ...FIXTURE, width: 1320, height: 720 }), "utf8");
    writeFileSync(join(svgDir, "fig02.svg"), renderFigure({ ...FIXTURE, fig: "FIG02", width: 720, height: 960 }), "utf8");
    const outPath = join(dir, "drawings.html");

    const code = figureCli(["node", "cli.mjs", "sheet-html", svgDir, "--out", outPath]);
    assert.equal(code, 0);
    const html = readFileSync(outPath, "utf8");
    assert.match(html, /@page \{ size: 8\.5in 11in;/);
    assert.match(html, /class="figwrap wide"/);
    assert.match(html, /class="fig fig-wide"/);
    assert.match(html, /1\/2/);
    assert.match(html, /2\/2/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli sheet-html --compact stacks short figures on one drawing sheet", () => {
  const dir = mkdtempSync(join(tmpdir(), "apa-figure-compact-sheets-"));
  try {
    const svgDir = join(dir, "svgs");
    mkdirSync(svgDir, { recursive: true });
    writeFileSync(join(svgDir, "fig01.svg"), renderFigure({ ...FIXTURE, width: 1320, height: 720 }), "utf8");
    writeFileSync(join(svgDir, "fig02.svg"), renderFigure({ ...FIXTURE, fig: "FIG02", width: 1320, height: 720 }), "utf8");
    const outPath = join(dir, "drawings.html");

    const code = figureCli(["node", "cli.mjs", "sheet-html", svgDir, "--out", outPath, "--compact"]);
    assert.equal(code, 0);
    const html = readFileSync(outPath, "utf8");
    assert.match(html, /class="sheet compact"/);
    assert.match(html, /class="stack"/);
    assert.match(html, /1\/1/);
    assert.match(html, /data-figure="fig01\.svg,fig02\.svg"/);
    assert.match(html, /--fig-max-height:/);
    assert.match(html, /--fig-width:/);
    assert.match(html, /--fig-height:/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli sheet-html --compact keeps stacked figures at a common physical scale", () => {
  const dir = mkdtempSync(join(tmpdir(), "apa-figure-compact-scale-"));
  try {
    const svgDir = join(dir, "svgs");
    mkdirSync(svgDir, { recursive: true });
    writeFileSync(join(svgDir, "fig01.svg"), renderFigure({ ...FIXTURE, width: 1320, height: 760 }), "utf8");
    writeFileSync(join(svgDir, "fig02.svg"), renderFigure({ ...FIXTURE, fig: "FIG02", width: 1000, height: 620 }), "utf8");
    const reportPath = join(dir, "compact-scale-report.json");

    const code = figureCli(["node", "cli.mjs", "sheet-review", svgDir, "--compact", "--out", reportPath, "--max-font-ratio", "1.05", "--min-text-pt", "0.01"]);
    assert.equal(code, 0);
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    const sheet = report.sheets[0];
    assert.equal(sheet.figure_count, 2);
    assert.ok(sheet.item_layout.every((item) => item.scale_in_per_px === sheet.item_layout[0].scale_in_per_px));
    assert.ok(sheet.max_text_size_ratio <= 1.05, JSON.stringify(sheet, null, 2));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli sheet-review --compact flags inconsistent source font sizes on one sheet", () => {
  const dir = mkdtempSync(join(tmpdir(), "apa-figure-font-mismatch-"));
  try {
    const svgDir = join(dir, "svgs");
    mkdirSync(svgDir, { recursive: true });
    const fig01 = renderFigure({ ...FIXTURE, width: 1320, height: 760 });
    const fig02 = renderFigure({ ...FIXTURE, fig: "FIG02", width: 1000, height: 620 }).replace(/font-size="[0-9]+(?:\.[0-9]+)?"/g, 'font-size="30"');
    writeFileSync(join(svgDir, "fig01.svg"), fig01, "utf8");
    writeFileSync(join(svgDir, "fig02.svg"), fig02, "utf8");
    const reportPath = join(dir, "font-mismatch-report.json");

    const code = figureCli(["node", "cli.mjs", "sheet-review", svgDir, "--compact", "--out", reportPath, "--max-font-ratio", "1.12", "--min-text-pt", "0.01"]);
    assert.equal(code, 1);
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    assert.ok(report.findings.some((f) => f.code === "COMPACT_TEXT_SIZE_MISMATCH"), JSON.stringify(report.findings, null, 2));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli sheet-review flags short one-view sheets and passes compact grouping", () => {
  const dir = mkdtempSync(join(tmpdir(), "apa-figure-sheet-review-"));
  try {
    const svgDir = join(dir, "svgs");
    mkdirSync(svgDir, { recursive: true });
    writeFileSync(join(svgDir, "fig01.svg"), renderFigure({ ...FIXTURE, width: 1320, height: 720 }), "utf8");
    writeFileSync(join(svgDir, "fig02.svg"), renderFigure({ ...FIXTURE, fig: "FIG02", width: 1320, height: 720 }), "utf8");
    const sparseReportPath = join(dir, "sparse-sheet-report.json");
    const compactReportPath = join(dir, "compact-sheet-report.json");

    const sparseCode = figureCli(["node", "cli.mjs", "sheet-review", svgDir, "--out", sparseReportPath, "--min-utilization", "0.55", "--min-text-pt", "0.01"]);
    assert.equal(sparseCode, 1);
    const sparseReport = JSON.parse(readFileSync(sparseReportPath, "utf8"));
    assert.equal(sparseReport.sheet_count, 2);
    assert.equal(sparseReport.compact_candidate_sheet_count, 1);
    assert.ok(sparseReport.findings.some((f) => f.code === "PAGE_COUNT_INFLATED_BY_SHORT_VIEWS"));
    assert.ok(sparseReport.findings.some((f) => f.code === "COMPACT_SHEET_RECOMMENDED"));

    const compactCode = figureCli(["node", "cli.mjs", "sheet-review", svgDir, "--compact", "--out", compactReportPath, "--min-utilization", "0.55", "--min-text-pt", "0.01"]);
    assert.equal(compactCode, 0);
    const compactReport = JSON.parse(readFileSync(compactReportPath, "utf8"));
    assert.equal(compactReport.sheet_count, 1);
    assert.equal(compactReport.findings.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli sheet-review flags globally inconsistent text sizes across sheets", () => {
  const dir = mkdtempSync(join(tmpdir(), "apa-figure-global-text-"));
  try {
    const svgDir = join(dir, "svgs");
    mkdirSync(svgDir, { recursive: true });
    writeFileSync(join(svgDir, "fig01.svg"), renderFigure({ ...FIXTURE, width: 1320, height: 760 }), "utf8");
    writeFileSync(join(svgDir, "fig02.svg"), renderFigure({ ...FIXTURE, fig: "FIG02", width: 720, height: 960 }), "utf8");
    const reportPath = join(dir, "global-text-report.json");

    const code = figureCli(["node", "cli.mjs", "sheet-review", svgDir, "--out", reportPath, "--max-global-font-ratio", "1.12", "--min-text-pt", "0.01"]);
    assert.equal(code, 1);
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    assert.ok(report.findings.some((f) => f.code === "GLOBAL_TEXT_SIZE_MISMATCH"), JSON.stringify(report.findings, null, 2));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli sheet-review flags rendered text below the physical-size target", () => {
  const dir = mkdtempSync(join(tmpdir(), "apa-figure-min-text-"));
  try {
    const svgDir = join(dir, "svgs");
    mkdirSync(svgDir, { recursive: true });
    writeFileSync(join(svgDir, "fig01.svg"), renderFigure({ ...FIXTURE, width: 1320, height: 760 }), "utf8");
    const reportPath = join(dir, "min-text-report.json");

    const code = figureCli(["node", "cli.mjs", "sheet-review", svgDir, "--out", reportPath, "--min-text-pt", "9.1"]);
    assert.equal(code, 1);
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    assert.ok(report.findings.some((f) => f.code === "TEXT_BELOW_MINIMUM_PHYSICAL_SIZE"), JSON.stringify(report.findings, null, 2));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cli sheet-review fails when the SVG directory contains no SVG files", () => {
  const dir = mkdtempSync(join(tmpdir(), "apa-figure-empty-svg-dir-"));
  try {
    const svgDir = join(dir, "svgs");
    mkdirSync(svgDir, { recursive: true });
    writeFileSync(join(svgDir, "notes.txt"), "not an svg", "utf8");

    const code = figureCli(["node", "cli.mjs", "sheet-review", svgDir]);
    assert.equal(code, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("sheet composition rejects active SVG content instead of injecting it into HTML", () => {
  const activeSvg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" onload="alert(1)">',
    '<script>alert(1)</script>',
    '<a href="https://example.test/tracker"><text font-size="16">FIG. 1</text></a>',
    "</svg>",
  ].join("");
  assert.throws(
    () => composeDrawingSheets([{ name: "active.svg", svg: activeSvg }]),
    /unsafe or active SVG content/i,
  );
});

test("sheet composition rejects unquoted protocol-relative references and trailing HTML", () => {
  const externalReference = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">',
    "<feImage href=//example.test/tracker />",
    '<text font-size="16">FIG. 1</text>',
    "</svg>",
  ].join("");
  assert.throws(
    () => composeDrawingSheets([{ name: "external.svg", svg: externalReference }]),
    /SVG_EXTERNAL_REFERENCE/,
  );

  const trailingMarkup = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">',
    '<text font-size="16">FIG. 1</text>',
    "</svg><form><input name=x></form>",
  ].join("");
  assert.throws(
    () => composeDrawingSheets([{ name: "trailing.svg", svg: trailingMarkup }]),
    /SVG_ROOT_INVALID/,
  );
});

test("sheet composition rejects multiple roots and HTML img src between SVG documents", () => {
  const splitRootPayload = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"></svg>',
    '<img src="//example.test/tracker">',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"></svg>',
  ].join("");
  const inspected = inspectSvgSafety(splitRootPayload);
  assert.equal(inspected.safe, false);
  assert.ok(inspected.issues.some((item) =>
    ["SVG_ROOT_INVALID", "SVG_ELEMENT_NOT_ALLOWED", "SVG_ATTRIBUTE_NOT_ALLOWED"].includes(item.code)
  ));
  assert.throws(
    () => composeDrawingSheets([{ name: "split-root.svg", svg: splitRootPayload }]),
    /unsafe or active SVG content/,
  );
});

test("sheet review measures inline CSS and point font sizes", () => {
  const inlineCss = '<svg width="800" height="600"><text style="font-size: 5px">FIG. 1</text></svg>';
  const points = "<svg width='800' height='600'><text font-size='5pt'>FIG. 2</text></svg>";
  const report = analyzeDrawingSheets([
    { name: "css.svg", svg: inlineCss },
    { name: "points.svg", svg: points },
  ], {
    minRenderedTextPt: 9.1,
    maxGlobalTextRatio: 10,
  });
  assert.equal(report.sheets[0].item_layout[0].unmeasured_text_count, 0);
  assert.equal(report.sheets[1].item_layout[0].unmeasured_text_count, 0);
  assert.ok(
    report.findings.filter((finding) => finding.code === "TEXT_BELOW_MINIMUM_PHYSICAL_SIZE").length >= 2,
    JSON.stringify(report.findings, null, 2),
  );
});

test("sheet review blocks inherited class CSS that it cannot measure", () => {
  const svg = [
    '<svg width="800" height="600">',
    "<style>.tiny { font-size: 5px }</style>",
    '<text class="tiny">FIG. 1</text>',
    "</svg>",
  ].join("");
  const report = analyzeDrawingSheets([{ name: "class-css.svg", svg }]);
  assert.equal(report.verdict, "blocked");
  assert.ok(report.findings.some((finding) => finding.code === "UNSAFE_SVG_CONTENT"));
  assert.ok(report.findings.some((finding) => finding.code === "UNMEASURABLE_TEXT"));
});

test("sheet review converts physical SVG dimensions instead of substituting 800x600", () => {
  const svg = '<svg width="8in" height="10in"><text font-size="16">FIG. 1</text></svg>';
  const report = analyzeDrawingSheets([{ name: "physical.svg", svg }], { minRenderedTextPt: 0.01 });
  assert.deepEqual(report.sheets[0].item_layout[0].source_size, [768, 960]);
  assert.equal(report.sheets[0].item_layout[0].dimensions_measured, true);
  assert.equal(report.findings.some((finding) => finding.code === "UNMEASURABLE_DIMENSIONS"), false);
});

test("sheet-review rejects missing, non-finite, zero, and negative threshold values", () => {
  const dir = mkdtempSync(join(tmpdir(), "apa-figure-thresholds-"));
  try {
    const svgDir = join(dir, "svgs");
    mkdirSync(svgDir, { recursive: true });
    writeFileSync(join(svgDir, "fig01.svg"), renderFigure(FIXTURE), "utf8");
    for (const args of [
      ["--min-utilization"],
      ["--min-utilization", "NaN"],
      ["--min-utilization", "0"],
      ["--max-font-ratio", "-2"],
      ["--max-global-font-ratio", "0"],
      ["--min-text-pt", "0"],
    ]) {
      assert.equal(
        figureCli(["node", "cli.mjs", "sheet-review", svgDir, ...args]),
        1,
        `expected rejection for ${args.join(" ")}`,
      );
    }
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
