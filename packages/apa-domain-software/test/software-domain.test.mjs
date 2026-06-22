import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildArchitectureFigures,
  buildClaimSeeds,
  buildCodebaseInventory,
  buildSoftware101Review,
} from "../software-domain.mjs";
import { validateRunlog } from "../../apa-trace/runlog.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..", "..");
const CLI = join(HERE, "..", "cli.mjs");
const EXAMPLE = join(ROOT, "examples", "minimal-patent-artifact");

function makeSource(dir) {
  const src = join(dir, "source-repo");
  mkdirSync(join(src, "src"), { recursive: true });
  writeFileSync(join(src, "src", "codec.ts"), [
    "// Compress gaussian payloads into indexed atlas frames to reduce bandwidth.",
    "export class GaussianCodec {",
    "  encodeFrame(points) { return quantize(points); }",
    "}",
    "export function quantize(points) { return points.map(p => p); }",
    "export function streamAtlas(frame) { return frame; }",
    "",
  ].join("\n"));
  writeFileSync(join(src, "src", "server.js"), [
    "const express = require('express');",
    "const app = express();",
    "app.post('/encode', (req, res) => res.json({ ok: true }));",
    "function authenticateRequest(req) { return Boolean(req); }",
    "",
  ].join("\n"));
  return src;
}

test("software domain inventory extracts source-backed code signals", () => {
  const d = mkdtempSync(join(tmpdir(), "apa-domain-software-"));
  try {
    const source = makeSource(d);
    const inventory = buildCodebaseInventory(source);
    assert.equal(inventory.schema, "apa-software-domain-artifact-v1");
    assert.equal(inventory.artifact, "codebase_inventory");
    assert.equal(inventory.files_scanned, 2);
    assert.ok(inventory.modules.some((m) => m.classes.includes("GaussianCodec")));
    assert.ok(inventory.modules.some((m) => m.functions.includes("quantize")));
    assert.ok(inventory.modules.some((m) => m.endpoints.some((e) => e.path === "/encode")));
    assert.ok(inventory.invention_signals.some((s) => /compress|encode|quantize|stream/.test(s)));
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("software domain builders emit claim, 101, and architecture artifacts without legal conclusions", () => {
  const d = mkdtempSync(join(tmpdir(), "apa-domain-software-"));
  try {
    const inventory = buildCodebaseInventory(makeSource(d));
    const seeds = buildClaimSeeds(inventory);
    const review = buildSoftware101Review(inventory, seeds);
    const figures = buildArchitectureFigures(inventory);
    assert.equal(seeds.legal_posture.includes("not a claim-scope recommendation"), true);
    assert.ok(seeds.method_seed.candidate_limitations.every((l) => l.adoption_state === "ai-suggested"));
    assert.equal(review.legal_posture, "risk flags only; no eligibility conclusion");
    assert.ok(Array.isArray(review.findings));
    assert.ok(figures.proposed_figures.some((f) => f.type === "block-diagram"));
    assert.ok(figures.cautions.join(" ").includes("/apa-drawing-quality"));
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("software domain CLI run-all writes hook outputs under domain/software and appends runlog", () => {
  const d = mkdtempSync(join(tmpdir(), "apa-domain-software-cli-"));
  try {
    cpSync(EXAMPLE, d, { recursive: true });
    const source = makeSource(d);
    execFileSync(process.execPath, [CLI, "run-all", "--matter", d, "--source", source], { stdio: "pipe" });
    for (const name of [
      "codebase_inventory.json",
      "software_disclosure_summary.md",
      "software_claim_seeds.json",
      "software_101_review.json",
      "software_architecture_figures.json",
    ]) {
      assert.ok(existsSync(join(d, "domain", "software", name)), `${name} should exist`);
    }
    const seeds = JSON.parse(readFileSync(join(d, "domain", "software", "software_claim_seeds.json"), "utf8"));
    assert.equal(seeds.method_seed.candidate_limitations[0].adoption_state, "ai-suggested");
    const runlog = validateRunlog(d);
    assert.equal(runlog.ok, true, JSON.stringify(runlog.errors));
    assert.equal(runlog.entries.at(-1).skill, "apa-domain-software");
    assert.ok(runlog.entries.at(-1).outputs.some((o) => /domain\/software\/codebase_inventory\.json$/.test(o.path)));
    assert.equal(runlog.entries.at(-1).human_checkpoints[0].id, "software-domain-human-adoption");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});
