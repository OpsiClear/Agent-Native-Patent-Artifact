/**
 * apa-figure / sheets.mjs - compose rendered SVG figures into fixed patent drawing sheets.
 *
 * The individual SVG files remain the canonical drawing views. This compositor only places those
 * views on letter-size sheets for browser/PDF review with stable margins and predictable scaling.
 */

import { readFileSync, readdirSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { assertSafeSvg, inspectSvgSafety } from "./svg-safety.mjs";

const PAGE_FIGURE_WIDTH_IN = 6.9;
const PAGE_FIGURE_HEIGHT_IN = 8.85;
const COMPACT_GAP_IN = 0.22;
const COMPACT_MAX_FIG_HEIGHT_IN = 4.35;
const DEFAULT_MIN_SHEET_UTILIZATION = 0.55;
const DEFAULT_MAX_COMPACT_TEXT_RATIO = 1.12;
const DEFAULT_MAX_GLOBAL_TEXT_RATIO = 1.12;
const DEFAULT_MIN_RENDERED_TEXT_PT = 9.1;
const TEXT_ELEMENT_RE = /<text\b([^>]*)>([\s\S]*?)<\/text>/gi;
const TSPAN_ELEMENT_RE = /<tspan\b([^>]*)>([\s\S]*?)<\/tspan>/gi;

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function attrValue(attrs, name) {
  const match = new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "i").exec(String(attrs || ""));
  return match ? match[2].trim() : "";
}

function lengthToPx(value) {
  const match = /^([+]?(?:\d+(?:\.\d+)?|\.\d+))(px|pt|pc|in|cm|mm|q)?$/i.exec(String(value || "").trim());
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const unit = String(match[2] || "px").toLowerCase();
  const multiplier = {
    px: 1,
    pt: 96 / 72,
    pc: 16,
    in: 96,
    cm: 96 / 2.54,
    mm: 96 / 25.4,
    q: 96 / 101.6,
  }[unit];
  return multiplier ? amount * multiplier : null;
}

function svgDimensions(svg) {
  const root = String(svg || "").match(/<svg\b([^>]*)>/i);
  const attrs = root ? root[1] : "";
  const viewBox = attrValue(attrs, "viewBox").trim().split(/[\s,]+/).map(Number);
  if (viewBox.length === 4 && viewBox.every(Number.isFinite) && viewBox[2] > 0 && viewBox[3] > 0) {
    return { width: viewBox[2], height: viewBox[3], measured: true, source: "viewBox" };
  }
  const width = lengthToPx(attrValue(attrs, "width"));
  const height = lengthToPx(attrValue(attrs, "height"));
  if (width && height) return { width, height, measured: true, source: "width-height" };
  return { width: null, height: null, measured: false, source: "unmeasurable" };
}

