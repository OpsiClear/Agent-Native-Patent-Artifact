/**
 * Source: arXiv API (preprint/non-patent literature metadata).
 *
 * This source returns candidate records only. Version dates, peer-reviewed publication status, and
 * exact relied-on passages remain human-verification tasks.
 */

import { guardedFetch, readTextCapped } from "./http.mjs";

export const meta = {
  id: "arxiv",
  label: "arXiv API",
  accessMode: "api",
  jurisdiction: "NPL",
  requiresKey: false,
  enabledByDefault: true,
};

const ENDPOINT = "https://export.arxiv.org/api/query";

export async function search(query, opts = {}) {
  const size = Math.max(1, Math.min(100, Number(query.limit ?? 25) | 0));
  const terms = (query.keywords || []).map((k) => String(k).trim()).filter(Boolean);
  const searchQuery = terms.length
    ? terms.slice(0, 8).map((t) => `all:${quoteArxiv(t)}`).join("+AND+")
    : "all:patent+AND+all:prior+AND+all:art";
  const params = new URLSearchParams();
  params.set("search_query", searchQuery);
  params.set("start", "0");
  params.set("max_results", String(size));
  params.set("sortBy", "submittedDate");
  params.set("sortOrder", "descending");
  const url = `${ENDPOINT}?${params.toString()}`;
  const parameters = { source_id: meta.id, endpoint: ENDPOINT, method: "GET", query: Object.fromEntries(params.entries()) };
  let res;
  try {
    res = await guardedFetch(url, { headers: { Accept: "application/atom+xml" } }, opts);
  } catch (err) {
    return { records: [], rawCount: 0, parameters, notes: [`arxiv: network error - ${messageOf(err)}`] };
  }
  if (!res.ok) return { records: [], rawCount: 0, parameters, notes: [`arxiv: HTTP ${res.status} ${res.statusText || ""}`.trim()] };

  let xml;
  try {
    xml = await readTextCapped(res, opts);
  } catch (err) {
    return { records: [], rawCount: 0, parameters, notes: [`arxiv: failed to read XML - ${messageOf(err)}`] };
  }

  const entries = [...String(xml || "").matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/g)].map((m) => m[1]);
  const total = Number((String(xml).match(/<opensearch:totalResults[^>]*>(\d+)<\/opensearch:totalResults>/) || [])[1] || entries.length);
  const records = entries.map(mapEntry).filter((r) => r.docNumber || r.title);
  const notes = [
    "arxiv: preprint metadata candidate source only - verify version, publication date/status, and relied-on passages before reliance",
  ];
  if (records.length < total) notes.push(`arxiv: returned ${records.length} of ${total} total hits`);
  return { records, rawCount: total, parameters, notes };
}

function mapEntry(entry) {
  const idUrl = text(entry, "id");
  const arxivId = arxivIdOf(idUrl);
  const title = text(entry, "title");
  const abstract = text(entry, "summary");
  const date = dateOnly(text(entry, "published") || text(entry, "updated"));
  const authors = [...entry.matchAll(/<author\b[^>]*>[\s\S]*?<name\b[^>]*>([\s\S]*?)<\/name>[\s\S]*?<\/author>/g)]
    .map((m) => decodeXml(m[1])).map(oneLine).filter(Boolean);
  const categories = [...entry.matchAll(/<category\b[^>]*term="([^"]+)"/g)].map((m) => decodeXml(m[1])).filter(Boolean);
  const pdf = (entry.match(/<link\b[^>]*title="pdf"[^>]*href="([^"]+)"/) || [])[1] || "";
  return {
    source: meta.id,
    docNumber: arxivId ? `arXiv:${arxivId}` : idUrl,
    title,
    abstract,
    inventors: authors.length ? authors : undefined,
    date,
    cpc: categories.length ? categories : undefined,
    url: pdf || idUrl,
    snippet: abstract || title,
  };
}

function quoteArxiv(term) {
  const clean = String(term || "").replace(/["()]/g, " ").trim();
  return clean.includes(" ") ? `"${clean}"` : clean;
}
function text(xml, tag) {
  const m = String(xml || "").match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return m ? oneLine(decodeXml(m[1])) : "";
}
function decodeXml(s) {
  return String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}
function oneLine(text) { return String(text == null ? "" : text).replace(/[\r\n\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim(); }
function arxivIdOf(url) { return (String(url || "").match(/\/abs\/([^/?#]+)/) || [])[1] || ""; }
function dateOnly(s) { return String(s || "").slice(0, 10) || undefined; }
function messageOf(err) { return err && err.message ? err.message : String(err); }
