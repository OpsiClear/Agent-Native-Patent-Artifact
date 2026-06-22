#!/usr/bin/env node
/**
 * apa-bench package entrypoint.
 *
 * The deterministic benchmark implementation lives in scripts/benchmark.mjs for historical
 * compatibility. This wrapper gives the architecture a package-level command without duplicating the
 * runner.
 */
import { main as runBenchmarkCli } from "../../scripts/benchmark.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  formatPublicPatentScore,
  scorePublicSoftwarePatentFixtures,
} from "./public-patent-score.mjs";
import {
  formatPriorArtRecallScore,
  scorePriorArtRecallFixtures,
} from "./prior-art-recall.mjs";
import { generateSoftwarePatentCandidateReports } from "./software-patent-tune.mjs";

function parseRealPatentArgs(argv) {
  const args = { cases: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--real-software-patents") args.realSoftwarePatents = true;
    else if (a === "--mock") args.mock = true;
    else if (a === "--json") args.json = true;
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--case") args.cases.push(argv[++i]);
    else if (a === "--run-id") args.runId = argv[++i];
    else if (a === "--fresh") args.fresh = true;
    else if (a === "--candidate-root") args.candidateRoot = argv[++i];
    else if (a === "--tune-root") args.tuneRoot = argv[++i];
    else if (a === "--enforce-floors") args.enforceFloors = true;
    else if (a === "--threshold") args.threshold = Number(argv[++i]);
    else if (a === "-h" || a === "--help") args.help = true;
    else throw new Error(`unknown argument for --real-software-patents: ${a}`);
  }
  if (!Number.isFinite(args.threshold)) delete args.threshold;
  return args;
}

function runRealPatentCli(argv) {
  const args = parseRealPatentArgs(argv);
  if (args.help) {
    console.log("usage: node packages/apa-bench/cli.mjs --mock --real-software-patents [--fresh] [--json] [--out <file>] [--case <id>] [--run-id <id>] [--candidate-root <dir>] [--tune-root <dir>] [--threshold <score>]");
    return 0;
  }
  let candidateRoot = args.candidateRoot;
  let tuningRun = null;
  if (args.fresh) {
    tuningRun = generateSoftwarePatentCandidateReports({
      cases: args.cases.length ? args.cases : undefined,
      runId: args.runId,
      tuneRoot: args.tuneRoot,
    });
    candidateRoot = tuningRun.candidateRoot;
  }
  const summary = scorePublicSoftwarePatentFixtures({
    cases: args.cases.length ? args.cases : undefined,
    runId: args.runId,
    candidateRoot,
    enforceFloors: args.fresh || args.enforceFloors,
    threshold: args.threshold,
  });
  if (tuningRun) summary.tuning_run = tuningRun;
  if (args.out) {
    const out = resolve(args.out);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(summary, null, 2) + "\n", "utf8");
  }
  if (args.json) console.log(JSON.stringify(summary, null, 2));
  else console.log(formatPublicPatentScore(summary));
  return summary.ok ? 0 : 1;
}

function parsePriorArtRecallArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--prior-art-recall") args.priorArtRecall = true;
    else if (a === "--mock") args.mock = true;
    else if (a === "--json") args.json = true;
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--case") args.caseId = argv[++i];
    else if (a === "-h" || a === "--help") args.help = true;
    else throw new Error(`unknown argument for --prior-art-recall: ${a}`);
  }
  return args;
}

async function runPriorArtRecallCli(argv) {
  const args = parsePriorArtRecallArgs(argv);
  if (args.help) {
    console.log("usage: node packages/apa-bench/cli.mjs --mock --prior-art-recall [--json] [--out <file>] [--case <id>]");
    return 0;
  }
  const summary = await scorePriorArtRecallFixtures({ caseId: args.caseId || undefined });
  if (args.out) {
    const out = resolve(args.out);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(summary, null, 2) + "\n", "utf8");
  }
  if (args.json) console.log(JSON.stringify(summary, null, 2));
  else console.log(formatPriorArtRecallScore(summary));
  return summary.ok ? 0 : 1;
}

try {
  const argv = process.argv.slice(2);
  if (argv.includes("--real-software-patents")) process.exit(runRealPatentCli(argv));
  if (argv.includes("--prior-art-recall")) process.exit(await runPriorArtRecallCli(argv));
  process.exit(await runBenchmarkCli(argv));
} catch (e) {
  console.error(`error: ${e.message}`);
  process.exit(2);
}
