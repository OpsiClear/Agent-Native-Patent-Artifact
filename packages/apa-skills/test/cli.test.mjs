import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, "..", "bin", "apa-skills.mjs");

test("apa-skills CLI help and list execute against the repository skill bundle", () => {
  const help = spawnSync(process.execPath, [CLI, "--help"], { encoding: "utf8" });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /install Agent-Native Patent Artifact/);

  const list = spawnSync(process.execPath, [CLI, "list"], { encoding: "utf8" });
  assert.equal(list.status, 0, list.stderr);
  assert.match(list.stdout, /APA skills \(\d+\)/);
  assert.match(list.stdout, /apa-review-form/);
  assert.match(list.stdout, /Claude Code|claude/i);
});
