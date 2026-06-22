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
 * @property {NormalizedRef[]} [backwardCitations] cited-by-this-reference candidates, if a source supplies them
 * @property {NormalizedRef[]} [forwardCitations] citing-this-reference candidates, if a source supplies them
 * @property {NormalizedRef[]} [familyMembers] patent-family candidates, if a source supplies them
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

export function expandCitationNeighborhood(refs = []) {
  const records = [...(refs || [])];
  const expansion = {
    enabled: true,
    seeds: [],
    added_count: 0,
    relations: [],
  };
  const relations = [
    ["backward", ["backwardCitations", "backward_citations", "citations"]],
    ["forward", ["forwardCitations", "forward_citations", "cited_by"]],
    ["family", ["familyMembers", "family_members"]],
  ];
  for (const seed of refs || []) {
    const seedSummary = {
      seed_doc_number: seed?.docNumber || "",
      seed_source_id: seed?.source || "",
      added: [],
    };
    for (const [relation, keys] of relations) {
      const children = keys.flatMap((key) => Array.isArray(seed?.[key]) ? seed[key] : []);
      for (const child of children) {
        const normalized = normalizeCitationChild(child, seed, relation);
        if (!normalized.docNumber && !normalized.title) continue;
        records.push(normalized);
        seedSummary.added.push({
          relation,
          doc_number: normalized.docNumber || "",
          title: normalized.title || "",
        });
        expansion.relations.push({
          relation,
          seed_doc_number: seed?.docNumber || "",
          candidate_doc_number: normalized.docNumber || "",
        });
      }
    }
    if (seedSummary.added.length) expansion.seeds.push(seedSummary);
  }
  expansion.added_count = records.length - (refs || []).length;
  return { records, expansion };
}

function normalizeCitationChild(child = {}, seed = {}, relation = "") {
  return {
    source: child.source || `${seed?.source || "unknown"}-citation`,
    docNumber: child.docNumber || child.doc_number || "",
    title: child.title || "",
    abstract: child.abstract || child.snippet || "",
    assignee: child.assignee || undefined,
    inventors: child.inventors || undefined,
    date: child.date || undefined,
    cpc: child.cpc || undefined,
    url: child.url || "",
    snippet: child.snippet || child.abstract || child.title || "",
    citation_expansion: {
      relation,
      seed_doc_number: seed?.docNumber || "",
      seed_source_id: seed?.source || "",
    },
  };
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

/** Rank refs by field-aware keyword overlap and CPC overlap with the query. Adds `.score` and `.rank_explanation`. */
export function rankRefs(refs, query) {
  const kw = (query.keywords || []).map((k) => String(k).toLowerCase().trim()).filter(Boolean);
  const qcpc = new Set((query.cpc || []).map((c) => c.toUpperCase()));
  const scored = refs.map((r) => {
    const title = String(r.title || "").toLowerCase();
    const abstract = String(r.abstract || "").toLowerCase();
    const snippet = String(r.snippet || "").toLowerCase();
    let score = 0;
    const matchedKeywords = [];
    const fieldHits = {};
    const scoreBreakdown = [];
    for (const [keywordIndex, k] of kw.entries()) {
      const fields = [];
      if (title.includes(k)) {
        score += 5;
        fields.push("title");
        scoreBreakdown.push({ reason: "keyword-title", term: k, points: 5 });
      }
      if (snippet.includes(k)) {
        score += 4;
        fields.push("snippet");
        scoreBreakdown.push({ reason: "keyword-snippet", term: k, points: 4 });
      }
      if (abstract.includes(k)) {
        score += 3;
        fields.push("abstract");
        scoreBreakdown.push({ reason: "keyword-abstract", term: k, points: 3 });
      }
      if (/\s/.test(k) && (title.includes(k) || abstract.includes(k) || snippet.includes(k))) {
        score += 2;
        scoreBreakdown.push({ reason: "exact-phrase", term: k, points: 2 });
      }
      if (fields.length) {
        if (keywordIndex === 0) {
          score += 8;
          scoreBreakdown.push({ reason: "primary-keyword", term: k, points: 8 });
        } else if (keywordIndex === 1) {
          score += 3;
          scoreBreakdown.push({ reason: "secondary-keyword", term: k, points: 3 });
        }
        matchedKeywords.push(k);
        fieldHits[k] = [...new Set(fields)];
      }
    }
    const matchedCpc = [];
    for (const c of r.cpc || []) {
      const normalized = String(c).toUpperCase();
      if (qcpc.has(normalized)) {
        score += 2;
        matchedCpc.push(normalized);
        scoreBreakdown.push({ reason: "cpc-exact", term: normalized, points: 2 });
      } else if ([...qcpc].some((q) => normalized.startsWith(q) || q.startsWith(normalized))) {
        score += 1;
        matchedCpc.push(normalized);
        scoreBreakdown.push({ reason: "cpc-prefix", term: normalized, points: 1 });
      }
    }
    return {
      ...r,
      score,
      rank_explanation: {
        matched_keywords: [...new Set(matchedKeywords)],
        matched_cpc: [...new Set(matchedCpc)],
        field_hits: fieldHits,
        score_breakdown: scoreBreakdown,
        rationale: scoreBreakdown.length
          ? "ranked by field-weighted keyword/CPC overlap; title and relied-on snippets carry the strongest weight"
          : "no keyword/CPC overlap found; date tie-break may affect order",
      },
    };
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
