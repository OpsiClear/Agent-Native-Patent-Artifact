import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { asArray, loadYaml } from "../../lib/apa-parse.mjs";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const SKILLS_DIR = join(ROOT, "skills");
export const REGISTRY_PATH = join(SKILLS_DIR, "registry.yaml");
export const BENCHMARK_INDEX_PATH = join(ROOT, "benchmarks", "index.json");
const BENCHMARK_PATH_FIELDS = [
  "source",
  "matter",
  "expected",
  "office_action",
  "scenarios",
  "matter_template",
];

function readYaml(path) {
  return loadYaml(readFileSync(path, "utf8"));
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function rel(path) {
  return relative(ROOT, path).replace(/\\/g, "/");
}

function walk(dir, fileName, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, fileName, out);
    else if (entry.isFile() && entry.name === fileName) out.push(p);
  }
  return out.sort();
}

export function loadSkillGraph({ root = ROOT } = {}) {
  const skillsDir = join(root, "skills");
  const registryPath = join(skillsDir, "registry.yaml");
  const benchmarkIndexPath = join(root, "benchmarks", "index.json");
  const registry = existsSync(registryPath) ? readYaml(registryPath) : null;
  const benchmarkIndex = existsSync(benchmarkIndexPath) ? readJson(benchmarkIndexPath) : null;
  const skillPaths = walk(skillsDir, "skill.yaml");
  const domainPaths = walk(join(skillsDir, "domains"), "domain.yaml");
  const skills = skillPaths.map((path) => ({ path, relPath: rel(path), dir: dirname(path), ...readYaml(path) }));
  const domains = domainPaths.map((path) => ({ path, relPath: rel(path), dir: dirname(path), ...readYaml(path) }));
  return { root, registryPath, registry, benchmarkIndexPath, benchmarkIndex, skills, domains };
}

function add(errors, path, message) {
  errors.push({ path, message });
}

function isSafeSink(tool) {
  return /^apa-safe(?:-|$)/.test(String(tool || "")) || tool === "apa-search";
}

function registryHookIds(registry) {
  return new Set(asArray(registry?.hooks).map((h) => h && h.id).filter(Boolean));
}

function allowedLoopPairs(registry) {
  return new Set(asArray(registry?.allowed_loops).map((l) => `${l.from}->${l.to}`));
}

function validateRequiredObject(errors, obj, path, schema, required) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    add(errors, path, "missing or malformed YAML object");
    return;
  }
  if (obj.schema !== schema) add(errors, path, `expected schema ${schema}`);
  for (const field of required) {
    if (obj[field] === undefined || obj[field] === null || obj[field] === "") {
      add(errors, path, `missing required field '${field}'`);
    }
  }
}

function validateCycles(errors, skillsById, registry) {
  const allowed = allowedLoopPairs(registry);
  const visiting = new Set();
  const visited = new Set();
  const stack = [];

  function visit(id) {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      const start = stack.indexOf(id);
      const cycle = [...stack.slice(start), id];
      const directAllowed = cycle.length === 3 && allowed.has(`${cycle[0]}->${cycle[1]}`);
      if (!directAllowed) add(errors, "skills", `cycle is not allowed: ${cycle.join(" -> ")}`);
      return;
    }
    visiting.add(id);
    stack.push(id);
    const skill = skillsById.get(id);
    for (const next of asArray(skill?.downstream)) {
      if (allowed.has(`${id}->${next}`)) continue;
      if (skillsById.has(next)) visit(next);
    }
    stack.pop();
    visiting.delete(id);
    visited.add(id);
  }

  for (const id of skillsById.keys()) visit(id);
}

