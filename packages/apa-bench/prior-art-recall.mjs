import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runSearch } from "../apa-search/search.mjs";
import { normalizeDocNumber } from "../apa-search/lib/refs.mjs";
import { buildSearchDossier } from "../apa-search/writers.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DEFAULT_CASE = "public-software-prior-art-recall";
const DEFAULT_THRESHOLD = 0.8;

function fixtureDir(caseId) {
  return `benchmarks/fixtures/${caseId}`;
}

function readJson(root, rel) {
  const abs = resolve(root, rel);
  if (!existsSync(abs)) throw new Error(`missing fixture file: ${rel}`);
  return JSON.parse(readFileSync(abs, "utf8"));
}

function normalizedSet(values = []) {
  return new Set(values.map((v) => normalizeDocNumber(v)).filter(Boolean));
}

function rankOf(ranked, docNumber) {
  const key = normalizeDocNumber(docNumber);
  const index = ranked.findIndex((r) => normalizeDocNumber(r.docNumber) === key);
  return index >= 0 ? index + 1 : null;
}

function ratio(n, d) {
  return d ? n / d : 1;
}

function recallAt(ranked, known, n) {
  if (!known.size) return 1;
  const top = (ranked || []).slice(0, n);
  const found = top.filter((r) => known.has(normalizeDocNumber(r.docNumber)));
  return ratio(found.length, known.size);
}

function ranksFor(ranked, known) {
  return [...known].map((doc) => rankOf(ranked || [], doc));
}

function meanKnownReciprocalRank(ranks, knownCount) {
  if (!knownCount) return 1;
  const sum = ranks.reduce((acc, rank) => acc + (rank ? 1 / rank : 0), 0);
  return sum / knownCount;
}

function topExpectedSlotPrecision(ranked, known) {
  if (!known.size) return 1;
  const top = (ranked || []).slice(0, known.size);
  return ratio(top.filter((r) => known.has(normalizeDocNumber(r.docNumber))).length, known.size);
}

function candidateType(docNumber) {
  const normalized = normalizeDocNumber(docNumber);
  if (/^US[A-Z0-9]/.test(normalized)) return "patent";
  if (/^ARXIV/.test(normalized)) return "arxiv";
  if (/^NPL/.test(normalized)) return "npl";
  if (/^DOI/.test(normalized)) return "npl";
  return "other";
}

function candidateTypeDiversity(ranked) {
  return new Set((ranked || []).map((r) => candidateType(r.docNumber))).size;
}

function dossierCompleteness(dossier) {
  const checks = [
    dossier?.schema === "apa-search-dossier-v1",
    dossier?.coverage_limits?.search_complete_asserted === false,
    /^[0-9a-f]{64}$/.test(String(dossier?.query?.serialized_sha256 || "")),
    Array.isArray(dossier?.search_plan) && dossier.search_plan.length > 0,
    Array.isArray(dossier?.sources) && dossier.sources.some((s) => s.source_id === "fixture"),
    Array.isArray(dossier?.top_n?.before_dedupe),
    Array.isArray(dossier?.top_n?.after_dedupe_before_ranking),
    Array.isArray(dossier?.top_n?.after_ranking),
    Array.isArray(dossier?.dedupe_clusters),
    Array.isArray(dossier?.excluded_results),
    Array.isArray(dossier?.ranked_candidates),
    dossier?.closest_art_selection?.human_verified === false,
    dossier?.analysis_handoff?.schema === "apa-search-to-patentability-handoff-v1",
  ];
  return ratio(checks.filter(Boolean).length, checks.length);
}

function quoteCoverage(dossier) {
  const candidates = dossier?.ranked_candidates || [];
  if (!candidates.length) return 0;
  const withQuotes = candidates.filter((c) => {
    const quote = c?.quote_handoff?.quote;
    return quote && quote !== "not located";
  });
  return ratio(withQuotes.length, candidates.length);
}

function rankExplanationCoverage(dossier) {
  const candidates = dossier?.ranked_candidates || [];
  if (!candidates.length) return 0;
  return ratio(candidates.filter((c) => c.rank_explanation && Array.isArray(c.rank_explanation.score_breakdown)).length, candidates.length);
}

