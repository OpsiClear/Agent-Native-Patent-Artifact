import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { claude, codex, cursor } from "../src/hosts.mjs";
import { install, uninstall } from "../src/installer.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(HERE, "..");

// In repo dev, use canonical root skills so an ignored stale bundle cannot shadow them.
function skillsDir() {
  const repoRoot = path.resolve(PKG_ROOT, "..", "..");
  const rootSkills = path.join(repoRoot, "skills");
  if (isApaRepoRoot(repoRoot) && fs.existsSync(path.join(rootSkills, "compiler", "SKILL.md"))) return rootSkills;
  const bundled = path.join(PKG_ROOT, "skills");
  if (fs.existsSync(path.join(bundled, "compiler", "SKILL.md"))) return bundled;
  return rootSkills;
}

function isApaRepoRoot(dir) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
    return pkg.name === "agent-native-patent-artifact";
  } catch {
    return false;
  }
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

    // compiler installs under its canonical /apa-compile skill identity.
    const compilerSkill = path.join(
      home,
      ".claude",
      "skills",
      "apa-compile",
      "SKILL.md"
    );
    assert.ok(fs.existsSync(compilerSkill), `expected ${compilerSkill} to exist`);
    assert.match(
      fs.readFileSync(compilerSkill, "utf8"),
      /^name: apa-compile$/m,
      "installed frontmatter name must match the installed directory",
    );
    const reviewFormSkill = path.join(
      home,
      ".claude",
      "skills",
      "apa-review-form",
      "SKILL.md"
    );
    const doublePrefixedReviewFormSkill = path.join(
      home,
      ".claude",
      "skills",
      "apa-apa-review-form",
      "SKILL.md"
    );
    assert.ok(fs.existsSync(reviewFormSkill), `expected ${reviewFormSkill} to exist`);
    assert.equal(fs.existsSync(doublePrefixedReviewFormSkill), false, "review-form must not be double-prefixed");

    // Lockfile is written with the injected stamp.
    const lockPath = path.join(home, ".claude", "skills", ".apa-skills.json");
    assert.ok(fs.existsSync(lockPath), "expected lockfile to be written");
    const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
    assert.equal(lock.installedAt, "test");
    assert.equal(lock.identity, "directory-frontmatter-v1");
    assert.ok(Array.isArray(lock.skills) && lock.skills.length > 0);
    assert.ok(lock.skills.some((s) => s.dir === "apa-review-form"));
    assert.equal(lock.skills.some((s) => s.dir === "apa-apa-review-form"), false);
    for (const skill of lock.skills) {
      const installedDir = path.join(home, ".claude", "skills", skill.dir);
      const installedSkill = fs.readFileSync(path.join(installedDir, "SKILL.md"), "utf8");
      const metadata = fs.readFileSync(path.join(installedDir, "skill.yaml"), "utf8");
      assert.match(installedSkill, new RegExp(`^name: ${skill.dir}$`, "m"));
      assert.match(metadata, new RegExp(`^id: ${skill.dir}$`, "m"));
      assert.match(metadata, new RegExp(`^command: /${skill.dir}$`, "m"));
    }
    assert.ok(result.skillCount > 0);

    // Now uninstall and assert the apa-* dirs and lockfile are gone.
    uninstall({ home, hosts: [claude] });

    const skillsRoot = path.join(home, ".claude", "skills");
    assert.ok(!fs.existsSync(compilerSkill), "apa-compile should be removed");
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

