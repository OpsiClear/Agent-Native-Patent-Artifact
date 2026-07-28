// Pure-ish install / uninstall logic. The functions here take everything they
// need as arguments (home, hosts, skillsDir, prefix, stamp) and never call
// Date.now()/Math.random() themselves — callers pass a `stamp` so behaviour is
// deterministic and testable. `dryRun` reports without touching disk.

import fs from "node:fs";
import path from "node:path";
import { discoverSkills } from "./skills.mjs";

const LOCK_FILE = ".apa-skills.json";
const IDENTITY_VERSION = "directory-frontmatter-v1";
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

function rewriteInstalledSkillName(skillDir, installedName) {
  const skillPath = path.join(skillDir, "SKILL.md");
  const source = fs.readFileSync(skillPath, "utf8");
  const match = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(source);
  if (!match) throw new Error(`installed skill is missing frontmatter: ${skillPath}`);
  const nameLines = match[1].match(/^name:\s*.*$/gm) || [];
  if (nameLines.length !== 1) {
    throw new Error(`installed skill must declare exactly one frontmatter name: ${skillPath}`);
  }
  const rewrittenHeader = match[0].replace(/^name:\s*.*$/m, `name: ${installedName}`);
  fs.writeFileSync(skillPath, rewrittenHeader + source.slice(match[0].length), "utf8");
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

function validInstalledSkillName(name) {
  return typeof name === "string"
    && name.length <= 64
    && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name);
}

function isApaRepoRoot(dir) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
    return pkg.name === "agent-native-patent-artifact";
  } catch {
    return false;
  }
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