export function checkSkillGraph(graph = loadSkillGraph()) {
  const errors = [];
  const { registry, registryPath, benchmarkIndex, benchmarkIndexPath, skills, domains } = graph;

  validateRequiredObject(errors, registry, rel(registryPath), "apa-skill-registry-v1", [
    "version",
    "global_gates",
    "hooks",
    "pipeline",
  ]);

  const hooks = registryHookIds(registry);
  const skillsById = new Map();
  const commands = new Map();

  for (const skill of skills) {
    validateRequiredObject(errors, skill, skill.relPath, "apa-skill-v1", [
      "id",
      "kind",
      "phase",
      "command",
      "version",
      "description",
      "inputs",
      "outputs",
      "safety",
    ]);
    if (!/^apa-[a-z0-9-]+$/.test(String(skill.id || ""))) add(errors, skill.relPath, `bad id '${skill.id}'`);
    if (!/^\/apa-[a-z0-9-]+$/.test(String(skill.command || ""))) add(errors, skill.relPath, `bad command '${skill.command}'`);
    if (skillsById.has(skill.id)) add(errors, skill.relPath, `duplicate skill id '${skill.id}'`);
    skillsById.set(skill.id, skill);
    if (commands.has(skill.command)) add(errors, skill.relPath, `duplicate command '${skill.command}'`);
    commands.set(skill.command, skill);
    for (const hook of asArray(skill.domain_hooks)) {
      if (!hooks.has(hook)) add(errors, skill.relPath, `unknown domain hook '${hook}'`);
    }
    for (const sink of asArray(skill.external_sinks)) {
      if (sink && typeof sink === "object" && sink.tool && !isSafeSink(sink.tool)) {
        add(errors, skill.relPath, `external sink '${sink.tool}' is not a safe wrapper`);
      }
    }
    if (skill.safety?.legal_conclusion !== false) {
      add(errors, skill.relPath, "safety.legal_conclusion must be false");
    }
  }

  for (const skill of skills) {
    for (const dep of [...asArray(skill.upstream), ...asArray(skill.downstream)]) {
      if (!skillsById.has(dep)) add(errors, skill.relPath, `references unknown skill '${dep}'`);
    }
  }

  for (const id of asArray(registry?.pipeline?.order)) {
    if (!skillsById.has(id)) add(errors, rel(registryPath), `pipeline references unknown skill '${id}'`);
  }
  for (const id of asArray(registry?.optional)) {
    if (!skillsById.has(id)) add(errors, rel(registryPath), `optional references unknown skill '${id}'`);
  }

  validateCycles(errors, skillsById, registry);
  const benchmarkCasesById = validateBenchmarkIndex(errors, graph.root, benchmarkIndex, benchmarkIndexPath);

  for (const domain of domains) {
    validateRequiredObject(errors, domain, domain.relPath, "apa-domain-pack-v1", [
      "id",
      "version",
      "status",
      "constraints",
      "hooks",
      "skills",
    ]);
    const base = domain.constraints?.writes_only_under;
    if (!base || !String(base).startsWith(`domain/${domain.id}/`)) {
      add(errors, domain.relPath, "constraints.writes_only_under must be domain/<id>/");
    }
    if (domain.constraints?.canonical_artifact_writes !== false) {
      add(errors, domain.relPath, "domain packs must set canonical_artifact_writes: false");
    }
    for (const hook of asArray(domain.hooks)) {
      if (!hooks.has(hook.id)) add(errors, domain.relPath, `unknown hook '${hook.id}'`);
      for (const output of asArray(hook.outputs)) {
        if (base && !String(output).startsWith(base)) {
          add(errors, domain.relPath, `hook output '${output}' is outside '${base}'`);
        }
      }
    }
    for (const skill of asArray(domain.skills)) {
      if (skill.hook && !hooks.has(skill.hook)) add(errors, domain.relPath, `skill '${skill.id}' uses unknown hook '${skill.hook}'`);
      for (const output of asArray(skill.outputs)) {
        if (base && !String(output).startsWith(base)) {
          add(errors, domain.relPath, `skill output '${output}' is outside '${base}'`);
        }
      }
      if (skill.skill_path && !existsSync(join(graph.root, skill.skill_path, "skill.yaml"))) {
        add(errors, domain.relPath, `skill_path missing skill.yaml: ${skill.skill_path}`);
      }
      if (skill.status === "active" && !skill.skill_path && !skill.runner) {
        add(errors, domain.relPath, `active domain skill '${skill.id}' must declare skill_path or runner`);
      }
      if (skill.runner) {
        const parts = String(skill.runner).split(/\s+/).filter(Boolean);
        const script = parts.find((part) => part.startsWith("packages/"));
        if (script && !existsSync(join(graph.root, script))) {
          add(errors, domain.relPath, `runner script missing for skill '${skill.id}': ${script}`);
        }
      }
    }
    validateDomainBenchmarks(errors, domain, benchmarkCasesById);
  }

  return { ok: errors.length === 0, errors, skills, domains, registry };
}

