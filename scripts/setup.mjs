#!/usr/bin/env node
/**
 * setup - prepare APA for use. Default (safe): regenerate skill docs, validate the example matter, and
 * print next steps + detected hosts. With `--install`, copy the generated skills into the detected
 * host's skill root (creating `apa-<name>` dirs). No external dependencies; Node >=21.
 *
 *   node scripts/setup.mjs            # gen + validate + report (no changes to your home dir)
 *   node scripts/setup.mjs --install  # also link/copy skills into ~/.claude/skills/apa-*
 *   node scripts/setup.mjs --install --dry-run
 */

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ALL_HOSTS } from "../hosts/index.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const node = process.execPath;
const run = (script, ...args) => execFileSync(node, [join(ROOT, script), ...args], { stdio: "inherit" });

function detectHosts() {
  return ALL_HOSTS.filter((h) => existsSync(join(homedir(), h.skillRoot.split("/")[0])))
    .map((h) => ({ ...h, abs: join(homedir(), ...h.skillRoot.split("/")) }));
}

function nextBackupPath(dst) {
  let candidate = `${dst}.bak`;
  let n = 1;
  while (existsSync(candidate)) candidate = `${dst}.bak.${n++}`;
  return candidate;
}

function install(hosts, { dryRun = false, backup = true } = {}) {
  const skillsDir = join(ROOT, "skills");
  const names = readdirSync(skillsDir).filter((n) => existsSync(join(skillsDir, n, "SKILL.md")));
  for (const h of hosts) {
    if (!dryRun) mkdirSync(h.abs, { recursive: true });
    for (const name of names) {
      const dst = join(h.abs, `apa-${name}`);
      if (dryRun) {
        console.log(`  would install ${name} -> ${dst}`);
        continue;
      }
      if (backup && existsSync(dst)) {
        const bak = nextBackupPath(dst);
        cpSync(dst, bak, { recursive: true });
        console.log(`  backed up existing ${dst} -> ${bak}`);
      }
      cpSync(join(skillsDir, name), dst, { recursive: true });
      console.log(`  installed ${name} -> ${dst}`);
    }
  }
}

function main() {
  const doInstall = process.argv.includes("--install");
  const dryRun = process.argv.includes("--dry-run");
  const backup = !process.argv.includes("--no-backup");
  console.log("==> regenerating skill docs"); run("scripts/gen-skill-docs.mjs");
  console.log("\n==> validating example matter");
  try { run("packages/apa-validate/validate.mjs", join(ROOT, "examples", "minimal-patent-artifact")); }
  catch { /* validate exits 1/2 on warnings/errors; that's reported, not fatal to setup */ }

  const hosts = detectHosts();
  console.log(`\n==> detected hosts: ${hosts.length ? hosts.map((h) => h.id).join(", ") : "none"}`);
  if (doInstall) {
    if (!hosts.length) { console.log("  no host config dirs found under your home; nothing installed."); }
    else { console.log(`==> ${dryRun ? "previewing skill installation" : "installing skills"}`); install(hosts, { dryRun, backup }); }
  } else {
    console.log("  (run with --install to copy skills into the detected host skill root; add --dry-run to preview)");
  }

  console.log("\nNext steps:");
  console.log("  - Read docs/legal-guardrails.md and DESIGN.md.");
  console.log("  - Try the validator:  node packages/apa-validate/validate.mjs examples/minimal-patent-artifact");
  console.log("  - Build the viewer:   node packages/apa-viewer/build_manifest.mjs examples/minimal-patent-artifact --out examples/minimal-patent-artifact/manifest.json");
  console.log("  - Reminder: APA is assistive, not legal advice; a human signs and files.");
}

main();
