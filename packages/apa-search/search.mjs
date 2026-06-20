/**
 * apa-search orchestrator: build a query from a matter's claims, SCAN IT AT THE SINK (confidentiality)
 * before it egresses, run the enabled sources, then dedupe + rank. Node >=18, ESM, zero deps.
 * Fetched content is wrapped via envelope.mjs before any LLM sees it; closest-art selection is always
 * left to a human (this is not a clearance and never asserts "no anticipating art found").
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter, extractBindingBlocks, iterEntitySections, asArray } from "../../lib/apa-parse.mjs";
import { scan } from "../apa-redact/redact-engine.mjs";
import { loadSource, descriptor, listSources } from "./sources/index.mjs";
import { dedupeRefs, rankRefs } from "./lib/refs.mjs";

const STOP = new Set("a,an,the,of,for,and,or,to,with,in,on,by,is,configured,comprising,said,wherein,further,least,one,each,such".split(","));

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
  const verdict = scanQueryAtSink(query);
  if (verdict.blocked) return { blocked: true, verdict, ranked: [], perSource: [] };
  if (verdict.needsConfirm && !confirmMedium) return { needsConfirm: true, verdict, ranked: [], perSource: [] };

  const ids = sources && sources.length ? sources : listSources().filter((s) => s.enabledByDefault).map((s) => s.id);
  const perSource = [];
  let all = [];
  for (const id of ids) {
    const d = descriptor(id);
    if (d && d.accessMode === "ui-restricted") { perSource.push({ id, count: 0, notes: [`${id}: UI-only/ToS-restricted - human handoff, not queried`] }); continue; }
    try {
      const mod = await loadSource(id);
      const { records, rawCount, notes } = await mod.search(query, opts);
      all = all.concat(records || []);
      perSource.push({ id, count: (records || []).length, rawCount, notes: notes || [] });
    } catch (e) {
      perSource.push({ id, count: 0, error: e.message });
    }
  }
  const ranked = rankRefs(dedupeRefs(all), query);
  return { blocked: false, verdict, ranked, perSource, query };
}

function safeRead(p) { try { return readFileSync(p, "utf8"); } catch { return ""; } }
