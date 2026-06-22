/**
 * apa-search orchestrator: build a query from a matter's claims, SCAN IT AT THE SINK (confidentiality)
 * before it egresses, run the enabled sources, then dedupe + rank. Node >=21, ESM, zero deps.
 * Fetched content is wrapped via envelope.mjs before any LLM sees it; closest-art selection is always
 * left to a human (this is not a clearance and never asserts "no anticipating art found").
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter, extractBindingBlocks, iterEntitySections, asArray } from "../../lib/apa-parse.mjs";
import { scan } from "../apa-redact/redact-engine.mjs";
import { loadSource, descriptor, listSources } from "./sources/index.mjs";
import { dedupeRefsDetailed, expandCitationNeighborhood, rankRefs } from "./lib/refs.mjs";

const STOP = new Set("a,an,the,of,for,and,or,to,with,in,on,by,is,configured,comprising,said,wherein,further,least,one,each,such".split(","));
const TERM_VARIANTS = new Map([
  ["linked document", ["web page", "hyperlink", "node", "link graph"]],
  ["linking document", ["backlink", "inbound link", "citing page"]],
  ["rank", ["score", "importance", "authority"]],
  ["ranking", ["scoring", "importance ordering", "authority ranking"]],
  ["key/value", ["key value", "key-value", "tuple"]],
  ["key value", ["key/value", "key-value", "tuple"]],
  ["mapreduce", ["map reduce", "mapper reducer", "distributed data processing"]],
  ["reduce", ["aggregation", "grouped intermediate values"]],
  ["out-of-distribution", ["ood", "distribution shift", "anomaly detection"]],
  ["feature vector", ["embedding", "latent representation"]],
  ["cluster", ["k-means", "centroid", "nearest cluster"]],
  ["threshold", ["distance threshold", "confidence threshold"]],
  ["classification model", ["classifier", "neural network model"]],
]);

/** Derive search keywords from a matter's claim limitations + title. */
export function buildQueryFromClaims(matterDir, { limit = 25 } = {}) {
  // The bounded parser throws on a malformed binding (tab indent / over-indent / too-deep). Degrade
  // LOUDLY (skip the unparseable source) rather than throw out of query-building - and note that the
  // egressing query is scanned at the sink (runSearch) regardless, so this never weakens confidentiality.
  let fm = {};
  try { fm = parseFrontmatter(safeRead(join(matterDir, "PATENT.md"))); } catch { /* malformed frontmatter -> no title keywords */ }
  const keywords = new Set();
  try {
    const claimsText = safeRead(join(matterDir, "logic", "claims.md"));
    for (const sec of iterEntitySections(claimsText)) {
      const b = extractBindingBlocks(sec.body)[0] || {};
      for (const lim of asArray(b.limitations).filter(Boolean)) if (lim.introduces) keywords.add(String(lim.introduces).toLowerCase());
    }
  } catch { /* malformed claims.md -> degrade to title-only keywords */ }
  for (const w of String(fm.title || "").toLowerCase().split(/[^a-z0-9-]+/)) {
    if (w.length > 3 && !STOP.has(w)) keywords.add(w);
  }
  return { keywords: [...keywords].filter((k) => k && !STOP.has(k)), cpc: [], limit };
}

export function queryToString(query) {
  return [...(query.keywords || []), ...(query.cpc || []), query.assignee || "", query.dateFrom || "", query.dateTo || ""].filter(Boolean).join(" ");
}

export function buildSearchPlan(query, { broad = false } = {}) {
  const base = normalizeQuery(query);
  if (!broad) return [{ id: "claim-keywords", label: "Claim-derived keywords", query: base }];

  const keywords = base.keywords || [];
  const compact = keywords.filter((k) => String(k).length <= 48);
  const phrases = keywords.filter((k) => /\s/.test(String(k))).slice(0, 12);
  const shortCore = compact.slice(0, 10);
  const coreTerms = compact.filter((k) => !/\s/.test(String(k)) && String(k).length >= 5).slice(0, 12);
  const plan = [
    { id: "claim-keywords", label: "All claim-derived keywords", query: base },
    { id: "core-technical", label: "Core technical terms", query: { ...base, keywords: (coreTerms.length ? coreTerms : shortCore).slice(0, 3), cpc: [] } },
    { id: "phrase-elements", label: "Multi-word claim elements", query: { ...base, keywords: (phrases.length ? phrases : shortCore).slice(-3), cpc: [] } },
    { id: "focused-pair", label: "Focused leading claim pair", query: { ...base, keywords: shortCore.slice(0, 2), cpc: [] } },
  ];
  const variants = expandTermVariants(keywords);
  if (variants.length) {
    plan.push({
      id: "term-variants",
      label: "Controlled technical term variants",
      query: { ...base, keywords: variants.slice(0, 10), cpc: [] },
    });
  }
  if ((base.cpc || []).length) plan.push({ id: "cpc-focused", label: "CPC-focused query", query: { ...base, keywords: shortCore.slice(0, 6), cpc: base.cpc } });
  if (base.assignee) plan.push({ id: "assignee-focused", label: "Assignee-focused query", query: { ...base, keywords: shortCore.slice(0, 6), assignee: base.assignee } });

  const seen = new Set();
  return plan.filter((step) => {
    const key = JSON.stringify({ keywords: step.query.keywords || [], cpc: step.query.cpc || [], assignee: step.query.assignee || "", dateFrom: step.query.dateFrom || "", dateTo: step.query.dateTo || "" });
    if (seen.has(key)) return false;
    seen.add(key);
    return (step.query.keywords || []).length || (step.query.cpc || []).length || step.query.assignee;
  });
}

