import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { basename, dirname, extname, join, relative, resolve } from "node:path";

import {
  appendRunlog,
  buildRunlogEntry,
  commandRecord,
  existingFileRecords,
  humanCheckpoint,
} from "../apa-trace/runlog.mjs";

export const SOFTWARE_DOMAIN_SCHEMA = "apa-software-domain-artifact-v1";
const TEXT_EXT = new Set([
  ".c", ".cc", ".cpp", ".cs", ".css", ".go", ".h", ".hpp", ".html", ".java", ".js", ".jsx",
  ".json", ".mjs", ".md", ".php", ".py", ".rb", ".rs", ".sql", ".ts", ".tsx", ".txt", ".yaml", ".yml",
]);
const IGNORE_DIRS = new Set([".git", "node_modules", "dist", "build", "coverage", ".next", ".venv", "__pycache__", "domain"]);

export function buildCodebaseInventory(sourceDir, { maxFiles = 250 } = {}) {
  const root = resolve(sourceDir || ".");
  const files = walkTextFiles(root).slice(0, maxFiles);
  const modules = files.map((file) => {
    const text = safeRead(file);
    return {
      path: rel(root, file),
      language: languageOf(file),
      bytes: Buffer.byteLength(text),
      sha256: sha256(text),
      functions: extractFunctions(text, file).slice(0, 80),
      classes: extractClasses(text, file).slice(0, 40),
      endpoints: extractEndpoints(text, file).slice(0, 40),
      comments: extractComments(text, file).slice(0, 20),
      imports: extractImports(text, file).slice(0, 40),
    };
  });
  const flows = inferFlows(modules);
  return {
    schema: SOFTWARE_DOMAIN_SCHEMA,
    artifact: "codebase_inventory",
    generated_at: new Date().toISOString(),
    source_root: root,
    source_root_name: basename(root),
    files_scanned: modules.length,
    truncated: files.length >= maxFiles,
    languages: countBy(modules.map((m) => m.language)),
    modules,
    flows,
    invention_signals: inventionSignals(modules, flows),
    caveats: [
      "Static inventory only; dynamic behavior, deployed infrastructure, and private product decisions require human confirmation.",
      "This domain artifact does not write canonical APA files and is not a patentability, infringement, validity, or FTO conclusion.",
    ],
  };
}

export function buildDisclosureSummary(inventory, { gitLog = [] } = {}) {
  const signals = inventory.invention_signals || [];
  const topModules = [...(inventory.modules || [])]
    .sort((a, b) => scoreModule(b) - scoreModule(a))
    .slice(0, 8);
  return [
    "# Software Disclosure Summary",
    "",
    "Generated from local static code inventory. Treat as inventor-discussion prompts, not adopted APA facts.",
    "",
    "## Candidate Technical Mechanisms",
    "",
    ...(signals.length ? signals.map((s) => `- ${s}`) : ["- No strong mechanism signal detected; ask the inventor for the concrete technical improvement."]),
    "",
    "## High-Signal Modules",
    "",
    ...(topModules.length ? topModules.map((m) => `- \`${m.path}\`: ${moduleSummary(m)}`) : ["- No source modules scanned."]),
    "",
    "## Candidate Inventor Questions",
    "",
    "- What technical problem existed in prior systems?",
    "- Which code path implements the new mechanism rather than routine integration?",
    "- What data structure, transform, scheduling rule, protocol step, or resource constraint is materially different?",
    "- What measurable effect is expected or observed: latency, memory, bandwidth, accuracy, security, robustness, or another technical metric?",
    "- Which limitation was conceived by which natural-person inventor?",
    "",
    "## Recent Commit Hints",
    "",
    ...(gitLog.length ? gitLog.slice(0, 12).map((line) => `- ${line}`) : ["- No git log hints available or source is not a git worktree."]),
    "",
  ].join("\n");
}

