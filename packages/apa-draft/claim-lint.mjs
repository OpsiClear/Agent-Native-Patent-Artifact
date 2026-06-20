#!/usr/bin/env node
/**
 * apa-claim-lint - deterministic legal-FORM lint for claims (DESIGN.md §7.1 Tier-1). Complements
 * apa-validate (which resolves antecedent basis + dependency + edges); this checks single-sentence
 * form, transitional phrases, claim numbering, multiple-dependent form, and flags 112(f) nonce words.
 * Form/advisory only - it asserts NO patentability merit. Node >=21, ESM, zero deps.
 *
 * Usage:  node claim-lint.mjs <matter-dir> [--json]
 * Exit:   0 = no findings · 1 = findings (advisory)
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { iterEntitySections, extractBindingBlocks, asArray } from "../../lib/apa-parse.mjs";
import { defaultReportFor } from "../apa-reports/schemas.mjs";
import { formatErrors, validateReport } from "../apa-reports/validate.mjs";
import { existingFileRecords } from "../apa-trace/runlog.mjs";

const TRANSITIONS = /\b(comprising|consisting of|consisting essentially of|including|having)\b/i;
const NONCE_112F = /\b(means|step|module|mechanism|unit|element|device|component|member|assembly|arrangement|configuration)s?\s+(for|configured to)\b/i;
const MULTI_DEP = /\b(claims?\s+\d+\s*(?:or|and|through|to|[-–])\s*\d+|any\s+(?:one\s+)?of\s+claims|any\s+(?:of\s+the\s+)?preceding\s+claims?)\b/i;
const SENTENCE_END = /\.(\s|$)/g;

export function lintClaims(matterDir) {
  const findings = [];
  const W = (code, msg) => findings.push({ code, severity: "warning", msg });
  const path = join(matterDir, "logic", "claims.md");
  if (!existsSync(path)) return { findings, claims: 0 };
  const text = readFileSync(path, "utf8");
  // The bounded parser FAILS LOUD by throwing on malformed structure (tab indent / over-indent / too-deep).
  // lintClaims is a hub (preflight, rigor scaffold, eval prePass call it), so convert a parser throw into a
  // structured finding here - never an uncaught throw escaping those load-bearing gates.
  let claims;
  try {
    claims = iterEntitySections(text).map((s) => ({ ...s, binding: extractBindingBlocks(s.body)[0] || {}, prose: s.body.split("```binding")[0].trim() }));
  } catch (e) {
    W("LINT_PARSE_ERROR", `claims.md failed to parse: ${e && e.message ? e.message : e}`);
    return { findings, claims: 0 };
  }

  // numbering: CLM01, CLM02, ... contiguous from 1
  const nums = claims.map((c) => parseInt((/^CLM(\d+)$/.exec(c.id) || [])[1], 10)).filter((n) => !isNaN(n)).sort((a, b) => a - b);
  nums.forEach((n, i) => { if (n !== i + 1) W("LINT_NUMBERING", `claim numbering is not contiguous from 1 (saw CLM${String(n).padStart(2, "0")} at position ${i + 1}).`); });

  for (const c of claims) {
    const limsText = asArray(c.binding.limitations).filter(Boolean).map((l) => l.text || "").join(" ");
    const hay = `${c.prose} ${limsText}`;
    const sentenceEnds = (c.prose.match(SENTENCE_END) || []).length;
    if (sentenceEnds > 1) W("LINT_ONE_SENTENCE", `${c.id}: a claim must be a single sentence (found ${sentenceEnds} sentence-ending periods).`);
    if (c.prose && !/\.\s*$/.test(c.prose)) W("LINT_NO_PERIOD", `${c.id}: claim does not end with a period.`);
    if (c.binding.type === "claim-independent" && !TRANSITIONS.test(hay)) W("LINT_TRANSITION", `${c.id}: independent claim has no transitional phrase (comprising/consisting of/including/having).`);
    if (c.binding.type === "claim-dependent" && !/\bclaim\s+\d+\b/i.test(c.prose)) W("LINT_DEP_REF", `${c.id}: dependent claim does not reference a base "claim N" in its text.`);
    if (MULTI_DEP.test(hay)) W("LINT_MULTI_DEP", `${c.id}: appears to be a multiple-dependent claim (37 CFR 1.75(c): must be in the alternative; extra fee).`);
    if (NONCE_112F.test(hay)) W("LINT_112F", `${c.id}: a "means/…-for" nonce phrase may invoke 35 USC 112(f) - ensure corresponding structure is disclosed and linked, or it is indefinite under 112(b).`);
  }
  return { findings, claims: claims.length };
}

function ruleAnchorFor(code) {
  if (code === "LINT_112F") return "35-usc-112f";
  if (code === "LINT_MULTI_DEP") return "37-cfr-1.75";
  if (code === "LINT_PARSE_ERROR") return "apa-protocol";
  return "37-cfr-1.75";
}

export function buildClaimsReport(matterDir, lintResult = lintClaims(matterDir)) {
  const claimsPath = join(matterDir, "logic", "claims.md");
  const report = defaultReportFor("claims", {
    matter: matterDir,
    inputs: existingFileRecords(matterDir, [claimsPath].filter(existsSync)),
  });
  report.claims_reviewed = Array.from({ length: lintResult.claims || 0 }, (_, i) => `CLM${String(i + 1).padStart(2, "0")}`);
  report.findings = (lintResult.findings || []).map((f) => ({
    finding_type: "flag",
    severity: f.severity === "warning" ? "warning" : "info",
    rule_anchor: ruleAnchorFor(f.code),
    code: f.code,
    evidence_span: f.msg,
    recommendation: `Resolve or deliberately document ${f.code}: ${f.msg}`,
  }));
  report.next_allowed_steps = report.findings.length
    ? ["revise-claims", "rerun-claim-lint", "run-apa-validate"]
    : ["run-apa-validate", "draft-specification", "run-apa-rigor"];
  return report;
}

function main(argv) {
  const args = argv.slice(2);
  const json = args.includes("--json");
  const reportIdx = args.indexOf("--report-out");
  const reportOut = reportIdx >= 0 ? args[reportIdx + 1] : null;
  const dir = args.find((a) => !a.startsWith("--"));
  if (!dir) { console.error("usage: node claim-lint.mjs <matter-dir> [--json]"); process.exit(1); }
  const r = lintClaims(dir);
  if (reportOut) {
    const report = buildClaimsReport(dir, r);
    const check = validateReport(report, { kind: "claims" });
    if (!check.ok) {
      console.error(formatErrors(check.errors).join("\n"));
      process.exit(2);
    }
    mkdirSync(dirname(reportOut), { recursive: true });
    writeFileSync(reportOut, JSON.stringify(report, null, 2) + "\n", "utf8");
  }
  if (json) { console.log(JSON.stringify(r, null, 2)); }
  else {
    console.log(`apa-claim-lint: ${dir} (${r.claims} claim(s)) - legal-FORM only, no patentability merit`);
    for (const f of r.findings) console.log(`  ${f.severity.toUpperCase()} [${f.code}] ${f.msg}`);
    console.log(`  => ${r.findings.length ? r.findings.length + " finding(s)" : "clean"}`);
    if (reportOut) console.log(`  report -> ${reportOut}`);
  }
  process.exit(r.findings.length ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv);
