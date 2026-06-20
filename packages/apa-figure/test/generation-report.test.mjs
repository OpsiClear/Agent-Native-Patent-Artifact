import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildFigureGenerationReport } from "../generation-report.mjs";
import { main as figureCli } from "../cli.mjs";

const HASH = "a".repeat(64);

function makeMatter() {
  const d = mkdtempSync(join(tmpdir(), "apa-figure-generation-"));
  const sourceDir = join(d, "src", "drawing_src");
  const drawingsDir = join(d, "evidence", "drawings");
  mkdirSync(sourceDir, { recursive: true });
  mkdirSync(drawingsDir, { recursive: true });
  return { d, sourceDir, drawingsDir };
}

function writeFig(sourceDir, figDef) {
  const name = `${String(figDef.fig || "fig01").toLowerCase()}.json`;
  writeFileSync(join(sourceDir, name), JSON.stringify(figDef, null, 2), "utf8");
}

function writeDrawingMd(drawingsDir, { fig = "FIG01", numerals = [] } = {}) {
  const lines = [
    `# ${fig} - Test drawing`,
    "",
    `### ${fig} - Test drawing`,
    "",
    "```binding",
    "representative: true",
    "numerals:",
  ];
  for (const n of numerals) {
    lines.push(`  - numeral: "${n.numeral}"`);
    lines.push(`    element: "${n.element}"`);
    if (n.defined_in !== undefined) lines.push(`    defined_in: ${n.defined_in}`);
  }
  lines.push("```", "");
  writeFileSync(join(drawingsDir, `${fig.toLowerCase()}.md`), lines.join("\n"), "utf8");
}

test("figure generation report accepts drawing-transcription-backed parts", () => {
  const { d, sourceDir, drawingsDir } = makeMatter();
  try {
    writeFig(sourceDir, {
      fig: "FIG01",
      title: "Supported view",
      parts: [
        { numeral: "10", label: "reservoir", shape: "box", x: 60, y: 80, w: 180, h: 90 },
        { numeral: "12", label: "valve", shape: "ellipse", x: 320, y: 90, w: 120, h: 80 },
      ],
      arrows: [{ from: "10", to: "12", kind: "flow" }],
    });
    writeDrawingMd(drawingsDir, {
      numerals: [
        { numeral: "10", element: "reservoir", defined_in: "SPEC0002" },
        { numeral: "12", element: "valve", defined_in: "SPEC0003" },
      ],
    });
    const report = buildFigureGenerationReport({ matterDir: d, sourceDir, generatedAt: "2026-06-20T00:00:00.000Z" });
    assert.equal(report.schema, "apa-figure-generation-report-v1");
    assert.equal(report.verdict, "ready-for-svg-render");
    assert.equal(report.ready_for_svg_render, true);
    assert.deepEqual(report.generated_numerals.map((n) => [n.numeral, n.defined_in]), [["10", "SPEC0002"], ["12", "SPEC0003"]]);
    assert.equal(report.unsupported_visual_change_risks.length, 0);
    assert.equal(report.files[0].visual_arrows[0].traceable, true);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("figure generation report blocks generated parts without source metadata or transcription", () => {
  const { d, sourceDir, drawingsDir } = makeMatter();
  try {
    writeFig(sourceDir, {
      fig: "FIG01",
      parts: [
        { numeral: "10", label: "known part", shape: "box", x: 60, y: 80, w: 180, h: 90 },
        { numeral: "99", label: "unsupported new part", shape: "box", x: 310, y: 80, w: 180, h: 90 },
      ],
    });
    writeDrawingMd(drawingsDir, {
      numerals: [{ numeral: "10", element: "known part", defined_in: "SPEC0002" }],
    });
    const report = buildFigureGenerationReport({ matterDir: d, sourceDir });
    assert.equal(report.ready_for_svg_render, false);
    assert.equal(report.verdict, "blocked-unsupported-visual-matter");
    assert.ok(report.unsupported_visual_change_risks.some((r) => r.code === "PART_UNSUPPORTED_BY_DISCLOSURE" && r.numeral === "99"));
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("figure generation report blocks removed transcribed numerals", () => {
  const { d, sourceDir, drawingsDir } = makeMatter();
  try {
    writeFig(sourceDir, {
      fig: "FIG01",
      parts: [{ numeral: "10", label: "remaining part", shape: "box", x: 60, y: 80, w: 180, h: 90 }],
    });
    writeDrawingMd(drawingsDir, {
      numerals: [
        { numeral: "10", element: "remaining part", defined_in: "SPEC0002" },
        { numeral: "12", element: "omitted part", defined_in: "SPEC0003" },
      ],
    });
    const report = buildFigureGenerationReport({ matterDir: d, sourceDir });
    assert.deepEqual(report.removed_numerals.map((n) => n.numeral), ["12"]);
    assert.ok(report.unsupported_visual_change_risks.some((r) => r.code === "NUMERAL_REMOVED_FROM_SOURCE" && r.numeral === "12"));
    assert.equal(report.ready_for_svg_render, false);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("explicit source metadata can support a newly visualized part before transcription", () => {
  const { d, sourceDir } = makeMatter();
  try {
    writeFig(sourceDir, {
      fig: "FIG01",
      parts: [
        {
          numeral: "42",
          label: "source-backed part",
          shape: "box",
          x: 60,
          y: 80,
          w: 180,
          h: 90,
          source: "inventor-confirmation",
          source_span: "interview-001:12:05-12:30",
          source_sha256: HASH,
        },
      ],
    });
    const report = buildFigureGenerationReport({ matterDir: d, sourceDir });
    assert.equal(report.ready_for_svg_render, true, JSON.stringify(report.unsupported_visual_change_risks));
    assert.deepEqual(report.generated_numerals[0].support_sources, ["source_metadata"]);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("generation-report CLI writes figure_generation_report.json and exits nonzero on unsupported matter", () => {
  const { d, sourceDir, drawingsDir } = makeMatter();
  try {
    writeFig(sourceDir, {
      fig: "FIG01",
      parts: [{ numeral: "88", label: "unsupported", shape: "box", x: 60, y: 80, w: 180, h: 90 }],
    });
    writeDrawingMd(drawingsDir, { numerals: [] });
    const out = join(d, "evidence", "drawings", "figure_generation_report.json");
    const code = figureCli(["node", "cli.mjs", "generation-report", "--matter", d, "--source-dir", sourceDir, "--out", out]);
    assert.equal(code, 1);
    const report = JSON.parse(readFileSync(out, "utf8"));
    assert.equal(report.schema, "apa-figure-generation-report-v1");
    assert.equal(report.ready_for_svg_render, false);
    assert.ok(report.unsupported_visual_change_risks.length > 0);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});
