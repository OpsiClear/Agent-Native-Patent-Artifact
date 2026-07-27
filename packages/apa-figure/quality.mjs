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
import { inspectSvgSafety } from "./svg-safety.mjs";

const FORBIDDEN_TAGS = ["foreignObject", "image", "filter", "linearGradient", "radialGradient", "pattern"];
const COLOR_ATTR_RE = /\b(?:stroke|fill|color)="([^"]+)"/g;
const STROKE_WIDTH_RE = /\bstroke-width="([^"]+)"/g;
const TEXT_RE = /<text\b([^>]*)>([\s\S]*?)<\/text>/g;
const LINE_RE = /<line\b([^>]*)\/>/g;
const POLYLINE_RE = /<polyline\b([^>]*)\/>/g;

const FINDING_META = {
  SVG_INVALID: ["rendering", "37-cfr-1.84", "measured", "Regenerate the drawing as a valid SVG before review."],
  SVG_UNSAFE_ACTIVE_CONTENT: ["rendering", "apa-protocol", "measured", "Normalize the SVG to passive local line art before review or HTML composition."],
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
  LABEL_BORDER_CROWDING: ["crowding", "mpep-608.02", "measured", "Increase the part box, shorten/wrap the label, or move the label so text has clear padding from the border."],
  STROKE_WIDTH_OUT_OF_RANGE: ["line-weight", "37-cfr-1.84", "measured", "Use consistent drawing line weights that remain legible after PDF export."],
  ARROW_TEXT_COLLISION: ["crowding", "37-cfr-1.84", "measured", "Move reference numerals/text away from connector arrows or route arrows around text."],
  ARROW_PART_COLLISION: ["crowding", "37-cfr-1.84", "measured", "Route the connector around unrelated drawing features or move the intervening feature."],
  NUMERAL_PART_COLLISION: ["crowding", "37-cfr-1.84", "measured", "Move the reference numeral so it does not overlap another feature or box."],
  SPARSE_FIGURE_LAYOUT: ["crowding", "apa-protocol", "measured", "Re-layout the figure to use the drawing canvas more deliberately, or assemble short views together on a sheet."],
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

function boxObject(b) {
  if (!Array.isArray(b) || b.length !== 4) return null;
  return { x: b[0], y: b[1], w: b[2], h: b[3] };
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

function compositionMetrics(figDef, parts) {
  const width = Number(figDef?.width) || 0;
  const height = Number(figDef?.height) || 0;
  const boxes = (parts || []).map(box).filter(Array.isArray);
  const contentBox = unionBoxes(boxes);
  if (!width || !height || !contentBox) {
    return {
      measured: false,
      canvas: [width, height],
      content_bbox: null,
      content_area_ratio: 0,
      width_utilization: 0,
      height_utilization: 0,
    };
  }
  const widthUtilization = contentBox[2] / width;
  const heightUtilization = contentBox[3] / height;
  return {
    measured: true,
    canvas: [Math.round(width), Math.round(height)],
    content_bbox: contentBox,
    content_area_ratio: Number(((contentBox[2] * contentBox[3]) / (width * height)).toFixed(3)),
    width_utilization: Number(widthUtilization.toFixed(3)),
    height_utilization: Number(heightUtilization.toFixed(3)),
  };
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
  const texts = [];
  for (const m of svg.matchAll(TEXT_RE)) {
    const inner = m[2];
    const attrs = m[1];
    const tspans = [...inner.matchAll(/<tspan\b([^>]*)>([\s\S]*?)<\/tspan>/g)];
    const outer = {
      attrs: m[1],
      text: inner.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(),
      x: firstFinite(attrNumber(m[1], "x"), attrNumber(inner, "x")),
      y: firstFinite(attrNumber(m[1], "y"), attrNumber(inner, "y")),
      fontSize: attrNumber(m[1], "font-size"),
    };
    if (tspans.length === 0 && Number.isFinite(outer.x) && Number.isFinite(outer.y)) texts.push(outer);
    for (const t of tspans) {
      const tAttrs = t[1];
      const tText = t[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      const x = attrNumber(tAttrs, "x");
      const y = attrNumber(tAttrs, "y");
      if (Number.isFinite(x) && Number.isFinite(y)) {
        texts.push({ attrs, text: tText, x, y, fontSize: outer.fontSize });
      }
    }
  }
  return texts;
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

function styleScale(figDef = {}) {
  const value = Number(figDef.styleScale ?? figDef.fontScale);
  return Number.isFinite(value) ? Math.max(0.25, value) : 1;
}

function wrapTextEstimate(text, maxChars = 26, maxLines = 3) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines = [];
  let cur = "";
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (next.length <= maxChars || !cur) {
      cur = next;
    } else {
      lines.push(cur);
      cur = word;
    }
    if (lines.length === maxLines - 1) break;
  }
  if (cur) lines.push(cur);
  return lines.slice(0, maxLines);
}

function labelCrowding(p, figDef) {
  if (!p || !p.label || ![p.x, p.y, p.w, p.h].every(Number.isFinite)) return null;
  const scale = styleScale(figDef);
  const labelSize = 16 * scale;
  const charWidth = labelSize * 0.58;
  const maxChars = Math.max(8, Math.floor((Number(p.w) || 120) / Math.max(8, charWidth)));
  const lines = wrapTextEstimate(p.label, maxChars, 3);
  if (!lines.length) return null;
  const labelPoint = {
    x: Number.isFinite(p.labelX) ? p.labelX : p.x + p.w / 2,
    y: Number.isFinite(p.labelY) ? p.labelY : p.y + p.h / 2,
  };
  const maxLineWidth = Math.max(...lines.map((line) => line.length * charWidth));
  const lineHeight = labelSize * 1.18;
  const blockHeight = labelSize + Math.max(0, lines.length - 1) * lineHeight;
  const left = labelPoint.x - maxLineWidth / 2;
  const right = labelPoint.x + maxLineWidth / 2;
  const top = labelPoint.y - blockHeight / 2;
  const bottom = labelPoint.y + blockHeight / 2;
  const requiredPadding = Math.max(8, labelSize * 0.35);
  if (p.shape === "ellipse") {
    const cx = p.x + p.w / 2;
    const cy = p.y + p.h / 2;
    const rx = p.w / 2 - requiredPadding;
    const ry = p.h / 2 - requiredPadding;
    const corners = [[left, top], [right, top], [right, bottom], [left, bottom]];
    const maxNorm = rx > 0 && ry > 0
      ? Math.max(...corners.map(([x, y]) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2))
      : Infinity;
    if (maxNorm <= 1) return null;
    return {
      numeral: String(p.numeral ?? ""),
      label: String(p.label),
      shape: "ellipse",
      boundary_ratio: Number(Math.sqrt(maxNorm).toFixed(2)),
      required_padding: Number(requiredPadding.toFixed(1)),
      bbox: [
        Math.round(Math.min(left, p.x)),
        Math.round(Math.min(top, p.y)),
        Math.round(Math.max(right, p.x + p.w) - Math.min(left, p.x)),
        Math.round(Math.max(bottom, p.y + p.h) - Math.min(top, p.y)),
      ],
    };
  }
  const minPadding = Math.min(left - p.x, p.x + p.w - right, top - p.y, p.y + p.h - bottom);
  if (minPadding >= requiredPadding) return null;
  return {
    numeral: String(p.numeral ?? ""),
    label: String(p.label),
    min_padding: Number(minPadding.toFixed(1)),
    required_padding: Number(requiredPadding.toFixed(1)),
    bbox: [
      Math.round(Math.min(left, p.x)),
      Math.round(Math.min(top, p.y)),
      Math.round(Math.max(right, p.x + p.w) - Math.min(left, p.x)),
      Math.round(Math.max(bottom, p.y + p.h) - Math.min(top, p.y)),
    ],
  };
}

function textBox(t) {
  if (![t.x, t.y, t.fontSize].every(Number.isFinite)) return null;
  const width = Math.max(1, Math.round(String(t.text || "").length * t.fontSize * 0.58));
  const anchor = attrString(t.attrs, "text-anchor");
  const left = anchor === "middle" ? t.x - width / 2 : anchor === "end" ? t.x - width : t.x;
  return [
    Math.round(left),
    Math.round(t.y - t.fontSize),
    width,
    Math.max(1, Math.round(t.fontSize * 1.25)),
  ];
}

function attrString(attrs, name) {
  const m = new RegExp(`\\b${escRe(name)}="([^"]+)"`).exec(String(attrs || ""));
  return m ? m[1] : "";
}

function arrowSegments(svg) {
  const segments = [];
  for (const m of svg.matchAll(LINE_RE)) {
    const attrs = m[1];
    const id = attrString(attrs, "id");
    if (!/-arrow-\d+-line\b/.test(id)) continue;
    const x1 = attrNumber(attrs, "x1");
    const y1 = attrNumber(attrs, "y1");
    const x2 = attrNumber(attrs, "x2");
    const y2 = attrNumber(attrs, "y2");
    if ([x1, y1, x2, y2].every(Number.isFinite)) segments.push({ id, x1, y1, x2, y2 });
  }
  for (const m of svg.matchAll(POLYLINE_RE)) {
    const attrs = m[1];
    const id = attrString(attrs, "id");
    if (!/-arrow-\d+-line\b/.test(id)) continue;
    const points = attrString(attrs, "points").trim().split(/\s+/).map((p) => {
      const [x, y] = p.split(",").map(Number);
      return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
    }).filter(Boolean);
    for (let i = 0; i < points.length - 1; i++) {
      segments.push({ id, x1: points[i].x, y1: points[i].y, x2: points[i + 1].x, y2: points[i + 1].y });
    }
  }
  return segments;
}

function lineIntersectsBox(seg, b, pad = 2) {
  if (!Array.isArray(b)) return false;
  const [x, y, w, h] = b;
  const x1 = x - pad;
  const y1 = y - pad;
  const x2 = x + w + pad;
  const y2 = y + h + pad;
  if (Math.max(seg.x1, seg.x2) < x1 || Math.min(seg.x1, seg.x2) > x2 || Math.max(seg.y1, seg.y2) < y1 || Math.min(seg.y1, seg.y2) > y2) return false;
  if ((seg.x1 >= x1 && seg.x1 <= x2 && seg.y1 >= y1 && seg.y1 <= y2) || (seg.x2 >= x1 && seg.x2 <= x2 && seg.y2 >= y1 && seg.y2 <= y2)) return true;
  const edges = [
    { x1, y1, x2, y2: y1 },
    { x1: x2, y1, x2, y2 },
    { x1: x2, y1: y2, x2: x1, y2 },
    { x1, y1: y2, x2: x1, y2: y1 },
  ];
  return edges.some((edge) => segmentsIntersect(seg, edge));
}

function segmentsIntersect(a, b) {
  const cross = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const sign = (value) => Math.abs(value) < 1e-9 ? 0 : Math.sign(value);
  const onSegment = (p, q, r) =>
    q.x >= Math.min(p.x, r.x) - 1e-9 &&
    q.x <= Math.max(p.x, r.x) + 1e-9 &&
    q.y >= Math.min(p.y, r.y) - 1e-9 &&
    q.y <= Math.max(p.y, r.y) + 1e-9;
  const p1 = { x: a.x1, y: a.y1 };
  const q1 = { x: a.x2, y: a.y2 };
  const p2 = { x: b.x1, y: b.y1 };
  const q2 = { x: b.x2, y: b.y2 };
  const o1 = sign(cross(p1, q1, p2));
  const o2 = sign(cross(p1, q1, q2));
  const o3 = sign(cross(p2, q2, p1));
  const o4 = sign(cross(p2, q2, q1));
  if (o1 !== o2 && o3 !== o4) return true;
  return (
    (o1 === 0 && onSegment(p1, p2, q1)) ||
    (o2 === 0 && onSegment(p1, q2, q1)) ||
    (o3 === 0 && onSegment(p2, p1, q2)) ||
    (o4 === 0 && onSegment(p2, q1, q2))
  );
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
  const composition = compositionMetrics(figDef, parts);
  const numeralBoxes = new Map();

  let score = 100;
  const subtract = (severity, points) => {
    score -= severity === "blocking" ? Math.max(points, 15) : points;
  };

  if (!svg || !/^<svg\b/.test(svg.trim())) {
    findings.push(finding("blocking", "SVG_INVALID", "Rendered output is not an SVG document."));
    return summary(figId, sheet, 0, findings);
  }

  const safety = inspectSvgSafety(svg);
  if (!safety.safe) {
    findings.push(finding(
      "blocking",
      "SVG_UNSAFE_ACTIVE_CONTENT",
      "SVG contains active or externally loading content that cannot be safely embedded.",
      { issues: safety.issues.slice(0, 12) },
    ));
    subtract("blocking", 24);
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
  const labelBorderCrowding = parts.map((p) => labelCrowding(p, figDef)).filter(Boolean);
  if (labelBorderCrowding.length) {
    findings.push(finding("fix-before-filing", "LABEL_BORDER_CROWDING", "One or more labels are too close to a part border.", {
      count: labelBorderCrowding.length,
      bbox: unionBoxes(labelBorderCrowding.map((c) => c.bbox)),
      collisions: labelBorderCrowding.slice(0, 8),
    }));
    subtract("fix-before-filing", Math.min(14, 5 + labelBorderCrowding.length));
  }

  const arrowTextCollisions = [];
  const arrowsForCollision = arrowSegments(svg);
  for (const t of text) {
    if (!t.text || t.text === expectedCaption) continue;
    const tb = textBox(t);
    if (!tb) continue;
    const colliding = arrowsForCollision.find((seg) => lineIntersectsBox(seg, tb, 2));
    if (colliding) arrowTextCollisions.push({ text: t.text, bbox: tb, arrow: colliding.id });
  }
  if (arrowTextCollisions.length) {
    findings.push(finding("fix-before-filing", "ARROW_TEXT_COLLISION", "Connector arrow crosses or touches drawing text/reference characters.", {
      count: arrowTextCollisions.length,
      bbox: unionBoxes(arrowTextCollisions.map((c) => c.bbox)),
      collisions: arrowTextCollisions.slice(0, 8),
    }));
    subtract("fix-before-filing", Math.min(18, 6 + arrowTextCollisions.length * 2));
  }
  const arrowPartCollisions = [];
  for (const seg of arrowsForCollision) {
    const match = /-arrow-(\d+)-line\b/.exec(seg.id);
    const arrow = match ? arrows[Number(match[1])] : null;
    if (!arrow) continue;
    const owners = new Set([arrow.from, arrow.to, arrow.self].filter((value) => value != null).map(String));
    const ownerParts = parts.filter((part) => owners.has(String(part.numeral)));
    for (const part of parts) {
      if (!part || owners.has(String(part.numeral))) continue;
      if (ownerParts.some((owner) => mostlyContains(part, owner))) continue;
      const pbox = box(part);
      if (!pbox || !lineIntersectsBox(seg, pbox, 0)) continue;
      arrowPartCollisions.push({
        arrow: seg.id,
        crosses: String(part.numeral || part.label || ""),
        bbox: pbox,
      });
    }
  }
  if (arrowPartCollisions.length) {
    findings.push(finding("fix-before-filing", "ARROW_PART_COLLISION", "Connector arrow crosses an unrelated drawing feature.", {
      count: arrowPartCollisions.length,
      bbox: unionBoxes(arrowPartCollisions.map((collision) => collision.bbox)),
      collisions: arrowPartCollisions.slice(0, 8),
    }));
    subtract("fix-before-filing", Math.min(18, 6 + arrowPartCollisions.length * 2));
  }
  const partsByNumeral = new Map(parts.map((p) => [String(p.numeral), p]));
  const numeralPartCollisions = [];
  for (const t of text) {
    const owner = partsByNumeral.get(String(t.text || ""));
    if (!owner) continue;
    const tb = boxObject(textBox(t));
    if (!tb) continue;
    for (const other of parts) {
      if (!other || String(other.numeral) === String(owner.numeral)) continue;
      if (mostlyContains(other, owner)) continue;
      const ov = overlapArea(tb, other);
      if (ov > 2) {
        numeralPartCollisions.push({
          numeral: String(owner.numeral),
          overlaps: String(other.numeral || other.label || ""),
          bbox: box(tb),
        });
      }
    }
  }
  if (numeralPartCollisions.length) {
    findings.push(finding("fix-before-filing", "NUMERAL_PART_COLLISION", "Reference numeral overlaps an unrelated drawing feature.", {
      count: numeralPartCollisions.length,
      bbox: unionBoxes(numeralPartCollisions.map((c) => c.bbox)),
      collisions: numeralPartCollisions.slice(0, 8),
    }));
    subtract("fix-before-filing", Math.min(18, 6 + numeralPartCollisions.length * 2));
  }
  if (
    composition.measured &&
    parts.length >= 2 &&
    composition.content_area_ratio < 0.28 &&
    composition.width_utilization < 0.55 &&
    composition.height_utilization < 0.55
  ) {
    findings.push(finding("fix-before-filing", "SPARSE_FIGURE_LAYOUT", "Figure content occupies a small portion of the source canvas.", {
      bbox: composition.content_bbox,
      composition,
    }));
    subtract("fix-before-filing", 5);
  }
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

  return summary(figId, sheet, clampScore(score), findings, { composition_summary: composition });
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

function summary(figId, sheet, score, findings, extra = {}) {
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
    ...extra,
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
