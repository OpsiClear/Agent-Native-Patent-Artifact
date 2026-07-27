import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { atomicWriteJson, readJsonFile, updateJsonFile } from "./review_io.mjs";

test("atomic JSON updates preserve every concurrent append", async () => {
  const dir = mkdtempSync(join(tmpdir(), "apa-review-io-"));
  const path = join(dir, "agent_requests.json");
  try {
    atomicWriteJson(path, []);
    await Promise.all(Array.from({ length: 20 }, (_, index) =>
      updateJsonFile(path, [], current => [...current, { id: index }])
    ));
    const value = readJsonFile(path, []);
    assert.equal(value.length, 20);
    assert.deepEqual(
      value.map(item => item.id).sort((a, b) => a - b),
      Array.from({ length: 20 }, (_, index) => index),
    );
    assert.equal(readFileSync(path, "utf8").endsWith("\n"), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("JSON update refuses to replace a malformed existing file", async () => {
  const dir = mkdtempSync(join(tmpdir(), "apa-review-io-invalid-"));
  const path = join(dir, "human_review_state.json");
  try {
    writeFileSync(path, "{not valid json", "utf8");
    await assert.rejects(
      updateJsonFile(path, {}, () => ({ answers: {} })),
      /invalid JSON in human_review_state\.json/,
    );
    assert.equal(readFileSync(path, "utf8"), "{not valid json");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