export function buildClaimSeeds(inventory) {
  const mechanisms = mechanismTerms(inventory).slice(0, 8);
  const flows = (inventory.flows || []).slice(0, 6);
  const primary = mechanisms.slice(0, 4);
  return {
    schema: SOFTWARE_DOMAIN_SCHEMA,
    artifact: "software_claim_seeds",
    generated_at: new Date().toISOString(),
    legal_posture: "claim seeds only; not a claim-scope recommendation or legal conclusion",
    support_state: primary.length ? "needs-human-adoption" : "needs-inventor-confirmation",
    method_seed: {
      label: "method",
      candidate_limitations: primary.map((term, i) => ({
        id: `SW-LIM${String(i + 1).padStart(2, "0")}`,
        text: `performing a source-backed ${term} operation within the computer-implemented workflow`,
        provenance: "domain-software-inferred",
        adoption_state: "ai-suggested",
      })),
    },
    system_seed: {
      label: "system",
      candidate_components: componentTerms(inventory).slice(0, 8).map((term) => ({ term, role: "source-backed software component candidate" })),
    },
    crm_seed: {
      label: "non-transitory computer-readable medium",
      caution: "Use only if the specification supports stored instructions and excludes transitory signals.",
      candidate_steps: primary,
    },
    flow_handoff: flows,
    human_checkpoints: [
      "confirm technical-improvement mechanism",
      "confirm natural-person inventorship per limitation",
      "adopt or reject every ai-suggested limitation before assembly",
    ],
  };
}

export function buildSoftware101Review(inventory, claimSeeds = null) {
  const mechanisms = mechanismTerms(inventory);
  const hasConcreteMechanism = mechanisms.length >= 2;
  const genericSignals = findGenericAutomationSignals(inventory);
  const flags = [];
  if (!hasConcreteMechanism) {
    flags.push(finding("blocking", "software-101", "No concrete source-backed software mechanism was detected; avoid drafting around a business result or generic automation."));
  }
  for (const signal of genericSignals.slice(0, 6)) {
    flags.push(finding("warning", "software-101", `Generic automation / abstract-idea risk signal: ${signal}`));
  }
  if (claimSeeds?.crm_seed && !mechanisms.length) {
    flags.push(finding("warning", "software-crm", "CRM claim seed lacks a clear stored-instruction technical mechanism."));
  }
  return {
    schema: SOFTWARE_DOMAIN_SCHEMA,
    artifact: "software_101_review",
    generated_at: new Date().toISOString(),
    legal_posture: "risk flags only; no eligibility conclusion",
    practical_application: hasConcreteMechanism ? "candidate technical mechanism detected; verify with human source evidence" : "not established",
    technical_mechanisms: mechanisms.slice(0, 12),
    findings: flags,
    next_questions: [
      "What computer functionality or technical field is improved?",
      "Where is the improvement implemented in source-backed modules?",
      "Which claim elements are more than generic computer execution?",
    ],
  };
}

export function buildArchitectureFigures(inventory) {
  const components = componentTerms(inventory).slice(0, 10);
  const flows = (inventory.flows || []).slice(0, 10);
  return {
    schema: SOFTWARE_DOMAIN_SCHEMA,
    artifact: "software_architecture_figures",
    generated_at: new Date().toISOString(),
    legal_posture: "figure plan only; do not add unsupported visual matter",
    proposed_figures: [
      {
        figure_id: "SW-FIG01",
        type: "block-diagram",
        title: "Software system architecture",
        components: components.map((name, i) => ({ id: `SW-C${String(i + 1).padStart(2, "0")}`, name })),
        flows,
        human_review_required: true,
      },
      {
        figure_id: "SW-FIG02",
        type: "flowchart",
        title: "Computer-implemented method flow",
        steps: mechanismTerms(inventory).slice(0, 8),
        human_review_required: true,
      },
    ],
    cautions: [
      "Route final drawing candidates through /apa-figures and /apa-drawing-quality.",
      "Every visualized component or step needs source support before adoption into canonical drawings.",
    ],
  };
}

