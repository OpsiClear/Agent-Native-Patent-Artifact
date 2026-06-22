/**
 * Source registry for apa-search. Each descriptor declares an ACCESS MODE so sanctioned API/dataset
 * access is distinguished from ToS-restricted UI scraping; ui-restricted sources are disabled by
 * default and routed to a human (DESIGN.md §4.1 / §11.2). Modules are dynamically imported on use, so
 * a not-yet-implemented source never breaks importing this registry.
 */

import { effectiveRatePolicy } from "./policies.mjs";

export const SOURCE_REGISTRY = [
  {
    id: "patentsview", module: "./patentsview.mjs", accessMode: "api", jurisdiction: "US",
    official: true, requiresKey: true, keyEnv: "PATENTSVIEW_API_KEY", enabledByDefault: true,
    status: "implemented", queryPayloadClass: "claim-derived keyword/CPC query",
    returnsFullText: false, humanVerificationRequired: true,
    referenceUrl: "https://data.uspto.gov/support/transition-guide/patentsview",
    lastVerifiedAt: "2026-06-22",
    automationPolicy: "automated",
    currentNotice: "USPTO announced PatentsView migration to the Open Data Portal on 2026-03-20; record endpoint/auth/schema health in each live run.",
    note: "PatentsView PatentSearch API (search.patentsview.org); see docs/source-registry.md.",
  },
  {
    id: "crossref", module: "./crossref.mjs", accessMode: "api", jurisdiction: "NPL",
    official: false, requiresKey: false, keyEnv: "CROSSREF_MAILTO", enabledByDefault: true,
    status: "implemented", queryPayloadClass: "claim-derived NPL metadata query",
    returnsFullText: false, humanVerificationRequired: true,
    referenceUrl: "https://www.crossref.org/documentation/retrieve-metadata/rest-api/tips-for-using-the-crossref-rest-api/",
    lastVerifiedAt: "2026-06-22",
    automationPolicy: "automated",
    currentNotice: "Use Crossref polite pool identification when possible; full text and relied-on passages remain human verification.",
    note: "Crossref Works API for NPL metadata candidate discovery; full text still requires human verification.",
  },
  {
    id: "arxiv", module: "./arxiv.mjs", accessMode: "api", jurisdiction: "NPL",
    official: false, requiresKey: false, enabledByDefault: true,
    status: "implemented", queryPayloadClass: "claim-derived NPL/preprint query",
    returnsFullText: false, humanVerificationRequired: true,
    referenceUrl: "https://info.arxiv.org/help/api/index.html",
    lastVerifiedAt: "2026-06-22",
    automationPolicy: "automated",
    currentNotice: "Legacy arXiv APIs are limited to one request every three seconds and one connection.",
    note: "arXiv API for preprint/NPL candidate discovery; versions/dates require human verification.",
  },
  {
    id: "openalex", module: "./openalex.mjs", accessMode: "api", jurisdiction: "NPL",
    official: false, requiresKey: false, keyEnv: "OPENALEX_API_KEY", enabledByDefault: true,
    status: "implemented", queryPayloadClass: "claim-derived scholarly metadata query",
    returnsFullText: false, humanVerificationRequired: true,
    referenceUrl: "https://developers.openalex.org/api-reference/introduction",
    lastVerifiedAt: "2026-06-22",
    automationPolicy: "automated",
    currentNotice: "OpenAlex keyed access has a larger daily budget; monitor API-key budget and usage.",
    note: "OpenAlex Works API for scholarly metadata candidate discovery; full text and bibliographic details still require human verification.",
  },
  {
    id: "mock", module: "./mock.mjs", accessMode: "api", jurisdiction: "US",
    official: false, requiresKey: false, enabledByDefault: false, status: "implemented",
    queryPayloadClass: "synthetic demo query", returnsFullText: false, humanVerificationRequired: false,
    referenceUrl: "repo:packages/apa-search/sources/mock.mjs",
    lastVerifiedAt: "2026-06-22",
    automationPolicy: "local-only",
    note: "offline deterministic source for tests/demos.",
  },
  {
    id: "fixture", module: "./fixture.mjs", accessMode: "api", jurisdiction: "benchmark",
    official: false, requiresKey: false, enabledByDefault: false, status: "implemented",
    queryPayloadClass: "public benchmark query", returnsFullText: false, humanVerificationRequired: false,
    referenceUrl: "repo:packages/apa-search/sources/fixture.mjs",
    lastVerifiedAt: "2026-06-22",
    automationPolicy: "local-only",
    note: "offline benchmark fixture source; not prior art evidence.",
  },
  {
    id: "pqai", module: null, accessMode: "api", jurisdiction: "US/NPL",
    official: false, requiresKey: false, enabledByDefault: false, status: "planned",
    queryPayloadClass: "claim-derived semantic query", returnsFullText: false, humanVerificationRequired: true,
    referenceUrl: "https://projectpq.ai/patent-search-api-by-pqai/",
    lastVerifiedAt: "2026-06-22",
    automationPolicy: "planned",
    note: "PQAI semantic search (free); Phase-2 follow-on.",
  },
  {
    id: "epo-ops", module: null, accessMode: "api", jurisdiction: "EP/WO",
    official: true, requiresKey: true, keyEnv: "EPO_OPS_KEY", enabledByDefault: false, status: "planned",
    queryPayloadClass: "patent bibliographic/family/full-text query", returnsFullText: true, humanVerificationRequired: true,
    referenceUrl: "https://developers.epo.org/",
    lastVerifiedAt: "2026-06-22",
    automationPolicy: "planned",
    currentNotice: "EPO OPS is a RESTful XML service with OAuth and fair-use limits; not enabled until adapter/auth are implemented.",
    note: "EPO Open Patent Services (OAuth); not in USPTO-only v1.",
  },
  {
    id: "google-bigquery", module: null, accessMode: "dataset", jurisdiction: "global",
    official: false, requiresKey: true, keyEnv: "GOOGLE_APPLICATION_CREDENTIALS", enabledByDefault: false, status: "planned",
    queryPayloadClass: "SQL/dataset query", returnsFullText: false, humanVerificationRequired: true,
    referenceUrl: "https://github.com/google/patents-public-data",
    lastVerifiedAt: "2026-06-22",
    automationPolicy: "planned",
    note: "patents-public-data (sanctioned, free to query); the legitimate Google path.",
  },
  {
    id: "uspto-pps", module: null, accessMode: "ui-restricted", jurisdiction: "US",
    official: true, requiresKey: false, enabledByDefault: false, status: "human-handoff",
    queryPayloadClass: "human-entered search", returnsFullText: false, humanVerificationRequired: true,
    referenceUrl: "https://www.uspto.gov/patents/search/patent-public-search",
    lastVerifiedAt: "2026-06-22",
    automationPolicy: "human-handoff",
    note: "USPTO Patent Public Search is examiner-grade but UI-only (no API) - human-driven, never auto-trusted.",
  },
  {
    id: "google-patents-ui", module: null, accessMode: "ui-restricted", jurisdiction: "global",
    official: false, requiresKey: false, enabledByDefault: false, status: "disabled",
    queryPayloadClass: "UI interaction", returnsFullText: false, humanVerificationRequired: true,
    referenceUrl: "https://patents.google.com/",
    lastVerifiedAt: "2026-06-22",
    automationPolicy: "disabled",
    note: "automated access to the Google Patents UI violates Google ToS - use google-bigquery instead.",
  },
];

