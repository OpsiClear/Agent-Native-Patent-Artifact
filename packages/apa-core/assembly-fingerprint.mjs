/**
 * Deterministic source-input fingerprint for an assembled filing package.
 *
 * Only canonical matter inputs are included. Paths are matter-relative POSIX paths, so the same
 * matter copied to a different directory produces the same fingerprint. Assembled outputs, PDFs,
 * PNGs, staging notes, runlogs, and free-form review memos are deliberately excluded.
 */

import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";

export const ASSEMBLY_INPUT_CONTRACT = "apa-assembly-input-contract-v1";

const EXACT_INPUTS = [
  "PATENT.md",
  "logic/problem.md",
  "logic/claims.md",
  "logic/concepts.md",
  "logic/patentability.md",
  "logic/prior_art.md",
  "logic/reference_matrix.md",
  "src/background.md",
  "src/summary.md",
  "src/embodiments.md",
  "trace/prosecution.yaml",
  "evidence/README.md",
  "patent_rigor_report.json",
];

const INPUT_TREES = [
  {
    dir: "evidence/drawings",
    include: (name) => /\.(?:md|svg|json)$/i.test(name),
  },
  {
    dir: "evidence/prior_art",
    include: (name) => /\.md$/i.test(name) || /^search-dossier-.*\.json$/i.test(name),
  },
  {
    dir: "src/drawing_src",
    include: (name) => /\.json$/i.test(name),
  },
];

const posixRelative = (root, path) => relative(root, path).replace(/\\/g, "/");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const isWithin = (root, candidate) => {
  const rel = relative(root, candidate);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
};

function listTreeFiles(root, rootReal, relDir, include, unsafePaths) {
  const base = join(root, ...relDir.split("/"));
  const baseStat = lstatSync(base, { throwIfNoEntry: false });
  if (!baseStat) return [];
  if (baseStat.isSymbolicLink() || !isWithin(rootReal, realpathSync(base))) {
    unsafePaths.push(relDir);
    return [];
  }
  if (!baseStat.isDirectory()) return [];
  const files = [];
  const walk = (dir) => {
    const names = readdirSync(dir).sort();
    for (const name of names) {
      const path = join(dir, name);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) {
        unsafePaths.push(posixRelative(root, path));
        continue;
      }
      if (stat.isDirectory()) walk(path);
      else if (stat.isFile() && include(name)) files.push(path);
    }
  };
  walk(base);
  return files;
}

export function buildAssemblyInputFingerprint(matterDir) {
  const unsafePaths = [];
  const paths = [];
  const rootReal = realpathSync(matterDir);
  for (const relPath of EXACT_INPUTS) {
    const path = join(matterDir, ...relPath.split("/"));
    const entry = lstatSync(path, { throwIfNoEntry: false });
    if (!entry) continue;
    if (entry.isSymbolicLink() || !isWithin(rootReal, realpathSync(path))) unsafePaths.push(relPath);
    else if (entry.isFile()) paths.push(path);
  }
  for (const tree of INPUT_TREES) {
    paths.push(...listTreeFiles(matterDir, rootReal, tree.dir, tree.include, unsafePaths));
  }

  const records = [...new Set(paths)]
    .map((path) => {
      const bytes = readFileSync(path);
      return {
        path: posixRelative(matterDir, path),
        bytes: bytes.length,
        sha256: sha256(bytes),
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));

  const serialized = records.map((record) => (
    `${record.path}\0${record.bytes}\0${record.sha256}\n`
  )).join("");
  return {
    schema: "apa-assembly-input-fingerprint-v1",
    contract: ASSEMBLY_INPUT_CONTRACT,
    algorithm: "sha256",
    file_count: records.length,
    sha256: sha256(serialized),
    files: records,
    unsafe_paths: unsafePaths.sort(),
  };
}

export function compareAssemblyInputFingerprint(stored, matterDir) {
  const current = buildAssemblyInputFingerprint(matterDir);
  const reasons = [];
  if (!stored || typeof stored !== "object") {
    reasons.push("stored upload manifest has no input fingerprint");
    return { ok: false, reasons, current, changed: [], added: current.files.map((file) => file.path), removed: [] };
  }
  if (stored.schema !== current.schema) reasons.push(`unsupported fingerprint schema '${stored.schema || "missing"}'`);
  if (stored.contract !== current.contract) reasons.push(`input contract changed (${stored.contract || "missing"} -> ${current.contract})`);
  if (stored.algorithm !== "sha256") reasons.push(`unsupported fingerprint algorithm '${stored.algorithm || "missing"}'`);
  if (!Array.isArray(stored.files)) reasons.push("stored fingerprint files must be an array");
  if (current.unsafe_paths.length) reasons.push(`unsafe linked input path(s): ${current.unsafe_paths.join(", ")}`);

  const oldByPath = new Map((Array.isArray(stored.files) ? stored.files : []).map((file) => [file.path, file]));
  const currentByPath = new Map(current.files.map((file) => [file.path, file]));
  const changed = current.files
    .filter((file) => {
      const before = oldByPath.get(file.path);
      return before && (before.sha256 !== file.sha256 || Number(before.bytes) !== file.bytes);
    })
    .map((file) => file.path);
  const added = current.files.filter((file) => !oldByPath.has(file.path)).map((file) => file.path);
  const removed = [...oldByPath.keys()].filter((path) => !currentByPath.has(path)).sort();
  if (changed.length) reasons.push(`${changed.length} input file(s) changed`);
  if (added.length) reasons.push(`${added.length} input file(s) added`);
  if (removed.length) reasons.push(`${removed.length} input file(s) removed`);
  if (stored.sha256 !== current.sha256) reasons.push("aggregate input digest differs");

  return { ok: reasons.length === 0, reasons, current, changed, added, removed };
}
