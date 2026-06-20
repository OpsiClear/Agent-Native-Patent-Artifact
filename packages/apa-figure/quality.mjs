/**
 * apa-figure / quality.mjs - deterministic preflight for patent-style SVG figures.
 *
 * This is not a 37 CFR 1.84 compliance certification. It is a fast, local quality gate that catches
 * problems that make generated SVGs look unlike professional utility-patent drawings: color,
 * unsupported SVG constructs, missing numerals/lead lines, crowding, caption collisions, and
 * unreadably long labels.
 */

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { figCaption } from "./render.mjs";

const FORBIDDEN_TAGS = ["foreignObject", "image", "filter", "linearGradient", "radialGradient", "pattern"];
const COLOR_ATTR_RE = /\b(?:stroke|fill|color)="([^"]+)"/g;
const STROKE_WIDTH_RE = /\bstroke-width="([^"]+)"/g;
const TEXT_RE = /<text\b([^>]*)>([\s\S]*?)<\/text>/g;

const FINDING_META = {
  SVG_INVALID: ["rendering", "37-cfr-1.84", "measured", "Regenerate the drawing as a valid SVG before review."],
  SVG_FORBIDDEN_CONSTRUCT: ["rendering", "37-cfr-1.84", "measured", "Replace unsupported SVG constructs with plain black-and-white vector line art."],
  SVG_NON_BW_COLOR: ["rendering", "37-cfr-1.84", "measured", "Use only black, white, and none unless a human approves a color/photo petition path."],
  SVG_COLOR_SYNTAX: ["rendering", "37-cfr-1.84", "measured", "Remove CSS color syntax and keep explicit black/white SVG attributes."],
  FIG_CAPTION_MISSING: ["rendering", "37-cfr-1.84", "measured", "Restore the expected FIG. caption on the sheet."],
  PART_WITHOUT_NUMERAL: ["numeral", "37-cfr-1.84", "measured", "Assign a reference numeral or remove the unsupported visual element."],
  NUMERAL_NOT_RENDERED: ["numeral", "37-cfr-1.84", "measured", "Render the missing reference numeral as legible text."],
  LEAD_LINE_MISSING: ["lead-line", "37-cfr-1.84", "measured", "Add a short clear lead line from the numeral to the feature."],
  DUPLICATE_NUMERAL_IN_FIGURE: ["numeral", "37-cfr-1.84", "measured", "Use each reference numeral for one feature in the figure."],
  ARROW_UNRESOLVED_NUMERAL: ["lead-line", "apa-protocol", "measured", "Correct the arrow endpoint to reference an existing numeral."],
  LABEL_TOO_LONG: ["text-size", "mpep-608.02", "visual", "Shorten or wrap the label, or split the figure so text remains legible."],
  PART_GEOMETRY_INVALID: ["rendering", "apa-protocol", "measured", "Correct the figure JSON geometry before rendering."],
  PART_NEAR_EDGE: ["margin", "37-cfr-1.84", "measured", "Move the part inward to preserve drawing margins and caption space."],
  CAPTION_CROWDING: ["crowding", "37-cfr-1.84", "measured", "Move the view upward or split/enlarge the sheet so the FIG. caption has breathing room."],
  PART_OVERLAP: ["crowding", "mpep-608.02", "measured", "Separate overlapping parts or make containment visually explicit."],
  SMALL_TEXT: ["text-size", "37-cfr-1.84", "measured", "Increase text/reference-character size on the rendered sheet."],
  STROKE_WIDTH_OUT_OF_RANGE: ["line-weight", "37-cfr-1.84", "measured", "Use consistent drawing line weights that remain legible after PDF export."],
  CLEAN: ["rendering", "apa-protocol", "measured", "No deterministic fix required; keep human/draftsperson review."],
  SVG_MISSING: ["rendering", "apa-protocol", "measured", "Render the missing SVG before drawing-quality review."],
};

function escRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function clampScore(n) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function area(p) {
  return Math.max(0, Number(p.w) || 0) * Math.max(0, Number(p.h) || 0);
}

function bbox(p) {
  return {
    x1: Number(p.x) || 0,
    y1: Number(p.y) || 0,
    x2: (Number(p.x) || 0) + (Number(p.w) || 0),
    y2: (Number(p.y) || 0) + (Number(p.h) || 0),
  };
}

function box(p) {
  if (!p || ![p.x, p.y, p.w, p.h].every(Number.isFinite)) return null;
  return [Math.round(p.x), Math.round(p.y), Math.round(p.w), Math.round(p.h)];
}