function validateBenchmarkIndex(errors, root, benchmarkIndex, benchmarkIndexPath) {
  const casesById = new Map();
  if (!benchmarkIndex) {
    add(errors, rel(benchmarkIndexPath), "missing benchmarks/index.json");
    return casesById;
  }
  validateRequiredObject(errors, benchmarkIndex, rel(benchmarkIndexPath), "apa-benchmark-index-v1", [
    "policy",
    "cases",
  ]);
  const allowedSourceClasses = new Set(asArray(benchmarkIndex.policy?.allowed_source_classes));
  for (const testCase of asArray(benchmarkIndex.cases)) {
    if (!testCase?.id) {
      add(errors, rel(benchmarkIndexPath), "benchmark case missing id");
      continue;
    }
    if (casesById.has(testCase.id)) add(errors, rel(benchmarkIndexPath), `duplicate benchmark id '${testCase.id}'`);
    casesById.set(testCase.id, testCase);
    if (!testCase.kind) add(errors, rel(benchmarkIndexPath), `benchmark '${testCase.id}' missing kind`);
    if (!testCase.source_class) add(errors, rel(benchmarkIndexPath), `benchmark '${testCase.id}' missing source_class`);
    if (testCase.source_class && allowedSourceClasses.size && !allowedSourceClasses.has(testCase.source_class)) {
      add(errors, rel(benchmarkIndexPath), `benchmark '${testCase.id}' source_class '${testCase.source_class}' is not in policy.allowed_source_classes`);
    }
    if (!asArray(testCase.targeted_skills).length) {
      add(errors, rel(benchmarkIndexPath), `benchmark '${testCase.id}' must declare targeted_skills`);
    }
    validateBenchmarkCasePaths(errors, root, benchmarkIndexPath, testCase);
  }
  return casesById;
}

function validateBenchmarkCasePaths(errors, root, benchmarkIndexPath, testCase) {
  for (const field of BENCHMARK_PATH_FIELDS) {
    if (testCase[field] === undefined) continue;
    for (const value of pathValues(testCase[field])) {
      if (typeof value !== "string" || !value.trim()) {
        add(errors, rel(benchmarkIndexPath), `benchmark '${testCase.id}' field '${field}' must be a non-empty repo-relative path`);
        continue;
      }
      if (isAbsolute(value)) {
        add(errors, rel(benchmarkIndexPath), `benchmark '${testCase.id}' field '${field}' must not be absolute: ${value}`);
        continue;
      }
      const abs = resolve(root, value);
      if (!isInsideRoot(root, abs)) {
        add(errors, rel(benchmarkIndexPath), `benchmark '${testCase.id}' field '${field}' escapes repository root: ${value}`);
        continue;
      }
      if (!existsSync(abs)) {
        add(errors, rel(benchmarkIndexPath), `benchmark '${testCase.id}' field '${field}' path does not exist: ${value}`);
      }
    }
  }
}

function pathValues(value) {
  return Array.isArray(value) ? value : [value];
}

function isInsideRoot(root, absPath) {
  const relPath = relative(resolve(root), absPath);
  return relPath === "" || (!relPath.startsWith("..") && !isAbsolute(relPath));
}

