/**
 * apa-figure / render.mjs - deterministic SVG patent-figure generator.
 *
 * SVG is just text - no graphics library is needed, so this is a zero-dependency,
 * plain-Node reimplementation of the g2tree ReportLab figure primitives (box with a
 * numbered part + lead line, flow arrow with a computed arrowhead, self/loop feedback
 * arrow, FIG caption) described in DESIGN.md §11.3. SVG is a REVIEW/drafting format;
 * formal 37 CFR 1.84 black-and-white raster/PDF conversion is a later phase.
 *
 * Render rules (1.84-flavored): black strokes, white fills, NO color; each part is its
 * shape; a reference numeral is text near the part with a thin lead line to the part
 * edge; flow arrows run between part centers with a triangular arrowhead (SVG <marker>);
 * a self/loop arrow is a curved path returning to the same part; a `FIG. N` caption is
 * centered at the bottom (N derived from the fig id, e.g. FIG01 -> "FIG. 1").
 *
 * Determinism: every id is derived from the fig id + numeral - no random ids, no clocks.
 *
 * Node >=21, ESM, zero dependencies.
 */

// -------------------------------------------------------------------------------------------------
// Constants - the only "palette" is black-on-white (1.84: no color)
// -------------------------------------------------------------------------------------------------

const STROKE = "black";
const FILL = "white";
const STROKE_W = 2; // part outlines
const LEAD_W = 1; // thin lead lines
const FONT = "Liberation Serif, Times New Roman, serif"; // redistributable serif first (no MS font dep)
const NUMERAL_SIZE = 20; // reference-character size
const LABEL_SIZE = 16; // part label size
const CAPTION_SIZE = 24;
const TITLE_SIZE = 16;

function style(figDef = {}) {
  const scale = Number.isFinite(Number(figDef.styleScale ?? figDef.fontScale))
    ? Math.max(0.25, Number(figDef.styleScale ?? figDef.fontScale))
    : 1;
  return {
    scale,
    strokeW: STROKE_W * scale,
    leadW: LEAD_W * scale,
    numeralSize: NUMERAL_SIZE * scale,
    labelSize: LABEL_SIZE * scale,
    captionSize: CAPTION_SIZE * scale,
    titleSize: TITLE_SIZE * scale,
    markerSize: 12 * scale,
    markerRefX: 9 * scale,
    markerRefY: 5 * scale,
    markerPointX: 10 * scale,
    markerPointY: 5 * scale,
    markerPointY2: 10 * scale,
  };
}

// -------------------------------------------------------------------------------------------------
// Small helpers
// -------------------------------------------------------------------------------------------------

/** XML-escape text content / attribute values. */
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Round to 2dp so output is stable and compact. */
function n(v) {
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
}

/** Slug a value into a safe, deterministic id fragment. */
function slug(s) {
  return String(s == null ? "" : s).replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Deterministic short-line wrapping for labels inside flowchart/block boxes. */
function wrapText(text, maxChars = 26, maxLines = 3) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines = [];
  let cur = "";
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (next.length <= maxChars || !cur) {
      cur = next;
      continue;
    }
    lines.push(cur);
    cur = word;
    if (lines.length === maxLines - 1) break;
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length === maxLines) {
    const used = lines.join(" ").split(/\s+/).length;
    if (used < words.length) lines[maxLines - 1] = `${lines[maxLines - 1]}...`;
  }
  return lines;
}

/** Derive the ordinal caption from a fig id: "FIG01" -> "FIG. 1", "FIG12" -> "FIG. 12". */
export function figCaption(figId) {
  const m = /(\d+)\s*$/.exec(String(figId || ""));
  // No trailing digits: return the raw id rather than a malformed "FIG. FIG10A" (matches
  // numerals.mjs figOrdinal, which returns the bare id on the same fallback).
  if (!m) return String(figId || "?");
  return `FIG. ${String(parseInt(m[1], 10))}`;
}

/** Center point of a part rectangle. */
function center(p) {
  return { x: p.x + p.w / 2, y: p.y + p.h / 2 };
}

