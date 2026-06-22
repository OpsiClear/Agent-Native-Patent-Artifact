/**
 * Source registry for apa-search. Each descriptor declares an ACCESS MODE so sanctioned API/dataset
 * access is distinguished from ToS-restricted UI scraping; ui-restricted sources are disabled by
 * default and routed to a human (DESIGN.md §4.1 / §11.2). Modules are dynamically imported on use, so
 * a not-yet-implemented source never breaks importing this registry.
 */

export const SOURCE_REGISTRY = [
  { id: "patentsview", module: "./patentsview.mjs", accessMode: "api", jurisdiction: "US", requiresKey: true, enabledByDefault: true, status: "implemented", note: "PatentsView PatentSearch API (search.patentsview.org); see docs/source-registry.md." },
  { id: "crossref", module: "./crossref.mjs", accessMode: "api", jurisdiction: "NPL", requiresKey: false, enabledByDefault: true, status: "implemented", note: "Crossref Works API for NPL metadata candidate discovery; full text still requires human verification." },
  { id: "arxiv", module: "./arxiv.mjs", accessMode: "api", jurisdiction: "NPL", requiresKey: false, enabledByDefault: true, status: "implemented", note: "arXiv API for preprint/NPL candidate discovery; versions/dates require human verification." },
  { id: "mock", module: "./mock.mjs", accessMode: "api", jurisdiction: "US", requiresKey: false, enabledByDefault: false, status: "implemented", note: "offline deterministic source for tests/demos." },
  { id: "fixture", module: "./fixture.mjs", accessMode: "api", jurisdiction: "benchmark", requiresKey: false, enabledByDefault: false, status: "implemented", note: "offline benchmark fixture source; not prior art evidence." },
  { id: "pqai", module: null, accessMode: "api", jurisdiction: "US/NPL", requiresKey: false, enabledByDefault: false, status: "planned", note: "PQAI semantic search (free); Phase-2 follow-on." },
  { id: "epo-ops", module: null, accessMode: "api", jurisdiction: "EP/WO", requiresKey: true, enabledByDefault: false, status: "planned", note: "EPO Open Patent Services (OAuth); not in USPTO-only v1." },
  { id: "google-bigquery", module: null, accessMode: "dataset", jurisdiction: "global", requiresKey: true, enabledByDefault: false, status: "planned", note: "patents-public-data (sanctioned, free to query); the legitimate Google path." },
  { id: "uspto-pps", module: null, accessMode: "ui-restricted", jurisdiction: "US", requiresKey: false, enabledByDefault: false, status: "human-handoff", note: "USPTO Patent Public Search is examiner-grade but UI-only (no API) - human-driven, never auto-trusted." },
  { id: "google-patents-ui", module: null, accessMode: "ui-restricted", jurisdiction: "global", requiresKey: false, enabledByDefault: false, status: "disabled", note: "automated access to the Google Patents UI violates Google ToS - use google-bigquery instead." },
];

export function listSources() {
  return SOURCE_REGISTRY.map((s) => ({ ...s }));
}

export function descriptor(id) {
  return SOURCE_REGISTRY.find((s) => s.id === id) || null;
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