export function runSoftwareDomain({ command, source, matter, out, argv = [], startedAt = new Date().toISOString() } = {}) {
  const sourceDir = resolve(source || matter || ".");
  const matterDir = matter ? resolve(matter) : "";
  const domainDir = matterDir ? join(matterDir, "domain", "software") : dirname(resolve(out || "."));
  mkdirSync(domainDir, { recursive: true });

  const inventory = buildCodebaseInventory(sourceDir);
  const gitLog = readGitLog(sourceDir);
  const outputs = [];
  let result;
  if (command === "inventory") {
    result = inventory;
    outputs.push(writeJson(out || join(domainDir, "codebase_inventory.json"), result));
  } else if (command === "disclosure") {
    result = buildDisclosureSummary(inventory, { gitLog });
    outputs.push(writeText(out || join(domainDir, "software_disclosure_summary.md"), result));
  } else if (command === "claim-seeds") {
    result = buildClaimSeeds(inventory);
    outputs.push(writeJson(out || join(domainDir, "software_claim_seeds.json"), result));
  } else if (command === "101-review") {
    result = buildSoftware101Review(inventory, buildClaimSeeds(inventory));
    outputs.push(writeJson(out || join(domainDir, "software_101_review.json"), result));
  } else if (command === "figures") {
    result = buildArchitectureFigures(inventory);
    outputs.push(writeJson(out || join(domainDir, "software_architecture_figures.json"), result));
  } else if (command === "run-all") {
    const disclosure = buildDisclosureSummary(inventory, { gitLog });
    const seeds = buildClaimSeeds(inventory);
    const review = buildSoftware101Review(inventory, seeds);
    const figures = buildArchitectureFigures(inventory);
    outputs.push(writeJson(join(domainDir, "codebase_inventory.json"), inventory));
    outputs.push(writeText(join(domainDir, "software_disclosure_summary.md"), disclosure));
    outputs.push(writeJson(join(domainDir, "software_claim_seeds.json"), seeds));
    outputs.push(writeJson(join(domainDir, "software_101_review.json"), review));
    outputs.push(writeJson(join(domainDir, "software_architecture_figures.json"), figures));
    result = { inventory, disclosure, seeds, review, figures };
  } else {
    throw new Error(`unknown software domain command '${command}'`);
  }

  if (matterDir) {
    appendRunlog(matterDir, buildRunlogEntry({
      timestamp: new Date().toISOString(),
      skill: commandToSkill(command),
      ruleVersion: "apa-software-domain-v1",
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
        humanCheckpoint({ id: "software-domain-human-adoption", required: true, satisfied: false }),
      ],
      notes: [`source=${sourceDir}`, `writes_only_under=domain/software/`],
    }));
  }
  return { outputs, result };
}

function walkTextFiles(root, out = []) {
  if (!existsSync(root)) return out;
  const entries = readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const p = join(root, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name)) walkTextFiles(p, out);
    } else if (entry.isFile() && TEXT_EXT.has(extname(entry.name).toLowerCase())) {
      out.push(p);
    }
  }
  return out;
}

