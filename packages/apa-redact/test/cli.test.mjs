import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, "..", "cli.mjs");

test("apa-redact CLI executes clean, blocked, and invalid-argument paths", () => {
  const clean = spawnSync(process.execPath, [CLI, "--json"], {
    encoding: "utf8",
    input: "ordinary public text",
  });
  assert.equal(clean.status, 0, clean.stderr);
  assert.deepEqual(JSON.parse(clean.stdout).counts, { HIGH: 0, MEDIUM: 0, LOW: 0 });

  const blocked = spawnSync(process.execPath, [CLI, "--json"], {
    encoding: "utf8",
    input: "-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----",
  });
  assert.equal(blocked.status, 3, blocked.stderr);
  assert.ok(JSON.parse(blocked.stdout).counts.HIGH > 0);

  const invalid = spawnSync(process.execPath, [CLI, "--max-bytes", "NaN"], {
    encoding: "utf8",
    input: "text",
  });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /positive integer/);
});
