/**
 * Tests for sources/patentsview.mjs. Uses node:test + node:assert, ESM, zero deps.
 *
 * No live network: we monkeypatch globalThis.fetch to return the recorded fixture and restore it
 * after. The missing-key path is exercised with both opts.apiKey and process.env unset.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { search, meta } from "../sources/patentsview.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = JSON.parse(
  readFileSync(join(__dirname, "fixtures", "patentsview-sample.json"), "utf8")
);

/** Build a fake Response object matching the bits search() touches (ok, status, json()). */
function fakeResponse(body, { ok = true, status = 200, statusText = "OK" } = {}) {
  return {
    ok,
    status,
    statusText,
    async json() {
      return body;
    },
  };
}

/** Run fn with globalThis.fetch swapped for `impl`, restoring the original afterward. */
async function withFetch(impl, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

test("meta conforms to the Source contract", () => {
  assert.equal(meta.id, "patentsview");
  assert.equal(meta.accessMode, "api");
  assert.equal(meta.jurisdiction, "US");
  assert.equal(meta.requiresKey, true);
  assert.equal(meta.enabledByDefault, true);
});

test("search() maps fixture patents to NormalizedRefs", async () => {
  let capturedUrl;
  let capturedInit;
  const fakeFetch = async (url, init) => {
    capturedUrl = url;
    capturedInit = init;
    return fakeResponse(FIXTURE);
  };

  const out = await withFetch(fakeFetch, () =>
    search({ keywords: ["self-watering", "float", "valve"], limit: 5 }, { apiKey: "test" })
  );

  // Request was made to the new PatentSearch endpoint with the X-Api-Key header.
  assert.match(String(capturedUrl), /search\.patentsview\.org\/api\/v1\/patent/);
  assert.equal(capturedInit.method, "POST");
  assert.equal(capturedInit.headers["X-Api-Key"], "test");
  // Body carries q/f/o with the requested size.
  const body = JSON.parse(capturedInit.body);
  assert.ok(body.q, "q criteria present");
  assert.ok(Array.isArray(body.f), "f fields present");
  assert.equal(body.o.size, 5);

  assert.equal(out.rawCount, FIXTURE.total_hits);
  assert.equal(out.records.length, FIXTURE.patents.length);
  assert.ok(Array.isArray(out.notes));

  // First record fully populated and normalized.
  const first = out.records[0];
  assert.equal(first.source, "patentsview");
  assert.equal(first.docNumber, "US-10905426"); // normalized "US-#######"
  assert.equal(first.title, "Self-watering planter with float-actuated shutoff valve");
  assert.ok(first.abstract && first.abstract.length > 20, "abstract populated");
  assert.equal(first.snippet, first.abstract); // snippet defaults to abstract
  assert.equal(first.date, "2021-02-02");
  assert.equal(first.assignee, "GreenThumb Innovations LLC");
  assert.deepEqual(first.inventors, ["Maria Sanchez", "David Okafor"]);
  assert.ok(first.cpc.includes("A01G27/00"), "cpc group surfaced");
  assert.equal(first.url, "https://patents.google.com/patent/US10905426");

  // Every record has the required populated fields: docNumber (normalized), title, date, url.
  for (const r of out.records) {
    assert.match(r.docNumber, /^US-/, `${r.docNumber} normalized`);
    assert.ok(r.title.length > 0, "title populated");
    assert.match(r.date, /^\d{4}-\d{2}-\d{2}$/, "date YYYY-MM-DD");
    assert.match(r.url, /^https:\/\/patents\.google\.com\/patent\/US/, "google patents url");
  }

  // Design patent id keeps its kind letter through normalization.
  const design = out.records.find((r) => /D/.test(r.docNumber));
  assert.equal(design.docNumber, "US-D812345");
});

test("search() throws a clear error when no API key is available", async () => {
  const prev = process.env.PATENTSVIEW_API_KEY;
  delete process.env.PATENTSVIEW_API_KEY;
  try {
    await assert.rejects(
      () => search({ keywords: ["float", "valve"] }, {}),
      (err) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /API key required/);
        assert.match(err.message, /PATENTSVIEW_API_KEY/);
        return true;
      }
    );
  } finally {
    if (prev === undefined) delete process.env.PATENTSVIEW_API_KEY;
    else process.env.PATENTSVIEW_API_KEY = prev;
  }
});

test("search() returns empty result (no throw) on HTTP error", async () => {
  const fakeFetch = async () => fakeResponse({}, { ok: false, status: 429, statusText: "Too Many Requests" });
  const out = await withFetch(fakeFetch, () =>
    search({ keywords: ["valve"] }, { apiKey: "test" })
  );
  assert.deepEqual(out.records, []);
  assert.equal(out.rawCount, 0);
  assert.ok(out.notes.some((n) => /429|rate limited/i.test(n)), "rate-limit note present");
});

test("opts.apiKey falls back to PATENTSVIEW_API_KEY env var", async () => {
  const prev = process.env.PATENTSVIEW_API_KEY;
  process.env.PATENTSVIEW_API_KEY = "env-key";
  try {
    let seenKey;
    const fakeFetch = async (_url, init) => {
      seenKey = init.headers["X-Api-Key"];
      return fakeResponse(FIXTURE);
    };
    const out = await withFetch(fakeFetch, () => search({ keywords: ["valve"] }, {}));
    assert.equal(seenKey, "env-key");
    assert.ok(out.records.length > 0);
  } finally {
    if (prev === undefined) delete process.env.PATENTSVIEW_API_KEY;
    else process.env.PATENTSVIEW_API_KEY = prev;
  }
});
