/**
 * Offline benchmark fixture source.
 *
 * This source is only for deterministic scorer cases. It searches a caller-provided public fixture
 * corpus through the same apa-search orchestration path, with no network access and no claim that the
 * corpus is complete prior art.
 */

export const meta = {
  id: "fixture",
  label: "Offline benchmark fixture source",
  accessMode: "api",
  jurisdiction: "benchmark",
  requiresKey: false,
  enabledByDefault: false,
};

export async function search(query, opts = {}) {
  const records = Array.isArray(opts.fixtureRecords) ? opts.fixtureRecords : [];
  const keywords = (query.keywords || []).map((k) => String(k).toLowerCase().trim()).filter(Boolean);
  const cpc = new Set((query.cpc || []).map((k) => String(k).toUpperCase().trim()).filter(Boolean));
  const requestedLimit = query.limit ?? (records.length || 25);
  const limit = Math.max(1, Number(requestedLimit) | 0);

  const scored = records.map((record, inputIndex) => ({
    record: normalizeRecord(record),
    inputIndex,
  })).map((entry) => ({
    ...entry,
    fixtureScore: fixtureOverlap(entry.record, keywords, cpc),
  }));

  const matched = scored
    .filter((entry) => keywords.length === 0 || entry.fixtureScore > 0)
    .sort((a, b) => b.fixtureScore - a.fixtureScore || a.inputIndex - b.inputIndex)
    .slice(0, limit)
    .map((entry) => ({
      ...entry.record,
      fixture_match_score: entry.fixtureScore,
    }));

  return {
    records: matched,
    rawCount: matched.length,
    parameters: {
      source_id: meta.id,
      mode: "offline-benchmark-fixture",
      corpus_records: records.length,
      query: {
        keywords: query.keywords || [],
        cpc: query.cpc || [],
        limit,
      },
    },
    notes: ["fixture source: deterministic benchmark corpus, no network, not prior-art evidence"],
  };
}

function normalizeRecord(record = {}) {
  return {
    source: record.source || meta.id,
    docNumber: record.docNumber || record.doc_number || "",
    title: record.title || "",
    abstract: record.abstract || "",
    assignee: record.assignee || undefined,
    inventors: record.inventors || undefined,
    date: record.date || undefined,
    cpc: record.cpc || undefined,
    url: record.url || "",
    snippet: record.snippet || record.abstract || "",
    backwardCitations: record.backwardCitations || record.backward_citations || record.citations || undefined,
    forwardCitations: record.forwardCitations || record.forward_citations || record.cited_by || undefined,
    familyMembers: record.familyMembers || record.family_members || undefined,
  };
}

function fixtureOverlap(record, keywords, cpc) {
  const hay = `${record.title || ""} ${record.abstract || ""} ${record.snippet || ""}`.toLowerCase();
  let score = 0;
  for (const keyword of keywords) {
    if (hay.includes(keyword)) score += keyword.includes(" ") ? 3 : 1;
  }
  for (const code of record.cpc || []) {
    const normalized = String(code).toUpperCase();
    if (cpc.has(normalized)) score += 2;
  }
  return score;
}