function legacyInstallationsForHost({ home, host, root, prefix }) {
  const installations = [];
  for (const relativeRoot of host.legacySkillRoots || []) {
    const legacyRoot = path.join(home, relativeRoot);
    if (path.resolve(legacyRoot) === path.resolve(root)) continue;
    const lockPath = path.join(legacyRoot, LOCK_FILE);
    if (!fs.existsSync(lockPath)) continue;
    const lock = readLock(lockPath);
    if (!lock) {
      throw new Error(`refusing to migrate unreadable ownership lockfile: ${lockPath}`);
    }
    if (lock.prefix !== prefix) {
      throw new Error(
        `legacy ownership lockfile uses prefix "${lock.prefix}", not "${prefix}", at ${legacyRoot}`,
      );
    }
    installations.push({
      root: legacyRoot,
      lockPath,
      owned: [...validateOwnedDirs(lock, lockPath, prefix)],
    });
  }
  return installations;
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
  const legacyTouched = [];
  try {
    for (const skill of plan.installed) {
      const stagedSkill = path.join(stagedRoot, skill.dir);
      copyDir(skill.source, stagedSkill);
      rewriteInstalledSkillName(stagedSkill, skill.dir);
    }

    for (const [legacyIndex, legacy] of plan.legacyInstallations.entries()) {
      for (const dirName of legacy.owned) {
        const source = path.join(legacy.root, dirName);
        if (!fs.existsSync(source)) continue;
        const backup = path.join(backupRoot, `legacy-${legacyIndex}`, "skills", dirName);
        fs.mkdirSync(path.dirname(backup), { recursive: true });
        fs.renameSync(source, backup);
        legacyTouched.push({ source, backup });
      }
      const lockBackup = path.join(backupRoot, `legacy-${legacyIndex}`, LOCK_FILE);
      fs.mkdirSync(path.dirname(lockBackup), { recursive: true });
      fs.renameSync(legacy.lockPath, lockBackup);
      legacyTouched.push({ source: legacy.lockPath, backup: lockBackup });
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
      identity: IDENTITY_VERSION,
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
    for (const operation of legacyTouched.reverse()) {
      if (!fs.existsSync(operation.backup)) continue;
      fs.mkdirSync(path.dirname(operation.source), { recursive: true });
      fs.renameSync(operation.backup, operation.source);
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
 *   prefix:    string  — canonical identity prefix; install accepts only "apa-"
 *   dryRun:    boolean — report without writing
 *   stamp:     string  — timestamp recorded in the lockfile (injected, NOT generated here)
 *   version:   string  — installer/skill-pack version recorded in the lockfile
 *
 * Copies each skill dir into <home>/<host.skillRoot>/<skill.yaml id>/ and writes
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
  if (prefix !== "apa-") {
    throw new Error(
      "install requires the canonical apa- identity prefix so installed names match documented invocations; custom prefixes remain accepted only by uninstall for legacy cleanup",
    );
  }
  const skillsForHost = (host) => {
    const hostDir = path.join(skillsDir, host.id);
    if (fs.existsSync(hostDir) && fs.statSync(hostDir).isDirectory()) {
      return discoverSkills(hostDir);
    }
    const repoRoot = path.dirname(skillsDir);
    if (isApaRepoRoot(repoRoot)) {
      const source = host.id === "claude"
        ? skillsDir
        : path.join(repoRoot, "dist", host.id);
      if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) {
        throw new Error(
          `generated ${host.id} skill variants are missing at ${source}; run scripts/gen-skill-docs.mjs --all-hosts`,
        );
      }
      return discoverSkills(source);
    }
    return discoverSkills(skillsDir);
  };
  const plans = hosts.map((host) => {
    const skills = skillsForHost(host);
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
      const dirName = skill.identity || prefixedDirName(skill.name, prefix);
      if (!safeLockedDirName(dirName) || !validInstalledSkillName(dirName)) {
        throw new Error(
          `refusing unsafe installed skill directory name or invalid lowercase-hyphen Agent Skills identity: ${JSON.stringify(dirName)}`,
        );
      }
      const dest = path.join(root, dirName);
      return { name: dirName, sourceName: skill.name, dir: dirName, dest, source: skill.dir };
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
    const legacyInstallations = legacyInstallationsForHost({
      home,
      host,
      root,
      prefix,
    });
    return { host, root, lockPath, installed, staleOwned, legacyInstallations };
  });

  const skillSets = plans.map((plan) => ({
    host: plan.host.id,
    names: plan.installed.map((skill) => skill.name).sort(),
  }));
  const expectedSkillSet = JSON.stringify(skillSets[0]?.names || []);
  if (skillSets.some(({ names }) => JSON.stringify(names) !== expectedSkillSet)) {
    throw new Error(`host skill variants contain inconsistent skill sets: ${JSON.stringify(skillSets)}`);
  }
  const hostSummaries = [];
  for (const plan of plans) {
    if (!dryRun) installPlan(plan, { prefix, stamp, version });

    hostSummaries.push({
      host: plan.host.id,
      root: plan.root,
      lockPath: plan.lockPath,
      installed: plan.installed.map(({ source, ...skill }) => skill),
      staleOwned: plan.staleOwned.map(dir => ({ dir, dest: path.join(plan.root, dir) })),
      migratedLegacy: plan.legacyInstallations.map((legacy) => ({
        root: legacy.root,
        lockPath: legacy.lockPath,
        owned: [...legacy.owned],
      })),
    });
  }

  return {
    action: "install",
    dryRun,
    prefix,
    skillCount: plans[0]?.installed.length || 0,
    hosts: hostSummaries,
  };
}

/**
 * uninstall({ home, hosts, prefix='apa-', dryRun })
 *
 * Removes only skill dirs recorded in the ownership lockfile, plus that lockfile.
 * Prefix-shaped directories not owned by this installer are deliberately preserved.
 */
export function uninstall({ home, hosts, prefix = "apa-", dryRun = false }) {
  const plans = hosts.map((host) => {
    const root = path.join(home, host.skillRoot);
    const lockPath = path.join(root, LOCK_FILE);
    const roots = [...new Set([host.skillRoot, ...(host.legacySkillRoots || [])])];
    const installations = [];
    for (const relativeRoot of roots) {
      const candidateRoot = path.join(home, relativeRoot);
      const candidateLockPath = path.join(candidateRoot, LOCK_FILE);
      const lockExists = fs.existsSync(candidateLockPath);
      const lock = readLock(candidateLockPath);
      if (lockExists && !lock) {
        throw new Error(`refusing to uninstall from unreadable ownership lockfile: ${candidateLockPath}`);
      }
      if (lock && lock.prefix !== prefix) {
        throw new Error(
          `ownership lockfile uses prefix "${lock.prefix}", not "${prefix}", at ${candidateRoot}; pass the recorded prefix explicitly`,
        );
      }
      installations.push({
        root: candidateRoot,
        lockPath: candidateLockPath,
        lockExists,
        owned: [...validateOwnedDirs(lock, candidateLockPath, prefix)],
      });
    }
    return { host, root, lockPath, installations };
  });

  const hostSummaries = [];
  for (const plan of plans) {
    const removed = [];
    const removedLockPaths = [];
    for (const installation of plan.installations) {
      for (const dirName of installation.owned) {
        const dest = path.join(installation.root, dirName);
        if (fs.existsSync(dest)) {
          if (!dryRun) rmIfExists(dest);
          removed.push({ dir: dirName, dest, root: installation.root });
        }
      }
      if (installation.lockExists) {
        if (!dryRun) rmIfExists(installation.lockPath);
        removedLockPaths.push(installation.lockPath);
      }
    }
    hostSummaries.push({
      host: plan.host.id,
      root: plan.root,
      lockPath: plan.lockPath,
      lockRemoved: removedLockPaths.length > 0,
      removedLockPaths,
      removed,
    });
  }

  return { action: "uninstall", dryRun, prefix, hosts: hostSummaries };
}
