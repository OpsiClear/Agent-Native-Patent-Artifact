import { test } from "node:test";
import assert from "node:assert/strict";

import {
  checkSkillGraph,
  loadSkillGraph,
  renderDomainPacksDoc,
  renderMermaid,
  renderSkillGraphDoc,
} from "../skillgraph.mjs";

test("skill graph metadata validates", () => {
  const result = checkSkillGraph(loadSkillGraph());
  assert.equal(result.ok, true, result.errors.map((e) => `${e.path}: ${e.message}`).join("\n"));
  assert.ok(result.skills.length >= 16);
  assert.equal(result.domains.length, 3);
  const software = result.domains.find((d) => d.id === "software");
  const activeRunners = software.skills.filter((s) => s.status === "active" && s.runner);
  assert.ok(activeRunners.length >= 5);
  assert.ok(activeRunners.every((s) => s.runner.startsWith("node packages/apa-domain-software/cli.mjs")));
  const device = result.domains.find((d) => d.id === "device");
  const deviceRunners = device.skills.filter((s) => s.status === "active" && s.runner);
  assert.equal(deviceRunners.length, 4);
  assert.ok(deviceRunners.every((s) => s.runner.startsWith("node packages/apa-domain-device/cli.mjs")));
  const formulation = result.domains.find((d) => d.id === "formulation");
  const formulationRunners = formulation.skills.filter((s) => s.status === "active" && s.runner);
  assert.equal(formulationRunners.length, 4);
  assert.ok(formulationRunners.every((s) => s.runner.startsWith("node packages/apa-domain-formulation/cli.mjs")));
});

test("active domain skills are covered by declared benchmark cases", () => {
  const graph = loadSkillGraph();
  const benchmarkCases = new Map(graph.benchmarkIndex.cases.map((c) => [c.id, c]));
  for (const domain of graph.domains.filter((d) => d.status === "active")) {
    const declared = domain.benchmarks.map((b) => benchmarkCases.get(b.id)).filter(Boolean);
    assert.ok(declared.length >= 1, `${domain.id} should declare at least one benchmark`);
    const covered = new Set(declared.flatMap((c) => c.targeted_skills || []));
    for (const skill of domain.skills.filter((s) => s.status === "active")) {
      assert.ok(covered.has(skill.id), `${domain.id}:${skill.id} should be covered by a declared benchmark`);
    }
  }
});

test("skill graph docs mention hooks and domain packs", () => {
  const graph = loadSkillGraph();
  assert.match(renderSkillGraphDoc(graph), /disclosure\.enrich/);
  assert.match(renderDomainPacksDoc(graph), /software/);
  assert.match(renderMermaid(graph), /flowchart TD/);
});
