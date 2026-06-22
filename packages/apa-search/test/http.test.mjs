import { test } from "node:test";
import assert from "node:assert/strict";

import { guardedFetch, readJsonCapped, readTextCapped } from "../sources/http.mjs";

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
