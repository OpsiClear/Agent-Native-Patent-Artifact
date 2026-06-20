/**
 * Source: PatentsView PatentSearch API (US patents).
 *
 * CONFIRMED LIVE API (verified via WebFetch/WebSearch on 2026-06-15):
 *   - Endpoint:  https://search.patentsview.org/api/v1/patent/
 *   - Method:    POST with a JSON body { q, f, o, s } (GET with q=<urlencoded JSON> also works;
 *                docs recommend POST once the query exceeds ~2000 chars, so we always POST).
 *   - Auth:      REQUIRED. Free key via the PatentsView Service Desk (patentsview.org), sent in the
 *                `X-Api-Key` request header. The legacy api.patentsview.org host returns 410 since
 *                May 2025 and is intentionally NOT used here.
 *   - Query language (the `q` criteria object):
 *       logical:    _and, _or, _not        (arrays of sub-criteria)
 *       text:       _text_any, _text_all, _text_phrase   { field: "terms" }
 *       comparison: _gte, _lte, _gt, _lt, _eq            { field: value }
 *   - Confirmed field names (new API; these differ from the legacy API):
 *       patent_id                          -> patent number, e.g. "10905426" or "D345393"
 *       patent_title
 *       patent_abstract
 *       patent_date                        -> grant date, "YYYY-MM-DD"
 *       assignees.assignee_organization    -> nested array
 *       inventors.inventor_name_first
 *       inventors.inventor_name_last       -> nested array
 *       cpc_current.cpc_subclass_id        -> e.g. "A01G"
 *       cpc_current.cpc_group_id           -> e.g. "A01G27/00"
 *   - Response shape: { error: false, count: N, total_hits: M, patents: [ {...} ] }
 *
 * Docs: https://search.patentsview.org/docs/  (Search API Reference / Endpoint Dictionary)
 *
 * Conforms to the Source contract in ../lib/refs.mjs:
 *   export const meta (SourceMeta)
 *   export async function search(query, opts) -> { records: NormalizedRef[], rawCount, notes }
 *
 * Node >= 21, ESM, zero npm deps (uses global fetch).
 */

import { formatUsDocNumber } from "../lib/refs.mjs";

const ENDPOINT = "https://search.patentsview.org/api/v1/patent/";

/** @type {import("../lib/refs.mjs").SourceMeta} */
export const meta = {
  id: "patentsview",
  label: "PatentsView PatentSearch API",
  accessMode: "api",
  jurisdiction: "US",
  requiresKey: true,
  enabledByDefault: true,
};

// Fields we ask the API to return. Nested groups (assignees/inventors/cpc_current) come back as arrays.
const RETURN_FIELDS = [
  "patent_id",
  "patent_title",
  "patent_abstract",
  "patent_date",
  "assignees.assignee_organization",
  "inventors.inventor_name_first",
  "inventors.inventor_name_last",
  "cpc_current.cpc_subclass_id",
  "cpc_current.cpc_group_id",
];

/**
 * Build the `q` criteria object from a Query.
 * Text terms match either patent_title OR patent_abstract (each term-set via _text_any), AND'd with
 * any structured filters (CPC subclass, assignee org, date range).
 * @param {import("../lib/refs.mjs").Query} query
 */
function buildCriteria(query) {
  const and = [];

  const keywords = (query.keywords || []).map((k) => String(k).trim()).filter(Boolean);
  if (keywords.length) {
    // _text_any matches docs containing ANY of the space-separated terms; we OR title vs abstract so a
    // hit in either field counts. Joining keywords into one term-string keeps the criteria compact.
    const terms = keywords.join(" ");
    and.push({
      _or: [
        { _text_any: { patent_title: terms } },
        { _text_any: { patent_abstract: terms } },
      ],
    });
  }

  const cpc = (query.cpc || []).map((c) => String(c).trim().toUpperCase()).filter(Boolean);
  if (cpc.length) {
    // CPC hints may be a subclass ("A01G") or a full group ("A01G27/00"). Match either field; OR within.
    and.push({
      _or: cpc.flatMap((c) =>
        c.includes("/")
          ? [{ _eq: { "cpc_current.cpc_group_id": c } }]
          : [{ _eq: { "cpc_current.cpc_subclass_id": c } }]
      ),
    });
  }

  if (query.assignee && String(query.assignee).trim()) {
    and.push({ _text_phrase: { "assignees.assignee_organization": String(query.assignee).trim() } });
  }

  if (query.dateFrom) and.push({ _gte: { patent_date: String(query.dateFrom) } });
  if (query.dateTo) and.push({ _lte: { patent_date: String(query.dateTo) } });

  // If nothing was supplied, fall back to a trivially-true criterion so the request is still valid.
  if (!and.length) return { _gte: { patent_date: "1976-01-01" } };
  if (and.length === 1) return and[0];
  return { _and: and };
}

/**
 * Normalize a PatentsView patent_id to a "US-#######-Kind" style docNumber.
 * Design patents start with "D", plant with "PP", reissue with "RE", etc.; we surface those kinds.
 * Utility patents are plain digits -> kind defaults to "A" (publication) is wrong for grants, so we
 * leave the kind blank for plain utility grants rather than guess B1/B2. normalizeDocNumber() then
 * collapses spacing/commas. Result examples: "US-10905426", "US-D345393".
 * @param {string} rawId
 */
