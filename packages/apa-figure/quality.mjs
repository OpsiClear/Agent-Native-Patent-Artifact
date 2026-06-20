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
const TEXT_RE = /<text\b([^>]*)>([\s\S]*?)<\/text>/g;

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
  return [...svg.matchAll(TEXT_RE)].map((m) => ({
    attrs: m[1],
    text: m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(),
  }));
}

function finding(severity, code, message, detail = {}) {
  return { severity, code, message, ...detail };
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
  const width = Number(figDef?.width) || 800;
  const height = Number(figDef?.height) || 600;
  const parts = Array.isArray(figDef?.parts) ? figDef.parts.filter(Boolean) : [];
  const arrows = Array.isArray(figDef?.arrows) ? figDef.arrows.filter(Boolean) : [];

  let score = 100;
  const subtract = (severity, points) => {
    score -= severity === "blocking" ? Math.max(points, 15) : points;
  };

  if (!svg || !/^<svg\b/.test(svg.trim())) {
    findings.push(finding("blocking", "SVG_INVALID", "Rendered output is not an SVG document."));
    return summary(figId, 0, findings);
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
    findings.push(finding("blocking", "FIG_CAPTION_MISSING", `Expected caption ${expectedCaption}.`));
    subtract("blocking", 20);
  }

  const numeralCounts = new Map();
  for (const p of parts) {
    if (p.numeral == null || p.numeral === "") {
      findings.push(finding("fix-before-filing", "PART_WITHOUT_NUMERAL", "A part lacks a reference numeral.", { label: p.label || "" }));
      subtract("fix-before-filing", 5);
      continue;
    }
    const num = String(p.numeral);
    numeralCounts.set(num, (numeralCounts.get(num) || 0) + 1);
    if (!new RegExp(`>${escRe(num)}<`).test(svg)) {
      findings.push(finding("blocking", "NUMERAL_NOT_RENDERED", `Numeral ${num} is not rendered as text.`, { numeral: num }));
      subtract("blocking", 18);
    }
    if (!new RegExp(`part-${escRe(String(num).replace(/[^A-Za-z0-9]+/g, "-"))}-lead`).test(svg)) {
      findings.push(finding("fix-before-filing", "LEAD_LINE_MISSING", `No lead line id was found for numeral ${num}.`, { numeral: num }));
      subtract("fix-before-filing", 8);
    }
  }
  for (const [num, count] of numeralCounts) {
    if (count > 1) {
      findings.push(finding("blocking", "DUPLICATE_NUMERAL_IN_FIGURE", `Numeral ${num} is used ${count} times in one figure.`, { numeral: num, count }));
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
    if (label.length > 38) {
      findings.push(finding("fix-before-filing", "LABEL_TOO_LONG", `Label is likely too long for patent drawing text: "${label}".`, { label }));
      subtract("fix-before-filing", 5);
    }
    if (![p.x, p.y, p.w, p.h].every(Number.isFinite)) {
      findings.push(finding("blocking", "PART_GEOMETRY_INVALID", "Part has non-finite geometry.", { numeral: p.numeral || "" }));
      subtract("blocking", 18);
      continue;
    }
    if (p.x < 16 || p.y < 16 || p.x + p.w > width - 16 || p.y + p.h > height - 44) {
      findings.push(finding("fix-before-filing", "PART_NEAR_EDGE", "Part is close to the figure edge or caption zone.", { numeral: p.numeral || "" }));
      subtract("fix-before-filing", 6);
    }
    const gapToCaption = captionY - (p.y + p.h);
    if (gapToCaption < 36) {
      findings.push(finding("fix-before-filing", "CAPTION_CROWDING", "Part/callout is too close to the FIG caption.", { numeral: p.numeral || "", gap: Math.round(gapToCaption) }));
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
        findings.push(finding("fix-before-filing", "PART_OVERLAP", "Two parts overlap without containment.", { a: a.numeral || a.label || i, b: b.numeral || b.label || j }));
        subtract("fix-before-filing", 7);
      }
    }
  }

  const text = textContents(svg);
  const smallText = text.filter((t) => /font-size="(?:[0-9](?:\.\d+)?|1[0-1](?:\.\d+)?)"/.test(t.attrs));
  if (smallText.length) {
    findings.push(finding("fix-before-filing", "SMALL_TEXT", "SVG contains text below the gallery's minimum draft-quality size.", { count: smallText.length }));
    subtract("fix-before-filing", 6);
  }

  const severeCount = findings.filter((f) => f.severity === "blocking").length;
  const fixCount = findings.filter((f) => f.severity === "fix-before-filing").length;
  if (severeCount === 0 && fixCount === 0) {
    findings.push(finding("acceptable", "CLEAN", "No deterministic drawing-quality findings."));
  }

  return summary(figId, clampScore(score), findings);
}

function summary(figId, score, findings) {
  const blocking = findings.filter((f) => f.severity === "blocking").length;
  const fixes = findings.filter((f) => f.severity === "fix-before-filing").length;
  return {
    fig: figId,
    score,
    verdict: blocking ? "redraw" : fixes ? "polish-before-filing" : "candidate-ready-for-human-review",
    blocking,
    fixes,
    findings,
  };
}

export function reviewFigureFiles(figPath, svgPath) {
  const figDef = JSON.parse(readFileSync(figPath, "utf8"));
  const svg = readFileSync(svgPath, "utf8");
  return reviewFigure(figDef, svg, { file: figPath });
}

export function aggregateReviews(reviews) {
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
    reviews,
  };
}

export default { reviewFigure, reviewFigureFiles, aggregateReviews };
