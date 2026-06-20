/**
 * apa-figure / numerals.mjs - consolidated reference-numeral legend builder.
 *
 * Reads every `evidence/drawings/*.md` in a matter (via the SHARED parser at
 * ../../lib/apa-parse.mjs - never a private parser), collects the
 * {fig, numeral, element, defined_in} entries from each FIG## binding block, and produces:
 *
 *   - entries           : a consolidated numeral legend (one row per fig+numeral)
 *   - briefDescription  : a "Brief Description of the Drawings" list, one line per figure
 *                         ("FIG. N - <title from the ### heading>")
 *   - flags             : drafting-time mirror of the validator's numeral check -
 *                           * NUMERAL_UNDEFINED  - a numeral whose `defined_in` is empty/missing
 *                           * NUMERAL_INCONSISTENT - a numeral that appears in more than one figure
 *                             mapping to a DIFFERENT element (inconsistent numbering)
 *
 * This is a drafting aid, not the authoritative validator. Node >=21, ESM, zero deps.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { extractBindingBlocks, iterEntitySections } from "../../lib/apa-parse.mjs";

function readOrNull(p) {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

function listMdFiles(dir) {
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith(".md"))
      .filter((f) => {
        try {
          return statSync(join(dir, f)).isFile();
        } catch {
          return false;
        }
      })
      .sort(); // deterministic order
  } catch {
    return [];
  }
}

/** "FIG01" -> "FIG. 1"; falls back to the raw id when no trailing number. */
function figOrdinal(figId) {
  const m = /(\d+)\s*$/.exec(String(figId || ""));
  return m ? `FIG. ${parseInt(m[1], 10)}` : String(figId || "?");
}

/** The figure title is the part of the `### FIG## - <title>` heading after the leading dash. */
function headingTitle(heading) {
  const h = String(heading || "").trim();
  const m = /^[-–—:]\s*(.*)$/.exec(h); // strip a leading - / en/em dash / colon
  return (m ? m[1] : h).trim();
}

/**
 * Build the consolidated legend for a matter directory.
 *
 * @param {string} matterDir - path to the matter root (contains evidence/drawings/).
 * @returns {{ entries: Array, briefDescription: Array, flags: Array }}
 *   entries          : [{ fig, ordinal, numeral, element, defined_in }]  (sorted by fig then numeral)
 *   briefDescription : [{ fig, ordinal, title, line }]                   (sorted by figure number)
 *   flags            : [{ code, fig, numeral, element, msg }]
 */
export function buildLegend(matterDir) {
  const drawingsDir = join(matterDir, "evidence", "drawings");
  const entries = [];
  const briefDescription = [];
  const parseFlags = [];  // surfaced loudly below; a malformed drawing binding must not throw out of buildLegend

  for (const file of listMdFiles(drawingsDir)) {
    const text = readOrNull(join(drawingsDir, file));
    if (text === null) continue;
    for (const section of iterEntitySections(text)) {
      if (!/^FIG\d+$/.test(section.id)) continue; // only FIG## sections
      // The bounded parser throws on a malformed binding (tab indent / over-indent / too-deep). buildLegend
      // is called in-process by the pre-filing preflight gate, so degrade loudly (flag + skip), never throw.
      let binding;
      try { binding = extractBindingBlocks(section.body)[0] || {}; }
      catch (e) { parseFlags.push({ code: "NUMERAL_PARSE_ERROR", fig: section.id, msg: `binding failed to parse: ${e && e.message ? e.message : e}` }); continue; }
      const ordinal = figOrdinal(section.id);
      const title = headingTitle(section.heading);
      briefDescription.push({ fig: section.id, ordinal, title, line: `${ordinal} - ${title}` });
      const numerals = Array.isArray(binding.numerals) ? binding.numerals : [];
      for (const nm of numerals) {
        if (!nm || nm.numeral == null) continue;
        entries.push({
          fig: section.id,
          ordinal,
          numeral: String(nm.numeral),
          element: nm.element == null ? "" : String(nm.element),
          defined_in: nm.defined_in == null || nm.defined_in === "" ? null : String(nm.defined_in),
        });
      }
    }
  }

  // Deterministic ordering.
  const figNum = (id) => {
    const m = /(\d+)\s*$/.exec(id);
    return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
  };
  const numVal = (s) => {
    const m = /^(\d+)/.exec(s);
    return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
  };
  entries.sort((a, b) => figNum(a.fig) - figNum(b.fig) || numVal(a.numeral) - numVal(b.numeral) || a.numeral.localeCompare(b.numeral));
  briefDescription.sort((a, b) => figNum(a.fig) - figNum(b.fig));

  // ---- flags ----
  const flags = [];
  flags.push(...parseFlags);  // any drawing-binding parse failures, surfaced (not thrown)

  // (1) NUMERAL_UNDEFINED - a numeral with an empty/missing defined_in.
  for (const e of entries) {
    if (!e.defined_in) {
      flags.push({
        code: "NUMERAL_UNDEFINED",
        fig: e.fig,
        numeral: e.numeral,
        element: e.element,
        msg: `${e.fig} numeral ${e.numeral} ("${e.element}") has no defining SPEC (defined_in is empty/missing)`,
      });
    }
  }

  // (2) NUMERAL_INCONSISTENT - the same numeral maps to a different element across figures.
  const byNumeral = new Map(); // numeral -> [entry,...]
  for (const e of entries) {
    if (!byNumeral.has(e.numeral)) byNumeral.set(e.numeral, []);
    byNumeral.get(e.numeral).push(e);
  }
  for (const [numeral, list] of byNumeral) {
    const elements = new Set(list.map((e) => e.element.trim().toLowerCase()).filter((x) => x !== ""));
    if (elements.size > 1) {
      const where = list.map((e) => `${e.fig}="${e.element}"`).join(", ");
      flags.push({
        code: "NUMERAL_INCONSISTENT",
        fig: list.map((e) => e.fig).join(","),
        numeral,
        element: [...new Set(list.map((e) => e.element))].join(" / "),
        msg: `numeral ${numeral} maps to different elements across figures (${where})`,
      });
    }
  }

  return { entries, briefDescription, flags };
}

export default { buildLegend };
