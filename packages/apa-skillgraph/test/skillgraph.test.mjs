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
});

test("skill graph docs mention hooks and domain packs", () => {
  const graph = loadSkillGraph();
  assert.match(renderSkillGraphDoc(graph), /disclosure\.enrich/);
  assert.match(renderDomainPacksDoc(graph), /software/);
  assert.match(renderMermaid(graph), /flowchart TD/);
});
