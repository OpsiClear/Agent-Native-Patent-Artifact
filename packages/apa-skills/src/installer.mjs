// Pure-ish install / uninstall logic. The functions here take everything they
// need as arguments (home, hosts, skillsDir, prefix, stamp) and never call
// Date.now()/Math.random() themselves — callers pass a `stamp` so behaviour is
// deterministic and testable. `dryRun` reports without touching disk.

import fs from "node:fs";
import path from "node:path";
import { discoverSkills } from "./skills.mjs";

const LOCK_FILE = ".apa-skills.json";
let tempFileCounter = 0;

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else if (entry.isFile()) fs.copyFileSync(s, d);
    else throw new Error(`refusing unsupported bundled skill entry: ${s}`);
  }
}

function rmIfExists(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

function prefixedDirName(name, prefix) {
  return String(name || "").startsWith(prefix) ? String(name) : `${prefix}${name}`;
}

function readLock(lockPath) {
  if (!fs.existsSync(lockPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(lockPath, "utf8"));
  } catch {
    return null;
  }
}

function lockOwnedDirs(lock) {
  return new Set(
    lock && Array.isArray(lock.skills)
      ? lock.skills.map((s) => s && s.dir).filter((dir) => typeof dir === "string")
      : [],
  );
}

function safeLockedDirName(dirName) {
  return typeof dirName === "string"
    && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(dirName)
    && path.basename(dirName) === dirName;
}

function validateOwnedDirs(lock, lockPath, prefix) {
  const owned = lockOwnedDirs(lock);
  for (const dirName of owned) {
    if (!safeLockedDirName(dirName)) {
      throw new Error(`refusing unsafe directory name in ownership lockfile ${lockPath}: ${JSON.stringify(dirName)}`);
    }
    if (!dirName.startsWith(prefix)) {
      throw new Error(
        `refusing directory outside recorded prefix "${prefix}" in ownership lockfile ${lockPath}: ${JSON.stringify(dirName)}`,
      );
    }
  }
  return owned;
}

function atomicWriteText(file, content) {
  const temp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${++tempFileCounter}.tmp`);
  let fd;
  try {
    fd = fs.openSync(temp, "wx", 0o600);
    fs.writeFileSync(fd, content, "utf8");
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(temp, file);
  } catch (error) {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch { /* best-effort cleanup */ }
    }
    fs.rmSync(temp, { force: true });
    throw error;
  }
}

function installPlan(plan, { prefix, stamp, version }) {
  fs.mkdirSync(plan.root, { recursive: true });
  const transactionRoot = fs.mkdtempSync(path.join(plan.root, ".apa-skills-transaction-"));
  const stagedRoot = path.join(transactionRoot, "staged");
  const backupRoot = path.join(transactionRoot, "backup");
  const touched = [];
  try {
    for (const skill of plan.installed) {
      copyDir(skill.source, path.join(stagedRoot, skill.dir));
    }

    const currentByDir = new Map(plan.installed.map(skill => [skill.dir, skill]));
    for (const dirName of [...currentByDir.keys(), ...plan.staleOwned]) {
      const skill = currentByDir.get(dirName);
      const dest = path.join(plan.root, dirName);
      const backup = path.join(backupRoot, dirName);
      const operation = { dest, backup, hadOld: false, installed: false };
      touched.push(operation);
      if (fs.existsSync(dest)) {
        fs.mkdirSync(path.dirname(backup), { recursive: true });
        fs.renameSync(dest, backup);
        operation.hadOld = true;
      }
      if (skill) {
        fs.renameSync(path.join(stagedRoot, dirName), dest);
        operation.installed = true;
      }
    }

    const lock = {
      version,
      prefix,
      installedAt: stamp,
      skills: plan.installed.map((s) => ({ name: s.name, dir: s.dir })),
    };
    atomicWriteText(plan.lockPath, JSON.stringify(lock, null, 2) + "\n");
  } catch (error) {
    for (const operation of touched.reverse()) {
      if (operation.installed && fs.existsSync(operation.dest)) rmIfExists(operation.dest);
      if (operation.hadOld && fs.existsSync(operation.backup)) {
        fs.renameSync(operation.backup, operation.dest);
      }
    }
    rmIfExists(transactionRoot);
    throw error;
  }
  rmIfExists(transactionRoot);
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
  const plans = hosts.map((host) => {
    const root = path.join(home, host.skillRoot);
    const lockPath = path.join(root, LOCK_FILE);
    const lockExists = fs.existsSync(lockPath);
    const lock = readLock(lockPath);
    if (lockExists && !lock) {
      throw new Error(`refusing to install over unreadable ownership lockfile: ${lockPath}`);
    }
    if (lock && lock.prefix !== prefix) {
      throw new Error(
        `refusing to replace an installation owned by prefix "${lock.prefix}" with "${prefix}" at ${root}; uninstall it explicitly first`,
      );
    }
    const owned = validateOwnedDirs(lock, lockPath, prefix);
    const installed = skills.map((skill) => {
      const dirName = prefixedDirName(skill.name, prefix);
      if (!safeLockedDirName(dirName)) {
        throw new Error(`refusing unsafe installed skill directory name: ${JSON.stringify(dirName)}`);
      }
      const dest = path.join(root, dirName);
      return { name: skill.name, dir: dirName, dest, source: skill.dir };
    });
    const installedDirs = new Set();
    for (const skill of installed) {
      if (installedDirs.has(skill.dir)) {
        throw new Error(`duplicate installed skill directory name: ${skill.dir}`);
      }
      installedDirs.add(skill.dir);
    }
    const conflicts = installed.filter((skill) => fs.existsSync(skill.dest) && !owned.has(skill.dir));
    if (conflicts.length) {
      throw new Error(
        `refusing to overwrite skill director${conflicts.length === 1 ? "y" : "ies"} not owned by ${LOCK_FILE}: ${conflicts.map((s) => s.dest).join(", ")}`,
      );
    }
    const staleOwned = [...owned].filter(dirName => !installedDirs.has(dirName));
    return { host, root, lockPath, installed, staleOwned };
  });

  const hostSummaries = [];
  for (const plan of plans) {
    if (!dryRun) installPlan(plan, { prefix, stamp, version });

    hostSummaries.push({
      host: plan.host.id,
      root: plan.root,
      lockPath: plan.lockPath,
      installed: plan.installed.map(({ source, ...skill }) => skill),
      staleOwned: plan.staleOwned.map(dir => ({ dir, dest: path.join(plan.root, dir) })),
    });
  }

  return { action: "install", dryRun, prefix, skillCount: skills.length, hosts: hostSummaries };
}

/**
 * uninstall({ home, hosts, prefix='apa-', dryRun })
 *
 * Removes only skill dirs recorded in the ownership lockfile, plus that lockfile.
 * Prefix-shaped directories not owned by this installer are deliberately preserved.
 */
export function uninstall({ home, hosts, prefix = "apa-", dryRun = false }) {
  const hostSummaries = [];

  for (const host of hosts) {
    const root = path.join(home, host.skillRoot);
    const lockPath = path.join(root, LOCK_FILE);
    const removed = [];

    const targets = new Set();
    const lockExists = fs.existsSync(lockPath);
    const lock = readLock(lockPath);
    if (lockExists && !lock) {
      throw new Error(`refusing to uninstall from unreadable ownership lockfile: ${lockPath}`);
    }
    if (lock && lock.prefix !== prefix) {
      throw new Error(
        `ownership lockfile uses prefix "${lock.prefix}", not "${prefix}", at ${root}; pass the recorded prefix explicitly`,
      );
    }
    for (const dirName of validateOwnedDirs(lock, lockPath, prefix)) {
      targets.add(dirName);
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