function buildFindings({ scenario, metrics, floors }) {
  const findings = [];
  if (metrics.recall_at_20 < floors.recall_at_20) {
    findings.push({
      severity: "blocking",
      path: `${scenario.id}.recall_at_20`,
      message: `${scenario.id}: recall@20 ${metrics.recall_at_20.toFixed(4)} < ${floors.recall_at_20}`,
    });
  }
  if (metrics.recall_at_5 < floors.recall_at_5) {
    findings.push({
      severity: "blocking",
      path: `${scenario.id}.recall_at_5`,
      message: `${scenario.id}: recall@5 ${metrics.recall_at_5.toFixed(4)} < ${floors.recall_at_5}`,
    });
  }
  if (metrics.closest_known_reference_rank === null || metrics.closest_known_reference_rank > floors.closest_known_reference_rank_max) {
    findings.push({
      severity: "blocking",
      path: `${scenario.id}.closest_known_reference_rank`,
      message: `${scenario.id}: closest known reference rank ${metrics.closest_known_reference_rank ?? "missing"} > ${floors.closest_known_reference_rank_max}`,
    });
  }
  if (metrics.mean_known_reciprocal_rank < floors.mean_known_reciprocal_rank) {
    findings.push({
      severity: "blocking",
      path: `${scenario.id}.mean_known_reciprocal_rank`,
      message: `${scenario.id}: mean known reciprocal rank ${metrics.mean_known_reciprocal_rank.toFixed(4)} < ${floors.mean_known_reciprocal_rank}`,
    });
  }
  if (metrics.top_expected_slot_precision < floors.top_expected_slot_precision) {
    findings.push({
      severity: "blocking",
      path: `${scenario.id}.top_expected_slot_precision`,
      message: `${scenario.id}: top expected-slot precision ${metrics.top_expected_slot_precision.toFixed(4)} < ${floors.top_expected_slot_precision}`,
    });
  }
  if (metrics.candidate_type_diversity < floors.candidate_type_diversity_min) {
    findings.push({
      severity: "warning",
      path: `${scenario.id}.candidate_type_diversity`,
      message: `${scenario.id}: candidate type diversity ${metrics.candidate_type_diversity} < ${floors.candidate_type_diversity_min}`,
    });
  }
  const expansionAddedMin = scenario.citation_expansion_added_min ?? floors.citation_expansion_added_min ?? 0;
  if (metrics.citation_expansion_added_count < expansionAddedMin) {
    findings.push({
      severity: "blocking",
      path: `${scenario.id}.citation_expansion_added_count`,
      message: `${scenario.id}: citation expansion added ${metrics.citation_expansion_added_count} < ${expansionAddedMin}`,
    });
  }
  const expansionGainMin = scenario.citation_expansion_recall_gain_min ?? floors.citation_expansion_recall_gain_min ?? 0;
  if (metrics.citation_expansion_recall_gain < expansionGainMin) {
    findings.push({
      severity: "blocking",
      path: `${scenario.id}.citation_expansion_recall_gain`,
      message: `${scenario.id}: citation expansion recall gain ${metrics.citation_expansion_recall_gain.toFixed(4)} < ${expansionGainMin}`,
    });
  }
  if (metrics.dossier_completeness < floors.dossier_completeness) {
    findings.push({
      severity: "blocking",
      path: `${scenario.id}.dossier_completeness`,
      message: `${scenario.id}: dossier completeness ${metrics.dossier_completeness.toFixed(4)} < ${floors.dossier_completeness}`,
    });
  }
  if (metrics.quote_handoff_coverage < floors.quote_handoff_coverage) {
    findings.push({
      severity: "warning",
      path: `${scenario.id}.quote_handoff_coverage`,
      message: `${scenario.id}: quote handoff coverage ${metrics.quote_handoff_coverage.toFixed(4)} < ${floors.quote_handoff_coverage}`,
    });
  }
  if (metrics.rank_explanation_coverage < floors.rank_explanation_coverage) {
    findings.push({
      severity: "warning",
      path: `${scenario.id}.rank_explanation_coverage`,
      message: `${scenario.id}: rank explanation coverage ${metrics.rank_explanation_coverage.toFixed(4)} < ${floors.rank_explanation_coverage}`,
    });
  }
  return findings;
}

