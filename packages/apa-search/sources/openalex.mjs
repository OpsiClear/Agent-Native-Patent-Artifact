/**
 * Source: OpenAlex Works API (non-patent literature metadata).
 *
 * OpenAlex indexes scholarly works across journals, conferences, repositories, books, datasets, and
 * other research outputs. This source is candidate discovery only. Bibliographic fields, versions,
 * dates, open-access links, and relied-on passages still require human verification before reliance
 * or IDS use.
 */

import { guardedFetch, readJsonCapped } from "./http.mjs";

export const meta = {
  id: "openalex",
  label: "OpenAlex Works API",
  accessMode: "api",
  jurisdiction: "NPL",
  requiresKey: false,
  enabledByDefault: true,
};

const ENDPOINT = "https://api.openalex.org/works";

export async function search(query, opts = {}) {
  const size = Math.max(1, Math.min(100, Number(query.limit ?? 25) | 0));
  const terms = (query.keywords || []).map((k) => String(k).trim()).filter(Boolean).join(" ");
  const params = new URLSearchParams();
  params.set("search", terms || "patent prior art");
  params.set("per-page", String(size));
  params.set("select", [
    "id",
    "doi",
    "display_name",
    "title",
    "abstract_inverted_index",
    "publication_date",
    "publication_year",
    "authorships",
    "primary_location",
    "locations",
    "type",
    "cited_by_count",
    "concepts",
    "topics",
    "relevance_score",
  ].join(","));
  if (opts.mailto || process.env.OPENALEX_MAILTO) params.set("mailto", opts.mailto || process.env.OPENALEX_MAILTO);
  const url = `${ENDPOINT}?${params.toString()}`;
  const parameters = { source_id: meta.id, endpoint: ENDPOINT, method: "GET", query: Object.fromEntries(params.entries()) };

  let res;
  try {
    res = await guardedFetch(url, { headers: { Accept: "application/json" } }, opts);
  } catch (err) {
    return { records: [], rawCount: 0, parameters, notes: [`openalex: network error - ${messageOf(err)}`] };
  }
  if (!res.ok) return { records: [], rawCount: 0, parameters, notes: [`openalex: HTTP ${res.status} ${res.statusText || ""}`.trim()] };

  let json;
  try {
    json = await readJsonCapped(res, opts);
  } catch (err) {
    return { records: [], rawCount: 0, parameters, notes: [`openalex: failed to parse JSON - ${messageOf(err)}`] };
  }

  const items = Array.isArray(json?.results) ? json.results : [];
  const records = items.map(mapWork).filter((r) => r.docNumber || r.title);
  const rawCount = Number(json?.meta?.count ?? records.length);
  const notes = [
    "openalex: scholarly metadata candidate source only - verify full text, publication/version state, dates, venue, and relied-on passages before reliance",
  ];
  if (records.length < rawCount) notes.push(`openalex: returned ${records.length} of ${rawCount} total hits`);
  return { records, rawCount, parameters, notes };
}

function mapWork(w = {}) {
  const doi = normalizeDoi(w.doi || "");
  const title = oneLine(w.display_name || w.title || "");
  const abstract = abstractFromInvertedIndex(w.abstract_inverted_index);
  const sourceName = sourceDisplayName(w);
  const authors = Array.isArray(w.authorships)
    ? w.authorships.map((a) => oneLine(a?.author?.display_name || "")).filter(Boolean)
    : [];
  const concepts = [
    ...labelsFrom(w.topics),
    ...labelsFrom(w.concepts),
  ];
  const url = bestUrl(w, doi);
  const citationBits = [
    sourceName,
    w.type ? `type:${oneLine(w.type)}` : "",
    Number.isFinite(Number(w.cited_by_count)) ? `cited_by:${Number(w.cited_by_count)}` : "",
  ].filter(Boolean);
  return {
    source: meta.id,
    docNumber: doi ? `DOI:${doi}` : oneLine(w.id || url),
    title,
    abstract,
    assignee: citationBits.join("; ") || undefined,
    inventors: authors.length ? authors : undefined,
    date: oneLine(w.publication_date || "") || dateFromYear(w.publication_year),
    cpc: concepts.length ? concepts.slice(0, 8) : undefined,
    url,
    snippet: abstract || title,
  };
}

function abstractFromInvertedIndex(index) {
  if (!index || typeof index !== "object" || Array.isArray(index)) return "";
  const positioned = [];
  for (const [word, positions] of Object.entries(index)) {
    if (!Array.isArray(positions)) continue;
    for (const pos of positions) {
      const n = Number(pos);
      if (Number.isInteger(n) && n >= 0) positioned.push([n, word]);
    }
  }
  positioned.sort((a, b) => a[0] - b[0]);
  return oneLine(positioned.map(([, word]) => word).join(" "));
}

function sourceDisplayName(w) {
  return oneLine(
    w?.primary_location?.source?.display_name ||
    w?.primary_location?.source?.host_organization_name ||
    firstLocationSource(w?.locations),
  );
}

function firstLocationSource(locations) {
  if (!Array.isArray(locations)) return "";
  for (const loc of locations) {
    const name = loc?.source?.display_name || loc?.source?.host_organization_name;
    if (name) return name;
  }
  return "";
}

function bestUrl(w, doi) {
  return oneLine(
    w?.primary_location?.landing_page_url ||
    w?.primary_location?.pdf_url ||
    (doi ? `https://doi.org/${doi}` : "") ||
    w.id ||
    "",
  );
}

function labelsFrom(values) {
  if (!Array.isArray(values)) return [];
  return values.map((v) => oneLine(v?.display_name || v?.name || "")).filter(Boolean);
}

function normalizeDoi(value) {
  return oneLine(String(value || "").replace(/^https?:\/\/(dx\.)?doi\.org\//i, ""));
}

function dateFromYear(year) {
  const y = Number(year);
  return Number.isInteger(y) && y > 0 ? `${String(y).padStart(4, "0")}-01-01` : undefined;
}

function oneLine(text) {
  return String(text == null ? "" : text).replace(/[\r\n\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim();
}

function messageOf(err) {
  return err && err.message ? err.message : String(err);
}
