/**
 * Source: Crossref Works API (non-patent literature metadata).
 *
 * This is candidate discovery only. Crossref metadata is not a substitute for publisher/full-text
 * verification, page/paragraph citation, or IDS materiality review.
 */

import { guardedFetch, readJsonCapped } from "./http.mjs";
import { effectiveRatePolicy, rateFetchOptions } from "./policies.mjs";

export const meta = {
  id: "crossref",
  label: "Crossref Works API",
  accessMode: "api",
  jurisdiction: "NPL",
  requiresKey: false,
  enabledByDefault: true,
};

const ENDPOINT = "https://api.crossref.org/works";

export async function search(query, opts = {}) {
  const size = Math.max(1, Math.min(100, Number(query.limit ?? 25) | 0));
  const terms = (query.keywords || []).map((k) => String(k).trim()).filter(Boolean).join(" ");
  const params = new URLSearchParams();
  params.set("query", terms || "patent prior art");
  params.set("rows", String(size));
  params.set("select", "DOI,title,abstract,published-print,published-online,issued,container-title,publisher,URL,author,subject");
  if (opts.mailto || process.env.CROSSREF_MAILTO) params.set("mailto", opts.mailto || process.env.CROSSREF_MAILTO);
  const url = `${ENDPOINT}?${params.toString()}`;
  const parameters = {
    source_id: meta.id,
    endpoint: ENDPOINT,
    method: "GET",
    query: Object.fromEntries(params.entries()),
    rate_policy: effectiveRatePolicy(meta.id, opts),
  };
  let res;
  try {
    res = await guardedFetch(url, { headers: { Accept: "application/json" } }, { ...opts, ...rateFetchOptions(meta.id, opts) });
  } catch (err) {
    return { records: [], rawCount: 0, parameters, notes: [`crossref: network error - ${messageOf(err)}`] };
  }
  if (!res.ok) return { records: [], rawCount: 0, parameters, notes: [`crossref: HTTP ${res.status} ${res.statusText || ""}`.trim()] };

  let json;
  try {
    json = await readJsonCapped(res, opts);
  } catch (err) {
    return { records: [], rawCount: 0, parameters, notes: [`crossref: failed to parse JSON - ${messageOf(err)}`] };
  }
  const items = Array.isArray(json?.message?.items) ? json.message.items : [];
  const records = items.map(mapWork).filter((r) => r.docNumber || r.title);
  const rawCount = Number(json?.message?.["total-results"] ?? records.length);
  const notes = [
    "crossref: metadata candidate source only - verify full text, dates, venue, and relied-on passages before reliance",
  ];
  if (records.length < rawCount) notes.push(`crossref: returned ${records.length} of ${rawCount} total hits`);
  return { records, rawCount, parameters, notes };
}

function mapWork(w) {
  const doi = oneLine(w.DOI || "");
  const title = first(w.title);
  const container = first(w["container-title"]);
  const abstract = stripTags(w.abstract || "");
  const date = dateParts(w["published-print"] || w["published-online"] || w.issued);
  const authors = Array.isArray(w.author)
    ? w.author.map((a) => [a.given, a.family].filter(Boolean).join(" ").trim()).filter(Boolean)
    : [];
  const url = oneLine(w.URL || (doi ? `https://doi.org/${doi}` : ""));
  const citationBits = [container, w.publisher].map(oneLine).filter(Boolean);
  return {
    source: meta.id,
    docNumber: doi ? `DOI:${doi}` : url,
    title,
    abstract,
    assignee: citationBits.join("; ") || undefined,
    inventors: authors.length ? authors : undefined,
    date,
    cpc: Array.isArray(w.subject) ? w.subject.map(oneLine).filter(Boolean).slice(0, 6) : undefined,
    url,
    snippet: abstract || title,
  };
}

function first(v) { return Array.isArray(v) ? oneLine(v[0] || "") : oneLine(v || ""); }
function oneLine(text) { return String(text == null ? "" : text).replace(/[\r\n\u2028\u2029]+/g, " ").trim(); }
function stripTags(text) { return oneLine(String(text || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim(); }
function messageOf(err) { return err && err.message ? err.message : String(err); }

function dateParts(obj) {
  const parts = Array.isArray(obj?.["date-parts"]?.[0]) ? obj["date-parts"][0] : [];
  if (!parts.length) return undefined;
  const [y, m = 1, d = 1] = parts;
  if (!y) return undefined;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