function addRootAttributes(svg, className) {
  const trimmed = String(svg || "").trim();
  return trimmed.replace(/<svg\b([^>]*)>/i, (full, attrs) => {
    let next = attrs;
    if (/\bclass="/i.test(next)) next = next.replace(/\bclass="([^"]*)"/i, `class="$1 ${className}"`);
    else next += ` class="${className}"`;
    if (!/\bpreserveAspectRatio="/i.test(next)) next += ' preserveAspectRatio="xMidYMid meet"';
    return `<svg${next}>`;
  });
}

function estimatedHeightIn(dim) {
  const aspect = dim.width / dim.height;
  if (!Number.isFinite(aspect) || aspect <= 0) return PAGE_FIGURE_HEIGHT_IN;
  return Math.min(PAGE_FIGURE_HEIGHT_IN, PAGE_FIGURE_WIDTH_IN / aspect);
}

function median(nums) {
  const values = nums.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (!values.length) return null;
  const mid = Math.floor(values.length / 2);
  return values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
}

function inlineFontSize(attrs) {
  const direct = attrValue(attrs, "font-size");
  if (direct) return lengthToPx(direct);
  const style = attrValue(attrs, "style");
  if (!style) return null;
  const match = /(?:^|;)\s*font-size\s*:\s*([^;]+)/i.exec(style);
  return match ? lengthToPx(match[1]) : null;
}

function visibleText(value) {
  return String(value || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function svgTextMetrics(svg) {
  const fontSizes = [];
  let textElementCount = 0;
  let unmeasuredTextCount = 0;

  for (const textMatch of String(svg || "").matchAll(TEXT_ELEMENT_RE)) {
    const textAttrs = textMatch[1];
    const inner = textMatch[2];
    const inheritedSize = inlineFontSize(textAttrs);
    const tspans = [...inner.matchAll(TSPAN_ELEMENT_RE)];
    const directText = visibleText(inner.replace(TSPAN_ELEMENT_RE, ""));

    if (directText) {
      textElementCount += 1;
      if (inheritedSize) fontSizes.push(inheritedSize);
      else unmeasuredTextCount += 1;
    }
    for (const tspan of tspans) {
      if (!visibleText(tspan[2])) continue;
      textElementCount += 1;
      const size = inlineFontSize(tspan[1]) || inheritedSize;
      if (size) fontSizes.push(size);
      else unmeasuredTextCount += 1;
    }
  }

  return {
    fontSizes,
    textElementCount,
    measuredTextCount: fontSizes.length,
    unmeasuredTextCount,
  };
}

function preparedEntries(entries) {
  return entries.map((entry, i) => {
    const name = entry.name || basename(entry.path || `fig${String(i + 1).padStart(2, "0")}.svg`);
    const svg = entry.svg || readFileSync(entry.path, "utf8");
    const parsedDim = svgDimensions(svg);
    const dim = parsedDim.measured
      ? parsedDim
      : { width: 800, height: 600, measured: false, source: parsedDim.source };
    const text = svgTextMetrics(svg);
    const fontSizes = text.fontSizes;
    const wide = dim.width / dim.height >= 1.45;
    return {
      name,
      svg,
      dim,
      dimensionMeasured: parsedDim.measured,
      dimensionSource: parsedDim.source,
      wide,
      fontSizes,
      textElementCount: text.textElementCount,
      measuredTextCount: text.measuredTextCount,
      unmeasuredTextCount: text.unmeasuredTextCount,
      safety: inspectSvgSafety(svg),
      medianFontSize: median(fontSizes),
      estimatedHeight: estimatedHeightIn(dim),
    };
  });
}

function compactGroups(items) {
  const groups = [];
  let current = [];
  let currentHeight = 0;
  for (const item of items) {
    const h = item.estimatedHeight;
    const canStack = h <= COMPACT_MAX_FIG_HEIGHT_IN;
    const nextHeight = currentHeight + (current.length ? COMPACT_GAP_IN : 0) + h;
    if (canStack && current.length && nextHeight <= PAGE_FIGURE_HEIGHT_IN) {
      current.push(item);
      currentHeight = nextHeight;
      continue;
    }
    if (current.length) groups.push(current);
    current = [item];
    currentHeight = h;
  }
  if (current.length) groups.push(current);
  return groups;
}

function compactScaleInPerPx(group, availableHeight = PAGE_FIGURE_HEIGHT_IN) {
  const widthScale = Math.min(...group.map((item) => PAGE_FIGURE_WIDTH_IN / item.dim.width));
  const totalSourceHeight = group.reduce((sum, item) => sum + item.dim.height, 0);
  const heightScale = totalSourceHeight > 0 ? availableHeight / totalSourceHeight : widthScale;
  return Math.min(widthScale, heightScale);
}

function itemMetrics(item, scaleInPerPx) {
  const renderedTextSizes = item.fontSizes.map((size) => size * scaleInPerPx * 72);
  const medianTextPt = median(renderedTextSizes);
  const minTextPt = renderedTextSizes.length ? Math.min(...renderedTextSizes) : null;
  const maxTextPt = renderedTextSizes.length ? Math.max(...renderedTextSizes) : null;
  return {
    figure: item.name,
    source_size: item.dimensionMeasured ? [Math.round(item.dim.width), Math.round(item.dim.height)] : null,
    dimension_source: item.dimensionSource,
    dimensions_measured: item.dimensionMeasured,
    text_element_count: item.textElementCount,
    measured_text_count: item.measuredTextCount,
    unmeasured_text_count: item.unmeasuredTextCount,
    rendered_width_in: Number((item.dim.width * scaleInPerPx).toFixed(2)),
    rendered_height_in: Number((item.dim.height * scaleInPerPx).toFixed(2)),
    scale_in_per_px: Number(scaleInPerPx.toFixed(6)),
    median_source_font_px: item.medianFontSize == null ? null : Number(item.medianFontSize.toFixed(2)),
    median_rendered_text_pt: medianTextPt == null ? null : Number(medianTextPt.toFixed(2)),
    min_rendered_text_pt: minTextPt == null ? null : Number(minTextPt.toFixed(2)),
    max_rendered_text_pt: maxTextPt == null ? null : Number(maxTextPt.toFixed(2)),
  };
}

function textSizeRatio(items) {
  const values = items.map((item) => item.median_rendered_text_pt).filter((n) => Number.isFinite(n) && n > 0);
  if (values.length < 2) return 1;
  return Math.max(...values) / Math.min(...values);
}

function sheetMetrics(group, index, opts = {}) {
  const compact = Boolean(opts.compact && group.length > 1);
  const available = PAGE_FIGURE_HEIGHT_IN - COMPACT_GAP_IN * Math.max(0, group.length - 1);
  const scaleInPerPx = compact
    ? compactScaleInPerPx(group, available)
    : Math.min(PAGE_FIGURE_WIDTH_IN / group[0].dim.width, PAGE_FIGURE_HEIGHT_IN / group[0].dim.height);
  const item_layout = group.map((item) => itemMetrics(item, scaleInPerPx));
  const natural = compact
    ? group.reduce((sum, item) => sum + item.dim.height * scaleInPerPx, 0)
    : group.reduce((sum, item) => sum + item.estimatedHeight, 0);
  const scale = compact || natural <= available ? 1 : available / natural;
  const used = compact
    ? item_layout.reduce((sum, item) => sum + item.rendered_height_in, 0) + COMPACT_GAP_IN * Math.max(0, group.length - 1)
    : natural * scale + COMPACT_GAP_IN * Math.max(0, group.length - 1);
  return {
    sheet: index + 1,
    figures: group.map((item) => item.name),
    figure_count: group.length,
    compact,
    natural_height_in: Number(natural.toFixed(2)),
    used_height_in: Number(used.toFixed(2)),
    height_utilization: Number((used / PAGE_FIGURE_HEIGHT_IN).toFixed(3)),
    scale: Number(scale.toFixed(3)),
    scale_in_per_px: Number(scaleInPerPx.toFixed(6)),
    max_text_size_ratio: Number(textSizeRatio(item_layout).toFixed(3)),
    item_layout,
  };
}

export function analyzeDrawingSheets(entries, opts = {}) {
  const items = preparedEntries(entries);
  const groups = opts.compact ? compactGroups(items) : items.map((item) => [item]);
  const compactCandidateGroups = compactGroups(items);
  const boundedOption = (name, fallback, min, max, minInclusive = true) => {
    const value = opts[name] === undefined ? fallback : Number(opts[name]);
    const aboveMin = minInclusive ? value >= min : value > min;
    if (!Number.isFinite(value) || !aboveMin || value > max) {
      throw new Error(`${name} must be ${minInclusive ? "at least" : "greater than"} ${min} and at most ${max}`);
    }
    return value;
  };
  const minUtilization = boundedOption("minUtilization", DEFAULT_MIN_SHEET_UTILIZATION, 0, 1, false);
  const maxCompactTextRatio = boundedOption("maxCompactTextRatio", DEFAULT_MAX_COMPACT_TEXT_RATIO, 1, 10);
  const maxGlobalTextRatio = boundedOption("maxGlobalTextRatio", DEFAULT_MAX_GLOBAL_TEXT_RATIO, 1, 10);
  const minRenderedTextPt = boundedOption("minRenderedTextPt", DEFAULT_MIN_RENDERED_TEXT_PT, 0, 72, false);
  const sheets = groups.map((group, i) => sheetMetrics(group, i, opts));
  const findings = [];

  for (const item of items) {
    if (!item.safety.safe) {
      findings.push({
        severity: "blocking",
        code: "UNSAFE_SVG_CONTENT",
        figures: [item.name],
        issues: item.safety.issues.slice(0, 12),
        message: `${item.name} contains active or externally loading SVG content.`,
        suggested_fix: "Normalize the SVG to passive local vector line art before composing or opening it as HTML.",
      });
    }
    if (!item.dimensionMeasured) {
      findings.push({
        severity: "blocking",
        code: "UNMEASURABLE_DIMENSIONS",
        figures: [item.name],
        message: `${item.name} has no measurable positive viewBox or width/height dimensions.`,
        suggested_fix: "Add a positive numeric viewBox or supported px/pt/pc/in/cm/mm dimensions before sheet composition.",
      });
    }
    if (item.unmeasuredTextCount > 0) {
      findings.push({
        severity: "blocking",
        code: "UNMEASURABLE_TEXT",
        figures: [item.name],
        text_element_count: item.textElementCount,
        unmeasured_text_count: item.unmeasuredTextCount,
        message: `${item.name} contains ${item.unmeasuredTextCount} text element(s) whose physical size cannot be measured.`,
        suggested_fix: "Set a supported numeric font-size directly on each text/tspan or inherit it from its enclosing text element.",
      });
    }
  }

  if (!opts.compact && compactCandidateGroups.length < groups.length) {
    findings.push({
      severity: "fix-before-filing",
      code: "PAGE_COUNT_INFLATED_BY_SHORT_VIEWS",
      message: `${groups.length} one-view sheet(s) can be reduced to ${compactCandidateGroups.length} sheet(s) with compact assembly.`,
      suggested_fix: "Regenerate the sheet HTML with sheet-html --compact, then visually inspect the combined sheets for crowding.",
    });
  }

  for (const sheet of sheets) {
    if (sheet.figure_count === 1 && sheet.height_utilization < minUtilization) {
      findings.push({
        severity: "fix-before-filing",
        code: opts.compact ? "UNDERUSED_SHEET_AFTER_COMPACT" : "COMPACT_SHEET_RECOMMENDED",
        sheet: sheet.sheet,
        figures: sheet.figures,
        height_utilization: sheet.height_utilization,
        message: `Sheet ${sheet.sheet} uses about ${Math.round(sheet.height_utilization * 100)}% of the available drawing height.`,
        suggested_fix: opts.compact
          ? "Consider a taller source layout, a detail view, or a human-approved multi-view grouping for this short figure."
          : "Use sheet-html --compact or re-layout the source figure taller before filing-polish review.",
      });
    }
    if (sheet.compact && sheet.max_text_size_ratio > maxCompactTextRatio) {
      findings.push({
        severity: "fix-before-filing",
        code: "COMPACT_TEXT_SIZE_MISMATCH",
        sheet: sheet.sheet,
        figures: sheet.figures,
        max_text_size_ratio: sheet.max_text_size_ratio,
        item_layout: sheet.item_layout,
        message: `Sheet ${sheet.sheet} contains compact figures whose effective median text sizes differ by ${Math.round((sheet.max_text_size_ratio - 1) * 100)}%.`,
        suggested_fix: "Use a common compact-sheet scale for all figures on the sheet, normalize SVG source font sizes, or split the views onto separate sheets.",
      });
    }
    for (const item of sheet.item_layout) {
      if (item.min_rendered_text_pt != null && item.min_rendered_text_pt < minRenderedTextPt) {
        findings.push({
          severity: "fix-before-filing",
          code: "TEXT_BELOW_MINIMUM_PHYSICAL_SIZE",
          sheet: sheet.sheet,
          figures: [item.figure],
          min_rendered_text_pt: item.min_rendered_text_pt,
          message: `${item.figure} renders text as small as ${item.min_rendered_text_pt} pt on sheet ${sheet.sheet}.`,
          suggested_fix: "Increase source typography scale, re-layout the view so it can be rendered larger, or split compact sheets until text meets the physical-size target.",
        });
      }
    }
  }
  const allItems = sheets.flatMap((sheet) => sheet.item_layout.map((item) => ({ ...item, sheet: sheet.sheet })));
  const globalTextValues = allItems.map((item) => item.median_rendered_text_pt).filter((n) => Number.isFinite(n) && n > 0);
  const globalTextRatio = globalTextValues.length >= 2 ? Math.max(...globalTextValues) / Math.min(...globalTextValues) : 1;
  if (globalTextRatio > maxGlobalTextRatio) {
    findings.push({
      severity: "fix-before-filing",
      code: "GLOBAL_TEXT_SIZE_MISMATCH",
      max_text_size_ratio: Number(globalTextRatio.toFixed(3)),
      item_layout: allItems,
      message: `Median rendered text size differs across drawing sheets by ${Math.round((globalTextRatio - 1) * 100)}%.`,
      suggested_fix: "Normalize source typography/style scale across figures, use a common drawing scale, or split/re-layout views so final text size is consistent across sheets.",
    });
  }

  return {
    schema: "apa-drawing-sheet-composition-v1",
    compact: Boolean(opts.compact),
    sheet_count: groups.length,
    compact_candidate_sheet_count: compactCandidateGroups.length,
    min_sheet_utilization_required: Number(minUtilization.toFixed(3)),
    max_compact_text_ratio_allowed: Number(maxCompactTextRatio.toFixed(3)),
    max_global_text_ratio_allowed: Number(maxGlobalTextRatio.toFixed(3)),
    min_rendered_text_pt_required: Number(minRenderedTextPt.toFixed(2)),
    min_height_utilization: sheets.length ? Math.min(...sheets.map((s) => s.height_utilization)) : 0,
    mean_height_utilization: sheets.length
      ? Number((sheets.reduce((sum, s) => sum + s.height_utilization, 0) / sheets.length).toFixed(3))
      : 0,
    max_global_text_size_ratio: Number(globalTextRatio.toFixed(3)),
    verdict: findings.some((finding) => finding.severity === "blocking")
      ? "blocked"
      : findings.length
        ? "polish-before-filing"
        : "candidate-ready-for-human-review",
    findings,
    sheets,
  };
}

function figureMarkup(item, opts = {}) {
  const wide = item.wide;
  const figClass = wide ? "fig fig-wide" : "fig";
  const wrapClass = ["figwrap", wide ? "wide" : "", opts.compact ? "compact-item" : ""].filter(Boolean).join(" ");
  const styleVars = [];
  if (opts.width) styleVars.push(`--fig-width: ${opts.width.toFixed(2)}in`);
  if (opts.height) styleVars.push(`--fig-height: ${opts.height.toFixed(2)}in`);
  if (opts.maxHeight) styleVars.push(`--fig-max-height: ${opts.maxHeight.toFixed(2)}in`);
  const style = styleVars.length ? ` style="${styleVars.join("; ")}"` : "";
  return `<div class="${wrapClass}"${style}>${addRootAttributes(item.svg, figClass)}</div>`;
}

export function svgFiles(svgDir) {
  const files = readdirSync(svgDir)
    .filter((name) => extname(name).toLowerCase() === ".svg")
    .sort()
    .map((name) => join(svgDir, name));
  if (!files.length) throw new Error(`no SVG files found in ${svgDir}`);
  return files;
}

export function composeDrawingSheets(entries, opts = {}) {
  const title = opts.title || "Drawings";
  const items = preparedEntries(entries);
  for (const item of items) {
    assertSafeSvg(item.svg, item.name);
    if (!item.dimensionMeasured) {
      throw new Error(`${item.name} has unmeasurable SVG dimensions`);
    }
    if (item.unmeasuredTextCount > 0) {
      throw new Error(`${item.name} contains text with unmeasurable font size`);
    }
  }
  const groups = opts.compact ? compactGroups(items) : items.map((item) => [item]);
  const sheets = groups.map((group, i) => {
    const names = group.map((item) => item.name).join(",");
    const compact = opts.compact && group.length > 1;
    const available = PAGE_FIGURE_HEIGHT_IN - COMPACT_GAP_IN * Math.max(0, group.length - 1);
    const natural = group.reduce((sum, item) => sum + item.estimatedHeight, 0);
    const scale = natural > available ? available / natural : 1;
    const compactScale = compact ? compactScaleInPerPx(group, available) : null;
    const figures = group.map((item) => figureMarkup(item, {
      compact,
      width: compact ? item.dim.width * compactScale : undefined,
      height: compact ? item.dim.height * compactScale : undefined,
      maxHeight: compact ? item.dim.height * compactScale : undefined,
    })).join("");
    return [
      `<section class="sheet${compact ? " compact" : ""}" data-figure="${esc(names)}">`,
      `<div class="num">${i + 1}/${groups.length}</div>`,
      compact ? `<div class="stack">${figures}</div>` : figures,
      `</section>`,
    ].join("");
  });
  return [
    "<!doctype html>",
    `<html><head><meta charset="utf-8"><title>${esc(title)}</title>`,
    "<style>",
    "  @page { size: 8.5in 11in; margin: 1in 0.6in 0.4in 1in; }",
    "  html, body { margin: 0; padding: 0; background: white; }",
    "  .sheet { page-break-after: always; break-after: page; height: 9.5in; display: flex; flex-direction: column; box-sizing: border-box; }",
    "  .sheet:last-child { page-break-after: auto; break-after: auto; }",
    "  .num { text-align: center; font-family: \"Times New Roman\", serif; font-size: 11pt; margin-bottom: 6pt; }",
    "  .figwrap { flex: 1 1 auto; display: flex; align-items: center; justify-content: center; min-height: 0; box-sizing: border-box; }",
    "  .figwrap.wide { align-items: flex-start; padding-top: 1.05in; }",
    "  svg.fig { max-width: 100%; max-height: 8.85in; width: auto; height: auto; }",
    "  .figwrap.wide svg.fig { max-height: 8.35in; transform: translateX(-0.1in); }",
    "  .sheet.compact { justify-content: flex-start; }",
    "  .stack { flex: 1 1 auto; display: flex; flex-direction: column; gap: 0.22in; align-items: center; justify-content: center; min-height: 0; }",
    "  .figwrap.compact-item { flex: 0 1 auto; width: 100%; padding-top: 0; }",
    "  .figwrap.compact-item svg.fig { width: var(--fig-width, auto); height: var(--fig-height, auto); max-height: var(--fig-max-height, 4.2in); transform: none; }",
    "</style></head><body>",
    sheets.join("\n"),
    "</body></html>",
  ].join("\n") + "\n";
}

export function composeDrawingSheetsFromDir(svgDir, opts = {}) {
  return composeDrawingSheets(svgFiles(svgDir).map((path) => ({ path, name: basename(path) })), opts);
}

export function analyzeDrawingSheetsFromDir(svgDir, opts = {}) {
  return analyzeDrawingSheets(svgFiles(svgDir).map((path) => ({ path, name: basename(path) })), opts);
}

export default { analyzeDrawingSheets, analyzeDrawingSheetsFromDir, composeDrawingSheets, composeDrawingSheetsFromDir, svgFiles };
