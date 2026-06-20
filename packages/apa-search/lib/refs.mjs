/**
 * Shared prior-art record contract + helpers for apa-search. Node >=21, zero deps, ESM.
 *
 * @typedef {Object} Query
 * @property {string[]} keywords    free-text terms (from claim limitations / inventive concept)
 * @property {string[]} [cpc]       CPC class hints
 * @property {string}   [assignee]  assignee name filter
 * @property {string}   [dateFrom]  YYYY-MM-DD
 * @property {string}   [dateTo]    YYYY-MM-DD
 * @property {number}   [limit]     max results (default 25)
 *
 * @typedef {Object} NormalizedRef
 * @property {string} source        source id (e.g. "patentsview")
 * @property {string} docNumber     publication/patent number, normalized (e.g. "US-10000000-B2")
 * @property {string} title
 * @property {string} [abstract]
 * @property {string} [assignee]
 * @property {string[]} [inventors]
 * @property {string} [date]        YYYY-MM-DD
 * @property {string[]} [cpc]
 * @property {string} [url]         canonical link
 * @property {string} [snippet]     relied-on passage candidate (usually the abstract)
 *
 * A Source module exports `meta` and async `search(query, opts) -> { records, rawCount, notes }`:
 * @typedef {Object} SourceMeta
 * @property {string} id
 * @property {string} label
 * @property {"api"|"dataset"|"ui-restricted"} accessMode   sanctioned API/dataset vs ToS-restricted UI scraping
 * @property {string} jurisdiction
 * @property {boolean} requiresKey
 * @property {boolean} enabledByDefault   ui-restricted sources are false (human-handoff)
 */

/**
 * Canonical dedup KEY for a doc number: uppercase and drop every non-alphanumeric separator, so
 * "US 10,000,001 B2", "US-10000001-B2", and "US10000001B2" all collapse to "US10000001B2". Used only
 * as the dedup key; the displayed `docNumber` keeps its original formatting.
 */
