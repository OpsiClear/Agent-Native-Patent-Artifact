/**
 * Bind a rigor review to the exact canonical matter inputs it evaluated.
 *
 * The assembly contract already inventories the authoritative matter surface. Rigor uses the same
 * records except for patent_rigor_report.json itself, avoiding a self-referential digest while still
 * covering claims, specification, drawings, prior-art dossiers, and matter metadata.
 */

import { createHash } from "node:crypto";

import { buildAssemblyInputFingerprint } from "../apa-core/assembly-fingerprint.mjs";

export const RIGOR_INPUT_CONTRACT = "apa-rigor-input-contract-v1";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function aggregate(files) {
  return sha256(files.map((file) => `${file.path}\0${file.bytes}\0${file.sha256}\n`).join(""));
}

export function buildRigorInputFingerprint(matterDir) {
  const base = buildAssemblyInputFingerprint(matterDir);
  const files = base.files.filter((file) => file.path !== "patent_rigor_report.json");
  return {
    schema: "apa-rigor-input-fingerprint-v1",
    contract: RIGOR_INPUT_CONTRACT,
    algorithm: "sha256",
    file_count: files.length,
    sha256: aggregate(files),
    files,
    unsafe_paths: base.unsafe_paths,
  };
}

export function compareRigorInputFingerprint(stored, matterDir) {
  const current = buildRigorInputFingerprint(matterDir);
  const reasons = [];
  if (!stored || typeof stored !== "object") {
    return {
      ok: false,
      reasons: ["rigor report has no input fingerprint"],
      current,
      changed: [],
      added: current.files.map((file) => file.path),
      removed: [],
    };
  }
  if (stored.schema !== current.schema) reasons.push(`unsupported rigor fingerprint schema '${stored.schema || "missing"}'`);
  if (stored.contract !== current.contract) reasons.push(`rigor input contract changed (${stored.contract || "missing"} -> ${current.contract})`);
  if (stored.algorithm !== current.algorithm) reasons.push(`unsupported rigor fingerprint algorithm '${stored.algorithm || "missing"}'`);
  if (!Array.isArray(stored.files)) reasons.push("stored rigor fingerprint files must be an array");
  if (current.unsafe_paths.length) reasons.push(`unsafe linked rigor input path(s): ${current.unsafe_paths.join(", ")}`);

  const before = new Map((Array.isArray(stored.files) ? stored.files : []).map((file) => [file.path, file]));
  const after = new Map(current.files.map((file) => [file.path, file]));
  const changed = current.files
    .filter((file) => {
      const prior = before.get(file.path);
      return prior && (prior.sha256 !== file.sha256 || Number(prior.bytes) !== file.bytes);
    })
    .map((file) => file.path);
  const added = current.files.filter((file) => !before.has(file.path)).map((file) => file.path);
  const removed = [...before.keys()].filter((path) => !after.has(path)).sort();
  if (changed.length) reasons.push(`${changed.length} rigor input file(s) changed`);
  if (added.length) reasons.push(`${added.length} rigor input file(s) added`);
  if (removed.length) reasons.push(`${removed.length} rigor input file(s) removed`);
  if (stored.sha256 !== current.sha256) reasons.push("aggregate rigor input digest differs");
  return { ok: reasons.length === 0, reasons, current, changed, added, removed };
}