function unionBoxes(boxes) {
  const valid = boxes.filter(Array.isArray);
  if (!valid.length) return null;
  const x1 = Math.min(...valid.map((b) => b[0]));
  const y1 = Math.min(...valid.map((b) => b[1]));
  const x2 = Math.max(...valid.map((b) => b[0] + b[2]));
  const y2 = Math.max(...valid.map((b) => b[1] + b[3]));
  return [x1, y1, x2 - x1, y2 - y1];
}

function normalizeBbox(value) {
  if (!Array.isArray(value) || value.length !== 4) return null;
  const nums = value.map(Number);
  return nums.every(Number.isFinite) ? nums.map((n) => Math.round(n)) : null;
}

function overlapArea(a, b) {
  const ax = bbox(a);
  const bx = bbox(b);
  const w = Math.max(0, Math.min(ax.x2, bx.x2) - Math.max(ax.x1, bx.x1));
  const h = Math.max(0, Math.min(ax.y2, bx.y2) - Math.max(ax.y1, bx.y1));
  return w * h;
}

function mostlyContains(outer, inner) {
  const o = bbox(outer);
  const i = bbox(inner);
  return o.x1 <= i.x1 && o.y1 <= i.y1 && o.x2 >= i.x2 && o.y2 >= i.y2;
}

function textContents(svg) {
  return [...svg.matchAll(TEXT_RE)].map((m) => {
    const inner = m[2];
    return {
      attrs: m[1],
      text: inner.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(),
      x: firstFinite(attrNumber(m[1], "x"), attrNumber(inner, "x")),
      y: firstFinite(attrNumber(m[1], "y"), attrNumber(inner, "y")),
      fontSize: attrNumber(m[1], "font-size"),
    };
  });
}

function attrNumber(attrs, name) {
  const m = new RegExp(`\\b${escRe(name)}="([^"]+)"`).exec(String(attrs || ""));
  if (!m) return NaN;
  const n = Number(String(m[1]).replace(/px$/i, ""));
  return Number.isFinite(n) ? n : NaN;
}

function firstFinite(...values) {
  return values.find(Number.isFinite) ?? NaN;
}

function textBox(t) {
  if (![t.x, t.y, t.fontSize].every(Number.isFinite)) return null;
  return [
    Math.round(t.x),
    Math.round(t.y - t.fontSize),
    Math.max(1, Math.round(String(t.text || "").length * t.fontSize * 0.58)),
    Math.max(1, Math.round(t.fontSize * 1.25)),
  ];
}

function finding(severity, code, message, detail = {}) {
  const [issueType, ruleReference, measuredOrVisual, suggestedFix] = FINDING_META[code] || ["rendering", "apa-protocol", "visual", "Review and correct before relying on the drawing."];
  const {
    bbox: rawBbox,
    issue_type,
    rule_reference,
    measured_or_visual,
    suggested_fix,
    sheet,
    figure,
    ...rest
  } = detail;
  return {
    severity,
    code,
    message,
    sheet: sheet || null,
    figure: figure || null,
    bbox: normalizeBbox(rawBbox),
    issue_type: issue_type || issueType,
    rule_reference: rule_reference || ruleReference,
    measured_or_visual: measured_or_visual || measuredOrVisual,
    suggested_fix: suggested_fix || suggestedFix,
    ...rest,
  };
}

/**
 * Review a single figure definition and rendered SVG.
 * @param {object} figDef parsed figure JSON
 * @param {string} svg rendered SVG text
 * @param {{file?: string}} opts
 */
