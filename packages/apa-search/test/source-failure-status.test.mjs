import { test } from "node:test";
import assert from "node:assert/strict";

import { runSearch } from "../search.mjs";
import { buildSearchDossier } from "../writers.mjs";
import { search as searchPatentsView } from "../sources/patentsview.mjs";
import { search as searchCrossref } from "../sources/crossref.mjs";
import { search as searchArxiv } from "../sources/arxiv.mjs";
import { search as searchOpenAlex } from "../sources/openalex.mjs";

const QUERY = { keywords: ["float", "valve"], cpc: [], limit: 5 };

function fakeResponse(body, { ok = true, status = 200, statusText = "OK" } = {}) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok,
    status,
    statusText,
    async text() { return text; },
  };
}

test("PatentsView exposes network, HTTP, parse, and malformed-payload failures as errors", async () => {
  const common = { apiKey: "test", disableRateLimit: true };
  const network = await searchPatentsView(QUERY, {
    ...common,
    fetch: async () => { throw new Error("network unavailable"); },
  });
  assert.match(network.error, /network error.*network unavailable/i);

  const http = await searchPatentsView(QUERY, {
    ...common,
    fetch: async () => fakeResponse({}, { ok: false, status: 503, statusText: "Unavailable" }),
  });
  assert.match(http.error, /HTTP 503/i);

  const parse = await searchPatentsView(QUERY, {
    ...common,
    fetch: async () => fakeResponse("not json"),
  });
  assert.match(parse.error, /failed to parse JSON/i);

  const malformed = await searchPatentsView(QUERY, {
    ...common,
    fetch: async () => fakeResponse({ error: false, count: 0 }),
  });
  assert.match(malformed.error, /expected a patents array/i);

  const reflected = await searchPatentsView(QUERY, {
    ...common,
    fetch: async () => fakeResponse({
      error: { message: "SECRET reflected provider payload", code: "BAD_QUERY" },
    }),
  });
  assert.match(reflected.error, /BAD_QUERY/);
  assert.doesNotMatch(reflected.error, /SECRET|reflected provider payload/);
});

test("NPL adapters reject malformed success payloads instead of reporting a successful empty search", async () => {
  const common = { disableRateLimit: true };
  const crossref = await searchCrossref(QUERY, {
    ...common,
    fetch: async () => fakeResponse({ message: {} }),
  });
  assert.match(crossref.error, /expected a message\.items array/i);

  const arxiv = await searchArxiv(QUERY, {
    ...common,
    fetch: async () => fakeResponse("<html><body>maintenance</body></html>"),
  });
  assert.match(arxiv.error, /expected an Atom feed/i);

  const openalex = await searchOpenAlex(QUERY, {
    ...common,
    fetch: async () => fakeResponse({ meta: { count: 0 } }),
  });
  assert.match(openalex.error, /expected a results array/i);
});

test("all automated source failures are explicit and failed sources are not marked searched", async () => {
  const failedFetch = async () => fakeResponse({}, {
    ok: false,
    status: 503,
    statusText: "Unavailable",
  });
  const result = await runSearch({
    query: QUERY,
    sources: ["patentsview", "crossref", "arxiv", "openalex"],
    opts: { apiKey: "test", fetch: failedFetch, disableRateLimit: true },
  });

  assert.equal(result.allAutomatedSourcesFailed, true);
  assert.equal(result.allRequestedSourcesFailed, true);
  assert.deepEqual(result.sourceExecution.successful_source_ids, []);
  assert.deepEqual(
    new Set(result.sourceExecution.failed_source_ids),
    new Set(["patentsview", "crossref", "arxiv", "openalex"]),
  );
  assert.ok(result.perSource.every((source) => source.error));

  const dossier = buildSearchDossier({ query: QUERY, result, assigned: [], limit: 5 });
  assert.deepEqual(dossier.coverage_limits.searched_source_ids, []);
  assert.deepEqual(
    new Set(dossier.coverage_limits.source_errors_or_skips.map((row) => row.source_id)),
    new Set(["patentsview", "crossref", "arxiv", "openalex"]),
  );
});

test("a successful requested source preserves partial results while retaining other source errors", async () => {
  const result = await runSearch({
    query: QUERY,
    sources: ["patentsview", "mock"],
    opts: {
      apiKey: "test",
      fetch: async () => fakeResponse({}, { ok: false, status: 503, statusText: "Unavailable" }),
      disableRateLimit: true,
    },
  });

  assert.equal(result.allAutomatedSourcesFailed, true);
  assert.equal(result.allRequestedSourcesFailed, false);
  assert.ok(result.ranked.length > 0);
  assert.match(result.perSource.find((source) => source.id === "patentsview").error, /HTTP 503/i);

  const dossier = buildSearchDossier({ query: QUERY, result, assigned: [], limit: 5 });
  assert.deepEqual(dossier.coverage_limits.searched_source_ids, ["mock"]);
  assert.ok(dossier.coverage_limits.source_errors_or_skips.some((row) => row.source_id === "patentsview"));
});
