import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { bundleHostSkills, bundleSkills } from "../scripts/bundle-skills.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(HERE, "..");
const REPO_ROOT = path.resolve(PKG_ROOT, "..", "..");
const ROOT_SKILLS = path.join(REPO_ROOT, "skills");

test("bundle script produces fresh copies of repo-root installable skills", () => {
  const rootSkillNames = installableSkillNames(ROOT_SKILLS);

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "apa-skill-bundle-"));
  try {
    const out = path.join(temp, "skills");
    const result = bundleSkills({ src: ROOT_SKILLS, dst: out, packageRoot: temp });
    assert.equal(result.count, rootSkillNames.length);

    const bundledSkillNames = fs
      .readdirSync(out, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    assert.deepEqual(
      bundledSkillNames,
      rootSkillNames,
      "bundle output should contain every installable root skill and no extra directories"
    );

    for (const name of rootSkillNames) {
      assert.deepEqual(
        treeDigest(path.join(out, name)),
        treeDigest(path.join(ROOT_SKILLS, name)),
        `${name} bundle output differs from repo-root skill`
      );
    }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("npm pack runs the real prepack lifecycle with complete host variants and notices", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(PKG_ROOT, "package.json"), "utf8"));
  assert.equal(
    packageJson.scripts?.prepack,
    "node ../../scripts/gen-skill-docs.mjs --all-hosts && node scripts/bundle-skills.mjs",
  );
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "apa-skill-pack-"));
  const stagedRepo = path.join(temp, "repo");
  const tempPackage = path.join(stagedRepo, "packages", "apa-skills");
  try {
    fs.mkdirSync(tempPackage, { recursive: true });
    for (const entry of [
      "package.json",
      "README.md",
      "LICENSE",
      "THIRD_PARTY_NOTICES.md",
      "bin",
      "src",
      "scripts",
    ]) {
      fs.cpSync(path.join(PKG_ROOT, entry), path.join(tempPackage, entry), { recursive: true });
    }
    for (const entry of ["scripts", "hosts", "skills"]) {
      fs.cpSync(path.join(REPO_ROOT, entry), path.join(stagedRepo, entry), { recursive: true });
    }
    fs.copyFileSync(
      path.join(REPO_ROOT, "package.json"),
      path.join(stagedRepo, "package.json"),
    );
    fs.mkdirSync(path.join(stagedRepo, "packages"), { recursive: true });
    fs.cpSync(
      path.join(REPO_ROOT, "packages", "apa-rules"),
      path.join(stagedRepo, "packages", "apa-rules"),
      { recursive: true },
    );
    fs.mkdirSync(path.join(stagedRepo, "docs"), { recursive: true });
    fs.cpSync(
      path.join(REPO_ROOT, "docs", "rule-packs"),
      path.join(stagedRepo, "docs", "rule-packs"),
      { recursive: true },
    );

    const command = process.platform === "win32" ? (process.env.ComSpec || "cmd.exe") : "npm";
    const args = process.platform === "win32"
      ? ["/d", "/s", "/c", "npm pack --json"]
      : ["pack", "--json"];
    const pathValue = `${path.dirname(process.execPath)}${path.delimiter}${process.env.Path || process.env.PATH || ""}`;
    const result = spawnSync(command, args, {
      cwd: tempPackage,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: pathValue,
        Path: pathValue,
      },
    });
    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
    const packed = parseFirstJsonArray(result.stdout);
    const files = new Set((packed[0]?.files || []).map((file) => file.path));
    const rootSkillNames = installableSkillNames(ROOT_SKILLS);
    for (const host of ["claude", "codex", "cursor"]) {
      assert.deepEqual(
        installableSkillNames(path.join(tempPackage, "skills", host)),
        rootSkillNames,
        `${host} prepack tree must contain every source skill`,
      );
      assert.ok(files.has(`skills/${host}/apa-form-fill/SKILL.md`));
      assert.ok(files.has(`skills/${host}/apa-form-fill/agents/openai.yaml`));
      assert.ok(files.has(`skills/${host}/apa-form-fill/scripts/vendor/pdf-lib-1.17.1.cjs`));
      assert.ok(files.has(`skills/${host}/apa-form-fill/scripts/vendor/PDF-LIB-LICENSE.md`));
    }
    assert.ok(
      files.has("skills/codex/tldraw-patent-drawing/fixtures/minimal-export.svg"),
      "Codex templated variant must retain committed fixture support",
    );
    assert.ok(
      files.has("skills/cursor/tldraw-patent-drawing/tldraw-fixture.test.mjs"),
      "Cursor templated variant must retain committed test/support files",
    );
    assert.ok(files.has("LICENSE"), "package must contain the APA MIT license");
    assert.ok(files.has("THIRD_PARTY_NOTICES.md"), "package must contain package-level notices");

    const claudeForm = fs.readFileSync(
      path.join(tempPackage, "skills", "claude", "apa-form-fill", "SKILL.md"),
      "utf8",
    );
    const codexForm = fs.readFileSync(
      path.join(tempPackage, "skills", "codex", "apa-form-fill", "SKILL.md"),
      "utf8",
    );
    const cursorForm = fs.readFileSync(
      path.join(tempPackage, "skills", "cursor", "apa-form-fill", "SKILL.md"),
      "utf8",
    );
    for (const skill of [claudeForm, codexForm, cursorForm]) {
      assert.match(skill, /^name: apa-form-fill$/m);
      assert.match(skill, /^compatibility:/m);
      assert.match(skill, /\/apa-form-fill/);
      assert.match(skill, /\$apa-form-fill/);
      assert.match(skill, /@apa-form-fill/);
    }
    assert.match(claudeForm, /^allowed-tools:/m);
    assert.doesNotMatch(codexForm, /^allowed-tools:/m);
    assert.doesNotMatch(cursorForm, /^allowed-tools:|^alwaysApply:/m);

    const bundledList = spawnSync(
      process.execPath,
      [path.join(tempPackage, "bin", "apa-skills.mjs"), "list"],
      { cwd: tempPackage, encoding: "utf8" },
    );
    assert.equal(bundledList.status, 0, bundledList.stderr);
    assert.match(
      bundledList.stdout,
      new RegExp(`from ${escapeRegex(path.join(tempPackage, "skills"))}`),
      "the CLI must prefer packaged host variants even inside a recognizable APA checkout",
    );

    const consumer = path.join(temp, "consumer");
    const fakeHome = path.join(temp, "home");
    fs.mkdirSync(consumer, { recursive: true });
    fs.mkdirSync(fakeHome, { recursive: true });
    fs.writeFileSync(
      path.join(consumer, "package.json"),
      '{"name":"apa-packed-smoke","private":true}\n',
    );
    const tarball = path.join(tempPackage, packed[0].filename);
    const consumerTarball = path.join(consumer, "package.tgz");
    fs.copyFileSync(tarball, consumerTarball);
    const installArgs = process.platform === "win32"
      ? ["/d", "/s", "/c", "npm install --ignore-scripts --no-audit --no-fund package.tgz"]
      : ["install", "--ignore-scripts", "--no-audit", "--no-fund", consumerTarball];
    const installedPackage = spawnSync(command, installArgs, {
      cwd: consumer,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: pathValue,
        Path: pathValue,
      },
    });
    assert.equal(
      installedPackage.status,
      0,
      `${installedPackage.stderr}\n${installedPackage.stdout}`,
    );
    const installedCli = path.join(
      consumer,
      "node_modules",
      "@apa",
      "patent-skills",
      "bin",
      "apa-skills.mjs",
    );
    const homeEnv = {
      ...process.env,
      HOME: fakeHome,
      USERPROFILE: fakeHome,
    };
    const installedRun = spawnSync(
      process.execPath,
      [installedCli, "install", "--host", "codex"],
      { cwd: consumer, encoding: "utf8", env: homeEnv },
    );
    assert.equal(installedRun.status, 0, installedRun.stderr);
    const installedForm = path.join(
      fakeHome,
      ".agents",
      "skills",
      "apa-form-fill",
      "SKILL.md",
    );
    assert.match(fs.readFileSync(installedForm, "utf8"), /^name: apa-form-fill$/m);
    assert.doesNotMatch(fs.readFileSync(installedForm, "utf8"), /^allowed-tools:/m);
    const installedCompiler = path.join(
      fakeHome,
      ".agents",
      "skills",
      "apa-compile",
      "SKILL.md",
    );
    assert.match(fs.readFileSync(installedCompiler, "utf8"), /^name: apa-compile$/m);
    assert.equal(
      fs.existsSync(path.join(fakeHome, ".agents", "skills", "apa-compiler")),
      false,
      "packed install must use the canonical command identity, not the source directory name",
    );
    assert.ok(
      fs.existsSync(path.join(
        path.dirname(installedForm),
        "scripts",
        "vendor",
        "pdf-lib-1.17.1.cjs",
      )),
      "packed Codex installation must retain the offline PDF runtime",
    );
    const formHelp = spawnSync(
      process.execPath,
      [path.join(path.dirname(installedForm), "scripts", "patent_form_fill.mjs"), "--help"],
      { cwd: consumer, encoding: "utf8", env: homeEnv },
    );
    assert.equal(formHelp.status, 0, formHelp.stderr);
    assert.match(formHelp.stderr, /prompt-driven, local USPTO AcroForm draft filling/);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("bundle replacement is contained to packageRoot/skills and refuses overlap", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "apa-skill-containment-"));
  try {
    const marker = path.join(temp, "marker.txt");
    fs.writeFileSync(marker, "preserve\n");
    assert.throws(
      () => bundleSkills({ src: ROOT_SKILLS, dst: temp, packageRoot: temp }),
      /direct "skills" child/,
    );
    assert.equal(fs.readFileSync(marker, "utf8"), "preserve\n");

    const source = path.join(temp, "source");
    fs.mkdirSync(source, { recursive: true });
    fs.writeFileSync(path.join(source, "SKILL.md"), "# source\n");
    assert.throws(
      () => bundleSkills({ src: source, dst: path.join(source, "skills"), packageRoot: source }),
      /must not overlap/,
    );
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("host bundling packages independent Claude, Codex, and Cursor variants", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "apa-skill-host-bundle-"));
  try {
    const sources = {};
    for (const host of ["claude", "codex", "cursor"]) {
      const source = path.join(temp, `source-${host}`);
      const skill = path.join(source, "sample");
      fs.mkdirSync(skill, { recursive: true });
      fs.writeFileSync(
        path.join(skill, "SKILL.md"),
        `---\nname: sample\ndescription: ${host} variant\n---\n\n# ${host}\n`,
      );
      sources[host] = source;
    }
    const packageRoot = path.join(temp, "package");
    fs.mkdirSync(packageRoot, { recursive: true });
    const result = bundleHostSkills({
      hostSources: sources,
      dst: path.join(packageRoot, "skills"),
      packageRoot,
    });
    assert.deepEqual(result.counts, { claude: 1, codex: 1, cursor: 1 });
    for (const host of Object.keys(sources)) {
      assert.match(
        fs.readFileSync(path.join(packageRoot, "skills", host, "sample", "SKILL.md"), "utf8"),
        new RegExp(`# ${host}`),
      );
    }
    fs.rmSync(path.join(sources.cursor, "sample"), { recursive: true, force: true });
    fs.mkdirSync(path.join(sources.cursor, "different"), { recursive: true });
    fs.writeFileSync(
      path.join(sources.cursor, "different", "SKILL.md"),
      "---\nname: different\ndescription: mismatched variant\n---\n",
    );
    assert.throws(
      () => bundleHostSkills({
        hostSources: sources,
        dst: path.join(packageRoot, "skills"),
        packageRoot,
      }),
      /incomplete or inconsistent skill sets/,
    );
    assert.match(
      fs.readFileSync(path.join(packageRoot, "skills", "cursor", "sample", "SKILL.md"), "utf8"),
      /# cursor/,
      "a rejected replacement must preserve the prior complete bundle",
    );
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

function installableSkillNames(root) {
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => fs.existsSync(path.join(root, name, "SKILL.md")))
    .sort();
}

function treeDigest(root) {
  const files = walk(root)
    .map((abs) => path.relative(root, abs).replace(/\\/g, "/"))
    .sort();
  const hash = createHash("sha256");
  for (const rel of files) {
    const abs = path.join(root, rel);
    hash.update(rel);
    hash.update("\0");
    hash.update(fs.readFileSync(abs));
    hash.update("\0");
  }
  return { files, sha256: hash.digest("hex") };
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(abs));
    else if (entry.isFile()) out.push(abs);
  }
  return out;
}

function parseFirstJsonArray(text) {
  const start = String(text || "").search(/\[\s*\{/);
  assert.notEqual(start, -1, text);
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) return JSON.parse(text.slice(start, i + 1));
    }
  }
  throw new Error("npm pack JSON array was not complete");
}