/**
 * Compute where a ray from the part center toward `target` exits the part boundary.
 * For an ellipse this is the ellipse intersection; for a box it is the rectangle edge.
 * Used both for lead-line attachment and for arrow endpoints (so arrows touch edges).
 */
function edgePoint(p, target) {
  const c = center(p);
  let dx = target.x - c.x;
  let dy = target.y - c.y;
  if (dx === 0 && dy === 0) return { x: c.x, y: p.y }; // degenerate: top edge
  const rx = p.w / 2;
  const ry = p.h / 2;
  if (p.shape === "ellipse") {
    // Parametric scale t so (t*dx/rx)^2 + (t*dy/ry)^2 = 1.
    const t = 1 / Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry));
    return { x: c.x + dx * t, y: c.y + dy * t };
  }
  // Box: scale to the nearer of the vertical/horizontal edges.
  const tx = dx !== 0 ? rx / Math.abs(dx) : Infinity;
  const ty = dy !== 0 ? ry / Math.abs(dy) : Infinity;
  const t = Math.min(tx, ty);
  return { x: c.x + dx * t, y: c.y + dy * t };
}

// -------------------------------------------------------------------------------------------------
// Primitive emitters (return SVG fragment strings)
// -------------------------------------------------------------------------------------------------

function shapeEl(p, idBase, s) {
  const c = center(p);
  if (p.shape === "ellipse") {
    return (
      `  <ellipse id="${idBase}-shape" cx="${n(c.x)}" cy="${n(c.y)}" ` +
      `rx="${n(p.w / 2)}" ry="${n(p.h / 2)}" fill="${FILL}" stroke="${STROKE}" stroke-width="${n(s.strokeW)}"/>`
    );
  }
  // default: box (rounded a touch is still acceptable line-art; keep square for 1.84 simplicity)
  return (
    `  <rect id="${idBase}-shape" x="${n(p.x)}" y="${n(p.y)}" width="${n(p.w)}" height="${n(p.h)}" ` +
    `fill="${FILL}" stroke="${STROKE}" stroke-width="${n(s.strokeW)}"/>`
  );
}

/** Part label - drawn inside the shape near its center. */
function labelEl(p, idBase, s) {
  if (!p.label) return "";
  const c = center(p);
  const labelPoint = {
    x: Number.isFinite(p.labelX) ? p.labelX : c.x,
    y: Number.isFinite(p.labelY) ? p.labelY : c.y,
  };
  const maxChars = Math.max(8, Math.floor((Number(p.w) || 120) / Math.max(8, s.labelSize * 0.58)));
  const lines = wrapText(p.label, maxChars, 3);
  const lineHeight = s.labelSize * 1.18;
  const startY = labelPoint.y - ((lines.length - 1) * lineHeight) / 2;
  const tspans = lines
    .map((line, i) => `<tspan x="${n(labelPoint.x)}" y="${n(startY + i * lineHeight)}">${esc(line)}</tspan>`)
    .join("");
  return (
    `  <text id="${idBase}-label" font-family="${FONT}" font-size="${n(s.labelSize)}" ` +
    `fill="${STROKE}" text-anchor="middle" dominant-baseline="middle">${tspans}</text>`
  );
}

function straightLeadEl(idBase, start, end, s) {
  return (
    `  <line id="${idBase}-lead" x1="${n(start.x)}" y1="${n(start.y)}" ` +
    `x2="${n(end.x)}" y2="${n(end.y)}" stroke="${STROKE}" stroke-width="${n(s.leadW)}"/>`
  );
}

