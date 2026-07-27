import { test } from "node:test";
import assert from "node:assert/strict";

import {
  METADATA_FETCH_POLICY,
  allowedMetadataUrl,
  safeMetadataFetch,
} from "./apa-safe-review-metadata-fetch.mjs";

test("metadata boundary permits only explicit HTTPS hosts without credentials or custom ports", () => {
  assert.equal(allowedMetadataUrl("https://api.crossref.org/works/example").hostname, "api.crossref.org");
  for (const value of [
    "http://api.crossref.org/works/example",
    "https://user:secret@api.crossref.org/works/example",
    "https://api.crossref.org:444/works/example",
    "https://api.crossref.org.example.invalid/works/example",
  ]) {
    assert.throws(() => allowedMetadataUrl(value), /not allowlisted/);
  }
});

test("metadata boundary rejects redirects outside the allowlist before a second request", async () => {
  let calls = 0;
  const result = await safeMetadataFetch("https://api.crossref.org/works/example", {
    fetchImpl: async () => {
      calls++;
      return new Response("", {
        status: 302,
        headers: { location: "https://example.invalid/tracker" },
      });
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.ok, false);
  assert.match(result.error, /not allowlisted/);
});

test("metadata boundary caps decoded response bytes and records exact request identity", async () => {
  const oversized = await safeMetadataFetch("https://api.crossref.org/works/example", {
    maxBytes: 4,
    fetchImpl: async () => new Response("12345", { status: 200 }),
  });
  assert.equal(oversized.ok, false);
  assert.match(oversized.error, /exceeds 4 bytes/);

  const accepted = await safeMetadataFetch("https://api.crossref.org/works/example", {
    fetchImpl: async () => new Response("{}", { status: 200 }),
  });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.egress[0].boundary, METADATA_FETCH_POLICY.boundary);
  assert.match(accepted.egress[0].requestUrlSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(accepted.egress[0].scan, { high: 0, medium: 0, approved: false });
});

test("metadata boundary scans exact egress before fetch and blocks HIGH findings", async () => {
  let fetched = false;
  const result = await safeMetadataFetch("https://api.crossref.org/works/example", {
    scanImpl: () => [{ patternName: "test.high", tier: "HIGH", start: 0 }],
    fetchImpl: async () => {
      fetched = true;
      return new Response("{}", { status: 200 });
    },
  });
  assert.equal(result.ok, false);
  assert.equal(fetched, false);
  assert.match(result.error, /blocked by exact-egress redaction scan/);
  assert.match(result.egress[0].requestUrlSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(result.egress[0].scan, { blocked: true });
});
