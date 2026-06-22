import { test } from "node:test";
import assert from "node:assert/strict";

import { guardedFetch, readJsonCapped, readTextCapped, resetRateLimitState } from "../sources/http.mjs";

test("readTextCapped rejects oversized response text before parsing", async () => {
  await assert.rejects(
    () => readTextCapped({ text: async () => "x".repeat(32) }, { maxBytes: 8 }),
    /response too large/
  );
});

test("readJsonCapped parses small JSON responses", async () => {
  const parsed = await readJsonCapped({ text: async () => "{\"ok\":true}" }, { maxBytes: 32 });
  assert.deepEqual(parsed, { ok: true });
});

test("guardedFetch aborts long-running fetches", async () => {
  const fetch = async (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(new Error("aborted-by-test")), { once: true });
  });
  await assert.rejects(
    () => guardedFetch("https://example.invalid", {}, { fetch, timeoutMs: 1 }),
    /aborted-by-test/
  );
});

test("guardedFetch applies per-source minimum intervals after the first request", async () => {
  resetRateLimitState();
  const fetch = async () => ({ ok: true, text: async () => "ok" });
  await guardedFetch("https://example.invalid/1", {}, {
    fetch,
    rateLimitKey: "unit-test-source",
    minIntervalMs: 20,
  });
  const started = Date.now();
  await guardedFetch("https://example.invalid/2", {}, {
    fetch,
    rateLimitKey: "unit-test-source",
    minIntervalMs: 20,
  });
  assert.ok(Date.now() - started >= 15);
  resetRateLimitState();
});
