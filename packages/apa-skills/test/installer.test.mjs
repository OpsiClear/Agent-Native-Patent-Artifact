import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { claude } from "../src/hosts.mjs";
import { install, uninstall } from "../src/installer.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(HERE, "..");

// Use the bundled copy if present, else the repo-root skills/.
function skillsDir() {
  const bundled = path.join(PKG_ROOT, "skills");
  if (fs.existsSync(path.join(bundled, "compiler", "SKILL.md"))) return bundled;
  return path.resolve(PKG_ROOT, "..", "..", "skills");
}

test("install then uninstall APA skills into a fake home", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "apa-skills-test-"));
  try {
    // A host is "detected" via the presence of its config dir; create it.
    fs.mkdirSync(path.join(home, ".claude"), { recursive: true });

    const sd = skillsDir();
    const result = install({
      home,
      hosts: [claude],
      skillsDir: sd,
      stamp: "test",
    });

    // compiler skill installs to <home>/.claude/skills/apa-compiler/SKILL.md
    const compilerSkill = path.join(
      home,
      ".claude",
      "skills",
      "apa-compiler",
      "SKILL.md"
    );
    assert.ok(fs.existsSync(compilerSkill), `expected ${compilerSkill} to exist`);

    // Lockfile is written with the injected stamp.
    const lockPath = path.join(home, ".claude", "skills", ".apa-skills.json");
    assert.ok(fs.existsSync(lockPath), "expected lockfile to be written");
    const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
    assert.equal(lock.installedAt, "test");
    assert.ok(Array.isArray(lock.skills) && lock.skills.length > 0);
    assert.ok(result.skillCount > 0);

    // Now uninstall and assert the apa-* dirs and lockfile are gone.
    uninstall({ home, hosts: [claude] });

    const skillsRoot = path.join(home, ".claude", "skills");
    assert.ok(!fs.existsSync(compilerSkill), "apa-compiler should be removed");
    assert.ok(!fs.existsSync(lockPath), "lockfile should be removed");
    if (fs.existsSync(skillsRoot)) {
      const leftover = fs
        .readdirSync(skillsRoot, { withFileTypes: true })
        .filter((e) => e.isDirectory() && e.name.startsWith("apa-"));
      assert.equal(leftover.length, 0, "no apa-* dirs should remain");
    }
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("dryRun does not touch disk", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "apa-skills-dry-"));
  try {
    fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
    const summary = install({
      home,
      hosts: [claude],
      skillsDir: skillsDir(),
      stamp: "test",
      dryRun: true,
    });
    assert.ok(summary.skillCount > 0);
    const skillsRoot = path.join(home, ".claude", "skills");
    assert.ok(!fs.existsSync(skillsRoot), "dry-run must not create the skills dir");
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
