import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, extname, join, relative, resolve } from "node:path";

import {
  appendRunlog,
  buildRunlogEntry,
  commandRecord,
  existingFileRecords,
  humanCheckpoint,
} from "../apa-trace/runlog.mjs";

export const FORMULATION_DOMAIN_SCHEMA = "apa-formulation-domain-artifact-v1";
const TEXT_EXT = new Set([".csv", ".json", ".md", ".txt", ".yaml", ".yml"]);
const IGNORE_DIRS = new Set([".git", "node_modules", "dist", "build", "coverage", "domain"]);
const RANGE_RE = /(?:about\s+)?(\d+(?:\.\d+)?)\s*(?:-|to|–)\s*(\d+(?:\.\d+)?)\s*(wt\s*%|%|mg\/ml|mg|g|ml|mol\s*%|ppm|phr|parts?)(?=\s|$|\||,|;|\.)/ig;
const AMOUNT_RE = /(?:about\s+)?(\d+(?:\.\d+)?)\s*(wt\s*%|%|mg\/ml|mg|g|ml|mol\s*%|ppm|phr|parts?)(?=\s|$|\||,|;|\.)/ig;
const INGREDIENT_ROLE_RE = /\b(active|binder|solvent|polymer|surfactant|stabilizer|buffer|excipient|crosslinker|initiator|catalyst|filler|plasticizer|preservative|vehicle|carrier)\b/i;
const PROPERTY_RE = /\b(viscosity|ph|release|dissolution|stability|potency|adhesion|hardness|particle size|conductivity|tensile|elongation|shelf life|yield|purity)\b/i;
const STEP_RE = /\b(mix|mixed|dissolve|dissolved|heat|heated|cool|cooled|filter|filtered|dry|dried|cure|cured|blend|blended|homogenize|homogenized|sterilize|sterilized|coat|coated|polymerize|neutralize|adjust)\b/i;

export function buildFormulationSummary(sourceDir, { maxFiles = 200 } = {}) {
  const root = resolve(sourceDir || ".");
  const files = walkTextFiles(root).slice(0, maxFiles);
  const ingredients = [];
  const ranges = [];
  const examples = [];
  const procedures = [];
  const properties = [];

  for (const file of files) {
    const text = safeRead(file);
    const source = rel(root, file);
    const sourceSha = sha256(text);
    ingredients.push(...extractIngredients(text, source, sourceSha));
    ranges.push(...extractRanges(text, source, sourceSha));
    examples.push(...extractExamples(text, source, sourceSha));
    procedures.push(...extractProcedures(text, source, sourceSha));
    properties.push(...extractProperties(text, source, sourceSha));
  }

  return {
    schema: FORMULATION_DOMAIN_SCHEMA,
    artifact: "formulation_summary",
    generated_at: new Date().toISOString(),
    source_root: root,
    files_scanned: files.length,
    truncated: files.length >= maxFiles,
    ingredients: dedupeBy(ingredients, (x) => `${normalize(x.name)}|${normalize(x.role)}|${x.source}`),
    ranges: dedupeBy(ranges, (x) => `${normalize(x.label)}|${x.low}|${x.high}|${normalize(x.unit)}|${x.source}`),
    examples: dedupeBy(examples, (x) => `${normalize(x.id)}|${x.source}`),
    procedures: dedupeBy(procedures, (x) => `${normalize(x.step)}|${x.source}`),
    measured_properties: dedupeBy(properties, (x) => `${normalize(x.property)}|${x.source}`),
    caveats: [
      "Static formulation-domain extraction only; actual support, enablement, criticality, regulatory status, and test sufficiency require competent human review.",
      "This domain artifact does not write canonical APA files and is not a patentability, validity, infringement, FTO, safety, efficacy, or regulatory conclusion.",
    ],
  };
}