export function listSources() {
  return SOURCE_REGISTRY.map((s) => ({ ...s }));
}

export function descriptor(id) {
  return SOURCE_REGISTRY.find((s) => s.id === id) || null;
}

export function sourceHealth(id, { env = process.env, opts = {} } = {}) {
  const d = descriptor(id);
  if (!d) throw new Error(`unknown source '${id}'`);
  const keyEnv = d.keyEnv || null;
  const keyPresent = keyEnv ? Boolean(env[keyEnv]) : false;
  const configured = !d.requiresKey || keyPresent;
  const implemented = Boolean(d.module) && d.status === "implemented";
  const automated = implemented && d.accessMode !== "ui-restricted" && configured;
  return {
    source_id: d.id,
    status: d.status,
    access_mode: d.accessMode,
    jurisdiction: d.jurisdiction,
    official: Boolean(d.official),
    enabled_by_default: Boolean(d.enabledByDefault),
    implemented,
    configured,
    automation_ready: automated,
    credential: {
      required: Boolean(d.requiresKey),
      key_env: keyEnv,
      key_present: keyPresent,
    },
    query_payload_class: d.queryPayloadClass || "",
    returns_full_text: Boolean(d.returnsFullText),
    human_verification_required: Boolean(d.humanVerificationRequired),
    rate_policy: effectiveRatePolicy(d.id, opts),
    reference_url: d.referenceUrl || "",
    last_verified_at: d.lastVerifiedAt || "",
    automation_policy: d.automationPolicy || "",
    current_notice: d.currentNotice || "",
    note: d.note || "",
  };
}

/** Dynamically load an implemented source -> { meta, search }. Throws for unknown/unimplemented ids. */
export async function loadSource(id) {
  const d = descriptor(id);
  if (!d) throw new Error(`unknown source '${id}' (known: ${SOURCE_REGISTRY.map((s) => s.id).join(", ")})`);
  if (!d.module) {
    const why = d.accessMode === "ui-restricted"
      ? `'${id}' is ${d.status} (UI-only / ToS-restricted) - route to a human; it has no automated API path.`
      : `'${id}' is ${d.status} and not implemented in this version.`;
    throw new Error(why);
  }
  return import(d.module);
}
