import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, extname, join, relative, resolve } from "node:path";

import {
  appendRunlog,
  buildRunlogEntry,
  commandRecord,
  existingFileRecords,
  humanCheckpoint,
} from "../apa-trace/runlog.mjs";

export const DEVICE_DOMAIN_SCHEMA = "apa-device-domain-artifact-v1";
const TEXT_EXT = new Set([".csv", ".json", ".md", ".txt", ".yaml", ".yml"]);
const IGNORE_DIRS = new Set([".git", "node_modules", "dist", "build", "coverage", "domain"]);
const RELATION_RE = /\b(coupled to|connected to|pivotally connected to|mounted to|secured to|disposed in|disposed on|engages|receives|supports|biases|slides within|rotates about)\b/ig;

export function buildComponentInventory(sourceDir, { maxFiles = 200 } = {}) {
  const root = resolve(sourceDir || ".");
  const files = walkTextFiles(root).slice(0, maxFiles);
  const components = [];
  const relationships = [];
  const drawingRefs = [];

  for (const file of files) {
    const text = safeRead(file);
    const source = rel(root, file);
    const sourceSha = sha256(text);
    const extracted = [
      ...parseMarkdownTable(text, source, sourceSha),
      ...parseNumberedLines(text, source, sourceSha),
      ...parseJsonParts(text, source, sourceSha),
    ];
    for (const c of extracted) components.push(c);
    relationships.push(...extractRelationships(text, source, sourceSha, extracted));
    drawingRefs.push(...extractDrawingRefs(text, source, sourceSha));
  }

  const deduped = dedupeComponents(components);
  return {
    schema: DEVICE_DOMAIN_SCHEMA,
    artifact: "component_inventory",
    generated_at: new Date().toISOString(),
    source_root: root,
    files_scanned: files.length,
    truncated: files.length >= maxFiles,
    components: deduped,
    relationships: dedupeRelationships(relationships),
    drawing_refs: dedupeDrawingRefs(drawingRefs),
    mechanism_signals: mechanismSignals(deduped, relationships),
    caveats: [
      "Static device-domain extraction only; CAD geometry, manufacturing tolerances, materials, and dimensions require human/draftsperson confirmation.",
      "This domain artifact does not write canonical APA files and is not a patentability, infringement, validity, FTO, or drawing-compliance conclusion.",
    ],
  };
}

export function buildMechanicalClaimSeeds(inventory) {
  const components = inventory.components || [];
  const primary = components.slice(0, 8);
  const relationships = inventory.relationships || [];
  return {
    schema: DEVICE_DOMAIN_SCHEMA,
    artifact: "mechanical_claim_seeds",
    generated_at: new Date().toISOString(),
    legal_posture: "claim seeds only; not a claim-scope recommendation or legal conclusion",
    support_state: primary.length ? "needs-human-adoption" : "needs-inventor-confirmation",
    apparatus_seed: {
      label: "apparatus/device",
      candidate_limitations: primary.map((c, i) => ({
        id: `DEV-LIM${String(i + 1).padStart(2, "0")}`,
        text: `a ${c.name}${c.ref ? ` (${c.ref})` : ""} configured as a source-backed structural component`,
        component_ref: c.ref || "",
        provenance: "domain-device-extracted",
        adoption_state: "ai-suggested",
      })),
    },
    relationship_seed: relationships.slice(0, 8).map((r, i) => ({
      id: `DEV-REL${String(i + 1).padStart(2, "0")}`,
      text: `${r.subject || "a first component"} ${r.relation} ${r.object || "a second component"}`,
      provenance: r.source,
      adoption_state: "ai-suggested",
    })),
    system_seed: {
      label: "system",
      candidate_components: primary.map((c) => ({ name: c.name, ref: c.ref || "", role: c.role || "structural component candidate" })),
    },
    human_checkpoints: [
      "confirm which structural relationships are novel or material",
      "confirm reference numerals and component names against drawings",
      "adopt or reject every ai-suggested limitation before assembly",
    ],
  };
}

