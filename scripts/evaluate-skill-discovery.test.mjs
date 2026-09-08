import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadSkillDefinitions } from "./check-skills.mjs";
import { corpusPath, discoveryPacket, scoreDiscovery } from "./evaluate-skill-discovery.mjs";
const cases = JSON.parse(readFileSync(corpusPath, "utf8")).cases;
test("discovery packet covers every skill with command-free prompts and withholds oracle labels", () => {
  const skills = loadSkillDefinitions();
  for (const skill of skills) assert.ok(cases.filter(c => c.expected === skill.dirName && !/\/apa-|\$apa-|@apa-/.test(c.prompt)).length >= 3, skill.dirName);
  const packet = discoveryPacket(cases);
  assert.ok(packet.prompts.every(p => Object.keys(p).sort().join() === "id,prompt"));
  assert.equal(packet.catalog.length, skills.length);
});
test("discovery score rejects missing, duplicate, stale and false-activation results", () => {
  const packet = discoveryPacket(cases);
  const correct = { packet_sha256: packet.packet_sha256, evaluator: "synthetic scorer test (not model evidence)",
    predictions: cases.map(c => ({ id: c.id, skill: c.expected })) };
  assert.equal(scoreDiscovery(cases, packet, correct).ok, true);
  assert.throws(() => scoreDiscovery(cases, packet, { ...correct, packet_sha256: "stale" }));
  assert.throws(() => scoreDiscovery(cases, packet, { ...correct, predictions: correct.predictions.slice(1) }));
  const duplicate = structuredClone(correct); duplicate.predictions[1] = duplicate.predictions[0];
  assert.throws(() => scoreDiscovery(cases, packet, duplicate));
  const falsePositive = structuredClone(correct); falsePositive.predictions.at(-1).skill = "compiler";
  assert.equal(scoreDiscovery(cases, packet, falsePositive).ok, false);
  const changed = discoveryPacket(cases, loadSkillDefinitions().map(s => ({ ...s, description: s.description + " changed" })));
  assert.notEqual(changed.packet_sha256, packet.packet_sha256);
});