export function buildFormulationClaimSeeds(summary) {
  const ingredients = summary.ingredients || [];
  const ranges = summary.ranges || [];
  const procedures = summary.procedures || [];
  return {
    schema: FORMULATION_DOMAIN_SCHEMA,
    artifact: "formulation_claim_seeds",
    generated_at: new Date().toISOString(),
    legal_posture: "claim seeds only; not a claim-scope recommendation, regulatory conclusion, or legal conclusion",
    support_state: ingredients.length ? "needs-human-adoption" : "needs-inventor-confirmation",
    composition_seed: {
      label: "composition of matter",
      candidate_limitations: ingredients.slice(0, 12).map((ing, i) => ({
        id: `FORM-LIM${String(i + 1).padStart(2, "0")}`,
        text: `a source-backed ${ing.role || "component"} comprising ${ing.name}${rangeFor(ing, ranges)}`,
        ingredient: ing.name,
        role: ing.role || "",
        provenance: "domain-formulation-extracted",
        source_span: ing.source,
        adoption_state: "ai-suggested",
      })),
    },
    preparation_seed: {
      label: "method of preparation",
      candidate_steps: procedures.slice(0, 10).map((step, i) => ({
        id: `FORM-STEP${String(i + 1).padStart(2, "0")}`,
        text: step.step,
        provenance: "domain-formulation-extracted",
        source_span: step.source,
        adoption_state: "ai-suggested",
      })),
    },
    use_seed: {
      label: "method of use",
      caution: "Use only if the canonical specification and human source material support the use and avoid unsupported treatment/regulatory assertions.",
      measured_properties: (summary.measured_properties || []).slice(0, 8),
    },
    human_checkpoints: [
      "confirm each ingredient/range is actually part of the invention, not only a tested control",
      "confirm working and comparative examples support the desired breadth",
      "adopt or reject every ai-suggested limitation before assembly",
    ],
  };
}

export function buildCompositionEnablementReview(summary, claimSeeds = null) {
  const findings = [];
  const ingredients = summary.ingredients || [];
  const ranges = summary.ranges || [];
  const examples = summary.examples || [];
  const properties = summary.measured_properties || [];
  if (!ingredients.length) {
    findings.push(finding("blocking", "composition-enablement", "No source-backed formulation ingredients were extracted; obtain a concrete composition disclosure before drafting claims."));
  }
  if (!examples.some((e) => e.kind === "working")) {
    findings.push(finding("warning", "composition-enablement", "No working example was detected; broad composition ranges may be unsupported without tested examples."));
  }
  if (ranges.length && examples.length < Math.min(2, ranges.length)) {
    findings.push(finding("warning", "composition-enablement", "Extracted ranges have limited example support; map each claimed range to working and non-working examples."));
  }
  if (!properties.length) {
    findings.push(finding("warning", "composition-enablement", "No measured property or performance endpoint was detected; identify critical properties and test support."));
  }
  if (claimSeeds?.composition_seed?.candidate_limitations?.length && !ranges.length) {
    findings.push(finding("warning", "composition-enablement", "Composition claim seeds lack extracted quantitative ranges; confirm whether qualitative ingredient recitation is intended."));
  }
  return {
    schema: FORMULATION_DOMAIN_SCHEMA,
    artifact: "composition_enablement_review",
    generated_at: new Date().toISOString(),
    legal_posture: "enablement/written-description risk flags only; no legal conclusion",
    ingredient_count: ingredients.length,
    range_count: ranges.length,
    working_example_count: examples.filter((e) => e.kind === "working").length,
    comparative_example_count: examples.filter((e) => e.kind === "comparative").length,
    measured_property_count: properties.length,
    findings,
    verdict: findings.some((f) => f.severity === "blocking") ? "blocking-findings" : "needs-human-enablement-review",
  };
}

export function buildRangesAndExamplesReview(summary) {
  const ranges = summary.ranges || [];
  const examples = summary.examples || [];
  const findings = [];
  for (const range of ranges) {
    const supporting = examples.filter((e) => mentionsAny(e.text, [range.label, range.unit]));
    if (!supporting.length) {
      findings.push(finding("warning", "ranges-and-examples", `Range ${range.label} ${range.low}-${range.high} ${range.unit} has no directly linked example in the extracted text.`, range.source));
    }
  }
  const nonWorking = examples.filter((e) => e.kind === "comparative" || e.kind === "non-working");
  if (!nonWorking.length) {
    findings.push(finding("info", "ranges-and-examples", "No comparative or non-working examples detected; ask whether failed/edge examples exist to support claim boundaries."));
  }
  return {
    schema: FORMULATION_DOMAIN_SCHEMA,
    artifact: "ranges_and_examples_review",
    generated_at: new Date().toISOString(),
    legal_posture: "range/example mapping only; no claim-scope, patentability, or regulatory conclusion",
    ranges: ranges.map((range) => ({
      ...range,
      linked_examples: examples
        .filter((e) => mentionsAny(e.text, [range.label, range.unit]))
        .map((e) => e.id),
    })),
    examples,
    findings,
    verdict: findings.some((f) => f.severity === "blocking") ? "blocking-findings" : "ready-for-human-range-review",
  };
}