export function buildFigurePlan(inventory) {
  const components = inventory.components || [];
  const refs = components.filter((c) => c.ref).map((c) => ({ ref: c.ref, label: c.name, source: c.source }));
  const relationshipCount = (inventory.relationships || []).length;
  const proposed = [
    {
      figure_id: "DEV-FIG01",
      view_type: "isometric",
      purpose: "show overall device structure and primary component positions",
      reference_numerals: refs,
      human_review_required: true,
    },
    {
      figure_id: "DEV-FIG02",
      view_type: "exploded",
      purpose: "show component ordering, attachment, and assembly relationships",
      reference_numerals: refs,
      human_review_required: true,
    },
  ];
  if (relationshipCount) {
    proposed.push({
      figure_id: "DEV-FIG03",
      view_type: "sectional/detail",
      purpose: "show internal engagement, pivot, sliding, or coupling relationships",
      reference_numerals: refs,
      human_review_required: true,
    });
  }
  return {
    schema: DEVICE_DOMAIN_SCHEMA,
    artifact: "figure_plan",
    generated_at: new Date().toISOString(),
    legal_posture: "figure plan only; do not add unsupported visual matter",
    proposed_figures: proposed,
    cautions: [
      "Route final drawing candidates through /apa-figures and /apa-drawing-quality.",
      "Every visualized part, section line, lead line, and reference numeral needs source support before adoption.",
    ],
  };
}

export function buildReferenceNumeralReview(inventory) {
  const components = inventory.components || [];
  const drawingRefs = inventory.drawing_refs || [];
  const componentRefs = new Map(components.filter((c) => c.ref).map((c) => [String(c.ref), c]));
  const drawingByRef = new Map();
  const findings = [];

  for (const ref of drawingRefs) {
    const key = String(ref.ref);
    if (!drawingByRef.has(key)) drawingByRef.set(key, []);
    drawingByRef.get(key).push(ref);
  }
  for (const [ref, comp] of componentRefs) {
    if (!drawingByRef.has(ref)) {
      findings.push(finding("warning", "reference-numeral-review", `Reference numeral ${ref} (${comp.name}) appears in component inventory but not drawing refs.`, comp.source));
    }
  }
  for (const [ref, refs] of drawingByRef) {
    if (!componentRefs.has(ref)) {
      findings.push(finding("warning", "reference-numeral-review", `Drawing reference numeral ${ref} has no matching component inventory entry.`, refs[0].source));
    }
    const labels = new Set(refs.map((r) => normalizeName(r.label)).filter(Boolean));
    if (labels.size > 1) {
      findings.push(finding("blocking", "reference-numeral-review", `Reference numeral ${ref} has inconsistent labels: ${[...labels].join(", ")}.`, refs[0].source));
    }
  }
  return {
    schema: DEVICE_DOMAIN_SCHEMA,
    artifact: "reference_numeral_review",
    generated_at: new Date().toISOString(),
    legal_posture: "formal-risk precheck only; not USPTO drawing compliance certification",
    component_ref_count: componentRefs.size,
    drawing_ref_count: drawingRefs.length,
    findings,
    verdict: findings.some((f) => f.severity === "blocking") ? "blocking-findings" : "ready-for-human-drawing-review",
  };
}

