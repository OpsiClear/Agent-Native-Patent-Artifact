import { test } from "node:test";
import assert from "node:assert/strict";

import { renderFigure } from "../render.mjs";
import { aggregateReviews, missingSvgReview, reviewFigure } from "../quality.mjs";

const CLEAN = {
  fig: "FIG01",
  width: 700,
  height: 520,
  parts: [
    { numeral: "10", label: "input", shape: "box", x: 90, y: 120, w: 180, h: 90 },
    { numeral: "12", label: "processor", shape: "box", x: 420, y: 120, w: 190, h: 90 },
  ],
  arrows: [{ from: "10", to: "12", kind: "flow" }],
};

function assertStructuredFinding(f) {
  assert.ok(f.sheet, "finding includes sheet");
  assert.ok(f.figure, "finding includes figure");
  assert.ok("bbox" in f, "finding includes bbox field");
  assert.ok(f.issue_type, "finding includes issue_type");
  assert.ok(f.rule_reference, "finding includes rule_reference");
  assert.match(f.measured_or_visual, /^(measured|visual)$/);
  assert.ok(f.suggested_fix, "finding includes suggested_fix");
}

test("reviewFigure: clean generated SVG is candidate-ready", () => {
  const review = reviewFigure(CLEAN, renderFigure(CLEAN));
  assert.equal(review.blocking, 0);
  assert.equal(review.fixes, 0, JSON.stringify(review.findings));
  assert.equal(review.verdict, "candidate-ready-for-human-review");
  assert.equal(review.score, 100);
  assert.equal(review.sheet, "SHEET 1");
  assert.equal(review.findings.length, 1);
  assertStructuredFinding(review.findings[0]);
  assert.equal(review.findings[0].severity, "acceptable");
});

test("reviewFigure: non-BW color and missing caption produce blocking findings", () => {
  const svg = renderFigure(CLEAN)
    .replace('stroke="black"', 'stroke="#333333"')
    .replace(/FIG\. 1/g, "Figure One");
  const review = reviewFigure(CLEAN, svg);
  assert.ok(review.blocking >= 1);
  assert.ok(review.findings.some((f) => f.code === "SVG_COLOR_SYNTAX"));
  assert.ok(review.findings.some((f) => f.code === "FIG_CAPTION_MISSING"));
  assert.equal(review.verdict, "redraw");
  for (const f of review.findings) assertStructuredFinding(f);
  assert.ok(review.findings.find((f) => f.code === "FIG_CAPTION_MISSING").bbox);
});

test("reviewFigure: crowding, margin, and small-text findings include actionable locations", () => {
  const crowded = {
    fig: "FIG88",
    width: 360,
    height: 250,
    parts: [
      { numeral: "10", label: "very long text that should not be squeezed into a patent figure box", shape: "box", x: 4, y: 165, w: 150, h: 62 },
      { numeral: "12", label: "overlap", shape: "box", x: 90, y: 178, w: 150, h: 62 },
    ],
    arrows: [{ from: "10", to: "12", kind: "flow" }],
  };
  const svg = renderFigure(crowded).replace(/font-size="16"/g, 'font-size="8"');
  const review = reviewFigure(crowded, svg);
  for (const code of ["PART_NEAR_EDGE", "CAPTION_CROWDING", "PART_OVERLAP", "SMALL_TEXT"]) {
    const f = review.findings.find((item) => item.code === code);
    assert.ok(f, `${code} exists`);
    assertStructuredFinding(f);
    assert.ok(Array.isArray(f.bbox), `${code} has bbox`);
  }
  assert.ok(review.measurement_summary.measured > 0);
  assert.ok(review.measurement_summary.visual > 0);
});

test("missingSvgReview uses the same structured finding shape", () => {
  const review = missingSvgReview("FIG77", "missing.svg");
  assert.equal(review.blocking, 1);
  assert.equal(review.findings[0].code, "SVG_MISSING");
  assertStructuredFinding(review.findings[0]);
});

test("aggregateReviews summarizes min and mean score", () => {
  const a = reviewFigure(CLEAN, renderFigure(CLEAN));
  const b = { ...a, score: 80, fixes: 1, verdict: "polish-before-filing" };
  const report = aggregateReviews([a, b]);
  assert.equal(report.figure_count, 2);
  assert.equal(report.mean_score, 90);
  assert.equal(report.min_score, 80);
  assert.equal(report.verdict, "polish-before-filing");
  assert.ok(Array.isArray(report.findings));
  assert.ok(report.measurement_summary.measured >= 1);
});
