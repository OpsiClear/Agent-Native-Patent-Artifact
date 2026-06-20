#!/usr/bin/env node
/**
 * apa-assemble - collate a matter into an assembly package draft and run the pre-filing gate. Produces the
 * 1.77 specification (md + USPTO print-CSS HTML), an ADS draft, an SB/08 IDS seed, an UNSIGNED
 * declaration template, a fee worksheet (estimate), and a go/no-go preflight. STOPS at the submit
 * boundary - it never signs, certifies, or files. Node >=21, ESM, zero deps.
 *
 *   node cli.mjs --matter <dir> [--write] [--json]
 * Exit: 0 = GO (pending human review) · 2 = NO-GO (a gate blocked)
 */

import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter } from "../../lib/apa-parse.mjs";
import { assembleMatter } from "./assemble.mjs";
import { assembleAds } from "./ads.mjs";
import { assembleIds } from "./ids.mjs";
import { preflight } from "./preflight.mjs";
import { validateMatter } from "../apa-validate/validate.mjs";
import { buildLegend } from "../apa-figure/numerals.mjs";
import { buildUploadManifest } from "./upload-manifest.mjs";
import {
  appendRunlog,
  buildRunlogEntry,
  commandRecord,
  existingFileRecords,
  humanCheckpoint,
} from "../apa-trace/runlog.mjs";

function fmOf(dir) { try { return parseFrontmatter(readFileSync(join(dir, "PATENT.md"), "utf8")); } catch { return {}; } }

function makeDeclaration(fm) {
  const inv = (fm.inventors || []).map((i) => `Inventor: ${i.name || "[REQUIRED]"}\nSignature: [SIGNATURE REQUIRED - executed personally by the inventor; APA does not sign]\nDate: ____________`).join("\n\n");
  return [
    "# Declaration (37 CFR 1.63) - UNSIGNED TEMPLATE",
    "> APA does not sign or pre-fill an executed signature. The named inventor must personally execute this.",
    "",
    "I hereby declare that I believe I am an original inventor of the subject matter claimed; that this",
    "application was made or authorized to be made by me; and I acknowledge the duty to disclose information",
    "material to patentability as defined in 37 CFR 1.56. Statements made of my own knowledge are true.",
    "",
    `Application: ${fm.title || "[REQUIRED]"}`,
    "",
    inv || "[REQUIRED - at least one natural-person inventor]",
    "",
  ].join("\n");
}

function feeWorksheet(fees) {
  if (!fees) return "# Fee worksheet\n\n*[fee engine not available - see packages/apa-assemble/fees.mjs]*\n";
  const rows = (fees.lineItems || []).map((li) => `| ${li.code} | ${li.label} | ${li.each} | ${li.qty} | ${li.amount} |`).join("\n");
  return [
    "# Fee worksheet - ESTIMATE (verify against the live USPTO fee schedule)",
    "",
    `Entity status: **${fees.entityStatus}** (x${fees.multiplier}) - rules effective ${fees.effectiveDate}`,
    "",
    "| Code | Item | Each | Qty | Amount |", "|---|---|---|---|---|", rows,
    "", `**Estimated total: ${fees.total} ${fees.currency || "USD"}**`, "",
    ...(fees.notes || []).map((n) => `- ${n}`), "",
  ].join("\n");
}

function gateLine(g) { const tag = g.status === "block" ? "BLOCK" : g.status === "warn" ? "warn " : "pass "; return `  [${tag}] ${g.name}: ${g.msg}`; }

