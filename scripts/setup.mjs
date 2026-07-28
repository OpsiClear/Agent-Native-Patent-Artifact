#!/usr/bin/env node
/**
 * setup - prepare APA for use. Default (safe): regenerate every host variant, validate the example
 * matter, and print next steps + detected hosts. With `--install`, atomically replace each installed
 * skill from its matching Claude/Codex/Cursor source tree. Existing destinations are moved to a
 * hidden backup directory outside the scanned skill root unless `--no-backup` is passed. Node >=21,
 * ESM, zero dependencies.
 *
 *   node scripts/setup.mjs
 *   node scripts/setup.mjs --install
 *   node scripts/setup.mjs --install --dry-run
 */

import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { ALL_HOSTS } from "../hosts/index.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const node = process.execPath;
const run = (script, ...args) => execFileSync(node, [join(ROOT, script), ...args], { stdio: "inherit" });

function isWithin(root, candidate) {
  const rel = relative(root, candidate);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function configRoot(host) {
  return host.configRoot || host.skillRoot.split(/[\\/]/)[0];
}

export function detectHosts(home = homedir()) {
  return ALL_HOSTS
    .filter((host) => existsSync(join(home, configRoot(host))))
    .map((host) => ({
      ...host,
      abs: join(home, ...host.skillRoot.split(/[\\/]/)),
    }));
}

function nextBackupPath(destination, backupRoot) {
  const base = join(backupRoot, `${destination.split(/[\\/]/).at(-1)}.bak`);
  let candidate = base;
  let n = 1;
  while (existsSync(candidate)) candidate = `${base}.${n++}`;
  return candidate;
}

function prefixedDirName(name, prefix = "apa-") {
  return String(name || "").startsWith(prefix) ? String(name) : `${prefix}${name}`;
}

function readSkillName(skillDir) {
  const source = readFileSync(join(skillDir, "SKILL.md"), "utf8");
  const match = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(source);
  const name = match?.[1].match(/^name:\s*([A-Za-z0-9._-]+)\s*$/m)?.[1];
  if (!name) throw new Error(`skill has no simple frontmatter name: ${skillDir}`);
  return name;
}

function readSkillIdentity(skillDir) {
  const metadataPath = join(skillDir, "skill.yaml");
  if (!existsSync(metadataPath)) return readSkillName(skillDir);
  const metadata = readFileSync(metadataPath, "utf8");
  const ids = [...metadata.matchAll(/^id:\s*([a-z0-9]+(?:-[a-z0-9]+)*)\s*$/gm)];
  const commands = [...metadata.matchAll(/^command:\s*(\/[a-z0-9]+(?:-[a-z0-9]+)*)\s*$/gm)];
  if (ids.length !== 1 || commands.length !== 1 || commands[0][1] !== `/${ids[0][1]}`) {
    throw new Error(`skill metadata id/command identity is invalid: ${metadataPath}`);
  }
  return ids[0][1];
}

function rewriteInstalledSkillName(skillDir, installedName) {
  const skillPath = join(skillDir, "SKILL.md");
  const source = readFileSync(skillPath, "utf8");
  const match = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(source);
  if (!match || (match[1].match(/^name:\s*.*$/gm) || []).length !== 1) {
    throw new Error(`skill must declare exactly one frontmatter name: ${skillPath}`);
  }
  const rewrittenHeader = match[0].replace(/^name:\s*.*$/m, `name: ${installedName}`);
  writeFileSync(skillPath, rewrittenHeader + source.slice(match[0].length), "utf8");
}

function sourceRootForHost(root, host) {
  return host.id === "claude"
    ? join(root, "skills")
    : join(root, "dist", host.id);
}

function replaceSkill(source, destination, { backup }) {
  const skillRoot = dirname(destination);
  if (!isWithin(skillRoot, destination) || destination === skillRoot) {
    throw new Error(`refusing unsafe setup destination: ${destination}`);
  }
  mkdirSync(skillRoot, { recursive: true });
  const transaction = mkdtempSync(join(skillRoot, ".apa-setup-transaction-"));
  const staged = join(transaction, "staged");
  const previous = join(transaction, "previous");
  const backupRoot = join(dirname(skillRoot), ".apa-setup-backups");
  const backupPath = existsSync(destination) && backup
    ? nextBackupPath(destination, backupRoot)
    : null;
  let oldLocation = null;
  let installed = false;
  try {
    cpSync(source, staged, { recursive: true });
    rewriteInstalledSkillName(staged, destination.split(/[\\/]/).at(-1));
    if (existsSync(destination)) {
      oldLocation = backupPath || previous;
      if (backupPath) mkdirSync(dirname(backupPath), { recursive: true });
      renameSync(destination, oldLocation);
    }
    renameSync(staged, destination);
    installed = true;
    if (oldLocation === previous) rmSync(previous, { recursive: true, force: true });
    return backupPath;
  } catch (error) {
    if (installed && existsSync(destination)) rmSync(destination, { recursive: true, force: true });
    if (oldLocation && existsSync(oldLocation) && !existsSync(destination)) {
      renameSync(oldLocation, destination);
    }
    throw error;
  } finally {
    rmSync(transaction, { recursive: true, force: true });
  }
}

export function install(hosts, {
  root = ROOT,
  dryRun = false,
  backup = true,
} = {}) {
  const results = [];
  for (const host of hosts) {
    const sourceRoot = sourceRootForHost(root, host);
    if (!existsSync(sourceRoot)) {
      throw new Error(`generated source tree missing for ${host.id}: ${sourceRoot}`);
    }
    const skills = readdirSync(sourceRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(join(sourceRoot, entry.name, "SKILL.md")))
      .map((entry) => ({
        source: join(sourceRoot, entry.name),
        sourceName: readSkillName(join(sourceRoot, entry.name)),
        identity: readSkillIdentity(join(sourceRoot, entry.name)),
      }))
      .sort((a, b) => a.identity.localeCompare(b.identity));
    for (const skill of skills) {
      const dirName = prefixedDirName(skill.identity);
      if (
        dirName.length > 64
        || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(dirName)
      ) {
        throw new Error(
          `refusing installed skill name that violates lowercase-hyphen Agent Skills identity rules: ${JSON.stringify(dirName)}`,
        );
      }
      const destination = join(host.abs, dirName);
      const legacyDirName = prefixedDirName(skill.sourceName);
      const legacyDestination = legacyDirName === dirName
        ? null
        : join(host.abs, legacyDirName);
      const legacyUnmanaged = legacyDestination && existsSync(legacyDestination)
        ? legacyDestination
        : null;
      if (legacyUnmanaged) {
        console.warn(
          `  warning: unmanaged legacy skill remains at ${legacyUnmanaged}; ` +
          "review and remove it manually after confirming it is not personal",
        );
      }
      if (dryRun) {
        console.log(`  would install ${skill.sourceName} -> ${destination}`);
        results.push({
          host: host.id,
          dir: dirName,
          destination,
          legacyUnmanaged,
          status: "would-install",
        });
        continue;
      }
      const backupPath = replaceSkill(skill.source, destination, { backup });
      if (backupPath) console.log(`  backed up existing ${destination} -> ${backupPath}`);
      console.log(`  installed ${skill.sourceName} -> ${destination}`);
      results.push({
        host: host.id,
        dir: dirName,
        destination,
        backup: backupPath,
        legacyUnmanaged,
        status: "installed",
      });
    }
  }
  return results;
}

export function main(argv = process.argv.slice(2)) {
  const doInstall = argv.includes("--install");
  const dryRun = argv.includes("--dry-run");
  const backup = !argv.includes("--no-backup");
  console.log("==> regenerating all host skill variants");
  run("scripts/gen-skill-docs.mjs", "--all-hosts");
  console.log("\n==> validating example matter");
  try {
    run("packages/apa-validate/validate.mjs", join(ROOT, "examples", "minimal-patent-artifact"));
  } catch {
    // validate exits 1/2 on warnings/errors; that result is already reported and setup continues.
  }

  const hosts = detectHosts();
  console.log(`\n==> detected hosts: ${hosts.length ? hosts.map((host) => host.id).join(", ") : "none"}`);
  if (doInstall) {
    if (!hosts.length) {
      console.log("  no host config dirs found under your home; nothing installed.");
    } else {
      console.log(`==> ${dryRun ? "previewing skill installation" : "installing skills"}`);
      install(hosts, { dryRun, backup });
    }
  } else {
    console.log("  (run with --install to copy skills into the detected host skill root; add --dry-run to preview)");
  }

  console.log("\nNext steps:");
  console.log("  - Read docs/legal-guardrails.md and DESIGN.md.");
  console.log("  - Try the validator:  node packages/apa-validate/validate.mjs examples/minimal-patent-artifact");
  console.log("  - Build the viewer:   node packages/apa-viewer/build_manifest.mjs examples/minimal-patent-artifact --out examples/minimal-patent-artifact/manifest.json");
  console.log("  - Reminder: APA is assistive, not legal advice; a human signs and files.");
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