function toDocNumber(rawId) {
  const id = String(rawId || "").trim();
  if (!id) return "";
  // formatUsDocNumber yields the "US-<id>" display form (e.g. "US-10905426", "US-D345393").
  // Dedup uses the separator-free normalizeDocNumber key, so the display hyphen is harmless.
  return formatUsDocNumber(id);
}

/** Build the canonical Google Patents URL for a US patent id. */
function googlePatentsUrl(rawId) {
  const id = String(rawId || "").trim().toUpperCase().replace(/[\s,]/g, "");
  return id ? `https://patents.google.com/patent/US${id}` : "";
}

/**
 * Map one raw PatentSearch `patents[]` entry to a NormalizedRef.
 * @param {any} p
 * @returns {import("../lib/refs.mjs").NormalizedRef}
 */
function mapPatent(p) {
  const assignees = Array.isArray(p.assignees) ? p.assignees : [];
  const inventors = Array.isArray(p.inventors) ? p.inventors : [];
  const cpc = Array.isArray(p.cpc_current) ? p.cpc_current : [];

  const assignee = assignees
    .map((a) => a && a.assignee_organization)
    .filter(Boolean)[0];

  const inventorNames = inventors
    .map((i) => [i && i.inventor_name_first, i && i.inventor_name_last].filter(Boolean).join(" ").trim())
    .filter(Boolean);

  // Prefer full group ids (e.g. "A01G27/00"); fall back to subclass ids ("A01G"). De-dupe, keep order.
  const cpcCodes = [
    ...new Set(
      cpc
        .map((c) => (c && (c.cpc_group_id || c.cpc_subclass_id)) || "")
        .filter(Boolean)
    ),
  ];

  const abstract = p.patent_abstract || undefined;

  return {
    source: meta.id,
    docNumber: toDocNumber(p.patent_id),
    title: p.patent_title || "",
    abstract,
    assignee: assignee || undefined,
    inventors: inventorNames.length ? inventorNames : undefined,
    date: p.patent_date || undefined,
    cpc: cpcCodes.length ? cpcCodes : undefined,
    url: googlePatentsUrl(p.patent_id),
    snippet: abstract,
  };
}

/**
 * Search the PatentsView PatentSearch API.
 * @param {import("../lib/refs.mjs").Query} query
 * @param {{ apiKey?: string, fetch?: typeof fetch, signal?: AbortSignal }} [opts]
 * @returns {Promise<{ records: import("../lib/refs.mjs").NormalizedRef[], rawCount: number, notes: string[] }>}
 */
export async function search(query, opts = {}) {
  const apiKey = opts.apiKey ?? process.env.PATENTSVIEW_API_KEY;
  if (!apiKey) {
    // The missing-key case is the ONLY condition under which we throw (per contract).
    throw new Error(
      "PatentsView PatentSearch API key required - get a free key at patentsview.org and set PATENTSVIEW_API_KEY"
    );
  }

  const notes = [];
  const size = Math.max(1, Number(query.limit ?? 25) | 0);
  const body = {
    q: buildCriteria(query),
    f: RETURN_FIELDS,
    o: { size },
    s: [{ patent_date: "desc" }],
  };

  const doFetch = opts.fetch || globalThis.fetch;
  if (typeof doFetch !== "function") {
    return { records: [], rawCount: 0, notes: ["patentsview: global fetch unavailable (need Node >=21)"] };
  }

  let res;
  try {
    res = await doFetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify(body),
      signal: opts.signal,
    });
  } catch (err) {
    return { records: [], rawCount: 0, notes: [`patentsview: network error - ${err && err.message ? err.message : err}`] };
  }

  if (!res.ok) {
    // Surface common cases (auth, rate limit) without throwing.
    if (res.status === 429) {
      notes.push("patentsview: rate limited (HTTP 429) - the API allows ~45 requests/minute; back off and retry");
    } else if (res.status === 403 || res.status === 401) {
      notes.push(`patentsview: auth failed (HTTP ${res.status}) - check PATENTSVIEW_API_KEY / X-Api-Key`);
    } else {
      notes.push(`patentsview: HTTP ${res.status} ${res.statusText || ""}`.trim());
    }
    return { records: [], rawCount: 0, notes };
  }

  let json;
  try {
    json = await res.json();
  } catch (err) {
    return { records: [], rawCount: 0, notes: [`patentsview: failed to parse JSON - ${err && err.message ? err.message : err}`] };
  }

  if (json && json.error) {
    return { records: [], rawCount: 0, notes: [`patentsview: API reported error - ${JSON.stringify(json.error)}`] };
  }

  const patents = Array.isArray(json && json.patents) ? json.patents : [];
  const records = patents.map(mapPatent).filter((r) => r.docNumber);

  // total_hits is the full match count; count is what was returned in this page.
  const rawCount = Number(
    (json && (json.total_hits ?? json.count)) ?? records.length
  );

  // Politeness note: PatentSearch is rate-limited (~45 req/min). Callers fanning out should throttle.
  notes.push("patentsview: be polite - PatentSearch API is rate-limited (~45 requests/minute)");
  if (records.length < rawCount) {
    notes.push(`patentsview: returned ${records.length} of ${rawCount} total hits (raise query.limit for more)`);
  }

  return { records, rawCount, notes };
}
