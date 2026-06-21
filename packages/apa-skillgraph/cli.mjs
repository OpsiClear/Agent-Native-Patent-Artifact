#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  ROOT,
  checkSkillGraph,
  loadSkillGraph,
  renderCiBenchmarkingDoc,
  renderDomainPacksDoc,
  renderMermaid,
  renderSkillGraphDoc,
  writeGeneratedDocs,
} from "./skillgraph.mjs";

function usage() {
  return [
    "usage: node packages/apa-skillgraph/cli.mjs <check|docs|graph|list> [--check]",
    "",
    "  check        validate registry, skill.yaml, and domain.yaml contracts",
    "  docs         write docs/skill-graph.md, docs/skill-graph.mmd, docs/domain-packs.md, docs/ci-benchmarking.md",
    "  graph        print Mermaid graph",
    "  list         print discovered skills and domains as JSON",
  ].join("\n");
}

function main(argv) {
  const cmd = argv[0] || "check";
  const graph = loadSkillGraph();
  if (cmd === "-h" || cmd === "--help") {
    console.log(usage());
    return 0;
  }
  if (cmd === "check") {
    const result = checkSkillGraph(graph);
    if (!result.ok) {
      for (const e of result.errors) console.error(`FAIL ${e.path}: ${e.message}`);
      return 1;
    }
    console.log(`skillgraph check passed (${result.skills.length} skill(s), ${result.domains.length} domain pack(s))`);
    return 0;
  }
  if (cmd === "docs") {
    const result = checkSkillGraph(graph);
    if (!result.ok) {
      for (const e of result.errors) console.error(`FAIL ${e.path}: ${e.message}`);
      return 1;
    }
    const checkOnly = argv.includes("--check");
    const outputs = [
      ["docs/skill-graph.md", renderSkillGraphDoc(graph)],
      ["docs/skill-graph.mmd", renderMermaid(graph)],
      ["docs/domain-packs.md", renderDomainPacksDoc(graph)],
      ["docs/ci-benchmarking.md", renderCiBenchmarkingDoc()],
    ];
    if (checkOnly) {
      let drift = 0;
      for (const [rel, content] of outputs) {
        const p = join(ROOT, rel);
        const current = existsSync(p) ? readFileSync(p, "utf8").replace(/\r\n/g, "\n") : "";
        if (current !== content) {
          console.error(`STALE ${rel} (run apa-skillgraph docs)`);
          drift++;
        } else {
          console.log(`FRESH ${rel}`);
        }
      }
      return drift ? 1 : 0;
    }
    for (const [rel, content] of outputs) writeFileSync(join(ROOT, rel), content, "utf8");
    console.log(`wrote ${outputs.map(([p]) => p).join(", ")}`);
    return 0;
  }
  if (cmd === "graph") {
    process.stdout.write(renderMermaid(graph));
    return 0;
  }
  if (cmd === "list") {
    console.log(JSON.stringify({
      skills: graph.skills.map((s) => ({ id: s.id, command: s.command, kind: s.kind, phase: s.phase })),
      domains: graph.domains.map((d) => ({ id: d.id, status: d.status })),
    }, null, 2));
    return 0;
  }
  console.error(`unknown command: ${cmd}\n${usage()}`);
  return 2;
}

try {
  process.exit(main(process.argv.slice(2)));
} catch (e) {
  console.error(`error: ${e.message}`);
  process.exit(2);
}
