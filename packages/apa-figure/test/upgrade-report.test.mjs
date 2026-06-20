import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { renderFigure } from "../render.mjs";
import { buildSvgUpgradeReport, extractSvgNumerals } from "../upgrade-report.mjs";
import { main as figureCli } from "../cli.mjs";

const FIG = {
  fig: "FIG01",
  title: "Valve assembly",
  width: 640,
  height: 440,
  parts: [
    { numeral: "10", label: "reservoir", shape: "box", x: 90, y: 100, w: 160, h: 90 },
    { numeral: "12", label: "valve", shape: "ellipse", x: 360, y: 115, w: 140, h: 80 },
  ],
  arrows: [{ from: "10", to: "12", kind: "flow" }],
};

function setupDirs() {
  const d = mkdtempSync(join(tmpdir(), "apa-svg-upgrade-"));
  const sourceDir = join(d, "src", "drawing_src");
  const beforeDir = join(d, "before");
  const afterDir = join(d, "after");
  mkdirSync(sourceDir, { recursive: true });
  mkdirSync(beforeDir, { recursive: true });
  mkdirSync(afterDir, { recursive: true });
  writeFileSync(join(sourceDir, "fig01.json"), JSON.stringify(FIG, null, 2), "utf8");
  return { d, sourceDir, beforeDir, afterDir };
}

test("extractSvgNumerals pairs rendered reference numerals with labels", () => {
  const records = extractSvgNumerals(renderFigure(FIG));
  assert.deepEqual(records.map((r) => [r.numeral, r.label]), [["10", "reservoir"], ["12", "valve"]]);
});

test("style-only SVG upgrade report is ready for drawing-quality review", () => {
  const { d, sourceDir, beforeDir, afterDir } = setupDirs();
  try {
    const before = renderFigure(FIG);
    const after = before.replace('font-size="16"', 'font-size="18"');
    writeFileSync(join(beforeDir, "fig01.svg"), before, "utf8");
    writeFileSync(join(afterDir, "fig01.svg"), after, "utf8");
    const report = buildSvgUpgradeReport({ beforeDir, afterDir, sourceDir, sourceRoute: "manual-svg" });
    assert.equal(report.schema, "apa-svg-upgrade-report-v1");
    assert.equal(report.verdict, "ready-for-drawing-quality");
    assert.equal(report.ready_for_drawing_quality, true);
    assert.equal(report.files[0].diff_summary.changed, true);
    assert.equal(report.files[0].numeral_parity.passed, true);
    assert.equal(report.unsupported_visual_changes.length, 0);
    assert.equal(report.preflight_after[0].verdict, "candidate-ready-for-human-review");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("numeral parity failure blocks marking an upgrade ready", () => {
  const { d, sourceDir, beforeDir, afterDir } = setupDirs();
  try {
    const before = renderFigure(FIG);
    const after = before.replace("</svg>", '  <text id="FIG01-part-14-num" x="60" y="60">14</text>\n</svg>');
    writeFileSync(join(beforeDir, "fig01.svg"), before, "utf8");
    writeFileSync(join(afterDir, "fig01.svg"), after, "utf8");
    const report = buildSvgUpgradeReport({ beforeDir, afterDir, sourceDir });
    assert.equal(report.verdict, "blocked-numeral-parity");
    assert.equal(report.ready_for_drawing_quality, false);
    assert.deepEqual(report.numerals_added_removed.map((n) => [n.action, n.numeral]), [["added", "14"]]);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("semantic visual additions absent from source JSON are blocked", () => {
  const { d, sourceDir, beforeDir, afterDir } = setupDirs();
  try {
    const before = renderFigure(FIG);
    const after = before.replace("</svg>", '  <rect id="FIG01-part-99-shape" x="20" y="20" width="30" height="30" fill="white" stroke="black"/>\n</svg>');
    writeFileSync(join(beforeDir, "fig01.svg"), before, "utf8");
    writeFileSync(join(afterDir, "fig01.svg"), after, "utf8");
    const report = buildSvgUpgradeReport({ beforeDir, afterDir, sourceDir });
    assert.equal(report.verdict, "blocked-unsupported-visual-changes");
    assert.equal(report.ready_for_drawing_quality, false);
    assert.equal(report.unsupported_visual_changes[0].id, "FIG01-part-99-shape");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("upgrade-report CLI writes svg_upgrade_report.json", () => {
  const { d, sourceDir, beforeDir, afterDir } = setupDirs();
  try {
    const before = renderFigure(FIG);
    const after = before.replace('font-size="16"', 'font-size="18"');
    writeFileSync(join(beforeDir, "fig01.svg"), before, "utf8");
    writeFileSync(join(afterDir, "fig01.svg"), after, "utf8");
    const out = join(d, "svg_upgrade_report.json");
    const code = figureCli([
      "node",
      "cli.mjs",
      "upgrade-report",
      "--before-dir",
      beforeDir,
      "--after-dir",
      afterDir,
      "--source-dir",
      sourceDir,
      "--source-route",
      "manual-svg",
      "--out",
      out,
      "--tool-note",
      "none",
    ]);
    assert.equal(code, 0);
    const report = JSON.parse(readFileSync(out, "utf8"));
    assert.equal(report.verdict, "ready-for-drawing-quality");
    assert.equal(report.files_changed_or_created[0].changed, true);
    assert.deepEqual(report.external_tool_notes, ["none"]);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});