async function main() {
  const startedAt = new Date().toISOString();
  const argv = process.argv.slice(2);
  const matter = argv[argv.indexOf("--matter") + 1];
  const doWrite = argv.includes("--write");
  const asJson = argv.includes("--json");
  if (!matter || matter.startsWith("--")) { console.error("usage: node cli.mjs --matter <dir> [--write] [--json]"); process.exit(2); }

  // Parse-guard FIRST: fmOf / buildLegend / assembleMatter / assembleAds / assembleIds all parse the
  // matter directly, and the bounded parser throws on a malformed binding (tab indent / over-indent /
  // too-deep). Run the GUARDED validator up front and short-circuit to a structured NO-GO (exit 2 per the
  // documented contract) so the CLI never crashes with a raw stack mid-assembly.
  const parseErr = validateMatter(matter).errors.find((e) => e.code === "PARSE_ERROR");
  if (parseErr) { console.error(`NO-GO: matter failed to parse (route to counsel): ${parseErr.msg}`); process.exit(2); }

  const fm = fmOf(matter);
  const legend = buildLegend(matter);
  const asm = assembleMatter(matter, { legend });
  const ads = assembleAds(matter);
  const ids = assembleIds(matter);
  const decl = makeDeclaration(fm);

  let fees = null;
  try { const m = await import("./fees.mjs"); fees = m.computeFees(matter); } catch { /* fee engine optional */ }

  const assembledDir = join(matter, "assembled");
  // Write the filing documents first so preflight's filing-document gate sees them.
  if (doWrite) {
    mkdirSync(join(assembledDir, "upload_set"), { recursive: true });
    writeFileSync(join(assembledDir, "specification.md"), asm.markdown);
    writeFileSync(join(assembledDir, "specification.html"), asm.html);
    writeFileSync(join(assembledDir, "ADS.md"), ads.markdown);
    writeFileSync(join(assembledDir, "IDS_SB08.md"), ids.markdown);
    writeFileSync(join(assembledDir, "declaration_UNSIGNED.md"), decl);
    writeFileSync(join(assembledDir, "FEE_WORKSHEET.md"), feeWorksheet(fees));
  }
  const pf = preflight(matter, { assembledDir });
  if (doWrite) {
    writeFileSync(join(assembledDir, "PREFLIGHT.md"), renderPreflightMd(pf));
    writeFileSync(join(assembledDir, "upload_set", "MANIFEST.txt"), pf.uploadSet.join("\n") + "\n\n" + pf.submitBoundary + "\n");
    const uploadManifest = buildUploadManifest(matter, assembledDir, pf);
    writeFileSync(join(assembledDir, "upload_manifest.json"), JSON.stringify(uploadManifest, null, 2) + "\n");
    appendRunlog(matter, buildRunlogEntry({
      timestamp: new Date().toISOString(),
      skill: "apa-assemble",
      ruleVersion: fm.rules_effective_date || "",
      inputs: existingFileRecords(matter, [
        join(matter, "PATENT.md"),
        join(matter, "logic", "claims.md"),
        join(matter, "logic", "prior_art.md"),
        join(matter, "src", "embodiments.md"),
        join(matter, "evidence", "drawings", "quality-review.json"),
        join(matter, "patent_rigor_report.json"),
      ]),
      outputs: existingFileRecords(matter, [
        join(assembledDir, "specification.md"),
        join(assembledDir, "specification.html"),
        join(assembledDir, "ADS.md"),
        join(assembledDir, "IDS_SB08.md"),
        join(assembledDir, "declaration_UNSIGNED.md"),
        join(assembledDir, "FEE_WORKSHEET.md"),
        join(assembledDir, "PREFLIGHT.md"),
        join(assembledDir, "upload_set", "MANIFEST.txt"),
        join(assembledDir, "upload_manifest.json"),
      ]),
      commands: [commandRecord({
        argv: ["node", "packages/apa-assemble/cli.mjs", ...argv],
        cwd: process.cwd(),
        exitCode: pf.blocked ? 2 : 0,
        startedAt,
        endedAt: new Date().toISOString(),
      })],
      humanCheckpoints: [
        humanCheckpoint({ id: "print-to-pdf-and-visual-qa", required: true, satisfied: false }),
        humanCheckpoint({ id: "ads-human-completion", required: true, satisfied: false }),
        humanCheckpoint({ id: "ids-reference-verification", required: true, satisfied: false }),
        humanCheckpoint({ id: "inventor-declaration-signature", required: true, satisfied: false }),
        humanCheckpoint({ id: "fee-entity-status-verification", required: true, satisfied: false }),
        humanCheckpoint({ id: "patent-center-human-upload", required: true, satisfied: false }),
      ],
    }));
  }

  if (asJson) { console.log(JSON.stringify({ warnings: asm.warnings, adsFlags: ads.flags, ids, fees, preflight: pf }, null, 2)); }
  else {
    console.log(`apa-assemble: ${fm.title || matter} (${fm.application_type || "?"})`);
    asm.warnings.forEach((w) => console.log(`  draft-gap: ${w}`));
    if (ads.flags.length) console.log(`  ADS needs: ${ads.flags.join("; ")}`);
    console.log(`  IDS: ${ids.count} reference(s), ${ids.unverified} unverified`);
    if (fees) console.log(`  Fee estimate: ${fees.total} ${fees.currency || "USD"} (${fees.entityStatus}; verify currency)`);
    console.log("  Pre-filing gates:");
    pf.gates.forEach((g) => console.log(gateLine(g)));
    console.log(`  => ${pf.goNoGo}`);
    console.log(`  ${pf.submitBoundary}`);
    if (doWrite) console.log(`  wrote ${assembledDir}/ (specification.md/html, ADS, IDS, declaration_UNSIGNED, fee worksheet, preflight, upload_set/MANIFEST, upload_manifest.json)`);
  }
  process.exit(pf.blocked ? 2 : 0);
}

function renderPreflightMd(pf) {
  return [
    "# Pre-filing checklist", "",
    ...pf.gates.map((g) => `- **${g.status.toUpperCase()}** ${g.name} - ${g.msg}`),
    "", `## Verdict: ${pf.goNoGo}`, "",
    "## Frozen upload set", ...pf.uploadSet.map((u) => `- ${u}`),
    "", `> ${pf.submitBoundary}`, "",
  ].join("\n");
}

main().catch((e) => { console.error("error:", e.message); process.exit(1); });
