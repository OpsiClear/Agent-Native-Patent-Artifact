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
    console.log("usage: node packages/apa-bench/cli.mjs --mock --real-software-patents [--json] [--out <file>] [--case <id>] [--run-id <id>] [--threshold <score>]");
    return 0;
  }
  const summary = scorePublicSoftwarePatentFixtures({
    cases: args.cases.length ? args.cases : undefined,
    runId: args.runId,
    threshold: args.threshold,
  });
  if (args.out) {
    const out = resolve(args.out);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(summary, null, 2) + "\n", "utf8");
  }
  if (args.json) console.log(JSON.stringify(summary, null, 2));
  else console.log(formatPublicPatentScore(summary));
  return summary.ok ? 0 : 1;
}

try {
  const argv = process.argv.slice(2);
  if (argv.includes("--real-software-patents")) process.exit(runRealPatentCli(argv));
  process.exit(runBenchmarkCli(argv));
} catch (e) {
  console.error(`error: ${e.message}`);
  process.exit(2);
}
