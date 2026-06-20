#!/usr/bin/env node
// apa-skills — installer for the Agent-Native Patent Artifact (APA) skills.
// Standalone, zero-dependency, Node built-ins only. Non-interactive.
//
//   apa-skills install   [--host <id>] [--prefix <p>] [--dry-run]
//   apa-skills uninstall [--host <id>] [--prefix <p>] [--dry-run]
//   apa-skills list

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ALL_HOSTS, getHost, detectHosts } from "../src/hosts.mjs";
import { discoverSkills } from "../src/skills.mjs";
import { install, uninstall } from "../src/installer.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(HERE, "..");

const DISCLAIMER =
  "APA is assistive, not legal advice; a human signs and files.";

const HELP = `apa-skills — install Agent-Native Patent Artifact (APA) skills

Usage:
  npx @apa/patent-skills install   [--host <id>] [--prefix <p>] [--dry-run]
  npx @apa/patent-skills uninstall [--host <id>] [--prefix <p>] [--dry-run]
  npx @apa/patent-skills list

Commands:
  install     Copy APA skills into each detected host's skill directory.
              Defaults to ALL detected hosts; narrow with --host.
  uninstall   Remove previously installed <prefix>* skills and the lockfile.
  list        Show discovered skills and detected hosts.

Options:
  --host <id>     Target one host: ${ALL_HOSTS.map((h) => h.id).join(", ")} (repeatable)
  --prefix <p>    Skill directory prefix (default: apa-)
  --dry-run       Report what would change without touching disk
  -h, --help      Show this help

${DISCLAIMER}`;

function parseArgs(argv) {
  const out = { _: [], hosts: [], prefix: undefined, dryRun: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--host") out.hosts.push(argv[++i]);
    else if (a === "--prefix") out.prefix = argv[++i];
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--help" || a === "-h") out.help = true;
    else if (a.startsWith("-")) throw new Error(`Unknown flag: ${a}`);
    else out._.push(a);
  }
  return out;
}

/** Locate the bundled skills directory: prefer sibling skills/, else repo root. */
function resolveSkillsDir() {
  const bundled = path.join(PKG_ROOT, "skills");
  if (hasSkills(bundled)) return bundled;
  const repoRoot = path.resolve(PKG_ROOT, "..", "..", "skills");
  if (hasSkills(repoRoot)) return repoRoot;
  throw new Error(
    `Could not locate a skills directory. Looked in:\n  ${bundled}\n  ${repoRoot}\n` +
      `Run scripts/bundle-skills.mjs to populate the bundled copy.`
  );
}

function hasSkills(dir) {
  if (!fs.existsSync(dir)) return false;
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .some((e) => e.isDirectory() && fs.existsSync(path.join(dir, e.name, "SKILL.md")));
  } catch {
    return false;
  }
}

function readVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(PKG_ROOT, "package.json"), "utf8"));
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/** Resolve target hosts: explicit --host wins, else all detected, else error. */
function resolveHosts(requested, home) {
  if (requested.length > 0) return requested.map((id) => getHost(id));
  const detected = detectHosts(home);
  return detected;
}

function main(argv) {
  const args = parseArgs(argv);

  if (args.help || args._.length === 0) {
    console.log(HELP);
    return 0;
  }

  const cmd = args._[0];
  const home = os.homedir();
  const skillsDir = resolveSkillsDir();
  const prefix = args.prefix || "apa-";

  if (cmd === "list") {
    const skills = discoverSkills(skillsDir);
    const detected = detectHosts(home);
    console.log(`APA skills (${skills.length}) — from ${skillsDir}\n`);
    for (const s of skills) {
      const desc = s.description ? s.description.slice(0, 100) : "(no description)";
      console.log(`  ${s.name}`);
      console.log(`    ${desc}`);
    }
    console.log(`\nHosts:`);
    for (const h of ALL_HOSTS) {
      const tag = detected.some((d) => d.id === h.id) ? "detected" : "not detected";
      console.log(`  ${h.id.padEnd(8)} ${h.skillRoot.padEnd(16)} [${tag}]`);
    }
    console.log(`\n${DISCLAIMER}`);
    return 0;
  }

  if (cmd === "install") {
    const hosts = resolveHosts(args.hosts, home);
    if (hosts.length === 0) {
      console.error(
        "No target hosts. None of " +
          ALL_HOSTS.map((h) => `.${h.id.split(/[\\/]/)[0]}`).join(", ") +
          ` were detected under ${home}. Pass --host <id> to force one.`
      );
      return 2;
    }
    const summary = install({
      home,
      hosts,
      skillsDir,
      prefix,
      dryRun: args.dryRun,
      stamp: new Date().toISOString(),
      version: readVersion(),
    });
    const verb = args.dryRun ? "Would install" : "Installed";
    console.log(`${verb} ${summary.skillCount} skill(s) (prefix "${prefix}")\n`);
    for (const h of summary.hosts) {
      console.log(`  ${h.host} -> ${h.root}`);
      for (const s of h.installed) console.log(`    + ${s.dir}`);
      if (!args.dryRun) console.log(`    lockfile: ${h.lockPath}`);
    }
    console.log(`\n${DISCLAIMER}`);
    return 0;
  }

  if (cmd === "uninstall") {
    // Uninstall targets explicitly requested hosts, else all known hosts
    // (so cleanup works even if a config dir was removed after install).
    const hosts = args.hosts.length > 0 ? args.hosts.map((id) => getHost(id)) : ALL_HOSTS;
    const summary = uninstall({ home, hosts, prefix, dryRun: args.dryRun });
    const verb = args.dryRun ? "Would remove" : "Removed";
    let total = 0;
    for (const h of summary.hosts) {
      if (h.removed.length === 0 && !h.lockRemoved) continue;
      console.log(`  ${h.host} -> ${h.root}`);
      for (const s of h.removed) {
        console.log(`    - ${s.dir}`);
        total++;
      }
      if (h.lockRemoved) console.log(`    - ${path.basename(h.lockPath)}`);
    }
    console.log(`\n${verb} ${total} skill dir(s) matching "${prefix}*".`);
    console.log(`\n${DISCLAIMER}`);
    return 0;
  }

  console.error(`Unknown command: ${cmd}\n`);
  console.log(HELP);
  return 2;
}

try {
  const code = main(process.argv.slice(2));
  process.exit(code);
} catch (err) {
  console.error(`\nError: ${err?.message ?? err}`);
  if (process.env.APA_SKILLS_DEBUG) console.error(err?.stack);
  process.exit(1);
}