export function reviewFigure(figDef, svg, opts = {}) {
  const findings = [];
  const figId = figDef?.fig || figDef?.id || basename(opts.file || "FIG");
  const sheet = figDef?.sheet || opts.sheet || "SHEET 1";
  const width = Number(figDef?.width) || 800;
  const height = Number(figDef?.height) || 600;
  const parts = Array.isArray(figDef?.parts) ? figDef.parts.filter(Boolean) : [];
  const arrows = Array.isArray(figDef?.arrows) ? figDef.arrows.filter(Boolean) : [];
  const numeralBoxes = new Map();

  let score = 100;
  const subtract = (severity, points) => {
    score -= severity === "blocking" ? Math.max(points, 15) : points;
  };

  if (!svg || !/^<svg\b/.test(svg.trim())) {
    findings.push(finding("blocking", "SVG_INVALID", "Rendered output is not an SVG document."));
    return summary(figId, sheet, 0, findings);
  }

  for (const tag of FORBIDDEN_TAGS) {
    if (new RegExp(`<${tag}\\b`, "i").test(svg)) {
      const sev = tag === "foreignObject" || tag === "image" ? "blocking" : "fix-before-filing";
      findings.push(finding(sev, "SVG_FORBIDDEN_CONSTRUCT", `Forbidden SVG construct <${tag}> is present.`, { tag }));
      subtract(sev, 14);
    }
  }

  for (const m of svg.matchAll(COLOR_ATTR_RE)) {
    const color = m[1].trim();
    const ok = color === "black" || color === "white" || color === "none" || color.startsWith("url(");
    if (!ok) {
      findings.push(finding("blocking", "SVG_NON_BW_COLOR", `Unexpected color value "${color}".`, { color }));
      subtract("blocking", 18);
    }
  }
  if (/#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/.test(svg)) {
    findings.push(finding("blocking", "SVG_COLOR_SYNTAX", "SVG contains color syntax outside black/white attributes."));
    subtract("blocking", 18);
  }

  const expectedCaption = figCaption(figId);
  if (!svg.includes(expectedCaption)) {
    findings.push(finding("blocking", "FIG_CAPTION_MISSING", `Expected caption ${expectedCaption}.`, { bbox: [0, height - 52, width, 52] }));
    subtract("blocking", 20);
  }

  const numeralCounts = new Map();
  for (const p of parts) {
    const pbox = box(p);
    if (p.numeral == null || p.numeral === "") {
      findings.push(finding("fix-before-filing", "PART_WITHOUT_NUMERAL", "A part lacks a reference numeral.", { label: p.label || "", bbox: pbox }));
      subtract("fix-before-filing", 5);
      continue;
    }
    const num = String(p.numeral);
    numeralCounts.set(num, (numeralCounts.get(num) || 0) + 1);
    numeralBoxes.set(num, [...(numeralBoxes.get(num) || []), pbox]);
    if (!new RegExp(`>${escRe(num)}<`).test(svg)) {
      findings.push(finding("blocking", "NUMERAL_NOT_RENDERED", `Numeral ${num} is not rendered as text.`, { numeral: num, bbox: pbox }));
      subtract("blocking", 18);
    }
    if (!new RegExp(`part-${escRe(String(num).replace(/[^A-Za-z0-9]+/g, "-"))}-lead`).test(svg)) {
      findings.push(finding("fix-before-filing", "LEAD_LINE_MISSING", `No lead line id was found for numeral ${num}.`, { numeral: num, bbox: pbox }));
      subtract("fix-before-filing", 8);
    }
  }
  for (const [num, count] of numeralCounts) {
    if (count > 1) {
      findings.push(finding("blocking", "DUPLICATE_NUMERAL_IN_FIGURE", `Numeral ${num} is used ${count} times in one figure.`, { numeral: num, count, bbox: unionBoxes(numeralBoxes.get(num) || []) }));
      subtract("blocking", 20);
    }
  }

  const byNumeral = new Set([...numeralCounts.keys()]);
  for (const a of arrows) {
    for (const key of ["from", "to", "self"]) {
      if (a[key] != null && !byNumeral.has(String(a[key]))) {
        findings.push(finding("blocking", "ARROW_UNRESOLVED_NUMERAL", `Arrow references missing numeral ${a[key]}.`, { numeral: String(a[key]) }));
        subtract("blocking", 16);
      }
    }
  }

  const captionY = height - 18;
  for (const p of parts) {
    const label = String(p.label || "");
    const pbox = box(p);
    if (label.length > 38) {
      findings.push(finding("fix-before-filing", "LABEL_TOO_LONG", `Label is likely too long for patent drawing text: "${label}".`, { label, bbox: pbox }));
      subtract("fix-before-filing", 5);
    }
    if (![p.x, p.y, p.w, p.h].every(Number.isFinite)) {
      findings.push(finding("blocking", "PART_GEOMETRY_INVALID", "Part has non-finite geometry.", { numeral: p.numeral || "" }));
      subtract("blocking", 18);
      continue;
    }
    if (p.x < 16 || p.y < 16 || p.x + p.w > width - 16 || p.y + p.h > height - 44) {
      findings.push(finding("fix-before-filing", "PART_NEAR_EDGE", "Part is close to the figure edge or caption zone.", { numeral: p.numeral || "", bbox: pbox }));
      subtract("fix-before-filing", 6);
    }
    const gapToCaption = captionY - (p.y + p.h);
    if (gapToCaption < 36) {
      findings.push(finding("fix-before-filing", "CAPTION_CROWDING", "Part/callout is too close to the FIG caption.", { numeral: p.numeral || "", gap: Math.round(gapToCaption), bbox: pbox }));
      subtract("fix-before-filing", 8);
    }
  }

  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      const a = parts[i];
      const b = parts[j];
      const ov = overlapArea(a, b);
      if (!ov) continue;
      const minArea = Math.min(area(a), area(b));
      const nested = mostlyContains(a, b) || mostlyContains(b, a);
      if (!nested && minArea > 0 && ov / minArea > 0.08) {
        findings.push(finding("fix-before-filing", "PART_OVERLAP", "Two parts overlap without containment.", { a: a.numeral || a.label || i, b: b.numeral || b.label || j, bbox: unionBoxes([box(a), box(b)]) }));
        subtract("fix-before-filing", 7);
      }
    }
  }

  const text = textContents(svg);
  const smallText = text.filter((t) => /font-size="(?:[0-9](?:\.\d+)?|1[0-1](?:\.\d+)?)"/.test(t.attrs));
  if (smallText.length) {
    findings.push(finding("fix-before-filing", "SMALL_TEXT", "SVG contains text below the gallery's minimum draft-quality size.", { count: smallText.length, bbox: unionBoxes(smallText.map(textBox)) }));
    subtract("fix-before-filing", 6);
  }

  const oddStrokeWidths = [...svg.matchAll(STROKE_WIDTH_RE)]
    .map((m) => Number(String(m[1]).replace(/px$/i, "")))
    .filter((n) => Number.isFinite(n) && (n < 0.5 || n > 4));
  if (oddStrokeWidths.length) {
    findings.push(finding("fix-before-filing", "STROKE_WIDTH_OUT_OF_RANGE", "SVG contains line weights outside the deterministic review range.", { count: oddStrokeWidths.length }));
    subtract("fix-before-filing", 5);
  }

  const severeCount = findings.filter((f) => f.severity === "blocking").length;
  const fixCount = findings.filter((f) => f.severity === "fix-before-filing").length;
  if (severeCount === 0 && fixCount === 0) {
    findings.push(finding("acceptable", "CLEAN", "No deterministic drawing-quality findings."));
  }

  return summary(figId, sheet, clampScore(score), findings);
}

