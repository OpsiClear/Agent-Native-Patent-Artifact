#!/usr/bin/env node
/**
 * apa-rigor - Level-2 rigor-review helper. Builds a report skeleton, and validates + computes the
 * authoritative verdict for a completed patent_rigor_report.json. The SCORING is the /apa-rigor skill's
 * job (semantic); this tool owns the deterministic verdict + the schema check. Read-only.
 *
 *   node cli.mjs scaffold --matter <dir> [--out f]   # emit a report skeleton (mechanical dims prefilled)
 *   node cli.mjs check <report.json>                 # validate schema + compute verdict
 * Exit: 0 ok · 1 valid but NOT fileable (Major-Rework/Do-Not-File/Incomplete) · 2 invalid schema/usage
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter } from "../../lib/apa-parse.mjs";
import { scaffoldReport } from "./scaffold.mjs";
import { validateReport, computeVerdict, isFileable } from "./verdict.mjs";
import {
  appendRunlog,
  buildRunlogEntry,
  commandRecord,
  existingFileRecords,
  humanCheckpoint,
} from "../apa-trace/runlog.mjs";

function ruleVersionOf(matterDir) {
  try {
    return parseFrontmatter(readFileSync(join(matterDir, "PATENT.md"), "utf8")).rules_effective_date || "";
  } catch {
    return "";
  }
}

function main() {
  const startedAt = new Date().toISOString();
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "scaffold") {
    const matter = rest[rest.indexOf("--matter") + 1];
    if (!matter || matter.startsWith("--")) { console.error("usage: scaffold --matter <dir> [--out f]"); process.exit(2); }
    const skel = scaffoldReport(matter);
    const out = rest.includes("--out") ? rest[rest.indexOf("--out") + 1] : null;
    const json = JSON.stringify(skel, null, 2);
    if (out) {
      writeFileSync(out, json);
      appendRunlog(matter, buildRunlogEntry({
        timestamp: new Date().toISOString(),
        skill: "apa-rigor",
        ruleVersion: ruleVersionOf(matter),
        inputs: existingFileRecords(matter, [
          join(matter, "PATENT.md"),
          join(matter, "logic", "claims.md"),
          join(matter, "logic", "prior_art.md"),
          join(matter, "src", "embodiments.md"),
        ]),
        outputs: existingFileRecords(matter, [out]),
        commands: [commandRecord({
          argv: ["node", "packages/apa-rigor/cli.mjs", cmd, ...rest],
          cwd: process.cwd(),
          exitCode: 0,
          startedAt,
          endedAt: new Date().toISOString(),
        })],
        humanCheckpoints: [
          humanCheckpoint({ id: "semantic-rigor-review", required: true, satisfied: false }),
          humanCheckpoint({ id: "prior-art-state-review", required: true, satisfied: false }),
        ],
      }));
      console.log(`wrote ${out} (Level-1 ${skel.level1.passed ? "passed" : "NOT passed - resolve mechanical errors first"})`);
    }
    else console.log(json);
    process.exit(0);
  }
  if (cmd === "check") {
    const file = rest.find((a) => !a.startsWith("--"));
    if (!file) { console.error("usage: check <report.json>"); process.exit(2); }
    let report;
    try { report = JSON.parse(readFileSync(file, "utf8")); } catch (e) { console.error("cannot read/parse:", e.message); process.exit(2); }
    const { ok, errors, computed } = validateReport(report);
    if (rest.includes("--json")) { console.log(JSON.stringify({ ok, errors, computed }, null, 2)); }
    else {
      console.log(`apa-rigor check: ${file}`);
      if (!ok) errors.forEach((e) => console.log(`  SCHEMA  ${e}`));
      console.log(`  scores -> mean ${computed.mean}${computed.capped ? " (capped by a weak dimension or prior-art state)" : ""}`);
      console.log(`  VERDICT: ${computed.verdict}${computed.missing.length ? ` (missing: ${computed.missing.join(",")})` : ""}`);
      console.log(`  DISPLAY: ${computed.display}`);
      if (computed.scoreCaps?.length) console.log(`  CAPS: ${computed.scoreCaps.map((c) => `${c.dimension} ${c.original_score}->${c.effective_score} (${c.reasons.join(",")})`).join("; ")}`);
      const pa = computed.priorArt || {};
      const age = pa.newest_dossier_age_days == null ? "unknown" : `${pa.newest_dossier_age_days}d`;
      console.log(`  PRIOR ART: dossier date ${pa.newest_dossier_generated_at || "missing"}; age ${age}; closest-art human verified: ${pa.closest_art_human_verified ? "yes" : "no"}`);
      console.log("  NOTE: findings are flags for a registered practitioner, never a patentability conclusion.");
    }
    if (!ok) process.exit(2);
    process.exit(isFileable(computed.verdict) ? 0 : 1);
  }
  console.error("usage: apa-rigor scaffold|check ..."); process.exit(2);
}

main();
