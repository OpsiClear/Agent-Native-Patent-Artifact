import { test } from "node:test";
import assert from "node:assert/strict";

import { renderFigure } from "../render.mjs";
import { aggregateReviews, reviewFigure } from "../quality.mjs";

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

test("reviewFigure: clean generated SVG is candidate-ready", () => {
  const review = reviewFigure(CLEAN, renderFigure(CLEAN));
  assert.equal(review.blocking, 0);
  assert.equal(review.fixes, 0, JSON.stringify(review.findings));
  assert.equal(review.verdict, "candidate-ready-for-human-review");
  assert.equal(review.score, 100);
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
});

test("aggregateReviews summarizes min and mean score", () => {
  const a = reviewFigure(CLEAN, renderFigure(CLEAN));
  const b = { ...a, score: 80, fixes: 1, verdict: "polish-before-filing" };
  const report = aggregateReviews([a, b]);
  assert.equal(report.figure_count, 2);
  assert.equal(report.mean_score, 90);
  assert.equal(report.min_score, 80);
  assert.equal(report.verdict, "polish-before-filing");
});
