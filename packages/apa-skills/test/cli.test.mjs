import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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
  assert.match(list.stdout, /apa-form-fill/);
  assert.match(list.stdout, /apa-compile \(source: compiler\)/);
  assert.doesNotMatch(list.stdout, /^\s+compiler\s*$/m);
  assert.match(list.stdout, /\.agents\/skills/);
  assert.match(list.stdout, /Claude Code|claude/i);
});

test("apa-skills install dry-run reports stale and legacy-owned removals without changing disk", () => {
  const home = mkdtempSync(join(tmpdir(), "apa-skills-cli-dry-"));
  try {
    const currentRoot = join(home, ".agents", "skills");
    const legacyRoot = join(home, ".codex", "skills");
    const stale = join(currentRoot, "apa-stale-owned");
    const legacy = join(legacyRoot, "apa-legacy-owned");
    mkdirSync(stale, { recursive: true });
    mkdirSync(legacy, { recursive: true });
    writeFileSync(join(stale, "SKILL.md"), "# stale\n");
    writeFileSync(join(legacy, "SKILL.md"), "# legacy\n");
    writeFileSync(
      join(currentRoot, ".apa-skills.json"),
      `${JSON.stringify({
        version: "0.1.0",
        prefix: "apa-",
        skills: [{ name: "apa-stale-owned", dir: "apa-stale-owned" }],
      }, null, 2)}\n`,
    );
    const legacyLock = join(legacyRoot, ".apa-skills.json");
    writeFileSync(
      legacyLock,
      `${JSON.stringify({
        version: "0.1.0",
        prefix: "apa-",
        skills: [{ name: "apa-legacy-owned", dir: "apa-legacy-owned" }],
      }, null, 2)}\n`,
    );
    const result = spawnSync(
      process.execPath,
      [CLI, "install", "--host", "codex", "--dry-run"],
      {
        encoding: "utf8",
        env: { ...process.env, HOME: home, USERPROFILE: home },
      },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.includes(stale), result.stdout);
    assert.ok(result.stdout.includes(legacy), result.stdout);
    assert.ok(result.stdout.includes(legacyLock), result.stdout);
    assert.equal(existsSync(stale), true);
    assert.equal(existsSync(legacy), true);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
