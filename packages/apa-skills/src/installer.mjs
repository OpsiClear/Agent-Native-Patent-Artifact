// Pure-ish install / uninstall logic. The functions here take everything they
// need as arguments (home, hosts, skillsDir, prefix, stamp) and never call
// Date.now()/Math.random() themselves — callers pass a `stamp` so behaviour is
// deterministic and testable. `dryRun` reports without touching disk.

import fs from "node:fs";
import path from "node:path";
import { discoverSkills } from "./skills.mjs";

const LOCK_FILE = ".apa-skills.json";

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function rmIfExists(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

function readLock(lockPath) {
  if (!fs.existsSync(lockPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(lockPath, "utf8"));
  } catch {
    return null;
  }
}

/**
 * install({ home, hosts, skillsDir, prefix='apa-', dryRun, stamp, version })
 *
 *   home:      string  — user home directory (install root base)
 *   hosts:     Host[]  — target hosts (from src/hosts.mjs)
 *   skillsDir: string  — bundled skills source directory
 *   prefix:    string  — dir-name prefix for installed skills (default "apa-")
 *   dryRun:    boolean — report without writing
 *   stamp:     string  — timestamp recorded in the lockfile (injected, NOT generated here)
 *   version:   string  — installer/skill-pack version recorded in the lockfile
 *
 * Copies each skill dir into <home>/<host.skillRoot>/<prefix><name>/ and writes
 * a lockfile at <home>/<host.skillRoot>/.apa-skills.json. Returns a summary.
 */
export function install({
  home,
  hosts,
  skillsDir,
  prefix = "apa-",
  dryRun = false,
  stamp = "",
  version = "0.0.0",
}) {
  const skills = discoverSkills(skillsDir);
  const hostSummaries = [];

  for (const host of hosts) {
    const root = path.join(home, host.skillRoot);
    const installed = [];

    for (const skill of skills) {
      const dirName = `${prefix}${skill.name}`;
      const dest = path.join(root, dirName);
      if (!dryRun) {
        rmIfExists(dest);
        copyDir(skill.dir, dest);
      }
      installed.push({ name: skill.name, dir: dirName, dest });
    }

    const lockPath = path.join(root, LOCK_FILE);
    if (!dryRun) {
      fs.mkdirSync(root, { recursive: true });
      const lock = {
        version,
        prefix,
        installedAt: stamp,
        skills: installed.map((s) => ({ name: s.name, dir: s.dir })),
      };
      fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + "\n");
    }

    hostSummaries.push({
      host: host.id,
      root,
      lockPath,
      installed,
    });
  }

  return { action: "install", dryRun, prefix, skillCount: skills.length, hosts: hostSummaries };
}

/**
 * uninstall({ home, hosts, prefix='apa-', dryRun })
 *
 * Removes the <prefix>* skill dirs recorded in the lockfile (and, defensively,
 * any <prefix>* dirs present on disk) plus the lockfile itself. Returns a
 * summary of what was removed.
 */
export function uninstall({ home, hosts, prefix = "apa-", dryRun = false }) {
  const hostSummaries = [];

  for (const host of hosts) {
    const root = path.join(home, host.skillRoot);
    const lockPath = path.join(root, LOCK_FILE);
    const removed = [];

    // Collect dirs to remove: those recorded in the lockfile, plus any
    // <prefix>* dirs found on disk (set-union, no duplicates).
    const targets = new Set();
    const lock = readLock(lockPath);
    if (lock && Array.isArray(lock.skills)) {
      for (const s of lock.skills) if (s && s.dir) targets.add(s.dir);
    }
    if (fs.existsSync(root)) {
      for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        if (entry.isDirectory() && entry.name.startsWith(prefix)) {
          targets.add(entry.name);
        }
      }
    }

    for (const dirName of targets) {
      const dest = path.join(root, dirName);
      if (fs.existsSync(dest)) {
        if (!dryRun) rmIfExists(dest);
        removed.push({ dir: dirName, dest });
      }
    }

    let lockRemoved = false;
    if (fs.existsSync(lockPath)) {
      if (!dryRun) rmIfExists(lockPath);
      lockRemoved = true;
    }

    hostSummaries.push({ host: host.id, root, lockPath, lockRemoved, removed });
  }

  return { action: "uninstall", dryRun, prefix, hosts: hostSummaries };
}