function curvedLeadEl(idBase, start, end, partCenter, s) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  // Keep patent lead lines restrained: a shallow cubic gives the familiar
  // hand-drafted callout feel without becoming a decorative squiggle or
  // drifting into nearby content.
  const amp = Math.min(8 * s.scale, Math.max(3.25 * s.scale, len * 0.12));
  const mid = { x: start.x + dx * 0.5, y: start.y + dy * 0.5 };
  const sideA = { x: mid.x + nx * amp, y: mid.y + ny * amp };
  const sideB = { x: mid.x - nx * amp, y: mid.y - ny * amp };
  const dA = Math.hypot(sideA.x - partCenter.x, sideA.y - partCenter.y);
  const dB = Math.hypot(sideB.x - partCenter.x, sideB.y - partCenter.y);
  const sign = dA >= dB ? 1 : -1;
  const c1 = { x: start.x + dx * 0.33 + nx * amp * sign, y: start.y + dy * 0.33 + ny * amp * sign };
  const c2 = { x: start.x + dx * 0.67 + nx * amp * sign, y: start.y + dy * 0.67 + ny * amp * sign };
  return (
    `  <path id="${idBase}-lead" d="M ${n(start.x)} ${n(start.y)} ` +
    `C ${n(c1.x)} ${n(c1.y)} ${n(c2.x)} ${n(c2.y)} ${n(end.x)} ${n(end.y)}" ` +
    `fill="none" stroke="${STROKE}" stroke-width="${n(s.leadW)}"/>`
  );
}

function leadEl(p, idBase, start, end, partCenter, s) {
  if (p.leadStyle === "straight") return straightLeadEl(idBase, start, end, s);
  if (p.leadStyle === "curved") return curvedLeadEl(idBase, start, end, partCenter, s);
  const len = Math.hypot(end.x - start.x, end.y - start.y) || 1;
  if (len <= 8 * s.scale) return straightLeadEl(idBase, start, end, s);
  return curvedLeadEl(idBase, start, end, partCenter, s);
}

/**
 * Reference numeral + lead line. The numeral is placed outside the shape (offset away
 * from the figure center) and a thin lead line runs from the numeral toward the part
 * edge - the 1.84 lead-line convention.
 */
function numeralEl(p, idBase, figCenter, s) {
  const c = center(p);
  // Direction from the figure center outward by default, so numerals sit on the outside.
  // `numX`/`numY` lets a draftsperson override automatic placement for crowded figures.
  let dx = c.x - figCenter.x;
  let dy = c.y - figCenter.y;
  if (dx === 0 && dy === 0) dx = 1; // degenerate: push right
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  // The numeral anchor sits a fixed offset beyond the part edge.
  const manual = Number.isFinite(p.numX) && Number.isFinite(p.numY);
  const target = manual ? { x: p.numX, y: p.numY } : { x: c.x + ux * 1000, y: c.y + uy * 1000 };
  const edge = edgePoint(p, target);
  const offset = 26;
  const np = manual ? { x: p.numX, y: p.numY } : { x: edge.x + ux * offset, y: edge.y + uy * offset };
  const ndx = np.x - edge.x;
  const ndy = np.y - edge.y;
  const nlen = Math.hypot(ndx, ndy) || 1;
  const lux = ndx / nlen;
  const luy = ndy / nlen;
  // Lead line: from a point just shy of the numeral to the part edge.
  const leadStart = { x: np.x - lux * 14, y: np.y - luy * 14 };
  const lead = leadEl(p, idBase, leadStart, edge, c, s);
  const text =
    `  <text id="${idBase}-num" x="${n(np.x)}" y="${n(np.y)}" font-family="${FONT}" ` +
    `font-size="${n(s.numeralSize)}" fill="${STROKE}" text-anchor="middle" dominant-baseline="middle">` +
    `${esc(p.numeral)}</text>`;
  return `${lead}\n${text}`;
}

