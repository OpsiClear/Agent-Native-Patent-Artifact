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
  if (metrics.closest_known_reference_rank === null || metrics.closest_known_reference_rank > floors.closest_known_reference_rank_max) {
    findings.push({
      severity: "blocking",
      path: `${scenario.id}.closest_known_reference_rank`,
      message: `${scenario.id}: closest known reference rank ${metrics.closest_known_reference_rank ?? "missing"} > ${floors.closest_known_reference_rank_max}`,
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
    closest_known_reference_rank_max: 10,
    dossier_completeness: 1,
    quote_handoff_coverage: 1,
    rank_explanation_coverage: 1,
    ...(expected.floors || {}),
  };
  const results = [];

  for (const scenario of scenarios) {
    const query = { limit: 20, ...(scenario.query || {}) };
    const result = await runSearch({
      query,
      sources: ["fixture"],
      opts: {
        broadSearch: true,
        fixtureRecords: scenario.records || [],
      },
      confirmMedium: true,
    });
    const known = normalizedSet(scenario.expected_known_refs || []);
    const rankedTop20 = (result.ranked || []).slice(0, 20);
    const found = rankedTop20.filter((r) => known.has(normalizeDocNumber(r.docNumber)));
    const closestRanks = [...known].map((doc) => rankOf(result.ranked || [], doc)).filter((v) => v !== null);
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
      recall_at_20: Number(ratio(found.length, known.size).toFixed(4)),
      closest_known_reference_rank: closestRanks.length ? Math.min(...closestRanks) : null,
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
    `prior-art-recall: ${summary.status} recall@20=${summary.metrics.average_recall_at_20.toFixed(2)} scenarios=${summary.metrics.scenarios} blocking=${summary.metrics.blocking_failures}`,
  ];
  for (const scenario of summary.scenarios) {
    lines.push(`  ${scenario.status === "pass" ? "ok" : "FAIL"} - ${scenario.id} recall@20=${scenario.metrics.recall_at_20.toFixed(2)} closest_rank=${scenario.metrics.closest_known_reference_rank ?? "missing"}`);
    for (const finding of scenario.findings) lines.push(`    ${finding.severity}: ${finding.message}`);
  }
  return lines.join("\n");
}
