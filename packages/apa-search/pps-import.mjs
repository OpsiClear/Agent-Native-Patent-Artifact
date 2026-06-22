/**
 * Local USPTO Patent Public Search (PPS) export importer.
 *
 * PPS is UI-only/human-handoff in APA. This module does not automate or scrape PPS; it only parses a
 * human-saved CSV/JSON/text export so the resulting candidate list, export hash, and human query can
 * be captured in the prior-art dossier and runlog.
 */

import { statSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename } from "node:path";
import { scanQueryAtSink } from "./search.mjs";
import { dedupeRefsDetailed } from "./lib/refs.mjs";
import { sourceHealth } from "./sources/index.mjs";

export const MAX_PPS_EXPORT_BYTES = 5 * 1024 * 1024;

export function buildPpsImportResult({
  exportText,
  exportPath,
  copiedPath = "",
  queryText,
  reviewer = "",
  notes = "",
  limit = 25,
  importedAt = new Date().toISOString(),
} = {}) {
  const fileName = basename(exportPath || "pps-export");
  const parsed = parsePpsExport(exportText, { fileName });
  const dedupe = dedupeRefsDetailed(parsed.records);
  const ranked = dedupe.deduped.slice(0, limit).map((ref, index) => ({
    ...ref,
    score: null,
    rank_explanation: {
      matched_keywords: [],
      matched_variants: [],
      matched_cpc: [],
      field_hits: {},
      score_breakdown: [],
      source_rank: ref.import_rank || index + 1,
      rationale: "preserved human PPS export order; not an automated relevance or legal score",
    },
  }));
  const query = {
    keywords: splitHumanQuery(queryText),
    cpc: [],
    limit,
    human_query: String(queryText || ""),
    source_id: "uspto-pps",
    source_mode: "human-handoff",
  };
  const verdict = scanImportedQuery(query);
  const importRecord = {
    source_id: "uspto-pps",
    imported_at: importedAt,
    reviewer: String(reviewer || ""),
    notes: String(notes || ""),
    format: parsed.format,
    file_name: fileName,
    original_path: String(exportPath || ""),
    copied_path: String(copiedPath || ""),
    bytes: Buffer.byteLength(String(exportText || ""), "utf8"),
    sha256: sha256Text(exportText),
    parsed_rows: parsed.rows.length,
    parsed_records: parsed.records.length,
    parsing_warnings: parsed.warnings,
    automation_statement: "Human exported this PPS data; APA imported the local file and did not automate the PPS UI.",
  };

  return {
    query,
    result: {
      blocked: false,
      needsConfirm: verdict.needsConfirm,
      verdict,
      rawRecords: parsed.records,
      deduped: dedupe.deduped,
      dedupe: { clusters: dedupe.clusters, excludedResults: dedupe.excludedResults },
      ranked,
      searchPlan: [{
        id: "human-pps-query",
        label: "Human-entered USPTO PPS query imported from local export",
        query,
      }],
      perSource: [{
        id: "uspto-pps",
        count: ranked.length,
        rawCount: parsed.records.length,
        accessMode: "ui-restricted",
        status: "human-imported",
        source_health: sourceHealth("uspto-pps"),
        parameters: {
          source_id: "uspto-pps",
          human_import: true,
          not_queried_by_apa: true,
          query_text_sha256: sha256Text(queryText || ""),
          import_file_sha256: importRecord.sha256,
          import_file_name: fileName,
          imported_at: importedAt,
        },
        notes: [
          "USPTO PPS is UI-only/human-handoff in APA; this row records a local human export import.",
          "Imported references are candidates and remain unverified until title, venue, canonical link, and relied-on passage checks are complete.",
        ],
      }],
      citationExpansion: { enabled: false, added_count: 0, seeds: [], relations: [] },
      humanImports: [importRecord],
    },
    importRecord,
  };
}

export function assertPpsExportSize(path) {
  const size = statSync(path).size;
  if (size > MAX_PPS_EXPORT_BYTES) {
    throw new Error(`PPS export is ${size} bytes; max supported import size is ${MAX_PPS_EXPORT_BYTES} bytes`);
  }
  return size;
}