/** A flow arrow between two part centers, clipped to the part edges, with an arrowhead marker. */
function flowArrowEl(from, to, arrow, idBase, markerId, s) {
  const label = arrow?.label;
  const cFrom = center(from);
  const cTo = center(to);
  const routePoints = Array.isArray(arrow?.points) ? arrow.points.filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y)) : [];
  const startTarget = routePoints[0] || cTo;
  const endTarget = routePoints.length ? routePoints[routePoints.length - 1] : cFrom;
  const start = edgePoint(from, startTarget);
  const end = edgePoint(to, endTarget);
  const linePoints = [start, ...routePoints, end];
  const line = routePoints.length
    ? `  <polyline id="${idBase}-line" points="${linePoints.map((p) => `${n(p.x)},${n(p.y)}`).join(" ")}" ` +
      `fill="none" stroke="${STROKE}" stroke-width="${n(s.strokeW)}" marker-end="url(#${markerId})"/>`
    : `  <line id="${idBase}-line" x1="${n(start.x)}" y1="${n(start.y)}" ` +
      `x2="${n(end.x)}" y2="${n(end.y)}" stroke="${STROKE}" stroke-width="${n(s.strokeW)}" ` +
      `marker-end="url(#${markerId})"/>`;
  let text = "";
  if (label) {
    const mid = linePoints[Math.floor(linePoints.length / 2)];
    const mx = Number.isFinite(arrow.labelX) ? arrow.labelX : routePoints.length ? mid.x : (start.x + end.x) / 2;
    const my = Number.isFinite(arrow.labelY) ? arrow.labelY : routePoints.length ? mid.y - 8 : (start.y + end.y) / 2 - 6;
    text =
      `\n  <text id="${idBase}-label" x="${n(mx)}" y="${n(my)}" font-family="${FONT}" ` +
      `font-size="${n(s.labelSize)}" fill="${STROKE}" text-anchor="middle">${esc(label)}</text>`;
  }
  return line + text;
}

/**
 * A self/loop feedback arrow: a curved cubic path leaving the top edge of the part and
 * returning to the right edge, ending in an arrowhead - the g2tree loop_arrow primitive.
 */
function loopArrowEl(p, label, idBase, markerId, s) {
  const top = { x: p.x + p.w * 0.5, y: p.y };
  const right = { x: p.x + p.w, y: p.y + p.h * 0.3 };
  const r = Math.max(p.w, p.h) * 0.45 + 24;
  // Control points bulge up-and-right to form a feedback loop.
  const c1 = { x: top.x + r * 0.4, y: top.y - r };
  const c2 = { x: right.x + r, y: right.y - r * 0.6 };
  const path =
    `  <path id="${idBase}-loop" d="M ${n(top.x)} ${n(top.y)} ` +
    `C ${n(c1.x)} ${n(c1.y)} ${n(c2.x)} ${n(c2.y)} ${n(right.x)} ${n(right.y)}" ` +
    `fill="none" stroke="${STROKE}" stroke-width="${n(s.strokeW)}" marker-end="url(#${markerId})"/>`;
  let text = "";
  if (label) {
    const lx = top.x + r * 0.7;
    const ly = top.y - r * 0.65;
    text =
      `\n  <text id="${idBase}-loop-label" x="${n(lx)}" y="${n(ly)}" font-family="${FONT}" ` +
      `font-size="${n(s.labelSize)}" fill="${STROKE}" text-anchor="middle">${esc(label)}</text>`;
  }
  return path + text;
}

// -------------------------------------------------------------------------------------------------
// Public: render a figure DSL object to an SVG document string
// -------------------------------------------------------------------------------------------------

/**
 * Render a figure-DSL object to a self-contained SVG document (string).
 *
 * figDef = {
 *   fig: "FIG01", title?: "Sectional view", representative?: true,
 *   width?: 800, height?: 600,
 *   parts: [ { numeral:"10", label:"reservoir", shape:"box"|"ellipse", x, y, w, h } ],
 *   arrows: [ { from:"12", to:"14", kind:"flow", label:"rises" },
 *             { self:"14", kind:"loop", label:"closes" } ]
 * }
 */