test("install refuses custom prefixes that would desynchronize skill identity and invocation", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "apa-skills-prefix-"));
  try {
    assert.throws(
      () => install({
        home,
        hosts: [claude],
        skillsDir: skillsDir(),
        prefix: "APA_",
        stamp: "test",
        dryRun: true,
      }),
      /canonical apa- identity prefix/,
    );
    assert.equal(fs.existsSync(path.join(home, ".claude", "skills")), false);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("install and uninstall preserve unowned prefix-shaped skill directories", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "apa-skills-owned-only-"));
  try {
    const skillsRoot = path.join(home, ".claude", "skills");
    const personal = path.join(skillsRoot, "apa-personal");
    fs.mkdirSync(personal, { recursive: true });
    fs.writeFileSync(path.join(personal, "SKILL.md"), "# personal\n");

    install({
      home,
      hosts: [claude],
      skillsDir: skillsDir(),
      stamp: "test",
    });
    uninstall({ home, hosts: [claude] });

    assert.equal(fs.readFileSync(path.join(personal, "SKILL.md"), "utf8"), "# personal\n");
    assert.equal(fs.existsSync(path.join(skillsRoot, "apa-compile")), false);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("install refuses an unowned destination before changing any skill directory", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "apa-skills-conflict-"));
  try {
    const skillsRoot = path.join(home, ".claude", "skills");
    const compiler = path.join(skillsRoot, "apa-compile");
    fs.mkdirSync(compiler, { recursive: true });
    fs.writeFileSync(path.join(compiler, "SKILL.md"), "# custom compiler\n");

    assert.throws(
      () => install({
        home,
        hosts: [claude],
        skillsDir: skillsDir(),
        stamp: "test",
      }),
      /refusing to overwrite skill director/,
    );

    assert.equal(fs.readFileSync(path.join(compiler, "SKILL.md"), "utf8"), "# custom compiler\n");
    assert.equal(fs.existsSync(path.join(skillsRoot, "apa-autoprep")), false);
    assert.equal(fs.existsSync(path.join(skillsRoot, ".apa-skills.json")), false);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("reinstall removes stale directories still owned by the prior lock", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "apa-skills-stale-owned-"));
  try {
    install({ home, hosts: [claude], skillsDir: skillsDir(), stamp: "first" });
    const skillsRoot = path.join(home, ".claude", "skills");
    const lockPath = path.join(skillsRoot, ".apa-skills.json");
    const stale = path.join(skillsRoot, "apa-removed-from-bundle");
    const personal = path.join(skillsRoot, "apa-personal");
    fs.mkdirSync(stale, { recursive: true });
    fs.writeFileSync(path.join(stale, "SKILL.md"), "# stale owned\n");
    fs.mkdirSync(personal, { recursive: true });
    fs.writeFileSync(path.join(personal, "SKILL.md"), "# unowned\n");
    const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
    lock.skills.push({ name: "removed-from-bundle", dir: "apa-removed-from-bundle" });
    fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);

    const result = install({ home, hosts: [claude], skillsDir: skillsDir(), stamp: "second" });

    assert.equal(fs.existsSync(stale), false, "stale lock-owned skill should be removed");
    assert.equal(fs.readFileSync(path.join(personal, "SKILL.md"), "utf8"), "# unowned\n");
    assert.ok(result.hosts[0].staleOwned.some((item) => item.dir === "apa-removed-from-bundle"));
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("reinstall safely upgrades an old lock and repairs installed frontmatter identity", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "apa-skills-old-lock-"));
  try {
    install({ home, hosts: [claude], skillsDir: skillsDir(), stamp: "first" });
    const skillsRoot = path.join(home, ".claude", "skills");
    const compiler = path.join(skillsRoot, "apa-compile", "SKILL.md");
    const lockPath = path.join(skillsRoot, ".apa-skills.json");
    fs.writeFileSync(compiler, fs.readFileSync(compiler, "utf8").replace(
      /^name: apa-compile$/m,
      "name: compiler",
    ));
    const oldLock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
    delete oldLock.identity;
    fs.writeFileSync(lockPath, `${JSON.stringify(oldLock, null, 2)}\n`);

    install({ home, hosts: [claude], skillsDir: skillsDir(), stamp: "upgrade" });

    assert.match(fs.readFileSync(compiler, "utf8"), /^name: apa-compile$/m);
    const upgradedLock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
    assert.equal(upgradedLock.identity, "directory-frontmatter-v1");
    assert.equal(upgradedLock.installedAt, "upgrade");
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("Codex install migrates only lock-owned legacy .codex skills into .agents", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "apa-skills-codex-migrate-"));
  const source = fs.mkdtempSync(path.join(os.tmpdir(), "apa-skills-codex-source-"));
  try {
    const sourceSkill = path.join(source, "codex", "sample");
    fs.mkdirSync(sourceSkill, { recursive: true });
    fs.writeFileSync(
      path.join(sourceSkill, "SKILL.md"),
      "---\nname: sample\ndescription: sample skill\n---\n\n# Sample\n",
    );
    const legacyRoot = path.join(home, ".codex", "skills");
    const legacyOwned = path.join(legacyRoot, "apa-sample");
    const legacyUnowned = path.join(legacyRoot, "apa-personal");
    fs.mkdirSync(legacyOwned, { recursive: true });
    fs.mkdirSync(legacyUnowned, { recursive: true });
    fs.writeFileSync(path.join(legacyOwned, "SKILL.md"), "---\nname: sample\n---\n");
    fs.writeFileSync(path.join(legacyUnowned, "SKILL.md"), "# personal\n");
    fs.writeFileSync(
      path.join(legacyRoot, ".apa-skills.json"),
      `${JSON.stringify({
        version: "0.1.0",
        prefix: "apa-",
        installedAt: "legacy",
        skills: [{ name: "sample", dir: "apa-sample" }],
      }, null, 2)}\n`,
    );

    const result = install({
      home,
      hosts: [codex],
      skillsDir: source,
      stamp: "migrated",
    });

    const installed = path.join(home, ".agents", "skills", "apa-sample", "SKILL.md");
    assert.match(fs.readFileSync(installed, "utf8"), /^name: apa-sample$/m);
    assert.equal(fs.existsSync(legacyOwned), false);
    assert.equal(fs.existsSync(path.join(legacyRoot, ".apa-skills.json")), false);
    assert.equal(fs.readFileSync(path.join(legacyUnowned, "SKILL.md"), "utf8"), "# personal\n");
    assert.equal(result.hosts[0].migratedLegacy.length, 1);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test("uninstall preflights current and legacy locks before removing anything", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "apa-skills-uninstall-preflight-"));
  try {
    const currentRoot = path.join(home, ".agents", "skills");
    const currentSkill = path.join(currentRoot, "apa-sample");
    fs.mkdirSync(currentSkill, { recursive: true });
    fs.writeFileSync(path.join(currentSkill, "SKILL.md"), "# current\n");
    const currentLock = path.join(currentRoot, ".apa-skills.json");
    fs.writeFileSync(
      currentLock,
      `${JSON.stringify({
        version: "0.1.0",
        prefix: "apa-",
        skills: [{ name: "apa-sample", dir: "apa-sample" }],
      }, null, 2)}\n`,
    );
    const legacyRoot = path.join(home, ".codex", "skills");
    fs.mkdirSync(legacyRoot, { recursive: true });
    fs.writeFileSync(path.join(legacyRoot, ".apa-skills.json"), "{not-json");

    assert.throws(
      () => uninstall({ home, hosts: [codex] }),
      /unreadable ownership lockfile/,
    );
    assert.equal(fs.readFileSync(path.join(currentSkill, "SKILL.md"), "utf8"), "# current\n");
    assert.equal(fs.existsSync(currentLock), true);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("install and uninstall reject lock-owned basenames outside the recorded prefix", () => {
  for (const action of ["install", "uninstall"]) {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), `apa-skills-forged-${action}-`));
    try {
      const skillsRoot = path.join(home, ".claude", "skills");
      const personal = path.join(skillsRoot, "personal");
      fs.mkdirSync(personal, { recursive: true });
      fs.writeFileSync(path.join(personal, "SKILL.md"), "# must survive\n");
      fs.writeFileSync(
        path.join(skillsRoot, ".apa-skills.json"),
        `${JSON.stringify({
          version: "0.0.0",
          prefix: "apa-",
          installedAt: "forged",
          skills: [{ name: "personal", dir: "personal" }],
        }, null, 2)}\n`,
      );

      assert.throws(
        () => action === "install"
          ? install({ home, hosts: [claude], skillsDir: skillsDir(), stamp: "test" })
          : uninstall({ home, hosts: [claude] }),
        /outside recorded prefix/,
      );
      assert.equal(fs.readFileSync(path.join(personal, "SKILL.md"), "utf8"), "# must survive\n");
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  }
});

