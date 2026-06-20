/**
 * Deterministic first-pass figure generation report for /apa-figures.
 *
 * This report sits between authored `src/drawing_src/*.json` and rendered SVG. It catches the
 * new-matter class of drawing mistakes: visual parts without support/source facts, generated numerals
 * that are not transcribed in the drawing legend, and transcribed numerals that would disappear from
 * the generated figure.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { buildLegend } from "./numerals.mjs";
import { sourceSpanFindings } from "../apa-validate/source-spans.mjs";

export const FIGURE_GENERATION_REPORT_SCHEMA = "apa-figure-generation-report-v1";

function sha256(text) {
  return createHash("sha256").update(String(text || ""), "utf8").digest("hex");
}

function relOrAbs(path) {
  return String(path || "");
}

function listJsonFiles(dir) {
  return readdirSync(dir)
    .filter((name) => extname(name).toLowerCase() === ".json")
    .filter((name) => statSync(join(dir, name)).isFile())
    .sort();
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function normalizeNumeral(value) {
  return value == null ? "" : String(value).trim();
}

function compareNumeral(a, b) {
  return normalizeNumeral(a).localeCompare(normalizeNumeral(b), undefined, { numeric: true });
}

function nonEmpty(value) {
  if (Array.isArray(value)) return value.some(nonEmpty);
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function explicitSupportFields(obj = {}) {
  const fields = [];
  for (const field of ["defined_in", "supported_by", "source_fact", "source_ref", "source_refs", "source_ids"]) {
    if (nonEmpty(obj[field])) fields.push(field);
  }
  return fields;
}

function sourceStatus(obj = {}, label = "visual element") {
  const fields = explicitSupportFields(obj);
  const sourceFindings = sourceSpanFindings(obj, label, { requireComplete: obj.source !== undefined && obj.source !== "not-recoverable" });
  const hasSource = obj.source !== undefined;
  const sourceValid = sourceFindings.length === 0;
  const supported =
    fields.length > 0 ||
    (hasSource && sourceValid && (obj.source === "not-recoverable" || (nonEmpty(obj.source_span) && nonEmpty(obj.source_sha256))));
  return {
    supported,
    support_fields: fields,
    source: obj.source || null,
    source_span: obj.source_span || null,
    source_sha256: obj.source_sha256 || null,
    source_findings: sourceFindings,
  };
}

function legendMaps(matterDir) {
  if (!matterDir) return { entries: [], flags: [], byFig: new Map(), byFigNumeral: new Map() };
  const legend = buildLegend(matterDir);
  const byFig = new Map();
  const byFigNumeral = new Map();
  for (const entry of legend.entries) {
    if (!byFig.has(entry.fig)) byFig.set(entry.fig, []);
    byFig.get(entry.fig).push(entry);
    byFigNumeral.set(`${entry.fig}:${normalizeNumeral(entry.numeral)}`, entry);
  }
  return { ...legend, byFig, byFigNumeral };
}

function risk({ code, severity = "blocking", fig, file, numeral = "", element = "", reason, source = "" }) {
  return { code, severity, fig, file, numeral, element, reason, source };
}

function partRecord({ part, fig, file, legendEntry }) {
  const numeral = normalizeNumeral(part?.numeral);
  const status = sourceStatus(part || {}, `${fig} part ${numeral || "(unnumbered)"}`);
  const legendSupported = Boolean(legendEntry?.defined_in);
  const support_sources = [];
  if (legendSupported) support_sources.push("drawing_transcription");
  if (status.supported) support_sources.push("source_metadata");
  return {
    fig,
    file,
    numeral,
    label: part?.label == null ? "" : String(part.label),
    shape: part?.shape || "box",
    defined_in: legendEntry?.defined_in || null,
    support_sources,
    support_fields: status.support_fields,
    source: status.source,
    source_span: status.source_span,
    source_sha256: status.source_sha256,
    source_findings: status.source_findings,
    traceable: legendSupported || status.supported,
  };
}

function arrowRecord({ arrow, fig, file, supportedNumerals }) {
  const status = sourceStatus(arrow || {}, `${fig} arrow`);
  const endpoints = [arrow?.from, arrow?.to, arrow?.self].map(normalizeNumeral).filter(Boolean);
  const endpointsSupported = endpoints.length > 0 && endpoints.every((n) => supportedNumerals.has(n));
  const support_sources = [];
  if (endpointsSupported) support_sources.push("endpoint_numerals");
  if (status.supported) support_sources.push("source_metadata");
  return {
    fig,
    file,
    kind: arrow?.kind || (arrow?.self != null ? "loop" : "flow"),
    from: arrow?.from == null ? null : String(arrow.from),
    to: arrow?.to == null ? null : String(arrow.to),
    self: arrow?.self == null ? null : String(arrow.self),
    label: arrow?.label == null ? "" : String(arrow.label),
    support_sources,
    support_fields: status.support_fields,
    source: status.source,
    source_span: status.source_span,
    source_sha256: status.source_sha256,
    source_findings: status.source_findings,
    traceable: endpointsSupported || status.supported,
  };
}

export function buildFigureGenerationFileReport({ name, sourcePath, figDef, legendState }) {
  const sourceText = readFileSync(sourcePath, "utf8");
  const fig = String(figDef?.fig || figDef?.id || basename(name, ".json").toUpperCase());
  const parts = Array.isArray(figDef?.parts) ? figDef.parts.filter(Boolean) : [];
  const arrows = Array.isArray(figDef?.arrows) ? figDef.arrows.filter(Boolean) : [];
  const legendEntries = legendState.byFig.get(fig) || [];
  const generatedNumeralSet = new Set(parts.map((p) => normalizeNumeral(p?.numeral)).filter(Boolean));
  const records = parts.map((part) => {
    const numeral = normalizeNumeral(part?.numeral);
    return partRecord({
      part,
      fig,
      file: name,
      legendEntry: legendState.byFigNumeral.get(`${fig}:${numeral}`),
    });
  });
  const supportedNumerals = new Set(records.filter((r) => r.traceable && r.numeral).map((r) => r.numeral));
  const arrowRecords = arrows.map((arrow) => arrowRecord({ arrow, fig, file: name, supportedNumerals }));
  const removed = legendEntries
    .filter((entry) => !generatedNumeralSet.has(normalizeNumeral(entry.numeral)))
    .map((entry) => ({
      fig,
      file: name,
      numeral: normalizeNumeral(entry.numeral),
      element: entry.element || "",
      defined_in: entry.defined_in || null,
      reason: "drawing transcription has a numeral absent from the figure JSON",
    }))
    .sort((a, b) => compareNumeral(a.numeral, b.numeral));

  const risks = [];
  for (const rec of records) {
    for (const finding of rec.source_findings) {
      risks.push(risk({
        code: "PART_SOURCE_METADATA_INVALID",
        fig,
        file: name,
        numeral: rec.numeral,
        element: rec.label,
        reason: finding.msg,
        source: rec.source || "",
      }));
    }
    if (!rec.traceable) {
      risks.push(risk({
        code: rec.numeral ? "PART_UNSUPPORTED_BY_DISCLOSURE" : "UNNUMBERED_PART_UNSUPPORTED",
        fig,
        file: name,
        numeral: rec.numeral,
        element: rec.label,
        reason: rec.numeral
          ? "part numeral is not transcribed with a defining SPEC paragraph and has no source/support metadata"
          : "unnumbered visual part has no source/support metadata",
      }));
    }
  }
  for (const rec of arrowRecords) {
    for (const finding of rec.source_findings) {
      risks.push(risk({
        code: "ARROW_SOURCE_METADATA_INVALID",
        fig,
        file: name,
        element: rec.label,
        reason: finding.msg,
        source: rec.source || "",
      }));
    }
    if (!rec.traceable) {
      risks.push(risk({
        code: "ARROW_UNSUPPORTED_BY_DISCLOSURE",
        fig,
        file: name,
        element: rec.label,
        reason: "arrow/relationship cannot be traced to source metadata or supported endpoint numerals",
      }));
    }
  }
  for (const entry of removed) {
    risks.push(risk({
      code: "NUMERAL_REMOVED_FROM_SOURCE",
      fig,
      file: name,
      numeral: entry.numeral,
      element: entry.element,
      reason: entry.reason,
    }));
  }

  return {
    name,
    source: relOrAbs(sourcePath),
    source_sha256: sha256(sourceText),
    fig,
    title: figDef?.title || "",
    representative: Boolean(figDef?.representative),
    generated_numerals: records
      .filter((r) => r.numeral)
      .map((r) => ({
        fig,
        file: name,
        numeral: r.numeral,
        element: r.label,
        defined_in: r.defined_in,
        support_sources: r.support_sources,
      }))
      .sort((a, b) => compareNumeral(a.numeral, b.numeral)),
    removed_numerals: removed,
    visual_parts: records,
    visual_arrows: arrowRecords,
    unsupported_visual_change_risks: risks,
    ready_for_svg_render: risks.filter((r) => r.severity === "blocking").length === 0,
  };
}

export function buildFigureGenerationReport({
  matterDir = "",
  sourceDir = matterDir ? join(matterDir, "src", "drawing_src") : "",
  generatedAt = new Date().toISOString(),
} = {}) {
  if (!sourceDir) throw new Error("sourceDir is required");
  if (!existsSync(sourceDir)) throw new Error(`drawing source directory not found: ${sourceDir}`);
  const legendState = legendMaps(matterDir);
  const sourceNames = listJsonFiles(sourceDir);
  const sourceFigIds = new Set();
  const files = sourceNames.map((name) => {
    const sourcePath = join(sourceDir, name);
    const figDef = readJson(sourcePath);
    const fig = String(figDef?.fig || figDef?.id || basename(name, ".json").toUpperCase());
    sourceFigIds.add(fig);
    return buildFigureGenerationFileReport({ name, sourcePath, figDef, legendState });
  });

  const missingSourceFigureRisks = [];
  for (const entry of legendState.entries || []) {
    if (!sourceFigIds.has(entry.fig)) {
      missingSourceFigureRisks.push(risk({
        code: "FIGURE_SOURCE_MISSING",
        fig: entry.fig,
        file: "",
        numeral: normalizeNumeral(entry.numeral),
        element: entry.element || "",
        reason: "drawing transcription exists for a figure with no matching source JSON",
      }));
    }
  }

  const generated_numerals = files.flatMap((file) => file.generated_numerals);
  const removed_numerals = files.flatMap((file) => file.removed_numerals);
  const unsupported_visual_change_risks = [
    ...files.flatMap((file) => file.unsupported_visual_change_risks),
    ...missingSourceFigureRisks,
  ];
  const blocking = unsupported_visual_change_risks.filter((r) => r.severity === "blocking");
  const verdict = blocking.length ? "blocked-unsupported-visual-matter" : "ready-for-svg-render";
  return {
    schema: FIGURE_GENERATION_REPORT_SCHEMA,
    generated_at: generatedAt,
    matter: matterDir,
    source_dir: sourceDir,
    file_count: files.length,
    inputs: [
      { kind: "drawing_source_dir", path: sourceDir },
      ...(matterDir ? [{ kind: "matter", path: matterDir }] : []),
    ],
    generated_numerals,
    removed_numerals,
    unsupported_visual_change_risks,
    human_review_required: unsupported_visual_change_risks.length > 0,
    ready_for_svg_render: verdict === "ready-for-svg-render",
    verdict,
    files,
  };
}

export default {
  FIGURE_GENERATION_REPORT_SCHEMA,
  buildFigureGenerationFileReport,
  buildFigureGenerationReport,
};