function validateDomainBenchmarks(errors, domain, benchmarkCasesById) {
  const declared = asArray(domain.benchmarks);
  if (domain.status === "active" && !declared.length) {
    add(errors, domain.relPath, `active domain pack '${domain.id}' must declare at least one benchmark`);
  }
  const declaredIds = new Set();
  const coveredSkills = new Set();
  for (const benchmark of declared) {
    if (!benchmark?.id) {
      add(errors, domain.relPath, "domain benchmark missing id");
      continue;
    }
    declaredIds.add(benchmark.id);
    const testCase = benchmarkCasesById.get(benchmark.id);
    if (!testCase) {
      add(errors, domain.relPath, `domain benchmark '${benchmark.id}' is not present in benchmarks/index.json`);
      continue;
    }
    if (benchmark.source_class && testCase.source_class !== benchmark.source_class) {
      add(errors, domain.relPath, `domain benchmark '${benchmark.id}' source_class '${benchmark.source_class}' does not match index source_class '${testCase.source_class}'`);
    }
    for (const skillId of asArray(testCase.targeted_skills)) coveredSkills.add(skillId);
  }
  for (const skill of asArray(domain.skills)) {
    if (skill.status !== "active") continue;
    if (!coveredSkills.has(skill.id)) {
      add(errors, domain.relPath, `active domain skill '${skill.id}' is not covered by a declared domain benchmark`);
    }
  }
  for (const [id, testCase] of benchmarkCasesById) {
    const targetsDomainSkill = asArray(testCase.targeted_skills).some((skillId) =>
      asArray(domain.skills).some((skill) => skill.id === skillId)
    );
    if (targetsDomainSkill && !declaredIds.has(id)) {
      add(errors, domain.relPath, `benchmark '${id}' targets domain '${domain.id}' skills but is not declared in domain.yaml`);
    }
  }
}

export function renderMermaid(graph = loadSkillGraph()) {
  const lines = ["flowchart TD"];
  const skillsById = new Map(graph.skills.map((s) => [s.id, s]));
  for (const skill of graph.skills) {
    lines.push(`  ${nodeId(skill.id)}["${skill.command}<br/>${skill.phase}"]`);
  }
  for (const skill of graph.skills) {
    for (const next of asArray(skill.downstream)) {
      if (skillsById.has(next)) lines.push(`  ${nodeId(skill.id)} --> ${nodeId(next)}`);
    }
  }
  for (const domain of graph.domains) {
    const d = nodeId(`domain-${domain.id}`);
    lines.push(`  ${d}["domain:${domain.id}<br/>${domain.status}"]`);
    for (const hook of asArray(domain.hooks)) {
      lines.push(`  ${d} -. ${hook.id} .-> ${nodeId(hook.id)}`);
    }
  }
  for (const hook of asArray(graph.registry?.hooks)) {
    lines.push(`  ${nodeId(hook.id)}(("hook:${hook.id}"))`);
  }
  return `${lines.join("\n")}\n`;
}

function nodeId(id) {
  return String(id).replace(/[^A-Za-z0-9_]/g, "_");
}

export function renderSkillGraphDoc(graph = loadSkillGraph()) {
  const core = graph.skills.filter((s) => s.kind === "core");
  const support = graph.skills.filter((s) => s.kind === "support");
  const domainSkills = graph.skills.filter((s) => s.kind === "domain");
  const rows = (items) => items.map((s) => `| \`${s.id}\` | \`${s.command}\` | ${s.phase} | ${s.description} |`).join("\n");
  return [
    "# APA Skill Graph",
    "",
    "Generated from `skills/registry.yaml`, `skills/*/skill.yaml`, and `skills/domains/*/domain.yaml`.",
    "The current repository keeps the original flat core skill layout for installer compatibility while exposing machine-readable graph contracts.",
    "",
    "## Core Pipeline",
    "",
    "| Skill | Command | Phase | Description |",
    "|---|---|---|---|",
    rows(core),
    "",
    "## Domain And Support Skills",
    "",
    "| Skill | Command | Phase | Description |",
    "|---|---|---|---|",
    rows([...domainSkills, ...support]),
    "",
    "## Hook Points",
    "",
    "| Hook | Placement | Blocking default |",
    "|---|---|---|",
    ...asArray(graph.registry?.hooks).map((h) => `| \`${h.id}\` | after: ${asArray(h.after).join(", ") || "-"}; before: ${asArray(h.before).join(", ") || "-"} | ${h.blocking_default === true} |`),
    "",
    "## Mermaid",
    "",
    "```mermaid",
    renderMermaid(graph).trimEnd(),
    "```",
    "",
  ].join("\n");
}

