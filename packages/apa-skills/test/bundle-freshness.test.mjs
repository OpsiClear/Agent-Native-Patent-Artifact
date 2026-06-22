import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { bundleSkills } from "../scripts/bundle-skills.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(HERE, "..");
const REPO_ROOT = path.resolve(PKG_ROOT, "..", "..");
const ROOT_SKILLS = path.join(REPO_ROOT, "skills");

test("bundle script produces fresh copies of repo-root installable skills", () => {
  const rootSkillNames = fs
    .readdirSync(ROOT_SKILLS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => fs.existsSync(path.join(ROOT_SKILLS, name, "SKILL.md")))
    .sort();

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "apa-skill-bundle-"));
  try {
    const out = path.join(temp, "skills");
    const result = bundleSkills({ src: ROOT_SKILLS, dst: out });
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
