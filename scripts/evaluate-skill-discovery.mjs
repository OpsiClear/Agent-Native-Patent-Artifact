#!/usr/bin/env node
// A description-only model routing evaluation. Unlike check-skills, this does not implement a
// keyword router. An external fresh agent receives a blind packet and returns predictions.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { loadSkillDefinitions } from "./check-skills.mjs";
export const corpusPath = new URL("../benchmarks/skill-discovery.json", import.meta.url);
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function discoveryPacket(cases, skills = loadSkillDefinitions()) {
  const packet = { schema: "apa-skill-discovery-packet-v1", instructions:
    "For each prompt choose exactly one skill name from this catalog, or null if none applies. Return all IDs; do not execute skills. Use descriptions only.",
    catalog: skills.map(s => ({ name: s.dirName, description: s.description })),
    prompts: cases.map(({ id, prompt }) => ({ id, prompt })) };
  return { ...packet, packet_sha256: hash(packet) };
}

export function scoreDiscovery(cases, packet, result) {
  if (result.packet_sha256 !== packet.packet_sha256) throw new Error("predictions do not bind the current descriptions and prompts");
  if (!result.evaluator || typeof result.evaluator !== "string") throw new Error("evaluator provenance is required");
  if (!Array.isArray(result.predictions) || result.predictions.length !== cases.length) throw new Error("one prediction per prompt is required");
  const allowed = new Set([null, ...packet.catalog.map(s => s.name)]);
  const expected = new Map(cases.map(c => [c.id, c]));
  const seen = new Set();
  const misses = [];
  for (const prediction of result.predictions) {
    if (!expected.has(prediction.id) || seen.has(prediction.id) || !allowed.has(prediction.skill)) throw new Error("unknown, duplicate, or invalid prediction");
    seen.add(prediction.id);
    const correct = expected.get(prediction.id).expected;
    if (prediction.skill !== correct) misses.push({ id: prediction.id, expected: correct, actual: prediction.skill });
  }
  const positiveCount = cases.filter(c => c.expected !== null).length;
  const falseActivations = misses.filter(m => m.expected === null).length;
  const positiveAccuracy = (positiveCount - misses.filter(m => m.expected !== null).length) / positiveCount;
  return { schema: "apa-skill-discovery-score-v1", packet_sha256: packet.packet_sha256,
    evaluator: result.evaluator, total: cases.length, correct: cases.length - misses.length,
    positive_accuracy: positiveAccuracy, false_activations: falseActivations,
    ok: positiveAccuracy >= 0.9 && falseActivations === 0, misses,
    limitation: "Description-only model selection, not host-router integration or drafting-quality certification." };
}

function main() {
  const cases = JSON.parse(readFileSync(corpusPath, "utf8")).cases;
  const packet = discoveryPacket(cases);
  const [command, path] = process.argv.slice(2);
  if (!path || !["packet", "score"].includes(command)) throw new Error("usage: node scripts/evaluate-skill-discovery.mjs packet <out.json> | score <predictions.json>");
  if (command === "packet") writeFileSync(path, JSON.stringify(packet, null, 2) + "\n");
  else {
    const score = scoreDiscovery(cases, packet, JSON.parse(readFileSync(path, "utf8")));
    console.log(JSON.stringify(score, null, 2));
    if (!score.ok) process.exitCode = 1;
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