test("install refuses a bundled skill name that could escape the host skill root", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "apa-skills-unsafe-name-"));
  const source = fs.mkdtempSync(path.join(os.tmpdir(), "apa-skills-unsafe-source-"));
  try {
    const skillDir = path.join(source, "malicious");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      "---\nname: ../../outside\ndescription: unsafe test\n---\n",
    );
    assert.throws(
      () => install({ home, hosts: [claude], skillsDir: source, stamp: "test" }),
      /unsafe installed skill directory name/,
    );
    assert.equal(fs.existsSync(path.join(home, ".claude", "skills")), false);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test("installer selects the matching packaged host variant", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "apa-skills-host-home-"));
  const source = fs.mkdtempSync(path.join(os.tmpdir(), "apa-skills-host-source-"));
  try {
    for (const host of [claude, codex, cursor]) {
      const skill = path.join(source, host.id, "sample");
      fs.mkdirSync(skill, { recursive: true });
      fs.writeFileSync(
        path.join(skill, "SKILL.md"),
        `---\nname: sample\ndescription: ${host.id}\n---\n\n# ${host.id}\n`,
      );
    }
    const result = install({
      home,
      hosts: [claude, codex, cursor],
      skillsDir: source,
      stamp: "host-variants",
    });
    assert.equal(result.skillCount, 1);
    for (const host of [claude, codex, cursor]) {
      const installed = fs.readFileSync(
        path.join(home, host.skillRoot, "apa-sample", "SKILL.md"),
        "utf8",
      );
      assert.match(installed, new RegExp(`# ${host.id}`));
      assert.match(installed, /^name: apa-sample$/m);
    }
    fs.rmSync(path.join(source, cursor.id, "sample"), { recursive: true, force: true });
    fs.mkdirSync(path.join(source, cursor.id, "different"), { recursive: true });
    fs.writeFileSync(
      path.join(source, cursor.id, "different", "SKILL.md"),
      "---\nname: different\ndescription: mismatched variant\n---\n",
    );
    assert.throws(
      () => install({
        home,
        hosts: [claude, codex, cursor],
        skillsDir: source,
        stamp: "mismatch",
      }),
      /inconsistent skill sets/,
    );
    assert.match(
      fs.readFileSync(path.join(home, cursor.skillRoot, "apa-sample", "SKILL.md"), "utf8"),
      /# cursor/,
      "a rejected cross-host mismatch must not change the prior installation",
    );
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(source, { recursive: true, force: true });
  }
});
