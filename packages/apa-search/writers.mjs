/**
 * Write a ranked prior-art landscape into a matter: append PA## blocks to logic/prior_art.md, write a
 * raw record per reference under evidence/prior_art/, and emit a reference-matrix scaffold. Every
 * reference is written UNVERIFIED (verification: false) - a human must confirm discloses-vs-lacks
 * before it is relied on or listed on an IDS. Node >=18, ESM, zero deps.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { iterEntitySections } from "../../lib/apa-parse.mjs";
import { refToPaBlock, refToEvidence } from "./lib/refs.mjs";

function nextPaNumber(priorArtPath) {
  let max = 0;
  if (existsSync(priorArtPath)) {
    for (const sec of iterEntitySections(readFileSync(priorArtPath, "utf8"))) {
      const m = /^PA(\d+)$/.exec(sec.id);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
  }
  return max + 1;
}

const paId = (n) => `PA${String(n).padStart(2, "0")}`;

/**
 * @param {string} matterDir
 * @param {object[]} rankedRefs  NormalizedRef[] (ranked)
 * @returns {{ assigned: {paId:string, docNumber:string}[], referenceMatrix:string }}
 */
export function writeLandscape(matterDir, rankedRefs) {
  const priorArtPath = join(matterDir, "logic", "prior_art.md");
  const evidenceDir = join(matterDir, "evidence", "prior_art");
  mkdirSync(evidenceDir, { recursive: true });
  if (!existsSync(priorArtPath)) {
    mkdirSync(join(matterDir, "logic"), { recursive: true });
    writeFileSync(priorArtPath, "# Prior-art landscape\n\n> Typed by legal role. For patentability, NOT a freedom-to-operate / clearance opinion.\n");
  }

  let n = nextPaNumber(priorArtPath);
  const assigned = [];
  for (const ref of rankedRefs) {
    const id = paId(n++);
    appendFileSync(priorArtPath, "\n" + refToPaBlock(ref, id));
    writeFileSync(join(evidenceDir, `${id.toLowerCase()}.md`), refToEvidence(ref, id));
    assigned.push({ paId: id, docNumber: ref.docNumber, title: ref.title });
  }

  const referenceMatrix = renderReferenceMatrix(assigned);
  writeFileSync(join(matterDir, "logic", "reference_matrix.md"), referenceMatrix);
  return { assigned, referenceMatrix };
}

/** A reference/claim matrix SCAFFOLD (the g2tree "Blocks / Does-NOT-block" pattern) for human+agent completion. */
function renderReferenceMatrix(assigned) {
  const rows = assigned.map((a) => `| ${a.paId} | ${escapePipe(a.title || a.docNumber)} | _tbd_ | _(fill: claim language it blocks)_ | _(fill: what it does not reach)_ |`).join("\n");
  return [
    "# Reference matrix (scaffold)",
    "",
    "> Auto-seeded from a prior-art search. Each reference is UNVERIFIED and its blocking analysis is",
    "> empty - the patentability-analysis + hardened-verification steps and a human fill the `Blocks` /",
    "> `Does NOT block` columns. This is for patentability, NOT a freedom-to-operate opinion, and never",
    "> asserts \"no anticipating art found\".",
    "",
    "| Ref | Title | Tier | Blocks | Does NOT block |",
    "|---|---|---|---|---|",
    rows || "| _(none)_ | | | | |",
    "",
    "**Strongest examiner combination:** _(to be identified)_",
    "",
    "**Practical claim boundary:** _(to be identified)_",
    "",
  ].join("\n");
}

function escapePipe(s) { return String(s).replace(/\|/g, "\\|"); }