/** Scan the exact query bytes that will egress. Returns a verdict; HIGH blocks, MEDIUM needs confirm. */
export function scanQueryAtSink(query) {
  // Scan a FULL serialization of the query - EVERY field (keywords, cpc, assignee, dateFrom, dateTo,
  // and any future filter a source serializes into the egress body), not a hand-rolled summary string
  // that omits fields. A secret hidden in e.g. dateFrom must still BLOCK before egress.
  const text = `${queryToString(query)}\n${JSON.stringify(query)}`;
  const findings = scan(text);
  const high = findings.filter((f) => f.tier === "HIGH");
  const medium = findings.filter((f) => f.tier === "MEDIUM");
  return {
    ok: high.length === 0 && medium.length === 0,
    blocked: high.length > 0,
    needsConfirm: high.length === 0 && medium.length > 0,
    high, medium, text,
  };
}

/**
 * Run a search. Scans the query first; if blocked (HIGH), does NOT egress. Otherwise queries each
 * enabled source, dedupes + ranks. Pass `confirmMedium: true` to proceed past MEDIUM findings.
 */
export async function runSearch({ query, sources, opts = {}, confirmMedium = false }) {
  const plan = buildSearchPlan(query, { broad: Boolean(opts.broadSearch) });
  const verdict = scanQueryAtSink({ ...query, search_plan: plan.map((p) => ({ id: p.id, query: p.query })) });
  if (verdict.blocked) return { blocked: true, verdict, ranked: [], perSource: [], searchPlan: planSummary(plan) };
  if (verdict.needsConfirm && !confirmMedium) return { needsConfirm: true, verdict, ranked: [], perSource: [], searchPlan: planSummary(plan) };

  const ids = sources && sources.length ? sources : listSources().filter((s) => s.enabledByDefault).map((s) => s.id);
  const perSource = [];
  let all = [];
  for (const step of plan) {
    for (const id of ids) {
      const d = descriptor(id);
      if (d && d.accessMode === "ui-restricted") {
        perSource.push({
          id,
          strategy_id: step.id,
          count: 0,
          rawCount: 0,
          skipped: true,
          accessMode: d.accessMode,
          status: d.status,
          parameters: { source_id: id, strategy_id: step.id, not_queried: true, reason: "ui-restricted-human-handoff" },
          notes: [`${id}: UI-only/ToS-restricted - human handoff, not queried`],
        });
        continue;
      }
      try {
        const mod = await loadSource(id);
        const { records, rawCount, notes, parameters } = await mod.search(step.query, opts);
        all = all.concat((records || []).map((r) => ({ ...r, searchStrategy: step.id })));
        perSource.push({
          id,
          strategy_id: step.id,
          count: (records || []).length,
          rawCount,
          accessMode: d?.accessMode || mod.meta?.accessMode || "unknown",
          status: d?.status || "implemented",
          parameters: { ...(parameters || { source_id: id, query: compactQueryForAudit(step.query) }), strategy_id: step.id, strategy_label: step.label },
          notes: notes || [],
        });
      } catch (e) {
        perSource.push({
          id,
          strategy_id: step.id,
          count: 0,
          rawCount: 0,
          accessMode: d?.accessMode || "unknown",
          status: d?.status || "error",
          parameters: { source_id: id, strategy_id: step.id, query: compactQueryForAudit(step.query) },
          error: e.message,
        });
      }
    }
  }
  const citationExpanded = opts.citationExpand ? expandCitationNeighborhood(all) : {
    records: all,
    expansion: { enabled: false, added_count: 0, seeds: [], relations: [] },
  };
  const dedupe = dedupeRefsDetailed(citationExpanded.records);
  const ranked = rankRefs(dedupe.deduped, query);
  return {
    blocked: false,
    verdict,
    rawRecords: citationExpanded.records,
    sourceRecords: all,
    citationExpansion: citationExpanded.expansion,
    deduped: dedupe.deduped,
    dedupe: { clusters: dedupe.clusters, excludedResults: dedupe.excludedResults },
    ranked,
    perSource,
    searchPlan: planSummary(plan),
    query,
  };
}

function safeRead(p) { try { return readFileSync(p, "utf8"); } catch { return ""; } }

function compactQueryForAudit(query) {
  return {
    keywords: query?.keywords || [],
    cpc: query?.cpc || [],
    assignee: query?.assignee || "",
    dateFrom: query?.dateFrom || "",
    dateTo: query?.dateTo || "",
    limit: query?.limit || null,
  };
}

function normalizeQuery(query = {}) {
  return {
    ...query,
    keywords: [...new Set((query.keywords || []).map((k) => String(k).trim().toLowerCase()).filter((k) => k && !STOP.has(k)))],
    cpc: [...new Set((query.cpc || []).map((c) => String(c).trim().toUpperCase()).filter(Boolean))],
    limit: query.limit || 25,
  };
}

function expandTermVariants(keywords = []) {
  const out = [];
  const seen = new Set(keywords.map((k) => String(k).toLowerCase()));
  for (const raw of keywords) {
    const term = String(raw || "").toLowerCase().trim();
    for (const [key, variants] of TERM_VARIANTS) {
      if (!term || !(term === key || term.includes(key) || key.includes(term))) continue;
      for (const variant of variants) {
        const normalized = String(variant).toLowerCase().trim();
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        out.push(normalized);
      }
    }
  }
  return out;
}

function planSummary(plan) {
  return plan.map((p) => ({
    id: p.id,
    label: p.label,
    query: compactQueryForAudit(p.query),
  }));
}
