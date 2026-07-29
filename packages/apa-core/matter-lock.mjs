import {
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

export function matterWriteLockPath(matterDir) {
  return join(resolve(matterDir), "trace", ".apa-write.lock");
}

export function readMatterWriteLock(matterDir) {
  const path = matterWriteLockPath(matterDir);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return { schema: "apa-matter-write-lock-v1", owner: "unknown", malformed: true };
  }
}

export function withMatterWriteLock(matterDir, operation, {
  owner = "apa",
  timestamp = new Date().toISOString(),
} = {}) {
  if (typeof operation !== "function") throw new TypeError("operation must be a function");
  const root = resolve(matterDir);
  if (!existsSync(root) || !lstatSync(root).isDirectory()) {
    throw new Error("matter directory does not exist");
  }
  const rootReal = realpathSync(root);
  const traceDir = join(rootReal, "trace");
  if (existsSync(traceDir) && lstatSync(traceDir).isSymbolicLink()) {
    throw new Error("refusing a symlinked matter trace directory");
  }
  mkdirSync(traceDir, { recursive: true });
  const path = join(traceDir, ".apa-write.lock");
  const token = randomUUID();
  let fd;
  try {
    fd = openSync(path, "wx", 0o600);
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    const held = readMatterWriteLock(rootReal);
    const heldBy = String(held?.owner || "unknown").replace(/[\r\n]/g, " ").slice(0, 80);
    throw new Error(`matter write lock is held by ${heldBy}`);
  }
  try {
    writeFileSync(fd, `${JSON.stringify({
      schema: "apa-matter-write-lock-v1",
      token,
      owner,
      pid: process.pid,
      acquired_at: timestamp,
    })}\n`, "utf8");
    closeSync(fd);
    fd = undefined;
    const result = operation({ token, path, matterDir: rootReal });
    if (result && typeof result.then === "function") {
      throw new TypeError("withMatterWriteLock operations must be synchronous");
    }
    return result;
  } finally {
    if (fd !== undefined) closeSync(fd);
    try {
      const held = readMatterWriteLock(rootReal);
      if (held?.token === token) rmSync(path, { force: true });
    } catch {
      // Preserve an unreadable or replaced lock for explicit operator inspection.
    }
  }
}