export function parsePpsExport(text, { fileName = "" } = {}) {
  const raw = String(text || "").replace(/^\uFEFF/, "");
  const warnings = [];
  const trimmed = raw.trim();
  if (!trimmed) return { format: "empty", rows: [], records: [], warnings: ["empty export"] };

  if (/\.json$/i.test(fileName) || /^[\[{]/.test(trimmed)) {
    try {
      const json = JSON.parse(trimmed);
      const rows = findJsonRows(json);
      return rowsToParsed("json", rows, warnings);
    } catch (err) {
      warnings.push(`json parse failed: ${err.message}`);
    }
  }

  const firstLine = raw.split(/\r?\n/, 1)[0] || "";
  if (firstLine.includes(",") || /\.csv$/i.test(fileName)) {
    return rowsToParsed("csv", parseDelimited(raw, ","), warnings);
  }
  if (firstLine.includes("\t") || /\.tsv$/i.test(fileName)) {
    return rowsToParsed("tsv", parseDelimited(raw, "\t"), warnings);
  }
  return rowsToParsed("text", textRows(raw), warnings);
}

function rowsToParsed(format, rows, warnings = []) {
  const records = [];
  for (const [index, row] of rows.entries()) {
    const ref = normalizePpsRow(row, index + 1);
    if (!ref.docNumber && !ref.title) {
      warnings.push(`row ${index + 1}: skipped because no document number or title was found`);
      continue;
    }
    records.push(ref);
  }
  return { format, rows, records, warnings };
}

function normalizePpsRow(row, rank) {
  const byKey = normalizeKeys(row || {});
  const docNumber = normalizeDocNumber(firstValue(byKey, [
    "publicationnumber",
    "publicationno",
    "publication",
    "publicationid",
    "documentnumber",
    "documentid",
    "patentnumber",
    "patentno",
    "applicationpublicationnumber",
    "apppublicationnumber",
    "pubnumber",
    "id",
  ]));
  const title = oneLine(firstValue(byKey, ["title", "inventiontitle", "documenttitle"]));
  const abstract = oneLine(firstValue(byKey, ["abstract", "description", "snippet", "summary"]));
  const snippet = oneLine(firstValue(byKey, ["snippet", "abstract", "representativeclaim", "claim", "description"]));
  const url = oneLine(firstValue(byKey, ["url", "link", "canonicalurl", "documenturl"]));
  return {
    source: "uspto-pps",
    docNumber,
    title,
    abstract,
    assignee: oneLine(firstValue(byKey, ["assignee", "applicant", "owner", "organization"])),
    inventors: splitList(firstValue(byKey, ["inventors", "inventor"])),
    date: normalizeDate(firstValue(byKey, ["publicationdate", "pubdate", "patentdate", "issuedate", "date"])),
    cpc: splitList(firstValue(byKey, ["cpc", "cpcclassifications", "classifications"])),
    url,
    snippet: snippet || abstract || title,
    import_rank: rank,
    import_source: "human-pps-export",
  };
}

function findJsonRows(json) {
  if (Array.isArray(json)) return json;
  for (const key of ["records", "results", "documents", "rows", "data", "items"]) {
    if (Array.isArray(json?.[key])) return json[key];
  }
  return [json];
}

function parseDelimited(text, delimiter) {
  const rows = parseDelimitedRows(text, delimiter).filter((row) => row.some((cell) => String(cell || "").trim()));
  if (!rows.length) return [];
  const headers = rows[0].map((h, i) => oneLine(h) || `column_${i + 1}`);
  return rows.slice(1).map((cells) => {
    const row = {};
    headers.forEach((h, i) => { row[h] = cells[i] ?? ""; });
    return row;
  });
}

function parseDelimitedRows(text, delimiter) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

function textRows(text) {
  const seen = new Set();
  const rows = [];
  for (const match of String(text || "").matchAll(/\bUS[\s-]?(?:RE|PP|D)?\s?\d[\d,\s-]{3,}(?:[A-Z]\d?)?\b/gi)) {
    const docNumber = normalizeDocNumber(match[0]);
    const key = docNumber.toUpperCase();
    if (!docNumber || seen.has(key)) continue;
    seen.add(key);
    const line = lineAt(text, match.index || 0);
    rows.push({ "Document Number": docNumber, Title: line.replace(match[0], "").trim() });
  }
  return rows;
}

function scanImportedQuery(query) {
  const verdict = scanQueryAtSink(query);
  const hasFindings = verdict.blocked || verdict.needsConfirm;
  return {
    ...verdict,
    blocked: false,
    needsConfirm: hasFindings,
    ok: !hasFindings,
    import_only: true,
  };
}

function splitHumanQuery(queryText) {
  return String(queryText || "").split(/[^A-Za-z0-9_/-]+/).map((s) => s.trim()).filter(Boolean).slice(0, 60);
}

function normalizeKeys(row) {
  const out = {};
  for (const [key, value] of Object.entries(row || {})) {
    out[String(key).toLowerCase().replace(/[^a-z0-9]/g, "")] = value;
  }
  return out;
}

function firstValue(row, keys) {
  for (const key of keys) {
    const value = row[key];
    if (value != null && String(value).trim()) return value;
  }
  return "";
}

function normalizeDocNumber(value) {
  const raw = oneLine(value).replace(/,/g, "");
  if (!raw) return "";
  if (/^US/i.test(raw)) {
    const core = raw.replace(/^US[\s-]*/i, "").replace(/\s+/g, "-").replace(/-+/g, "-");
    return core ? `US-${core}` : "";
  }
  return raw;
}

function normalizeDate(value) {
  const raw = oneLine(value);
  if (!raw) return "";
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (iso) return raw;
  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(raw);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
  if (slash) return `${slash[3]}-${slash[1].padStart(2, "0")}-${slash[2].padStart(2, "0")}`;
  return raw;
}

function splitList(value) {
  return oneLine(value).split(/\s*(?:;|\||,)\s*/).map((s) => s.trim()).filter(Boolean);
}

function lineAt(text, index) {
  const before = String(text || "").lastIndexOf("\n", index);
  const after = String(text || "").indexOf("\n", index);
  return oneLine(String(text || "").slice(before < 0 ? 0 : before + 1, after < 0 ? undefined : after));
}

function oneLine(text) {
  return String(text == null ? "" : text).replace(/[\r\n\u2028\u2029]+/g, " ").trim();
}

function sha256Text(text) {
  return createHash("sha256").update(String(text || "")).digest("hex");
}