export function renderDomainPacksDoc(graph = loadSkillGraph()) {
  return [
    "# APA Domain Packs",
    "",
    "Generated from `skills/domains/*/domain.yaml`.",
    "",
    ...graph.domains.map((d) => [
      `## ${d.id}`,
      "",
      `Status: \`${d.status}\``,
      "",
      d.description || "",
      "",
      `Writes only under: \`${d.constraints?.writes_only_under || ""}\``,
      "",
      "| Hook | Outputs | Blocking |",
      "|---|---|---|",
      ...asArray(d.hooks).map((h) => `| \`${h.id}\` | ${asArray(h.outputs).map((o) => `\`${o}\``).join(", ")} | ${h.blocking === true} |`),
      "",
      "| Skill | Command | Status | Hook | Runner |",
      "|---|---|---|---|---|",
      ...asArray(d.skills).map((s) => `| \`${s.id}\` | \`${s.command}\` | ${s.status || "planned"} | \`${s.hook || ""}\` | ${s.runner ? `\`${s.runner}\`` : "-"} |`),
      "",
    ].join("\n")),
  ].join("\n");
}

export function renderCiBenchmarkingDoc() {
  return [
    "# APA CI Benchmarking",
    "",
    "`scripts/benchmark.mjs --mock` is the deterministic CI benchmark gate. The blocking GitHub workflow also runs `npm run sources:check` and `npm run score:prior-art-search` as named steps, so source registry drift and prior-art retrieval regressions fail visibly instead of being hidden inside smoke output. Use `--case <id>` for targeted simulation/tuning loops such as `software-patent-skill-sim`.",
    "",
    "Current blocking local/CI commands:",
    "",
    "```bash",
    "npm run sources:check",
    "npm run benchmark",
    "npm run score:prior-art-search",
    "```",
    "",
    "`apa-skillgraph check` verifies that every active domain pack declares benchmark IDs in `domain.yaml`, each declared benchmark exists in `benchmarks/index.json`, every active domain skill is covered by at least one declared benchmark through `targeted_skills`, and every indexed benchmark path field (`source`, `matter`, `expected`, `office_action`, `scenarios`, `matter_template`) is repo-relative and present on disk.",
    "",
    "Commit-gate benchmark cases must be public or synthetic, offline, and reproducible. Live LLM/domain-quality evaluation remains periodic or advisory unless a deterministic oracle is committed.",
    "",
    "Recommended case fields:",
    "",
    "- `id`, `kind`, `source_class`, `targeted_skills`, `expected`.",
    "- `metrics` naming claim concepts, support coverage, figure coverage, and domain-specific gaps.",
    "- `source` or `matter` paths that are public/synthetic and safe for CI.",
    "",
  ].join("\n");
}

export function writeGeneratedDocs({ root = ROOT } = {}) {
  const graph = loadSkillGraph({ root });
  const outputs = [
    ["docs/skill-graph.md", renderSkillGraphDoc(graph)],
    ["docs/skill-graph.mmd", renderMermaid(graph)],
    ["docs/domain-packs.md", renderDomainPacksDoc(graph)],
    ["docs/ci-benchmarking.md", renderCiBenchmarkingDoc()],
  ];
  for (const [relPath, content] of outputs) {
    const out = join(root, relPath);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, content, "utf8");
  }
  return outputs.map(([path]) => path);
}
