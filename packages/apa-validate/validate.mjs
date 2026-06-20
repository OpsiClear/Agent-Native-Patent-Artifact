#!/usr/bin/env node
/**
 * apa-validate - Level-1 MECHANICAL validator for a Patent Artifact (see ../../docs/protocol.md §5/§6).
 *
 * It checks ONLY what is mechanical (antecedent basis, claim dependency, edge resolution, numeral
 * definedness, type-aware mandatory core, inventorship attestation). It NEVER decides §112 sufficiency
 * or 101/102/103 merits - those are LLM-judge flags for a registered practitioner, never a clearance.
 *
 * Exit codes:  0 = clean   1 = warnings only   2 = errors (do not proceed)
 * Usage:  node validate.mjs <matter-dir> [--json]
 * Node >=21, ESM, zero dependencies.
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseFrontmatter, extractBindingBlocks, loadYaml, iterEntitySections, asArray } from "../../lib/apa-parse.mjs";
import {
  isSourceSpanPolicy,
  sourceSpanFindings,
  sourceSpanPolicyOf,
} from "./source-spans.mjs";
import { evaluateMatterRulePack } from "../apa-rules/rule-packs.mjs";
import {
  CONFIDENTIAL_WORKFLOW_MODES,
  confidentialWorkflowModeOf,
  shareableExportPolicy,
} from "../apa-redact/confidential-workflow.mjs";

const SUPPORTED_TYPES = new Set(["provisional", "utility", "design"]);
const UNSUPPORTED_TYPES = new Set(["plant", "pct", "cip"]);
const SUPPORTED_USER_ROLES = new Set(["registered_practitioner", "pro_se", "unknown"]);
// Unambiguous machine-inventor markers. Acronyms are matched CASE-SENSITIVELY so legitimate human
// names ('Ai', 'Claude Monet', 'Neural Wang') are not blocked; phrase forms are case-insensitive.
// DABUS is the AI from Thaler v. Vidal. (Tightened to remove human-name false positives.)
// The dotted `A.I.` form needs its own boundary: a trailing `\b` after the final `.` can never match
// (a `.` then space/EOL are both non-word, so there is no word boundary there), so it gets `(?!\w)`.
const AI_ACRONYM_RE = /\b(?:DABUS|GPT|LLM|AI)\b|\bA\.I\.(?!\w)/;
const AI_PHRASE_RE = /\b(?:artificial intelligence|language model|large language model)\b/i;
function looksAiInventor(s) { const t = String(s || ""); return AI_ACRONYM_RE.test(t) || AI_PHRASE_RE.test(t); }
const SEQUENCE_RE = /SEQ ID NO|\b[ACGTU]{30,}\b/i;

// -------------------------------------------------------------------------------------------------
// Load a matter into a structured model
// -------------------------------------------------------------------------------------------------

function readOrNull(p) {
  try { return readFileSync(p, "utf8"); } catch { return null; }
}

function listFiles(dir) {
  try { return readdirSync(dir).filter((f) => statSync(join(dir, f)).isFile()); } catch { return []; }
}

function loadMatter(dir) {
  const m = {
    dir,
    frontmatter: {},
    claims: [],      // { id, heading, binding }
    terms: [],       // { id, binding }
    priorArt: [],    // { id, binding }
    specs: [],       // { id, binding }
    figures: [],     // { id, binding }
    prosecution: null,
    present: new Set(),
  };
  const patentMd = readOrNull(join(dir, "PATENT.md"));
  if (patentMd) { m.frontmatter = parseFrontmatter(patentMd); m.present.add("PATENT.md"); }

  const sections = (rel) => {
    const t = readOrNull(join(dir, rel));
    if (t === null) return null;
    m.present.add(rel);
    return iterEntitySections(t).map((s) => ({ id: s.id, heading: s.heading, binding: extractBindingBlocks(s.body)[0] || {} }));
  };

  m.claims = sections("logic/claims.md") || [];
  m.terms = sections("logic/concepts.md") || [];
  m.priorArt = sections("logic/prior_art.md") || [];
  m.specs = sections("src/embodiments.md") || [];
  for (const rel of ["logic/problem.md", "logic/patentability.md", "evidence/README.md"]) {
    if (readOrNull(join(dir, rel)) !== null) m.present.add(rel);
  }
  const prosText = readOrNull(join(dir, "trace/prosecution.yaml"));
  if (prosText !== null) { m.prosecution = loadYaml(prosText); m.present.add("trace/prosecution.yaml"); }

  // Figures: every file under evidence/drawings/*.md
  for (const f of listFiles(join(dir, "evidence", "drawings"))) {
    if (!f.endsWith(".md")) continue;
    const t = readOrNull(join(dir, "evidence", "drawings", f));
    for (const s of iterEntitySections(t)) m.figures.push({ id: s.id, heading: s.heading, binding: extractBindingBlocks(s.body)[0] || {} });
  }
  m.priorArtRefFiles = listFiles(join(dir, "evidence", "prior_art")).filter((f) => f.endsWith(".md"));
  m.drawingFiles = listFiles(join(dir, "evidence", "drawings")).filter((f) => f.endsWith(".md"));
  // Scan EVERY loaded matter body for the ST.26 sequence gate - a biotech sequence is most naturally
  // recited in the claims, not just problem.md/embodiments.md (which the gate previously missed).
  m.rawText = [
    "logic/problem.md", "logic/claims.md", "logic/concepts.md", "logic/prior_art.md",
    "logic/patentability.md", "src/embodiments.md",
  ].map((rel) => readOrNull(join(dir, rel))).filter(Boolean).join("\n")
    + "\n" + m.priorArtRefFiles.map((f) => readOrNull(join(dir, "evidence", "prior_art", f))).filter(Boolean).join("\n")
    + "\n" + m.drawingFiles.map((f) => readOrNull(join(dir, "evidence", "drawings", f))).filter(Boolean).join("\n");
  return m;
}

// -------------------------------------------------------------------------------------------------
// Node registry (for edge resolution)
// -------------------------------------------------------------------------------------------------

function buildNodeIds(m) {
  // NULL-prototype registries: lookups are keyed on attacker/typo-controlled strings (a claim's
  // depends_on / antecedent_of / supported_by target, an inventorship_matrix claim key). A plain {}
  // would inherit Object.prototype members, so `depends_on: toString` would resolve claimById['toString']
  // to the inherited Function (truthy) - making antecedentScope iterate a non-array (uncaught TypeError)
  // and silently suppressing DEP_UNRESOLVED / MATRIX_BAD_CLAIM. Object.create(null) closes both.
  const ids = new Set();
  const limOrderByClaim = Object.create(null);  // claimId -> [limId,...]
  const limOwner = Object.create(null);         // limId -> claimId
  const limById = Object.create(null);          // limId -> limitation binding
  const claimById = Object.create(null);
  for (const c of m.claims) {
    ids.add(c.id);
    claimById[c.id] = c.binding;
    limOrderByClaim[c.id] = [];
    for (const lim of asArray(c.binding.limitations).filter(Boolean)) {
      ids.add(lim.id);
      limOrderByClaim[c.id].push(lim.id);
      limOwner[lim.id] = c.id;
      limById[lim.id] = lim;
    }
  }
  for (const t of m.terms) ids.add(t.id);
  for (const p of m.priorArt) ids.add(p.id);
  for (const s of m.specs) ids.add(s.id);
  const figNumerals = new Set();   // "FIG01#12"
  for (const f of m.figures) {
    ids.add(f.id);
    for (const n of asArray(f.binding.numerals).filter(Boolean)) { ids.add(`${f.id}#${n.numeral}`); figNumerals.add(`${f.id}#${n.numeral}`); }
  }
  if (m.prosecution && Array.isArray(m.prosecution.nodes)) for (const n of m.prosecution.nodes.filter(Boolean)) if (n && n.id) ids.add(n.id);
  for (const inv of (Array.isArray(m.frontmatter.inventors) ? m.frontmatter.inventors : [])) if (inv && inv.id) ids.add(inv.id);
  return { ids, limOrderByClaim, limOwner, limById, claimById, figNumerals };
}

// claim -> ordered list of limitation ids in the claim's full antecedent scope (ancestors first).
function antecedentScope(claimId, reg) {
  const chain = [];
  let cur = claimId;
  const seen = new Set();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    chain.unshift(cur);
    const b = reg.claimById[cur];
    cur = b && b.depends_on ? b.depends_on : null;
  }
  const lims = [];
  for (const cid of chain) for (const lid of reg.limOrderByClaim[cid] || []) lims.push(lid);
  return lims;
}

// -------------------------------------------------------------------------------------------------
// Checks
// -------------------------------------------------------------------------------------------------

const UNRESOLVED_WARN_EDGES = ["supported_by", "illustrated_by", "practiced_by", "distinguished_over", "scope_set_at"];

export function validateMatter(dir) {
  const errors = [];
  const warnings = [];
  const info = [];
  const E = (code, msg) => errors.push({ code, msg });
  const W = (code, msg) => warnings.push({ code, msg });

  if (!existsSync(dir)) { return { dir, errors: [{ code: "NO_MATTER", msg: `matter directory not found: ${dir}` }], warnings, info, meta: {} }; }
  // The bounded parser FAILS LOUD by throwing on malformed structure (tab indentation, over-indented
  // orphan, nesting too deep). Convert that to a structured PARSE_ERROR so validateMatter NEVER throws
  // for any on-disk matter - in-process callers (preflight, rigor scaffold) rely on a report, not a throw.
  let m;
  try { m = loadMatter(dir); }
  catch (e) { return { dir, errors: [{ code: "PARSE_ERROR", msg: `failed to parse matter: ${e && e.message ? e.message : e}` }], warnings, info, meta: {} }; }
  const fm = m.frontmatter;
  const reg = buildNodeIds(m);
  const type = fm.application_type;
  const rulePackState = evaluateMatterRulePack({
    jurisdiction: fm.jurisdiction,
    rulesEffectiveDate: fm.rules_effective_date,
  });
  for (const e of rulePackState.errors) E(e.code, e.msg);
  for (const w of rulePackState.warnings) W(w.code, w.msg);

  // --- global ID uniqueness (protocol: CLM/LIM/TERM/PA/SPEC/FIG ids are globally unique) ---
  {
    const declared = [];
    for (const c of m.claims) { declared.push(c.id); for (const lim of asArray(c.binding.limitations).filter(Boolean)) declared.push(lim.id); }
    for (const t of m.terms) declared.push(t.id);
    for (const p of m.priorArt) declared.push(p.id);
    for (const s of m.specs) declared.push(s.id);
    for (const f of m.figures) declared.push(f.id);
    const seenId = new Set(); const dupes = new Set();
    for (const id of declared) { if (id == null) continue; if (seenId.has(id)) dupes.add(id); else seenId.add(id); }
    for (const id of dupes) E("DUPLICATE_ID", `entity id '${id}' is declared more than once; ids must be globally unique.`);
  }

  // --- malformed list fields (fail LOUD, never silently coerce) ---
  // A binding field that must be a list but parsed as a scalar/object (malformed-but-parseable input the
  // bounded YAML parser keeps as-is) is surfaced here as an error; downstream iteration uses asArray() so
  // it never throws an uncaught TypeError out of validateMatter (a load-bearing gate with in-process callers).
  {
    const badField = (label, obj, field) => {
      const v = obj && obj[field];
      if (v !== undefined && v !== null && !Array.isArray(v)) E("BINDING_FIELD_MALFORMED", `${label} field '${field}' must be a list; got ${typeof v}.`);
    };
    for (const c of m.claims) {
      for (const f of ["limitations", "distinguished_over", "scope_set_at"]) badField(c.id, c.binding, f);
      for (const lim of asArray(c.binding.limitations).filter(Boolean)) {
        for (const f of ["supported_by", "illustrated_by", "practiced_by", "antecedent_of", "references"]) badField(`${c.id}.${lim.id}`, lim, f);
      }
    }
    for (const f of m.figures) badField(f.id, f.binding, "numerals");
  }

  // --- application_type (fail loud on unsupported) ---
  if (!type) E("TYPE_MISSING", "PATENT.md frontmatter has no application_type.");
  else if (UNSUPPORTED_TYPES.has(type)) E("TYPE_UNSUPPORTED", `application_type '${type}' is not supported in this version - route to counsel/tooling.`);
  else if (!SUPPORTED_TYPES.has(type)) E("TYPE_UNKNOWN", `application_type '${type}' is unknown (supported: provisional, utility, design).`);

  // --- user_role (drives pro-se vs practitioner skill posture) ---
  if (fm.user_role !== undefined && !SUPPORTED_USER_ROLES.has(fm.user_role)) {
    E("USER_ROLE_UNKNOWN", `user_role '${fm.user_role}' is unknown (supported: registered_practitioner, pro_se, unknown).`);
  }
  const workflowMode = confidentialWorkflowModeOf(fm);
  if (!workflowMode.explicit) {
    W("CONFIDENTIAL_WORKFLOW_MODE_MISSING", `PATENT.md has no confidential_workflow_mode; defaulting to '${workflowMode.mode}'.`);
  } else if (!workflowMode.valid) {
    E("CONFIDENTIAL_WORKFLOW_MODE_UNKNOWN", `confidential_workflow_mode '${workflowMode.mode}' is unknown (supported: ${CONFIDENTIAL_WORKFLOW_MODES.join(", ")}).`);
  }
  const shareablePolicy = shareableExportPolicy(dir, { mode: workflowMode.mode });
  if (workflowMode.mode === "shareable_redacted" && shareablePolicy.sensitive_critique_artifacts_present.length > 0) {
    W(
      "SHAREABLE_REDACTION_REQUIRED",
      `shareable_redacted mode found sensitive critique artifact(s): ${shareablePolicy.sensitive_critique_artifacts_present.map((a) => a.path).join(", ")}; exclude by default and share only after redaction guard + human approval.`,
    );
  }
  const sourceSpanPolicy = sourceSpanPolicyOf(fm);
  if (fm.source_span_policy !== undefined && !isSourceSpanPolicy(fm.source_span_policy)) {
    E("SOURCE_SPAN_POLICY_UNKNOWN", `source_span_policy '${fm.source_span_policy}' is unknown (supported: warning, relaxed).`);
  }
  const requireSourceSpan = sourceSpanPolicy !== "relaxed";

  // --- mandatory core (type-aware) ---
  const need = ["PATENT.md", "logic/problem.md", "src/embodiments.md"];
  if (type === "utility" || type === "design") {
    need.push("logic/claims.md", "logic/concepts.md", "logic/patentability.md", "logic/prior_art.md", "trace/prosecution.yaml", "evidence/README.md");
  }
  for (const f of need) if (!m.present.has(f)) E("CORE_MISSING", `missing mandatory-core file for application_type '${type}': ${f}`);
  if (type === "utility") {
    if (m.priorArtRefFiles.length === 0) E("CORE_MISSING", "utility matter has no evidence/prior_art/*.md reference file.");
    if (m.drawingFiles.length === 0) W("NO_DRAWINGS", "utility matter has no evidence/drawings/*.md (drawings are usually required).");
  }
  if (type === "provisional" && m.claims.length > 0) info.push({ code: "PROV_HAS_CLAIMS", msg: "provisional includes claims (not required, but allowed)." });

  // --- inventors ---
  const inventors = Array.isArray(fm.inventors) ? fm.inventors : [];
  if (fm.inventors !== undefined && !Array.isArray(fm.inventors)) E("INVENTORS_MALFORMED", "PATENT.md `inventors` must be a YAML list of {id, name}, not a scalar.");
  if (inventors.length === 0) E("NO_INVENTOR", "PATENT.md has zero inventors; at least one natural person is required.");
  for (const inv of inventors) {
    const probe = `${inv && inv.name || ""} ${inv && inv.id || ""}`;
    if (looksAiInventor(probe)) E("AI_INVENTOR", `inventor entry looks AI-named ('${inv && inv.name}'); only natural persons may be inventors.`);
  }

  // --- design: exactly one claim ---
  if (type === "design" && m.claims.length !== 1) E("DESIGN_CLAIMS", `a design application must have exactly one claim; found ${m.claims.length}.`);

  // --- sequence-listing gate (fail loud) ---
  if (SEQUENCE_RE.test(m.rawText)) E("SEQ_LISTING", "a nucleotide/amino-acid sequence appears present; a WIPO ST.26 listing is required and is not supported - route to counsel/tooling.");

  // --- claim dependency graph ---
  for (const c of m.claims) {
    const b = c.binding;
    if (b.type === "claim-dependent") {
      if (!b.depends_on) E("DEP_MISSING", `${c.id} is claim-dependent but has no depends_on.`);
      else if (!reg.claimById[b.depends_on]) E("DEP_UNRESOLVED", `${c.id} depends_on '${b.depends_on}' which does not exist.`);
    }
  }
  // cycle detection
  for (const c of m.claims) {
    const seen = new Set();
    let cur = c.id;
    while (cur && reg.claimById[cur]) {
      if (seen.has(cur)) { E("DEP_CYCLE", `claim dependency cycle involving ${c.id}.`); break; }
      seen.add(cur);
      cur = reg.claimById[cur].depends_on || null;
    }
  }

  // --- antecedent basis + per-edge resolution ---
  for (const c of m.claims) {
    const scope = antecedentScope(c.id, reg);
    const idxInScope = (lid) => scope.indexOf(lid);
    // claim-level edges
    for (const ek of ["distinguished_over", "scope_set_at"]) {
      for (const target of asArray(c.binding[ek])) {
        if (!reg.ids.has(target)) W("UNRESOLVED_EDGE", `${c.id} ${ek} -> ${target} (target missing; unresolved edge).`);
      }
    }
    for (const lim of asArray(c.binding.limitations).filter(Boolean)) {
      const here = idxInScope(lim.id);
      // antecedent_of (errors)
      const introducedByAntecedents = new Set();
      for (const tgt of asArray(lim.antecedent_of)) {
        if (!reg.limById[tgt]) { E("ANTECEDENT_UNRESOLVED", `${c.id}.${lim.id} antecedent_of -> ${tgt} (no such limitation).`); continue; }
        const ti = idxInScope(tgt);
        if (ti === -1) E("ANTECEDENT_OUT_OF_SCOPE", `${c.id}.${lim.id} antecedent_of -> ${tgt} which is not in this claim's antecedent scope.`);
        else if (ti >= here) E("ANTECEDENT_NOT_EARLIER", `${c.id}.${lim.id} antecedent_of -> ${tgt} which is not earlier in the claim.`);
        else if (reg.limById[tgt].introduces) introducedByAntecedents.add(reg.limById[tgt].introduces);
      }
      // every `references` phrase must be covered by an antecedent introducing it
      for (const phrase of asArray(lim.references)) {
        if (!introducedByAntecedents.has(phrase)) {
          // is it introduced anywhere earlier in scope at all?
          const introducedEarlier = scope.slice(0, here).some((lid) => reg.limById[lid] && reg.limById[lid].introduces === phrase);
          if (introducedEarlier) W("ANTECEDENT_UNDECLARED", `${c.id}.${lim.id} references '${phrase}' which is introduced earlier but not declared via antecedent_of.`);
          else E("ANTECEDENT_BROKEN", `${c.id}.${lim.id} references '${phrase}' with no antecedent (broken antecedent basis - no earlier 'a/an ${phrase}').`);
        }
      }
      // support / illustration edges (warn on unresolved)
      for (const ek of ["supported_by", "illustrated_by", "practiced_by"]) {
        for (const tgt of asArray(lim[ek])) {
          if (!reg.ids.has(tgt)) {
            if (ek === "supported_by") W("UNSUPPORTED_EDGE", `${c.id}.${lim.id} supported_by -> ${tgt} MISSING (§112 support edge unresolved).`);
            else W("UNRESOLVED_EDGE", `${c.id}.${lim.id} ${ek} -> ${tgt} (target missing; unresolved edge).`);
          }
        }
      }
      // provenance: an ai-suggested claim limitation is an assembly blocker. A MISSING provenance is
      // the protocol default 'ai-suggested' (protocol §2.4) - treat it as the blocker, not as clean.
      if ((lim.provenance || "ai-suggested") === "ai-suggested") W("AI_SUGGESTED_LIMITATION", `${c.id}.${lim.id} is provenance 'ai-suggested'${lim.provenance ? "" : " (missing -> protocol default)"} (assembly blocker; a human must adopt it).`);
      else for (const finding of sourceSpanFindings(lim, `${c.id}.${lim.id}`, { requireComplete: requireSourceSpan })) W(finding.code, finding.msg);
    }
  }

  // --- inventorship attestation (contributed_to via inventorship_matrix) ---
  // Guard malformed-but-parseable input: the matrix must be a mapping of claimId -> [inventorId,...].
  // A scalar/list value (e.g. `CLM01: 5`) previously made `for..of (invs || [])` throw `not iterable`,
  // which escaped validateMatter and took down in-process callers (the pre-filing preflight gate).
  const rawMatrix = fm.inventorship_matrix;
  const matrix = (rawMatrix && typeof rawMatrix === "object" && !Array.isArray(rawMatrix)) ? rawMatrix : {};
  if (rawMatrix !== undefined && (typeof rawMatrix !== "object" || rawMatrix === null || Array.isArray(rawMatrix))) {
    E("MATRIX_MALFORMED", `inventorship_matrix must be a mapping of claimId -> [inventorId,...]; got ${Array.isArray(rawMatrix) ? "a list" : (rawMatrix === null ? "null" : typeof rawMatrix)}.`);
  }
  const inventorIds = new Set(inventors.map((i) => i && i.id).filter(Boolean));
  for (const [clm, invs] of Object.entries(matrix)) {
    if (!reg.claimById[clm]) E("MATRIX_BAD_CLAIM", `inventorship_matrix references claim '${clm}' which does not exist.`);
    if (!Array.isArray(invs)) { E("MATRIX_MALFORMED", `inventorship_matrix['${clm}'] must be a list of inventor ids; got ${invs === null ? "null" : typeof invs}.`); continue; }
    for (const iid of invs) if (!inventorIds.has(iid)) E("MATRIX_BAD_INVENTOR", `inventorship_matrix maps ${clm} to inventor '${iid}' not listed in inventors.`);
  }
  for (const c of m.claims) {
    if (c.binding.type === "claim-independent" && (!Array.isArray(matrix[c.id]) || matrix[c.id].length === 0)) {
      W("INVENTORSHIP_UNATTESTED", `${c.id} (independent) has no inventorship_matrix entry; conception not attested.`);
    }
  }

  // --- source-span provenance for adopted specification paragraphs ---
  // Warning-only: this surfaces weak provenance without deciding written-description sufficiency.
  for (const s of m.specs) {
    if ((s.binding.provenance || "ai-suggested") === "ai-suggested") continue;
    for (const finding of sourceSpanFindings(s.binding, s.id, { requireComplete: requireSourceSpan })) W(finding.code, finding.msg);
  }

  // --- figure numeral consistency ---
  for (const f of m.figures) {
    for (const n of asArray(f.binding.numerals).filter(Boolean)) {
      if (n.defined_in && !reg.ids.has(n.defined_in)) E("NUMERAL_NO_SPEC", `${f.id}#${n.numeral} ('${n.element}') defined_in ${n.defined_in} which does not exist.`);
    }
  }
  const repFigs = m.figures.filter((f) => f.binding.representative === true);
  if (m.figures.length > 0 && repFigs.length !== 1) W("REP_FIGURE", `expected exactly one representative figure; found ${repFigs.length}.`);

  // --- terms of degree ---
  for (const t of m.terms) {
    if (t.binding.objective_bound === false) W("TERM_NO_BOUND", `${t.id} ('${t.binding.term || ""}') is a term of degree without an objective bound (112(b) risk).`);
  }

  // --- recomputed provenance summary (info) ---
  // NULL-prototype: the key is the parsed `provenance` string (attacker/typo-controlled); a plain {} would
  // make `provenance: constructor`/`toString` read an inherited function and corrupt the count.
  const counts = Object.create(null);
  for (const c of m.claims) for (const lim of asArray(c.binding.limitations).filter(Boolean)) {
    const key = (lim.provenance || "").startsWith("inventor:") ? "inventor" : (lim.provenance || "ai-suggested");
    counts[key] = (counts[key] || 0) + 1;
  }
  info.push({ code: "PROVENANCE_LIMITATIONS", msg: `claim-limitation provenance counts: ${JSON.stringify(counts)}` });

  const meta = {
    title: fm.title, application_type: type, jurisdiction: rulePackState.jurisdiction, status: fm.status,
    confidential_workflow_mode: workflowMode.mode,
    rules_effective_date: fm.rules_effective_date, claims: m.claims.length,
    rule_pack: rulePackState.rule_pack,
    inventors: inventors.length, figures: m.figures.length, prior_art: m.priorArt.length,
  };
  return { dir, errors, warnings, info, meta };
}

// -------------------------------------------------------------------------------------------------
// CLI
// -------------------------------------------------------------------------------------------------

function verdict(report) {
  if (report.errors.length) return 2;
  if (report.warnings.length) return 1;
  return 0;
}

function main(argv) {
  const args = argv.slice(2);
  const asJson = args.includes("--json");
  const dir = args.find((a) => !a.startsWith("--"));
  if (!dir) { console.error("usage: node validate.mjs <matter-dir> [--json]"); process.exit(2); }
  let report;
  try { report = validateMatter(dir); }
  catch (e) {
    // A throw (e.g. malformed YAML caught by the fail-loud parser) is reported as one hard ERROR with
    // exit 2 - never an empty stdout + exit 1, which the contract reads as "warnings, proceed".
    report = { dir, errors: [{ code: "VALIDATOR_CRASH", msg: `validation failed (likely malformed input): ${e.message}` }], warnings: [], info: [], meta: {} };
  }
  const code = verdict(report);
  report.verdict = code === 0 ? "clean" : code === 1 ? "warnings" : "errors";
  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    const stamp = report.meta.rule_pack
      ? ` (rule pack ${report.meta.rule_pack.id} as of ${report.meta.rule_pack.effective_date}; verify currency)`
      : report.meta.rules_effective_date ? ` (rules as of ${report.meta.rules_effective_date}; verify currency)` : "";
    console.log(`APA Level-1 validation: ${report.dir}${stamp}`);
    console.log(`  ${report.meta.title || "(untitled)"} - ${report.meta.application_type || "?"} - ${report.meta.claims} claim(s)`);
    for (const e of report.errors) console.log(`  ERROR   [${e.code}] ${e.msg}`);
    for (const w of report.warnings) console.log(`  WARNING [${w.code}] ${w.msg}`);
    for (const i of report.info) console.log(`  info    [${i.code}] ${i.msg}`);
    console.log(`  => ${report.verdict.toUpperCase()}  (errors=${report.errors.length} warnings=${report.warnings.length})`);
    console.log("  NOTE: mechanical checks only. §112 sufficiency and 101/102/103 merits are flags for a registered practitioner, never a clearance.");
  }
  process.exit(code);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv);
}