export function normalizeDocNumber(s) {
  return String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * DISPLAY form of a US doc number: "US-<id>" with separators cleaned (e.g. "10905426" -> "US-10905426",
 * "D345393" -> "US-D345393"). Distinct from normalizeDocNumber, which is the separator-free dedup key.
 */
export function formatUsDocNumber(id) {
  const core = String(id || "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^US/, "");
  return core ? `US-${core}` : "";
}

/** Dedupe refs by normalized doc number, keeping the first (or the one with the most fields). */
export function dedupeRefs(refs) {
  return dedupeRefsDetailed(refs).deduped;
}

/**
 * Dedupe refs by normalized doc number and retain an audit trail.
 *
 * `clusters` records every duplicate group and why its winner was kept. `excludedResults` records
 * every non-winning duplicate as an explicit exclusion, so a dossier can answer what was omitted and
 * why.
 */
export function dedupeRefsDetailed(refs) {
  const by = new Map();
  const order = [];
  for (const [index, r] of (refs || []).entries()) {
    const key = normalizeDocNumber(r.docNumber);
    const safeKey = key || `NO-DOC-${index}`;
    if (!by.has(safeKey)) {
      by.set(safeKey, []);
      order.push(safeKey);
    }
    by.get(safeKey).push({ ref: r, inputIndex: index, fieldCount: fieldCount(r) });
  }

  const deduped = [];
  const clusters = [];
  const excludedResults = [];

  for (const key of order) {
    const members = by.get(key);
    const winner = [...members].sort((a, b) => b.fieldCount - a.fieldCount || a.inputIndex - b.inputIndex)[0];
    deduped.push(winner.ref);
    clusters.push({
      key,
      winner: refSummary(winner.ref, { input_index: winner.inputIndex, field_count: winner.fieldCount }),
      members: members.map((m) => refSummary(m.ref, { input_index: m.inputIndex, field_count: m.fieldCount })),
      rationale: members.length > 1
        ? "kept the record with the most populated fields; ties keep earliest source order"
        : "single record for normalized document number",
    });
    for (const m of members) {
      if (m === winner) continue;
      excludedResults.push({
        reason: "duplicate-doc-number",
        duplicate_of: winner.ref.docNumber || "",
        normalized_key: key,
        ...refSummary(m.ref, { input_index: m.inputIndex, field_count: m.fieldCount }),
      });
    }
  }

  return { deduped, clusters, excludedResults };
}

function fieldCount(r) { return Object.values(r).filter((v) => v != null && v !== "").length; }

export function refSummary(ref, extra = {}) {
  return {
    source_id: ref?.source || "unknown",
    doc_number: ref?.docNumber || "",
    title: ref?.title || "",
    url: ref?.url || "",
    date: ref?.date || "",
    ...extra,
  };
}

/** Rank refs by keyword overlap in title+abstract and CPC overlap with the query. Adds `.score`. */
export function rankRefs(refs, query) {
  const kw = (query.keywords || []).map((k) => k.toLowerCase()).filter(Boolean);
  const qcpc = new Set((query.cpc || []).map((c) => c.toUpperCase()));
  const scored = refs.map((r) => {
    const hay = `${r.title || ""} ${r.abstract || ""}`.toLowerCase();
    let score = 0;
    for (const k of kw) if (hay.includes(k)) score += 2;
    for (const c of r.cpc || []) if (qcpc.has(String(c).toUpperCase())) score += 1;
    return { ...r, score };
  });
  scored.sort((a, b) => b.score - a.score || (b.date || "").localeCompare(a.date || ""));
  return scored;
}

// --- Sanitizers for UNTRUSTED fetched content (title/abstract) ---------------------------------
// A fetched title/abstract is adversarial input (the project's own threat model). Embedding it raw
// lets an injected "### PA99 ..." heading or a ``` fence hijack the PA## section boundary - and
// writers.nextPaNumber() re-parses prior_art.md to compute the next id, so an injected heading would
// corrupt the counter. Collapse the title to one line; neutralize any abstract line that could open a
// markdown heading or code fence by prefixing a no-break space.
function oneLine(text) { return String(text == null ? "" : text).replace(/[\r\n\u2028\u2029]+/g, " ").trim(); }
function neutralizeBlock(text) {
  return String(text == null ? "" : text).replace(/\r\n?|[\u2028\u2029]/g, "\n").split("\n")
    .map((ln) => (/^\s*(#{1,6}(\s|$)|```)/.test(ln) ? " " + ln : ln)).join("\n");
}

/** Markdown PA## section + binding for logic/prior_art.md (protocol.md §3). verification starts UNVERIFIED. */
export function refToPaBlock(ref, paId, role = "prior-art-for-patentability") {
  // oneLine() EVERY untrusted field embedded in a single-line YAML scalar below: it collapses all four
  // line terminators (incl. U+2028/U+2029) to spaces so an injected ` ```binding` inside e.g.
  // relied_on_passage cannot survive JSON.stringify (which leaves U+2028/U+2029 literal) and then be
  // re-split into a column-0 fence by the parser's newline normalization. (See R2-6.)
  const safeTitle = oneLine(ref.title);
  const docNumber = oneLine(ref.docNumber);
  const cite = `${docNumber}${safeTitle ? ` - ${safeTitle}` : ""}${ref.assignee ? ` (${oneLine(ref.assignee)})` : ""}${ref.date ? `, ${oneLine(ref.date)}` : ""}`;
  return [
    `### ${paId} - ${safeTitle || docNumber}`,
    "",
    `${neutralizeBlock(ref.abstract) || "(abstract not retrieved)"}`,
    "",
    "```binding",
    `role: ${role}`,
    `citation: ${JSON.stringify(cite)}`,
    `relied_on_passage: ${JSON.stringify(oneLine(ref.snippet || ref.abstract || ""))}`,
    `discloses: []          # FILLED BY HARDENED-VERIFICATION + human review - do not assert beyond the text`,
    `lacks: []`,
    `source: ${JSON.stringify(oneLine(ref.source))}`,
    `url: ${JSON.stringify(oneLine(ref.url || ""))}`,
    `verification: { verified: false, confidence: low }   # MUST be human-verified before relied on or listed on an IDS`,
    `provenance: ai-executed`,
    "```",
    "",
  ].join("\n");
}

/** Raw evidence record markdown for evidence/prior_art/<paId>.md. */
export function refToEvidence(ref, paId) {
  return [
    `# ${paId} - ${oneLine(ref.title) || oneLine(ref.docNumber)} (raw record)`,
    "",
    `**Doc number:** ${ref.docNumber}`,
    `**Title:** ${ref.title || "(none)"}`,
    `**Assignee:** ${ref.assignee || "(none)"}`,
    `**Inventors:** ${(ref.inventors || []).join("; ") || "(none)"}`,
    `**Date:** ${ref.date || "(none)"}`,
    `**CPC:** ${(ref.cpc || []).join(", ") || "(none)"}`,
    `**Source:** ${ref.source}`,
    `**Canonical link:** ${ref.url || "(none)"}`,
    "",
    "## Abstract / relied-on passage",
    "> " + (ref.snippet || ref.abstract || "(not retrieved)").replace(/\n/g, "\n> "),
    "",
    "## Verification (REQUIRED before relied on / listed on an IDS)",
    "- verified: **false** - a human must confirm the title/venue/link and what it actually discloses vs lacks.",
    "- This record was retrieved by an automated search; it is a candidate, not a vetted reference.",
    "",
  ].join("\n");
}