export function runDeviceDomain({ command, source, matter, out, argv = [], startedAt = new Date().toISOString() } = {}) {
  const sourceDir = resolve(source || matter || ".");
  const matterDir = matter ? resolve(matter) : "";
  const domainDir = matterDir ? join(matterDir, "domain", "device") : dirname(resolve(out || "."));
  mkdirSync(domainDir, { recursive: true });

  const inventory = buildComponentInventory(sourceDir);
  const outputs = [];
  let result;
  if (command === "inventory") {
    result = inventory;
    outputs.push(writeJson(out || join(domainDir, "component_inventory.json"), result));
  } else if (command === "claim-seeds") {
    result = buildMechanicalClaimSeeds(inventory);
    outputs.push(writeJson(out || join(domainDir, "mechanical_claim_seeds.json"), result));
  } else if (command === "figures") {
    result = buildFigurePlan(inventory);
    outputs.push(writeJson(out || join(domainDir, "figure_plan.json"), result));
  } else if (command === "numeral-review") {
    result = buildReferenceNumeralReview(inventory);
    outputs.push(writeJson(out || join(domainDir, "reference_numeral_review.json"), result));
  } else if (command === "run-all") {
    const seeds = buildMechanicalClaimSeeds(inventory);
    const figures = buildFigurePlan(inventory);
    const numeralReview = buildReferenceNumeralReview(inventory);
    outputs.push(writeJson(join(domainDir, "component_inventory.json"), inventory));
    outputs.push(writeJson(join(domainDir, "mechanical_claim_seeds.json"), seeds));
    outputs.push(writeJson(join(domainDir, "figure_plan.json"), figures));
    outputs.push(writeJson(join(domainDir, "reference_numeral_review.json"), numeralReview));
    result = { inventory, seeds, figures, numeralReview };
  } else {
    throw new Error(`unknown device domain command '${command}'`);
  }

  if (matterDir) {
    appendRunlog(matterDir, buildRunlogEntry({
      timestamp: new Date().toISOString(),
      skill: commandToSkill(command),
      ruleVersion: "apa-device-domain-v1",
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
        humanCheckpoint({ id: "device-domain-human-adoption", required: true, satisfied: false }),
        humanCheckpoint({ id: "reference-numeral-human-review", required: true, satisfied: false }),
      ],
      notes: [`source=${sourceDir}`, `writes_only_under=domain/device/`],
    }));
  }
  return { outputs, result };
}

function parseMarkdownTable(text, source, sourceSha) {
  const out = [];
  const lines = String(text || "").split(/\r?\n/);
  for (const line of lines) {
    if (!line.includes("|")) continue;
    const cells = line.split("|").map((c) => c.trim()).filter(Boolean);
    if (cells.length < 2 || cells.some((c) => /^-+$/.test(c))) continue;
    const lower = cells.join(" ").toLowerCase();
    if (/ref|numeral|component|part/.test(lower) && /name|component|part/.test(lower)) continue;
    const ref = firstRef(cells[0]) || firstRef(cells[1]);
    const name = normalizeComponentName(ref && cells[0].includes(ref) ? cells[1] : cells[0]);
    if (name && !/ref|numeral|component|part|relationship/i.test(name)) {
      out.push(component(ref, name, source, sourceSha, { role: cells[2] || "" }));
    }
  }
  return out;
}

function parseNumberedLines(text, source, sourceSha) {
  const out = [];
  for (const m of String(text || "").matchAll(/(?:^|\n)\s*(?:ref(?:erence)?\s*)?(\d{2,4})\s*[-:]\s*([A-Za-z][A-Za-z0-9 _/-]{2,80})/gi)) {
    out.push(component(m[1], normalizeComponentName(m[2]), source, sourceSha));
  }
  return out;
}

function parseJsonParts(text, source, sourceSha) {
  const out = [];
  let parsed;
  try { parsed = JSON.parse(text); } catch { return out; }
  const parts = Array.isArray(parsed) ? parsed : (parsed.parts || parsed.components || []);
  if (!Array.isArray(parts)) return out;
  for (const p of parts) {
    if (!p || typeof p !== "object") continue;
    const ref = String(p.ref || p.numeral || p.id || "").match(/\d{2,4}/)?.[0] || "";
    const name = normalizeComponentName(p.name || p.label || p.component || "");
    if (name) out.push(component(ref, name, source, sourceSha, { role: p.role || "", material: p.material || "" }));
  }
  return out;
}