function extractFunctions(text, file) {
  const lang = languageOf(file);
  const patterns = lang === "python"
    ? [/^\s*def\s+([A-Za-z_][\w]*)\s*\(/gm]
    : [
        /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g,
        /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g,
        /^\s*(?:export\s+)?(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/gm,
      ];
  return unique(patterns.flatMap((re) => [...text.matchAll(re)].map((m) => m[1])));
}

function extractClasses(text, file) {
  const lang = languageOf(file);
  const re = lang === "python" ? /^\s*class\s+([A-Za-z_][\w]*)\b/gm : /\bclass\s+([A-Za-z_$][\w$]*)\b/g;
  return unique([...text.matchAll(re)].map((m) => m[1]));
}

function extractEndpoints(text) {
  const out = [];
  const express = /\.(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]/g;
  for (const m of text.matchAll(express)) out.push({ method: m[1].toUpperCase(), path: m[2], framework: "express-like" });
  const decorators = /@(Get|Post|Put|Patch|Delete|app\.route)\s*\(\s*["'`]([^"'`]+)["'`]/g;
  for (const m of text.matchAll(decorators)) out.push({ method: m[1].replace("app.route", "ROUTE").toUpperCase(), path: m[2], framework: "decorator" });
  const flask = /@app\.route\(\s*["']([^"']+)["'](?:,\s*methods=\[([^\]]+)\])?/g;
  for (const m of text.matchAll(flask)) out.push({ method: m[2] || "GET", path: m[1], framework: "flask" });
  return out;
}

function extractComments(text, file) {
  const ext = extname(file).toLowerCase();
  const out = [];
  if (ext === ".py") {
    for (const m of text.matchAll(/^\s*#\s?(.{12,180})$/gm)) out.push(oneLine(m[1]));
  } else {
    for (const m of text.matchAll(/^\s*\/\/\s?(.{12,180})$/gm)) out.push(oneLine(m[1]));
    for (const m of text.matchAll(/\/\*\*?([\s\S]*?)\*\//g)) out.push(oneLine(m[1].replace(/^\s*\*/gm, "")));
  }
  return unique(out).filter((s) => !/copyright|license|eslint|todo/i.test(s));
}

function extractImports(text, file) {
  const ext = extname(file).toLowerCase();
  const out = [];
  if (ext === ".py") {
    for (const m of text.matchAll(/^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))/gm)) out.push(m[1] || m[2]);
  } else {
    for (const m of text.matchAll(/\bfrom\s+["']([^"']+)["']|require\(\s*["']([^"']+)["']\s*\)/g)) out.push(m[1] || m[2]);
  }
  return unique(out);
}

function inferFlows(modules) {
  const out = [];
  for (const m of modules) {
    for (const ep of m.endpoints || []) {
      out.push({ from: `${ep.method} ${ep.path}`, to: m.path, evidence: "endpoint route declaration" });
    }
    for (const imp of m.imports || []) {
      if (String(imp).startsWith(".")) out.push({ from: m.path, to: imp, evidence: "relative import" });
    }
  }
  return out.slice(0, 120);
}

function inventionSignals(modules, flows) {
  const terms = mechanismTerms({ modules, flows });
  const comments = modules.flatMap((m) => m.comments || []).filter((c) => /improv|optimi|compress|encode|secure|dedupe|cache|latency|memory|bandwidth|synchron/i.test(c));
  return unique([
    ...terms.slice(0, 10).map((t) => `source-backed mechanism candidate: ${t}`),
    ...comments.slice(0, 8).map((c) => `comment signal: ${c}`),
  ]);
}

function mechanismTerms(inventory) {
  const words = [];
  for (const m of inventory.modules || []) {
    words.push(...(m.functions || []), ...(m.classes || []));
    for (const c of m.comments || []) words.push(...c.split(/\s+/));
  }
  return unique(words.map(splitIdentifier).flat().map((w) => w.toLowerCase()))
    .filter((w) => /^(cache|compress|encode|decode|encrypt|decrypt|index|rank|score|schedule|sync|render|segment|quantize|transform|stream|route|train|infer|dedupe|merge|partition|shard|validate|authenticate|authorize|optimize|predict|classify|filter|aggregate)$/.test(w));
}

function componentTerms(inventory) {
  const names = [];
  for (const m of inventory.modules || []) {
    names.push(...(m.classes || []), basename(m.path, extname(m.path)));
  }
  return unique(names.map((n) => splitIdentifier(n).join(" ")).filter(Boolean));
}

function findGenericAutomationSignals(inventory) {
  const hay = JSON.stringify(inventory).toLowerCase();
  const risky = ["advertising", "financial", "sales", "subscription", "recommendation", "organizing human activity", "business rule", "mental process"];
  return risky.filter((term) => hay.includes(term));
}

function finding(severity, rule, recommendation) {
  return {
    severity,
    rule_anchor: rule,
    evidence_span: "domain/software/codebase_inventory.json",
    recommendation,
  };
}

function sampleInputFiles(sourceDir) {
  return walkTextFiles(sourceDir).slice(0, 20);
}

function readGitLog(sourceDir) {
  const res = spawnSync("git", ["-C", sourceDir, "log", "--max-count=20", "--pretty=format:%h %s"], { encoding: "utf8" });
  if (res.status !== 0) return [];
  return res.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

function commandToSkill(command) {
  return ({
    inventory: "apa-codebase-to-patent",
    disclosure: "apa-software-disclosure-extractor",
    "claim-seeds": "apa-software-claim-patterns",
    "101-review": "apa-software-101-review",
    figures: "apa-software-architecture-figures",
    "run-all": "apa-domain-software",
  })[command] || "apa-domain-software";
}

function writeJson(path, data) {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
  return resolve(path);
}

function writeText(path, text) {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(path, text);
  return resolve(path);
}

function languageOf(file) {
  return ({
    ".js": "javascript",
    ".jsx": "javascript",
    ".mjs": "javascript",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".py": "python",
    ".go": "go",
    ".java": "java",
    ".rs": "rust",
    ".cs": "csharp",
  })[extname(file).toLowerCase()] || extname(file).replace(/^\./, "") || "text";
}

function scoreModule(m) {
  return (m.functions || []).length * 2 + (m.classes || []).length * 3 + (m.endpoints || []).length * 4 + (m.comments || []).length;
}

function moduleSummary(m) {
  const parts = [];
  if (m.classes?.length) parts.push(`classes ${m.classes.slice(0, 4).join(", ")}`);
  if (m.functions?.length) parts.push(`functions ${m.functions.slice(0, 6).join(", ")}`);
  if (m.endpoints?.length) parts.push(`${m.endpoints.length} endpoint(s)`);
  if (m.comments?.length) parts.push(`comments: ${m.comments[0]}`);
  return parts.join("; ") || "source file scanned";
}

function splitIdentifier(s) {
  return String(s || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function countBy(items) {
  const out = {};
  for (const item of items) out[item] = (out[item] || 0) + 1;
  return out;
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
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
