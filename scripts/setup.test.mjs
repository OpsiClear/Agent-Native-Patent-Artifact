import { test } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectHosts, install } from "./setup.mjs";

function writeSkill(root, hostPath, marker, identity = null) {
  const dir = join(root, hostPath, "sample");
  mkdirSync(join(dir, "support"), { recursive: true });
  writeFileSync(
    join(dir, "SKILL.md"),
    `---\nname: sample\ndescription: ${marker}\n---\n\n# ${marker}\n`,
  );
  writeFileSync(join(dir, "support", "marker.txt"), `${marker}\n`);
  if (identity) {
    writeFileSync(
      join(dir, "skill.yaml"),
      `schema: apa-skill-v1\nid: ${identity}\ncommand: /${identity}\n`,
    );
  }
}

test("setup detects Codex from .codex while installing skills under .agents", () => {
  const home = mkdtempSync(join(tmpdir(), "apa-setup-detect-"));
  try {
    mkdirSync(join(home, ".codex"), { recursive: true });
    const hosts = detectHosts(home);
    const codex = hosts.find((host) => host.id === "codex");
    assert.ok(codex);
    assert.equal(codex.abs, join(home, ".agents", "skills"));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("setup installs each transformed host source, rewrites identity, and replaces stale trees", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "apa-setup-root-"));
  const home = mkdtempSync(join(tmpdir(), "apa-setup-home-"));
  try {
    writeSkill(fixtureRoot, "skills", "claude-variant");
    writeSkill(fixtureRoot, join("dist", "codex"), "codex-variant");
    writeSkill(fixtureRoot, join("dist", "cursor"), "cursor-variant");
    const hosts = ["claude", "codex", "cursor"].map((id) => ({
      id,
      abs: join(home, id, "skills"),
    }));
    for (const host of hosts) {
      const stale = join(host.abs, "apa-sample");
      mkdirSync(stale, { recursive: true });
      writeFileSync(join(stale, "stale.txt"), "remove me\n");
      writeFileSync(join(stale, "SKILL.md"), "---\nname: stale\n---\n");
    }

    install(hosts, { root: fixtureRoot, backup: false });

    for (const host of hosts) {
      const installed = join(host.abs, "apa-sample");
      const skill = readFileSync(join(installed, "SKILL.md"), "utf8");
      assert.match(skill, /^name: apa-sample$/m);
      assert.match(skill, new RegExp(`# ${host.id}-variant`));
      assert.equal(
        readFileSync(join(installed, "support", "marker.txt"), "utf8"),
        `${host.id}-variant\n`,
      );
      assert.equal(existsSync(join(installed, "stale.txt")), false);
    }
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("setup dry-run reports transformed destinations without writing", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "apa-setup-dry-root-"));
  const home = mkdtempSync(join(tmpdir(), "apa-setup-dry-home-"));
  try {
    writeSkill(fixtureRoot, join("dist", "codex"), "codex-variant");
    const host = { id: "codex", abs: join(home, ".agents", "skills") };
    const result = install([host], { root: fixtureRoot, dryRun: true });
    assert.equal(result[0].status, "would-install");
    assert.equal(existsSync(host.abs), false);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("setup installs by canonical skill metadata identity when it differs from the source name", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "apa-setup-identity-root-"));
  const home = mkdtempSync(join(tmpdir(), "apa-setup-identity-home-"));
  try {
    writeSkill(
      fixtureRoot,
      join("dist", "codex"),
      "codex-variant",
      "apa-sample-command",
    );
    const host = { id: "codex", abs: join(home, ".agents", "skills") };
    install([host], { root: fixtureRoot, backup: false });
    const installed = join(host.abs, "apa-sample-command", "SKILL.md");
    assert.match(readFileSync(installed, "utf8"), /^name: apa-sample-command$/m);
    assert.equal(existsSync(join(host.abs, "apa-sample")), false);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("setup keeps backups outside scanned skill roots and reports unmanaged legacy names", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "apa-setup-backup-root-"));
  const home = mkdtempSync(join(tmpdir(), "apa-setup-backup-home-"));
  try {
    writeSkill(
      fixtureRoot,
      join("dist", "codex"),
      "new-codex-variant",
      "apa-sample-command",
    );
    const skillRoot = join(home, ".agents", "skills");
    const destination = join(skillRoot, "apa-sample-command");
    const legacy = join(skillRoot, "apa-sample");
    mkdirSync(destination, { recursive: true });
    mkdirSync(legacy, { recursive: true });
    writeFileSync(join(destination, "SKILL.md"), "# previous\n");
    writeFileSync(join(legacy, "SKILL.md"), "# unmanaged legacy\n");

    const [result] = install(
      [{ id: "codex", abs: skillRoot }],
      { root: fixtureRoot, backup: true },
    );

    assert.equal(result.legacyUnmanaged, legacy);
    assert.equal(readFileSync(join(legacy, "SKILL.md"), "utf8"), "# unmanaged legacy\n");
    assert.equal(
      result.backup,
      join(home, ".agents", ".apa-setup-backups", "apa-sample-command.bak"),
    );
    assert.match(
      readFileSync(join(result.backup, "SKILL.md"), "utf8"),
      /# previous/,
    );
    assert.match(
      readFileSync(join(destination, "SKILL.md"), "utf8"),
      /^name: apa-sample-command$/m,
    );
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});