function extractRelationships(text, source, sourceSha, components) {
  const out = [];
  const names = components.map((c) => c.name).filter(Boolean);
  for (const line of String(text || "").split(/\r?\n/)) {
    const rel = [...line.matchAll(RELATION_RE)][0]?.[1];
    if (!rel) continue;
    const subject = names.find((n) => line.toLowerCase().includes(n.toLowerCase())) || "";
    const after = line.slice(line.toLowerCase().indexOf(rel.toLowerCase()) + rel.length);
    const object = names.find((n) => after.toLowerCase().includes(n.toLowerCase())) || "";
    out.push({ subject, relation: rel.toLowerCase(), object, source, source_sha256: sourceSha, evidence: oneLine(line) });
  }
  return out;
}

function extractDrawingRefs(text, source, sourceSha) {
  const refs = [];
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = null; }
  const jsonRefs = parsed && (parsed.refs || parsed.reference_numerals || parsed.parts);
  if (Array.isArray(jsonRefs)) {
    for (const r of jsonRefs) {
      if (!r || typeof r !== "object") continue;
      const ref = String(r.ref || r.numeral || r.id || "").match(/\d{2,4}/)?.[0] || "";
      const label = normalizeComponentName(r.label || r.name || r.component || "");
      if (ref) refs.push({ ref, label, source, source_sha256: sourceSha });
    }
  }
  for (const m of String(text || "").matchAll(/\b(?:FIG\.?\s*\d+\s*)?(?:ref(?:erence)?\s*)?(\d{2,4})\s*(?:[:=-]\s*|\()([A-Za-z][A-Za-z0-9 _/-]{2,60})/gi)) {
    refs.push({ ref: m[1], label: normalizeComponentName(m[2].replace(/\)+$/, "")), source, source_sha256: sourceSha });
  }
  return refs;
}

function component(ref, name, source, sourceSha, extra = {}) {
  return {
    ref: ref || "",
    name,
    source,
    source_sha256: sourceSha,
    ...Object.fromEntries(Object.entries(extra).filter(([, v]) => v)),
  };
}

function dedupeComponents(items) {
  const map = new Map();
  for (const item of items) {
    const key = item.ref ? `ref:${item.ref}` : `name:${normalizeName(item.name)}`;
    if (!map.has(key)) map.set(key, item);
  }
  return [...map.values()].sort((a, b) => String(a.ref || a.name).localeCompare(String(b.ref || b.name), undefined, { numeric: true }));
}

function dedupeRelationships(items) {
  const seen = new Set();
  return items.filter((r) => {
    const key = [r.subject, r.relation, r.object, r.evidence].map(normalizeName).join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeDrawingRefs(items) {
  const seen = new Set();
  return items.filter((r) => {
    const key = `${r.ref}|${normalizeName(r.label)}|${r.source}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mechanismSignals(components, relationships) {
  const names = components.map((c) => normalizeName(c.name));
  const structural = names.filter((n) => /(hinge|pivot|spring|valve|seal|latch|bracket|shaft|gear|channel|slot|guide|arm|plate|housing)/.test(n));
  return [
    ...structural.slice(0, 10).map((n) => `structural component candidate: ${n}`),
    ...relationships.slice(0, 8).map((r) => `relationship candidate: ${r.subject || "component"} ${r.relation} ${r.object || "component"}`),
  ];
}

function finding(severity, rule, recommendation, evidenceSpan) {
  return {
    severity,
    rule_anchor: rule,
    evidence_span: evidenceSpan || "domain/device/component_inventory.json",
    recommendation,
  };
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
    inventory: "apa-device-disclosure-extractor",
    "claim-seeds": "apa-mechanical-claim-patterns",
    figures: "apa-device-figure-patterns",
    "numeral-review": "apa-reference-numeral-review",
    "run-all": "apa-domain-device",
  })[command] || "apa-domain-device";
}

function firstRef(text) {
  return String(text || "").match(/\b\d{2,4}\b/)?.[0] || "";
}

function normalizeComponentName(text) {
  return oneLine(String(text || "").replace(/\b\d{2,4}\b/g, "").replace(/\b(ref|reference|numeral|component|part)\b/ig, "").replace(/^[\s:=-]+|[\s:=-]+$/g, ""));
}

function normalizeName(text) {
  return oneLine(text).toLowerCase();
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
