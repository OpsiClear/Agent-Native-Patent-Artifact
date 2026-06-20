#!/usr/bin/env node
/**
 * apa-eval - the Tier-3 LLM-as-judge quality eval (DESIGN.md §7.1). PAID and PERIODIC (weekly cron),
 * NOT run on every commit. Runs the claim / spec / patentability judges over a matter, prints each
 * dimension's score + rationale, optionally records the run, and prints the budget gate vs the
 * previous run.
 *
 *   node cli.mjs --matter <dir> [--mock] [--judges claim,spec,patentability] [--out <store-dir>]
 *
 * With --mock it uses MockClient (offline, deterministic) - no key, no network. A live run reads
 * ANTHROPIC_API_KEY (and optionally APA_JUDGE_MODEL) from the environment.
 *
 * Exit: 0 ok · 1 regression (budget gate failed) · 2 usage error.
 * Node >=21, ESM, zero dependencies.
 */

import { makeClient, MockClient } from "./client.mjs";
import { JUDGES } from "./judges.mjs";
import { recordRun, latestRun, budgetGate, costOf } from "./store.mjs";

const ALL_JUDGES = ["claim", "spec", "patentability"];

function parseArgs(argv) {
  const a = { judges: ALL_JUDGES.slice() };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--matter") a.matter = argv[++i];
    else if (t === "--mock") a.mock = true;
    else if (t === "--judges") a.judges = (argv[++i] || "").split(",").map((s) => s.trim()).filter(Boolean);
    else if (t === "--out") a.out = argv[++i];
    else if (t === "--json") a.json = true;
    else if (t === "-h" || t === "--help") a.help = true;
  }
  return a;
}

const USAGE = "usage: node cli.mjs --matter <dir> [--mock] [--judges claim,spec,patentability] [--out <store-dir>] [--json]";

// Deterministic canned verdicts for --mock (offline). One per dimension; the patentability mock also
// flags a candidate so the offline run exercises that field. Scores are mid-high so the gate passes.
function mockVerdictFor(dimension) {
  if (dimension === "patentability") {
    return { score: 4, rationale: "[mock] PA01 discloses a reservoir+wick but lacks the float-actuated valve; CLM01 distinguished. No un-flagged anticipating art.", anticipated_claims: [], closest_reference: "PA01" };
  }
  if (dimension === "spec") {
    return { score: 4, rationale: "[mock] every claim limitation maps to a SPEC#### paragraph that describes and enables it; 'selected level' is objectively bounded." };
  }
  return { score: 4, rationale: "[mock] independent claim is commensurate with support; the dependent wick claim is a valid narrowing fallback." };
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  if (a.help) { console.log(USAGE); process.exit(0); }
  if (!a.matter) { console.error(USAGE); process.exit(2); }

  const bad = a.judges.filter((j) => !ALL_JUDGES.includes(j));
  if (bad.length) { console.error(`unknown judge(s): ${bad.join(", ")} (known: ${ALL_JUDGES.join(", ")})`); process.exit(2); }

  let client;
  try {
    client = a.mock
      ? new MockClient((sys, user, schema) => {
          const dim = /PRIOR-ART DETECTION/.test(sys) ? "patentability" : /WRITTEN DESCRIPTION/.test(sys) ? "spec" : "claim";
          return mockVerdictFor(dim);
        })
      : makeClient({});
  } catch (e) {
    console.error("error:", e.message); process.exit(2);
  }

  const dimensions = {};
  for (const name of a.judges) {
    try {
      const verdict = await JUDGES[name](client, a.matter);
      // attach per-call usage (cost gate) when the client reports it
      if (client.lastUsage && !verdict.skipped) verdict.usage = client.lastUsage;
      dimensions[name] = verdict;
    } catch (e) {
      console.error(`judge '${name}' failed:`, e.message);
      process.exit(a.mock ? 2 : 1);
    }
  }

  const run = { matter: a.matter, mock: !!a.mock, model: client.model, dimensions };
  run.cost = costOf(run);

  const prev = a.out ? latestRun(a.out) : null;
  const gate = budgetGate(prev, run);

  if (a.json) {
    console.log(JSON.stringify({ run, gate, prevCost: gate.prevCost }, null, 2));
  } else {
    console.log(`apa-eval (Tier-3, ${a.mock ? "MOCK/offline" : "LIVE"}) - ${a.matter}`);
    console.log(`  model: ${client.model}\n`);
    for (const name of a.judges) {
      const v = dimensions[name];
      const score = v.score == null ? "-" : `${v.score}/5`;
      console.log(`  [${name}] ${score}${v.skipped ? "  (skipped: deterministic pre-pass)" : ""}`);
      console.log(`    ${v.rationale || "(no rationale)"}`);
      if (Array.isArray(v.flags) && v.flags.length) console.log(`    flags: ${v.flags.join("; ")}`);
      if (Array.isArray(v.anticipated_claims) && v.anticipated_claims.length) console.log(`    at-risk claims: ${v.anticipated_claims.join(", ")}`);
      console.log("");
    }
    console.log(`  cost (this run): ${run.cost}${prev ? `   previous: ${gate.prevCost}` : "   (no previous run)"}`);
    console.log(`  budget gate: ${gate.ok ? "OK" : "FAIL"}${gate.reasons.length ? " - " + gate.reasons.join("; ") : ""}`);
    if (gate.notes && gate.notes.length) console.log(`    note: ${gate.notes.join("; ")}`);
  }

  if (a.out) {
    const file = recordRun(a.out, run, new Date().toISOString());
    if (!a.json) console.log(`  recorded run -> ${file}`);
  }

  if (!a.json) {
    console.log("\nNOTE: LLM-judge scores are DRAFT flags for a registered practitioner, never a legal opinion or clearance.");
  }

  process.exit(gate.ok ? 0 : 1);
}

main().catch((e) => { console.error("error:", e.message); process.exit(2); });
