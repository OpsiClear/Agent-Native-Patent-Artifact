/**
 * apa-prosecute/parse - parse a post-filing Office Action (`prosecution/oa-NN.md`).
 *
 * Per docs/protocol.md §8, an Office Action file carries:
 *   - a FILE-LEVEL ```oa fenced block: { mailing_date, examiner, application_no, action_type }
 *   - one `### REJ## - <gist>` section per rejection, each with a ```binding block:
 *       { ground, claims: [CLM##], references: [PA##], examiner_reasoning }
 *
 * This module reuses the SHARED parser (../../lib/apa-parse.mjs) - it never re-implements YAML.
 *
 * Node.js >=18, ESM, zero dependencies.
 */

import { readFileSync } from "node:fs";
import {
  loadYaml,
  iterEntitySections,
  extractBindingBlocks,
} from "../../lib/apa-parse.mjs";

// The file-level header block is fenced as ```oa ... ``` (distinct from the per-section ```binding).
const OA_HEADER_RE = /```oa[ \t]*\r?\n([\s\S]*?)\r?\n```/;

/** Normalize a YAML-parsed value into an array of strings (drops empties). */
function toIdList(v) {
  if (v == null) return [];
  const arr = Array.isArray(v) ? v : [v];
  return arr.map((x) => String(x).trim()).filter((x) => x.length > 0);
}

/**
 * Parse an Office Action's markdown text.
 *
 * @param {string} text  the full `oa-NN.md` contents.
 * @returns {{ header: { mailing_date: (string|null), examiner: (string|null),
 *             application_no: (string|null), action_type: (string|null) },
 *            rejections: Array<{ id: string, gist: string, ground: (string|null),
 *             claims: string[], references: string[], examiner_reasoning: (string|null) }> }}
 */
export function parseOfficeAction(text) {
  const src = String(text || "");

  // ---- File-level ```oa header block ----------------------------------------------------------
  let headerRaw = {};
  const hm = OA_HEADER_RE.exec(src);
  if (hm) {
    const parsed = loadYaml(hm[1]);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) headerRaw = parsed;
  }
  const header = {
    mailing_date: headerRaw.mailing_date != null ? String(headerRaw.mailing_date).trim() : null,
    examiner: headerRaw.examiner != null ? String(headerRaw.examiner) : null,
    application_no: headerRaw.application_no != null ? String(headerRaw.application_no) : null,
    action_type: headerRaw.action_type != null ? String(headerRaw.action_type).trim() : null,
  };

  // ---- Per-rejection `### REJ## - <gist>` sections --------------------------------------------
  const rejections = [];
  for (const section of iterEntitySections(src)) {
    if (!/^REJ\d+$/.test(section.id)) continue; // only rejection entities
    const binding = extractBindingBlocks(section.body)[0] || {};
    rejections.push({
      id: section.id,
      gist: (section.heading || "").replace(/^[-\s]+/, "").trim(),
      ground: binding.ground != null ? String(binding.ground).trim() : null,
      claims: toIdList(binding.claims),
      references: toIdList(binding.references),
      examiner_reasoning:
        binding.examiner_reasoning != null ? String(binding.examiner_reasoning).trim() : null,
    });
  }

  return { header, rejections };
}

/**
 * Read and parse an Office Action file from disk.
 * @param {string} path  path to `oa-NN.md`.
 */
export function parseOfficeActionFile(path) {
  return parseOfficeAction(readFileSync(path, "utf8"));
}