export async function scorePriorArtRecallFixture({
  root = ROOT,
  caseId = DEFAULT_CASE,
  fixture = fixtureDir(caseId),
} = {}) {
  const expected = readJson(root, `${fixture}/expected.json`);
  const scenarios = Array.isArray(expected.scenarios) ? expected.scenarios : [];
  const floors = {
    recall_at_20: 0.7,
    recall_at_5: 0.7,
    closest_known_reference_rank_max: 10,
    mean_known_reciprocal_rank: 0.7,
    top_expected_slot_precision: 1,
    candidate_type_diversity_min: 1,
    citation_expansion_added_min: 0,
    citation_expansion_recall_gain_min: 0,
    dossier_completeness: 1,
    quote_handoff_coverage: 1,
    rank_explanation_coverage: 1,
    ...(expected.floors || {}),
  };
  const results = [];

  for (const scenario of scenarios) {
    const query = { limit: 20, ...(scenario.query || {}) };
    const baseResult = await runSearch({
      query,
      sources: ["fixture"],
      opts: {
        broadSearch: true,
        fixtureRecords: scenario.records || [],
      },
      confirmMedium: true,
    });
    const result = await runSearch({
      query,
      sources: ["fixture"],
      opts: {
        broadSearch: true,
        citationExpand: true,
        fixtureRecords: scenario.records || [],
      },
      confirmMedium: true,
    });
    const known = normalizedSet(scenario.expected_known_refs || []);
    const rankedTop20 = (result.ranked || []).slice(0, 20);
    const found = rankedTop20.filter((r) => known.has(normalizeDocNumber(r.docNumber)));
    const ranks = ranksFor(result.ranked || [], known);
    const closestRanks = ranks.filter((v) => v !== null);
    const baseRecallAt20 = recallAt(baseResult.ranked || [], known, 20);
    const expandedRecallAt20 = recallAt(result.ranked || [], known, 20);
    const dossier = buildSearchDossier({
      query,
      result: { ...result, ranked: rankedTop20 },
      assigned: rankedTop20.map((r, index) => ({
        paId: `PA${String(index + 1).padStart(2, "0")}`,
        docNumber: r.docNumber,
        title: r.title,
      })),
      limit: 20,
      generatedAt: "2026-06-22T00:00:00.000Z",
    });
    const metrics = {
      known_references: known.size,
      found_known_references: found.length,
      found_known_references_at_5: rankedTop20.slice(0, 5).filter((r) => known.has(normalizeDocNumber(r.docNumber))).length,
      recall_at_20: Number(ratio(found.length, known.size).toFixed(4)),
      recall_at_5: Number(recallAt(result.ranked || [], known, 5).toFixed(4)),
      base_recall_at_20: Number(baseRecallAt20.toFixed(4)),
      citation_expansion_recall_gain: Number((expandedRecallAt20 - baseRecallAt20).toFixed(4)),
      citation_expansion_added_count: result.citationExpansion?.added_count || 0,
      closest_known_reference_rank: closestRanks.length ? Math.min(...closestRanks) : null,
      mean_known_reciprocal_rank: Number(meanKnownReciprocalRank(ranks, known.size).toFixed(4)),
      top_expected_slot_precision: Number(topExpectedSlotPrecision(result.ranked || [], known).toFixed(4)),
      candidate_type_diversity: candidateTypeDiversity(rankedTop20),
      dossier_completeness: Number(dossierCompleteness(dossier).toFixed(4)),
      quote_handoff_coverage: Number(quoteCoverage(dossier).toFixed(4)),
      rank_explanation_coverage: Number(rankExplanationCoverage(dossier).toFixed(4)),
      search_plan_ids: (result.searchPlan || []).map((p) => p.id),
      top_ranked_doc_numbers: rankedTop20.slice(0, 5).map((r) => r.docNumber),
    };
    const findings = buildFindings({ scenario, metrics, floors });
    results.push({
      id: scenario.id,
      public_source_url: scenario.public_source_url || "",
      status: findings.some((f) => f.severity === "blocking") ? "fail" : "pass",
      metrics,
      findings,
    });
  }

  const blockingFailures = results.reduce((sum, r) => sum + r.findings.filter((f) => f.severity === "blocking").length, 0);
  const warningCount = results.reduce((sum, r) => sum + r.findings.filter((f) => f.severity === "warning").length, 0);
  const averageRecall = results.length
    ? Number((results.reduce((sum, r) => sum + r.metrics.recall_at_20, 0) / results.length).toFixed(4))
    : 0;
  const averageRecallAt5 = results.length
    ? Number((results.reduce((sum, r) => sum + r.metrics.recall_at_5, 0) / results.length).toFixed(4))
    : 0;
  const averageMeanKnownReciprocalRank = results.length
    ? Number((results.reduce((sum, r) => sum + r.metrics.mean_known_reciprocal_rank, 0) / results.length).toFixed(4))
    : 0;
  const averageTopExpectedSlotPrecision = results.length
    ? Number((results.reduce((sum, r) => sum + r.metrics.top_expected_slot_precision, 0) / results.length).toFixed(4))
    : 0;
  const totalCitationExpansionAdded = results.reduce((sum, r) => sum + r.metrics.citation_expansion_added_count, 0);
  const averageDossierCompleteness = results.length
    ? Number((results.reduce((sum, r) => sum + r.metrics.dossier_completeness, 0) / results.length).toFixed(4))
    : 0;
  const status = blockingFailures === 0 && averageRecall >= (expected.threshold ?? DEFAULT_THRESHOLD) ? "pass" : "fail";
  return {
    schema: "apa-prior-art-recall-score-v1",
    generated_at: new Date().toISOString(),
    mode: "mock-offline",
    case_id: expected.case_id || caseId,
    source_class: expected.source_class || "public_patent",
    legal_posture: "retrieval-quality-only-not-patentability",
    status,
    ok: status === "pass",
    threshold: expected.threshold ?? DEFAULT_THRESHOLD,
    metrics: {
      scenarios: results.length,
      average_recall_at_20: averageRecall,
      average_recall_at_5: averageRecallAt5,
      average_mean_known_reciprocal_rank: averageMeanKnownReciprocalRank,
      average_top_expected_slot_precision: averageTopExpectedSlotPrecision,
      total_citation_expansion_added: totalCitationExpansionAdded,
      average_dossier_completeness: averageDossierCompleteness,
      blocking_failures: blockingFailures,
      warning_count: warningCount,
    },
    scenarios: results,
  };
}

export async function scorePriorArtRecallFixtures(opts = {}) {
  return scorePriorArtRecallFixture(opts);
}

export function formatPriorArtRecallScore(summary) {
  const lines = [
    `prior-art-recall: ${summary.status} recall@20=${summary.metrics.average_recall_at_20.toFixed(2)} recall@5=${summary.metrics.average_recall_at_5.toFixed(2)} mrr=${summary.metrics.average_mean_known_reciprocal_rank.toFixed(2)} scenarios=${summary.metrics.scenarios} blocking=${summary.metrics.blocking_failures}`,
  ];
  for (const scenario of summary.scenarios) {
    lines.push(`  ${scenario.status === "pass" ? "ok" : "FAIL"} - ${scenario.id} recall@20=${scenario.metrics.recall_at_20.toFixed(2)} recall@5=${scenario.metrics.recall_at_5.toFixed(2)} mrr=${scenario.metrics.mean_known_reciprocal_rank.toFixed(2)} closest_rank=${scenario.metrics.closest_known_reference_rank ?? "missing"}`);
    for (const finding of scenario.findings) lines.push(`    ${finding.severity}: ${finding.message}`);
  }
  return lines.join("\n");
}