export function runFormulationDomain({ command, source, matter, out, argv = [], startedAt = new Date().toISOString() } = {}) {
  const sourceDir = resolve(source || matter || ".");
  const matterDir = matter ? resolve(matter) : "";
  const domainDir = matterDir ? join(matterDir, "domain", "formulation") : dirname(resolve(out || "."));
  mkdirSync(domainDir, { recursive: true });

  const summary = buildFormulationSummary(sourceDir);
  const outputs = [];
  let result;
  if (command === "summary") {
    result = summary;
    outputs.push(writeJson(out || join(domainDir, "formulation_summary.json"), result));
  } else if (command === "claim-seeds") {
    result = buildFormulationClaimSeeds(summary);
    outputs.push(writeJson(out || join(domainDir, "formulation_claim_seeds.json"), result));
  } else if (command === "enablement-review") {
    result = buildCompositionEnablementReview(summary, buildFormulationClaimSeeds(summary));
    outputs.push(writeJson(out || join(domainDir, "composition_enablement_review.json"), result));
  } else if (command === "ranges-review") {
    result = buildRangesAndExamplesReview(summary);
    outputs.push(writeJson(out || join(domainDir, "ranges_and_examples_review.json"), result));
  } else if (command === "run-all") {
    const seeds = buildFormulationClaimSeeds(summary);
    const enablement = buildCompositionEnablementReview(summary, seeds);
    const ranges = buildRangesAndExamplesReview(summary);
    outputs.push(writeJson(join(domainDir, "formulation_summary.json"), summary));
    outputs.push(writeJson(join(domainDir, "formulation_claim_seeds.json"), seeds));
    outputs.push(writeJson(join(domainDir, "composition_enablement_review.json"), enablement));
    outputs.push(writeJson(join(domainDir, "ranges_and_examples_review.json"), ranges));
    result = { summary, seeds, enablement, ranges };
  } else {
    throw new Error(`unknown formulation domain command '${command}'`);
  }

  if (matterDir) {
    appendRunlog(matterDir, buildRunlogEntry({
      timestamp: new Date().toISOString(),
      skill: commandToSkill(command),
      ruleVersion: "apa-formulation-domain-v1",
      inputs: existingFileRecords(matterDir, sampleInputFiles(sourceDir)),
      outputs: existingFileRecords(matterDir, outputs),
      commands: [commandRecord({
        argv,
        cwd: process.cwd(),
        exitCode: 0,
        startedAt,
        endedAt: new Date().toISOString(),
      })],
      humanCheckpoints: [
        humanCheckpoint({ id: "formulation-domain-human-adoption", required: true, satisfied: false }),
        humanCheckpoint({ id: "composition-enablement-human-review", required: true, satisfied: false }),
      ],
      notes: [`source=${sourceDir}`, "writes_only_under=domain/formulation/"],
    }));
  }
  return { outputs, result };
}

function extractIngredients(text, source, sourceSha) {
  const out = [];
  for (const row of parseRows(text)) {
    const joined = row.join(" ");
    if (!hasAmount(joined)) continue;
    const role = (joined.match(INGREDIENT_ROLE_RE) || [])[1] || "";
    const name = normalizeIngredientName(row[0]);
    if (name && !/ingredient|component|amount|range|role/i.test(name)) out.push({ name, role: role.toLowerCase(), source, source_sha256: sourceSha });
  }
  return out;
}

function extractRanges(text, source, sourceSha) {
  const out = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    RANGE_RE.lastIndex = 0;
    for (const m of line.matchAll(RANGE_RE)) {
      out.push({
        label: rangeLabel(line, m.index || 0),
        low: Number(m[1]),
        high: Number(m[2]),
        unit: normalizeUnit(m[3]),
        source,
        source_sha256: sourceSha,
        evidence: oneLine(line),
      });
    }
    AMOUNT_RE.lastIndex = 0;
    for (const m of line.matchAll(AMOUNT_RE)) {
      if (/(?:-|to|–)\s*\d/.test(line.slice(Math.max(0, (m.index || 0) - 4), (m.index || 0) + 16))) continue;
      out.push({
        label: rangeLabel(line, m.index || 0),
        low: Number(m[1]),
        high: Number(m[1]),
        unit: normalizeUnit(m[2]),
        source,
        source_sha256: sourceSha,
        evidence: oneLine(line),
      });
    }
  }
  return out;
}

