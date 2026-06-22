/**
 * Source policy metadata shared by the executable registry and source adapters.
 *
 * These are audit and safety controls, not legal conclusions and not promises that a search is
 * complete. Keep rate limits conservative where provider policy is more nuanced than one number.
 */

export const RATE_POLICIES = {
  patentsview: {
    policy_id: "patentsview-45-per-minute",
    requests: 45,
    interval_seconds: 60,
    min_interval_ms: 1400,
    concurrency: 1,
    basis: "PatentsView PatentSearch API rate-limit note; back off on HTTP 429.",
  },
  crossref_public: {
    policy_id: "crossref-public-5-per-second",
    requests: 5,
    interval_seconds: 1,
    min_interval_ms: 200,
    concurrency: 1,
    basis: "Crossref public pool.",
  },
  crossref_polite: {
    policy_id: "crossref-polite-10-per-second",
    requests: 10,
    interval_seconds: 1,
    min_interval_ms: 100,
    concurrency: 3,
    basis: "Crossref polite pool when mailto/User-Agent identification is supplied.",
  },
  arxiv: {
    policy_id: "arxiv-legacy-api-1-per-3-seconds",
    requests: 1,
    interval_seconds: 3,
    min_interval_ms: 3000,
    concurrency: 1,
    basis: "arXiv API terms for legacy APIs.",
  },
  openalex_without_key: {
    policy_id: "openalex-unauthenticated-budget",
    requests: null,
    interval_seconds: null,
    min_interval_ms: 200,
    concurrency: 1,
    basis: "OpenAlex unauthenticated daily budget; key strongly preferred for production use.",
  },
  openalex_keyed: {
    policy_id: "openalex-keyed-budget",
    requests: null,
    interval_seconds: null,
    min_interval_ms: 100,
    concurrency: 1,
    basis: "OpenAlex API key daily budget; monitor usage headers/rate-limit endpoint.",
  },
};

export function effectiveRatePolicy(sourceId, opts = {}) {
  switch (sourceId) {
    case "patentsview":
      return RATE_POLICIES.patentsview;
    case "crossref":
      return opts.mailto || process.env.CROSSREF_MAILTO
        ? RATE_POLICIES.crossref_polite
        : RATE_POLICIES.crossref_public;
    case "arxiv":
      return RATE_POLICIES.arxiv;
    case "openalex":
      return opts.apiKey || process.env.OPENALEX_API_KEY
        ? RATE_POLICIES.openalex_keyed
        : RATE_POLICIES.openalex_without_key;
    default:
      return null;
  }
}

export function rateFetchOptions(sourceId, opts = {}) {
  const policy = effectiveRatePolicy(sourceId, opts);
  if (!policy?.min_interval_ms) return {};
  return {
    rateLimitKey: sourceId,
    minIntervalMs: policy.min_interval_ms,
    disableRateLimit: opts.disableRateLimit,
  };
}