export function renderFigure(figDef) {
  if (!figDef || typeof figDef !== "object") throw new TypeError("renderFigure: figDef object required");
  const figId = figDef.fig || figDef.id || "FIG";
  const figSlug = slug(figId) || "FIG";
  const width = Number(figDef.width) || 800;
  const height = Number(figDef.height) || 600; // letter-ish aspect via the viewBox
  const parts = Array.isArray(figDef.parts) ? figDef.parts : [];
  const arrows = Array.isArray(figDef.arrows) ? figDef.arrows : [];
  const s = style(figDef);

  // Index parts by numeral for arrow resolution.
  const byNumeral = new Map();
  for (const p of parts) if (p && p.numeral != null) byNumeral.set(String(p.numeral), p);

  // Figure center: bounding-box midpoint of all parts (so numerals push outward).
  let figCenter = { x: width / 2, y: height / 2 };
  if (parts.length) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of parts) {
      // A null/partial part (hand-authored JSON) must not throw here; the draw loop already guards.
      if (!p || ![p.x, p.y, p.w, p.h].every(Number.isFinite)) continue;
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + p.w);
      maxY = Math.max(maxY, p.y + p.h);
    }
    figCenter = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  }

  const markerId = `${figSlug}-arrowhead`;
  const out = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(width)}" height="${n(height)}" ` +
      `viewBox="0 0 ${n(width)} ${n(height)}" role="img" aria-label="${esc(figCaption(figId))}">`,
  );
  // Deterministic <defs>: a single shared triangular arrowhead marker (black, no color).
  out.push(`  <defs>`);
  out.push(
    `    <marker id="${markerId}" markerWidth="${n(s.markerSize)}" markerHeight="${n(s.markerSize)}" refX="${n(s.markerRefX)}" refY="${n(s.markerRefY)}" ` +
      `orient="auto" markerUnits="userSpaceOnUse">`,
  );
  out.push(`      <polygon points="0,0 ${n(s.markerPointX)},${n(s.markerPointY)} 0,${n(s.markerPointY2)}" fill="${STROKE}" stroke="${STROKE}"/>`);
  out.push(`    </marker>`);
  out.push(`  </defs>`);
  // White background (explicit white fill, 1.84: white page).
  out.push(`  <rect x="0" y="0" width="${n(width)}" height="${n(height)}" fill="${FILL}"/>`);

  // Optional small title (top, centered).
  if (figDef.title) {
    out.push(
      `  <text id="${figSlug}-title" x="${n(width / 2)}" y="26" font-family="${FONT}" ` +
        `font-size="${n(s.titleSize)}" fill="${STROKE}" text-anchor="middle">${esc(figDef.title)}</text>`,
    );
  }

  // Parts: draw feature outlines before connectors so short arrowheads remain visible.
  for (const p of parts) {
    if (!p) continue;
    const idBase = `${figSlug}-part-${slug(p.numeral) || "x"}`;
    out.push(shapeEl(p, idBase, s));
  }

  // Connectors: draw after feature outlines, before labels and numerals.
  let ai = 0;
  for (const a of arrows) {
    if (!a) continue;
    const idBase = `${figSlug}-arrow-${ai++}`;
    if (a.kind === "loop" || a.self != null) {
      const p = byNumeral.get(String(a.self != null ? a.self : a.from));
      if (p) out.push(loopArrowEl(p, a.label, idBase, markerId, s));
      continue;
    }
    const from = byNumeral.get(String(a.from));
    const to = byNumeral.get(String(a.to));
    if (from && to) out.push(flowArrowEl(from, to, a, idBase, markerId, s));
  }

  // Text: draw inner labels and reference numerals last to preserve legibility.
  for (const p of parts) {
    if (!p) continue;
    const idBase = `${figSlug}-part-${slug(p.numeral) || "x"}`;
    const lbl = labelEl(p, idBase, s);
    if (lbl) out.push(lbl);
    if (p.numeral != null) out.push(numeralEl(p, idBase, figCenter, s));
  }

  // FIG. N caption centered at the bottom.
  out.push(
    `  <text id="${figSlug}-caption" x="${n(width / 2)}" y="${n(height - 18)}" font-family="${FONT}" ` +
      `font-size="${n(s.captionSize)}" fill="${STROKE}" text-anchor="middle" font-weight="bold">` +
      `${esc(figCaption(figId))}</text>`,
  );

  out.push(`</svg>`);
  return out.join("\n") + "\n";
}

export default { renderFigure, figCaption };