function extractExamples(text, source, sourceSha) {
  const out = [];
  const blocks = String(text || "").split(/(?=^#{0,3}\s*(?:working\s+|comparative\s+|non-working\s+)?example\s+\w+|^#{0,3}\s*protocol\s+\w+)/gim);
  for (const block of blocks) {
    const head = oneLine(block.split(/\r?\n/)[0] || "");
    if (!/\b(example|protocol)\b/i.test(head)) continue;
    const kind = /comparative/i.test(head) ? "comparative" : /non-working|failed/i.test(head) ? "non-working" : "working";
    out.push({
      id: head.replace(/^#+\s*/, "") || `example-${out.length + 1}`,
      kind,
      source,
      source_sha256: sourceSha,
      text: oneLine(block).slice(0, 800),
    });
  }
  return out;
}

function extractProcedures(text, source, sourceSha) {
  const out = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    if (STEP_RE.test(line)) out.push({ step: oneLine(line).slice(0, 240), source, source_sha256: sourceSha });
  }
  return out;
}

function extractProperties(text, source, sourceSha) {
  const out = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    const m = line.match(PROPERTY_RE);
    if (m) out.push({ property: m[1].toLowerCase(), source, source_sha256: sourceSha, evidence: oneLine(line) });
  }
  return out;
}

function parseRows(text) {
  const rows = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    if (line.includes("|")) {
      const cells = line.split("|").map((c) => c.trim()).filter(Boolean);
      if (cells.length >= 2 && !cells.every((c) => /^-+$/.test(c))) rows.push(cells);
    } else if (line.includes(",")) {
      const cells = line.split(",").map((c) => c.trim()).filter(Boolean);
      if (cells.length >= 2) rows.push(cells);
    }
  }
  return rows;
}

function rangeFor(ingredient, ranges) {
  const r = ranges.find((x) => mentionsAny(x.evidence, [ingredient.name]));
  return r ? ` at ${r.low === r.high ? r.low : `${r.low}-${r.high}`} ${r.unit}` : "";
}

function rangeLabel(line, index) {
  if (line.includes("|")) {
    const cells = line.split("|").map((c) => c.trim()).filter(Boolean);
    if (cells.length >= 2) return normalizeIngredientName(cells[0]) || "formulation component";
  }
  const prefix = oneLine(line.slice(0, index));
  const candidate = prefix.split(/[;,.]/).at(-1) || prefix;
  return normalizeIngredientName(candidate) || "formulation component";
}

function finding(severity, rule, recommendation, evidenceSpan = "domain/formulation/formulation_summary.json") {
  return { severity, rule_anchor: rule, evidence_span: evidenceSpan, recommendation };
}

function sampleInputFiles(sourceDir) {
  return walkTextFiles(sourceDir).slice(0, 20);
}

function walkTextFiles(root, out = []) {
  if (!existsSync(root)) return out;
  for (const entry of readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = join(root, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name)) walkTextFiles(p, out);
    } else if (entry.isFile() && TEXT_EXT.has(extname(entry.name).toLowerCase())) {
      out.push(p);
    }
  }
  return out;
}

function writeJson(path, data) {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
  return resolve(path);
}

function commandToSkill(command) {
  return ({
    summary: "apa-formulation-disclosure-extractor",
    "claim-seeds": "apa-formulation-claim-patterns",
    "enablement-review": "apa-composition-enablement-review",
    "ranges-review": "apa-ranges-and-examples-review",
    "run-all": "apa-domain-formulation",
  })[command] || "apa-domain-formulation";
}

function hasAmount(text) {
  RANGE_RE.lastIndex = 0;
  AMOUNT_RE.lastIndex = 0;
  return RANGE_RE.test(String(text || "")) || AMOUNT_RE.test(String(text || ""));
}

function mentionsAny(text, terms) {
  const hay = normalize(text);
  return terms.some((term) => term && hay.includes(normalize(term)));
}

function normalizeIngredientName(text) {
  return oneLine(String(text || "")
    .replace(/\b(about|from|between|range|amount|wt|mg|ml|ppm|parts|component|ingredient|role|example)\b/ig, "")
    .replace(/[0-9.%/:-]+/g, " ")
    .replace(/\s+/g, " "))
    .replace(/^[,;.\s-]+|[,;.\s-]+$/g, "")
    .toLowerCase();
}

function normalizeUnit(unit) {
  return oneLine(unit).toLowerCase().replace(/\s+/g, "");
}

function normalize(text) {
  return oneLine(text).toLowerCase();
}

function dedupeBy(items, keyFn) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function oneLine(text) {
  return String(text || "").replace(/[\r\n\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim();
}

function safeRead(file) {
  try { return readFileSync(file, "utf8"); } catch { return ""; }
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function rel(root, file) {
  return relative(root, file).replace(/\\/g, "/");
}
