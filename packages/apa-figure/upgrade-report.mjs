/**
 * Deterministic SVG upgrade report for /apa-svg-upgrader.
 *
 * The report is a drafting-control artifact. It proves that every upgraded SVG has a pre/post diff,
 * numeral parity check, visual-structure comparison, and human-review gate before drawing QA.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { reviewFigure } from "./quality.mjs";

export const SVG_UPGRADE_REPORT_SCHEMA = "apa-svg-upgrade-report-v1";

const TEXT_RE = /<text\b([^>]*)>([\s\S]*?)<\/text>/gi;
const ID_RE = /\bid="([^"]+)"/i;
const VISUAL_TAGS = ["rect", "ellipse", "circle", "line", "path", "polyline", "polygon"];

function sha256(text) {
  return createHash("sha256").update(String(text || ""), "utf8").digest("hex");
}

function slug(s) {
  return String(s == null ? "" : s).replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function stripTags(s) {
  return String(s || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function attrId(attrs) {
  return ID_RE.exec(String(attrs || ""))?.[1] || "";
}

function idPartKey(id, suffix) {
  const re = new RegExp(`-part-(.+)-${suffix}$`);
  return re.exec(id)?.[1] || "";
}

function textElements(svg) {
  return [...String(svg || "").matchAll(TEXT_RE)].map((m) => ({
    attrs: m[1],
    id: attrId(m[1]),
    text: stripTags(m[2]),
  }));
}

export function extractSvgNumerals(svg) {
  const byPart = new Map();
  const fallback = [];
  for (const t of textElements(svg)) {
    const numKey = idPartKey(t.id, "num");
    const labelKey = idPartKey(t.id, "label");
    if (numKey) {
      const rec = byPart.get(numKey) || { part_key: numKey, numeral: "", label: "" };
      rec.numeral = t.text;
      byPart.set(numKey, rec);
    } else if (labelKey) {
      const rec = byPart.get(labelKey) || { part_key: labelKey, numeral: "", label: "" };
      rec.label = t.text;
      byPart.set(labelKey, rec);
    } else if (/^[0-9]+[A-Za-z]?$/.test(t.text)) {
      fallback.push({ part_key: `text:${t.text}`, numeral: t.text, label: "" });
    }
  }
  const records = [...byPart.values()]
    .map((r) => ({ ...r, numeral: String(r.numeral || r.part_key).trim(), label: String(r.label || "").trim() }))
    .filter((r) => r.numeral && !/^FIG\b/i.test(r.numeral));
  const seen = new Set(records.map((r) => r.numeral));
  for (const r of fallback) if (!seen.has(r.numeral)) records.push(r);
  return records.sort(compareNumerals);
}

function compareNumerals(a, b) {
  return String(a.numeral).localeCompare(String(b.numeral), undefined, { numeric: true });
}

function compareNumeralParity(before, after) {
  const beforeByNum = new Map(before.map((r) => [r.numeral, r]));
  const afterByNum = new Map(after.map((r) => [r.numeral, r]));
  const added = after.filter((r) => !beforeByNum.has(r.numeral));
  const removed = before.filter((r) => !afterByNum.has(r.numeral));
  const remapped = after
    .filter((r) => beforeByNum.has(r.numeral))
    .map((r) => ({ numeral: r.numeral, before_label: beforeByNum.get(r.numeral).label, after_label: r.label }))
    .filter((r) => r.before_label && r.after_label && r.before_label !== r.after_label);
  return {
    before,
    after,
    added,
    removed,
    remapped,
    passed: added.length === 0 && removed.length === 0 && remapped.length === 0,
  };
}

function tagCount(svg, tag) {
  return [...String(svg || "").matchAll(new RegExp(`<${tag}\\b`, "gi"))].length;
}

function visualTagCounts(svg) {
  return Object.fromEntries(VISUAL_TAGS.map((tag) => [tag, tagCount(svg, tag)]));
}

function semanticStructures(svg) {
  const ids = [...String(svg || "").matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  const arrowBases = [...new Set(ids.map((id) => /(.+-arrow-\d+)-/.exec(id)?.[1]).filter(Boolean))];
  return {
    part_shapes: ids.filter((id) => /-part-.+-shape$/.test(id)).sort(),
    part_leads: ids.filter((id) => /-part-.+-lead$/.test(id)).sort(),
    arrows: arrowBases.sort(),
  };
}

function expectedStructuresFromFigDef(figDef) {
  if (!figDef || typeof figDef !== "object") return null;
  const figSlug = slug(figDef.fig || figDef.id || "FIG") || "FIG";
  const parts = Array.isArray(figDef.parts) ? figDef.parts.filter(Boolean) : [];
  const arrows = Array.isArray(figDef.arrows) ? figDef.arrows.filter(Boolean) : [];
  return {
    part_shapes: parts.map((p) => `${figSlug}-part-${slug(p.numeral) || "x"}-shape`).sort(),
    part_leads: parts.filter((p) => p.numeral != null).map((p) => `${figSlug}-part-${slug(p.numeral) || "x"}-lead`).sort(),
    arrows: arrows.map((_, i) => `${figSlug}-arrow-${i}`).sort(),
  };
}

function addedItems(before, after) {
  const prior = new Set(before || []);
  return (after || []).filter((v) => !prior.has(v));
}

function visualDelta(beforeSvg, afterSvg, sourceSpec = null) {
  const before = semanticStructures(beforeSvg);
  const after = semanticStructures(afterSvg);
  const expected = expectedStructuresFromFigDef(sourceSpec) || before;
  const unsupported = [];
  for (const key of ["part_shapes", "part_leads", "arrows"]) {
    for (const id of addedItems(expected[key], after[key])) {
      unsupported.push({
        kind: key,
        id,
        reason: "semantic visual structure is not present in the source drawing specification",
        severity: "blocking",
      });
    }
  }
  const beforeCounts = visualTagCounts(beforeSvg);
  const afterCounts = visualTagCounts(afterSvg);
  const count_increases = {};
  for (const tag of VISUAL_TAGS) {
    const delta = afterCounts[tag] - beforeCounts[tag];
    if (delta > 0) count_increases[tag] = delta;
  }
  return {
    before,
    after,
    expected,
    visual_tag_counts_before: beforeCounts,
    visual_tag_counts_after: afterCounts,
    count_increases,
    unsupported_visual_changes: unsupported,
  };
}

function lineDiffSummary(beforeSvg, afterSvg) {
  const beforeLines = String(beforeSvg || "").split(/\r?\n/);
  const afterLines = String(afterSvg || "").split(/\r?\n/);
  const beforeSet = new Set(beforeLines);
  const afterSet = new Set(afterLines);
  const added = afterLines.filter((line) => !beforeSet.has(line));
  const removed = beforeLines.filter((line) => !afterSet.has(line));
  return {
    changed: beforeSvg !== afterSvg,
    before_lines: beforeLines.length,
    after_lines: afterLines.length,
    lines_added: added.length,
    lines_removed: removed.length,
    added_preview: added.slice(0, 20),
    removed_preview: removed.slice(0, 20),
  };
}

function compactPreflight(review) {
  if (!review) return null;
  return {
    score: review.score,
    verdict: review.verdict,
    blocking: review.blocking,
    fixes: review.fixes,
    finding_count: Array.isArray(review.findings) ? review.findings.length : 0,
  };
}

export function buildSvgUpgradeFileReport({
  name,
  beforeSvg,
  afterSvg,
  sourceFigDef = null,
  beforePath = "",
  afterPath = "",
  sourcePath = "",
} = {}) {
  const numeral_parity = compareNumeralParity(extractSvgNumerals(beforeSvg), extractSvgNumerals(afterSvg));
  const visual_structure = visualDelta(beforeSvg, afterSvg, sourceFigDef);
  const preflight_before = sourceFigDef ? compactPreflight(reviewFigure(sourceFigDef, beforeSvg, { file: sourcePath })) : null;
  const preflight_after = sourceFigDef ? compactPreflight(reviewFigure(sourceFigDef, afterSvg, { file: sourcePath })) : null;
  const unsupported_visual_changes = visual_structure.unsupported_visual_changes;
  const human_review_required =
    !numeral_parity.passed ||
    unsupported_visual_changes.length > 0 ||
    (preflight_after && (preflight_after.blocking > 0 || preflight_after.fixes > 0));
  return {
    name,
    before_svg: beforePath,
    after_svg: afterPath,
    source: sourcePath,
    before_sha256: sha256(beforeSvg),
    after_sha256: sha256(afterSvg),
    changed: beforeSvg !== afterSvg,
    byte_delta: Buffer.byteLength(String(afterSvg || ""), "utf8") - Buffer.byteLength(String(beforeSvg || ""), "utf8"),
    diff_summary: lineDiffSummary(beforeSvg, afterSvg),
    preflight_before,
    preflight_after,
    numeral_parity,
    numerals_added_removed: {
      added: numeral_parity.added,
      removed: numeral_parity.removed,
      remapped: numeral_parity.remapped,
    },
    visual_structure,
    unsupported_visual_changes,
    human_review_required,
    ready_for_drawing_quality: numeral_parity.passed && unsupported_visual_changes.length === 0,
  };
}

function svgFiles(dir) {
  return readdirSync(dir)
    .filter((name) => extname(name).toLowerCase() === ".svg")
    .sort();
}

function findSourceFigDef(sourceDir, name) {
  if (!sourceDir) return { figDef: null, sourcePath: "" };
  const sourcePath = join(sourceDir, `${basename(name, ".svg")}.json`);
  if (!existsSync(sourcePath)) return { figDef: null, sourcePath: "" };
  return { figDef: JSON.parse(readFileSync(sourcePath, "utf8")), sourcePath };
}

export function buildSvgUpgradeReport({
  beforeDir,
  afterDir,
  sourceDir = "",
  sourceRoute = "manual-svg",
  externalToolNotes = [],
  generatedAt = new Date().toISOString(),
} = {}) {
  const names = [...new Set([...svgFiles(beforeDir), ...svgFiles(afterDir)])].sort();
  const files = names.map((name) => {
    const beforePath = join(beforeDir, name);
    const afterPath = join(afterDir, name);
    if (!existsSync(beforePath)) throw new Error(`missing pre-upgrade SVG for ${name}: ${beforePath}`);
    if (!existsSync(afterPath)) throw new Error(`missing post-upgrade SVG for ${name}: ${afterPath}`);
    const { figDef, sourcePath } = findSourceFigDef(sourceDir, name);
    return buildSvgUpgradeFileReport({
      name,
      beforePath,
      afterPath,
      sourcePath,
      sourceFigDef: figDef,
      beforeSvg: readFileSync(beforePath, "utf8"),
      afterSvg: readFileSync(afterPath, "utf8"),
    });
  });
  const unsupported_visual_changes = files.flatMap((file) => file.unsupported_visual_changes.map((change) => ({ file: file.name, ...change })));
  const numerals_added_removed = files.flatMap((file) => {
    const out = [];
    for (const added of file.numerals_added_removed.added) out.push({ file: file.name, action: "added", ...added });
    for (const removed of file.numerals_added_removed.removed) out.push({ file: file.name, action: "removed", ...removed });
    for (const remapped of file.numerals_added_removed.remapped) out.push({ file: file.name, action: "remapped", ...remapped });
    return out;
  });
  const anyNumeralFailure = files.some((file) => !file.numeral_parity.passed);
  const verdict = unsupported_visual_changes.length
    ? "blocked-unsupported-visual-changes"
    : anyNumeralFailure
      ? "blocked-numeral-parity"
      : files.some((file) => file.human_review_required)
        ? "human-review-required"
        : "ready-for-drawing-quality";
  return {
    schema: SVG_UPGRADE_REPORT_SCHEMA,
    generated_at: generatedAt,
    source_route: sourceRoute,
    file_count: files.length,
    files_changed_or_created: files.map((file) => ({
      name: file.name,
      before_svg: file.before_svg,
      after_svg: file.after_svg,
      source: file.source,
      before_sha256: file.before_sha256,
      after_sha256: file.after_sha256,
      changed: file.changed,
    })),
    preflight_before: files.map((file) => ({ file: file.name, ...file.preflight_before })).filter((r) => r.verdict),
    preflight_after: files.map((file) => ({ file: file.name, ...file.preflight_after })).filter((r) => r.verdict),
    numerals_added_removed,
    unsupported_visual_changes,
    human_review_required: verdict !== "ready-for-drawing-quality",
    ready_for_drawing_quality: verdict === "ready-for-drawing-quality",
    verdict,
    external_tool_notes: externalToolNotes,
    files,
  };
}

export default {
  SVG_UPGRADE_REPORT_SCHEMA,
  extractSvgNumerals,
  buildSvgUpgradeFileReport,
  buildSvgUpgradeReport,
};
