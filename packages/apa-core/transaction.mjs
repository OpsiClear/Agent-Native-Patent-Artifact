import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { sha256 } from "./canonical.mjs";

export const transactionPath = (matter) => join(resolve(matter), "trace", "pending-transaction.json");

function confined(matter, path) {
  const root = resolve(matter);
  const target = resolve(root, path);
  const rel = relative(root, target);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || resolve(path) === path) {
    throw new Error("transaction path must remain within its matter");
  }
  let current = root;
  for (const part of rel.split(sep)) {
    current = join(current, part);
    if (lstatSync(current, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error("transaction refuses symbolic links");
  }
  return target;
}

function digest(path) {
  return existsSync(path) ? sha256(readFileSync(path)) : null;
}

function atomicBytes(path, bytes) {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${randomUUID()}.tmp`;
  let fd;
  try {
    fd = openSync(temp, "wx", 0o600);
    writeFileSync(fd, bytes);
    fsyncSync(fd);
    closeSync(fd); fd = undefined;
    renameSync(temp, path);
  } finally {
    if (fd !== undefined) closeSync(fd);
    rmSync(temp, { force: true });
  }
}

// Caller holds the matter writer lock. The durable journal stores exact already-validated bytes;
// recovery completes those bytes, never regenerating a timestamp or a human decision.
export function recoverMatterTransaction(matter, { afterWrite = () => {} } = {}) {
  const journalPath = confined(matter, "trace/pending-transaction.json");
  if (!existsSync(journalPath)) return false;
  const journal = JSON.parse(readFileSync(journalPath, "utf8"));
  if (journal.schema !== "apa-write-transaction-v1" || !Array.isArray(journal.writes) || !journal.writes.length) {
    throw new Error("invalid pending transaction; preserve it for operator inspection");
  }
  const prepared = journal.writes.map((write) => {
    const path = confined(matter, write.path);
    const bytes = Buffer.from(write.bytes, "base64");
    if (sha256(bytes) !== write.after) throw new Error("pending transaction content digest differs");
    const current = digest(path);
    if (current !== write.before && current !== write.after) throw new Error(`transaction conflict: ${write.path}`);
    return { ...write, path, bytes };
  });
  for (const [index, write] of prepared.entries()) {
    if (digest(write.path) !== write.after) atomicBytes(write.path, write.bytes);
    afterWrite(index);
  }
  rmSync(journalPath);
  return true;
}

export function commitMatterFiles(matter, writes, options) {
  if (existsSync(confined(matter, "trace/pending-transaction.json"))) throw new Error("pending transaction requires recovery");
  const seen = new Set();
  const records = writes.map(({ path, bytes, replace = false }) => {
    const rel = relative(resolve(matter), resolve(path)).replace(/\\/g, "/");
    const target = confined(matter, rel);
    if (seen.has(rel) || rel === "trace/pending-transaction.json") throw new Error("duplicate or reserved transaction path");
    seen.add(rel);
    const data = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    const before = digest(target);
    const after = sha256(data);
    if (!replace && before !== null && before !== after) throw new Error(`immutable record already exists with different content: ${rel}`);
    return { path: rel, before, after, bytes: data.toString("base64") };
  });
  atomicBytes(transactionPath(matter), Buffer.from(JSON.stringify({ schema: "apa-write-transaction-v1", writes: records })));
  recoverMatterTransaction(matter, options);
}
