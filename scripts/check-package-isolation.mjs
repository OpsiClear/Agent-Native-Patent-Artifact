#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { bundleHostSkills } from "../packages/apa-skills/scripts/bundle-skills.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGES = join(ROOT, "packages");
const EXPECTED_PUBLIC = new Set(["apa-redact", "@apa/patent-skills"]);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    ...options,
  });
  if (result.error) throw result.error;
  return result;
}

function quoteCmd(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function runNpm(args, cwd) {
  if (process.platform === "win32") {
    const line = ["npm", ...args.map((value) => /\s/.test(String(value)) ? quoteCmd(value) : String(value))].join(" ");
    return run(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", line], { cwd });
  }
  return run("npm", args, { cwd });
}

function parseFirstJsonArray(text) {
  const start = String(text || "").search(/\[\s*\{/);
  if (start < 0) throw new Error(`npm did not emit a JSON array: ${text}`);
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
    } else if (char === '"') {
      inString = true;
    } else if (char === "[") {
      depth += 1;
    } else if (char === "]") {
      depth -= 1;
      if (depth === 0) return JSON.parse(text.slice(start, index + 1));
    }
  }
  throw new Error("npm pack JSON output was incomplete");
}

function packageManifests() {
  return readdirSync(PACKAGES, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(PACKAGES, entry.name, "package.json"))
    .filter(existsSync)
    .map((path) => ({ path, value: JSON.parse(readFileSync(path, "utf8")) }));
}

function ensureHostOutputs() {
  const generated = run(process.execPath, [join(ROOT, "scripts", "gen-skill-docs.mjs"), "--all-hosts"], {
    cwd: ROOT,
  });
  assert.equal(generated.status, 0, `${generated.stderr}\n${generated.stdout}`);
}

function makeSkillsPackage(tempRoot) {
  ensureHostOutputs();
  const source = join(PACKAGES, "apa-skills");
  const copy = join(tempRoot, "apa-skills-package");
  mkdirSync(copy, { recursive: true });
  for (const entry of [
    "package.json",
    "README.md",
    "LICENSE",
    "THIRD_PARTY_NOTICES.md",
    "bin",
    "src",
    "scripts",
  ]) {
    cpSync(join(source, entry), join(copy, entry), { recursive: true });
  }
  bundleHostSkills({
    hostSources: {
      claude: join(ROOT, "skills"),
      codex: join(ROOT, "dist", "codex"),
      cursor: join(ROOT, "dist", "cursor"),
    },
    dst: join(copy, "skills"),
    packageRoot: copy,
  });
  return copy;
}

function pack(packageRoot, packDir) {
  mkdirSync(packDir, { recursive: true });
  const packed = runNpm([
    "pack",
    "--json",
    "--ignore-scripts",
    "--pack-destination",
    packDir,
  ], packageRoot);
  assert.equal(packed.status, 0, `${packed.stderr}\n${packed.stdout}`);
  const metadata = parseFirstJsonArray(packed.stdout)[0];
  const tarball = join(packDir, metadata.filename);
  assert.ok(existsSync(tarball), `missing tarball ${tarball}`);
  return { tarball, metadata };
}

function installTarball(tarball, projectDir) {
  mkdirSync(projectDir, { recursive: true });
  writeFileSync(
    join(projectDir, "package.json"),
    `${JSON.stringify({ name: "apa-isolation-probe", private: true, type: "module" }, null, 2)}\n`,
  );
  const installed = runNpm([
    "install",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    tarball,
  ], projectDir);
  assert.equal(installed.status, 0, `${installed.stderr}\n${installed.stdout}`);
}

function checkRedact(projectDir) {
  const probe = [
    'import "apa-redact";',
    'import "apa-redact/engine";',
    'import "apa-redact/patterns";',
    'import "apa-redact/confidential-workflow";',
  ].join("\n");
  const imports = run(process.execPath, ["--input-type=module", "-e", probe], { cwd: projectDir });
  assert.equal(imports.status, 0, imports.stderr);
  const cli = join(projectDir, "node_modules", "apa-redact", "cli.mjs");
  const executed = run(process.execPath, [cli, "--json"], { cwd: projectDir, input: "safe public text" });
  assert.equal(executed.status, 0, executed.stderr);
  assert.deepEqual(JSON.parse(executed.stdout).counts, { HIGH: 0, MEDIUM: 0, LOW: 0 });
}

function checkSkills(projectDir) {
  const packageRoot = join(projectDir, "node_modules", "@apa", "patent-skills");
  assert.ok(existsSync(join(packageRoot, "LICENSE")), "installed package license missing");
  assert.ok(
    existsSync(join(packageRoot, "THIRD_PARTY_NOTICES.md")),
    "installed package third-party notices missing",
  );
  const cli = join(packageRoot, "bin", "apa-skills.mjs");
  const listed = run(process.execPath, [cli, "list"], { cwd: projectDir });
  assert.equal(listed.status, 0, listed.stderr);
  assert.match(listed.stdout, /APA skills \(\d+\)/);
  const namesByHost = {};
  for (const host of ["claude", "codex", "cursor"]) {
    const root = join(packageRoot, "skills", host);
    assert.ok(statSync(root).isDirectory(), `${host} variant root missing`);
    const skillNames = readdirSync(root).filter((name) => existsSync(join(root, name, "SKILL.md")));
    assert.ok(skillNames.length > 0, `${host} variant is empty`);
    namesByHost[host] = skillNames.sort();
    const compiler = readFileSync(join(root, "compiler", "SKILL.md"), "utf8");
    assert.match(compiler, new RegExp(`host '${host}'`));
    for (const script of ["generate_review_form.mjs", "ask_review_questions.mjs", "serve_review_app.mjs", "verify_dates.mjs"]) {
      const probe = run(process.execPath, [join(root, "apa-review-form/scripts", script), "--help"], { cwd: projectDir });
      assert.equal(probe.status, 0, `${host}/${script}: ${probe.stderr}`);
    }
    const matter = join(projectDir, `review-fixture-${host}`);
    cpSync(join(ROOT, "examples/minimal-patent-artifact"), matter, { recursive: true });
    const generated = run(process.execPath, [join(root, "apa-review-form/scripts/generate_review_form.mjs"), "--matter", matter], { cwd: projectDir });
    assert.equal(generated.status, 0, `${host} offline generator: ${generated.stderr}`);
    const html = readFileSync(join(matter, "assembled/human_review_form.html"), "utf8");
    const data = JSON.parse(html.match(/<script type="application\/json" id="review-data">([\s\S]*?)<\/script>/)[1]);
    assert.match(data.reviewTargetFingerprint.sha256, /^[0-9a-f]{64}$/);
    assert.match(html, /CLM01/);
  }
  assert.deepEqual(namesByHost.codex, namesByHost.claude);
  assert.deepEqual(namesByHost.cursor, namesByHost.claude);
}

function main() {
  const manifests = packageManifests();
  const publicNames = new Set(
    manifests.filter(({ value }) => value.private !== true).map(({ value }) => value.name),
  );
  assert.deepEqual(publicNames, EXPECTED_PUBLIC);

  const temp = mkdtempSync(join(tmpdir(), "apa-package-isolation-"));
  try {
    const packDir = join(temp, "tarballs");
    const packages = [
      {
        name: "apa-redact",
        root: join(PACKAGES, "apa-redact"),
        check: checkRedact,
      },
      {
        name: "@apa/patent-skills",
        root: makeSkillsPackage(temp),
        check: checkSkills,
      },
    ];
    for (const item of packages) {
      const { tarball, metadata } = pack(item.root, packDir);
      assert.equal(metadata.name, item.name);
      const project = join(temp, `install-${basename(item.root)}`);
      installTarball(tarball, project);
      item.check(project);
      process.stdout.write(`PASS ${item.name}: packed, installed, and executed in isolation\n`);
    }
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  console.error(`package isolation failed: ${error.stack || error.message}`);
  process.exitCode = 1;
}
