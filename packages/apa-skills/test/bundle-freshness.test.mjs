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

test("npm pack dry-run includes generated skill bundle after running the prepack bundler", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(PKG_ROOT, "package.json"), "utf8"));
  assert.equal(
    packageJson.scripts?.prepack,
    "node ../../scripts/gen-skill-docs.mjs --all-hosts && node scripts/bundle-skills.mjs",
  );
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "apa-skill-pack-"));
  const tempPackage = path.join(temp, "package");
  try {
    fs.mkdirSync(tempPackage, { recursive: true });
    for (const entry of ["package.json", "README.md", "bin", "src", "scripts"]) {
      fs.cpSync(path.join(PKG_ROOT, entry), path.join(tempPackage, entry), { recursive: true });
    }
    const generatedBundle = path.join(tempPackage, "skills");
    bundleSkills({ src: ROOT_SKILLS, dst: generatedBundle, packageRoot: tempPackage });
    const rootSkillNames = installableSkillNames(ROOT_SKILLS);
    assert.deepEqual(installableSkillNames(generatedBundle), rootSkillNames);
    for (const name of rootSkillNames) {
      assert.deepEqual(
        treeDigest(path.join(generatedBundle, name)),
        treeDigest(path.join(ROOT_SKILLS, name)),
        `${name} generated package bundle differs from its repo-root source`,
      );
    }

    const command = process.platform === "win32" ? (process.env.ComSpec || "cmd.exe") : "npm";
    const args = process.platform === "win32"
      ? ["/d", "/s", "/c", "npm pack --dry-run --json --ignore-scripts"]
      : ["pack", "--dry-run", "--json", "--ignore-scripts"];
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
    assert.ok(files.has("skills/apa-review-form/SKILL.md"), "package must include apa-review-form");
    assert.ok(files.has("skills/tldraw-patent-drawing/SKILL.md"), "package must include tldraw-patent-drawing");
    assert.ok(files.has("skills/patent-svg-upgrader/SKILL.md"), "package must include patent-svg-upgrader");
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