function fillFindingLocation(f, figId, sheet) {
  return {
    ...f,
    sheet: f.sheet || sheet,
    figure: f.figure || figCaption(figId),
    bbox: f.bbox === undefined ? null : f.bbox,
  };
}

function measurementSummary(findings) {
  return findings.reduce((acc, f) => {
    const key = f.measured_or_visual === "measured" ? "measured" : "visual";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, { measured: 0, visual: 0 });
}

function summary(figId, sheet, score, findings) {
  const locatedFindings = findings.map((f) => fillFindingLocation(f, figId, sheet));
  const blocking = findings.filter((f) => f.severity === "blocking").length;
  const fixes = findings.filter((f) => f.severity === "fix-before-filing").length;
  return {
    fig: figId,
    sheet,
    score,
    verdict: blocking ? "redraw" : fixes ? "polish-before-filing" : "candidate-ready-for-human-review",
    blocking,
    fixes,
    measurement_summary: measurementSummary(locatedFindings),
    findings: locatedFindings,
  };
}

export function reviewFigureFiles(figPath, svgPath) {
  const figDef = JSON.parse(readFileSync(figPath, "utf8"));
  const svg = readFileSync(svgPath, "utf8");
  return reviewFigure(figDef, svg, { file: figPath });
}

export function missingSvgReview(figId, svgPath, opts = {}) {
  const sheet = opts.sheet || "SHEET 1";
  return summary(figId, sheet, 0, [
    finding("blocking", "SVG_MISSING", `Missing rendered SVG: ${svgPath}`),
  ]);
}

export function aggregateReviews(reviews) {
  const allFindings = reviews.flatMap((r) => (Array.isArray(r.findings) ? r.findings : []));
  const clean = reviews.every((r) => r.blocking === 0 && r.fixes === 0);
  const anyBlocking = reviews.some((r) => r.blocking > 0);
  const minScore = reviews.length ? Math.min(...reviews.map((r) => r.score)) : 0;
  const meanScore = reviews.length ? Math.round(reviews.reduce((a, r) => a + r.score, 0) / reviews.length) : 0;
  return {
    figure_count: reviews.length,
    mean_score: meanScore,
    min_score: minScore,
    blocking_count: reviews.reduce((a, r) => a + r.blocking, 0),
    fix_before_filing_count: reviews.reduce((a, r) => a + r.fixes, 0),
    verdict: anyBlocking ? "redraw" : clean ? "candidate-ready-for-human-review" : "polish-before-filing",
    measurement_summary: measurementSummary(allFindings),
    findings: allFindings,
    reviews,
  };
}

export default { reviewFigure, reviewFigureFiles, missingSvgReview, aggregateReviews };
