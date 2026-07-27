import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, dirname, join } from "node:path";

const DEFAULT_LOCK_TIMEOUT_MS = 5_000;
const DEFAULT_STALE_LOCK_MS = 30_000;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function readJsonFile(path, fallback) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new Error(`invalid JSON in ${basename(path)}: ${err.message}`);
  }
}

export function atomicWriteFile(path, content) {
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true });
  const temp = join(dir, `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`);
  let fd;
  try {
    fd = openSync(temp, "wx", 0o600);
    writeFileSync(fd, content, "utf8");
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    renameSync(temp, path);
  } catch (err) {
    if (fd !== undefined) {
      try { closeSync(fd); } catch { /* best-effort cleanup */ }
    }
    rmSync(temp, { force: true });
    throw err;
  }
}

export function atomicWriteJson(path, value) {
  atomicWriteFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function acquireFileLock(path, {
  timeoutMs = DEFAULT_LOCK_TIMEOUT_MS,
  staleMs = DEFAULT_STALE_LOCK_MS,
} = {}) {
  const lockPath = `${path}.lock`;
  mkdirSync(dirname(path), { recursive: true });
  const deadline = Date.now() + timeoutMs;

  while (true) {
    let fd;
    let created = false;
    try {
      fd = openSync(lockPath, "wx", 0o600);
      created = true;
      writeFileSync(fd, JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }), "utf8");
      fsyncSync(fd);
      closeSync(fd);
      return () => rmSync(lockPath, { force: true });
    } catch (err) {
      if (fd !== undefined) {
        try { closeSync(fd); } catch { /* best-effort cleanup */ }
      }
      if (created) rmSync(lockPath, { force: true });
      if (err.code !== "EEXIST") throw err;

      try {
        if (Date.now() - statSync(lockPath).mtimeMs > staleMs) {
          rmSync(lockPath, { force: true });
          continue;
        }
      } catch (statErr) {
        if (statErr.code === "ENOENT") continue;
        throw statErr;
      }

      if (Date.now() >= deadline) {
        throw new Error(`timed out waiting for ${basename(path)} lock`);
      }
      await delay(25);
    }
  }
}

export async function updateJsonFile(path, fallback, updater, options) {
  const release = await acquireFileLock(path, options);
  try {
    const current = readJsonFile(path, fallback);
    const next = await updater(current);
    atomicWriteJson(path, next);
    return next;
  } finally {
    release();
  }
}
