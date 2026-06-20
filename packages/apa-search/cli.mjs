#!/usr/bin/env node
/**
 * apa-search - prior-art search CLI. Builds a query (from --query or a matter's claims), SCANS IT at
 * the sink before egress, queries enabled sources, ranks, and optionally writes the landscape into a
 * matter. Node >=21, ESM, zero deps.
 *
 *   node cli.mjs --query "self-watering planter float valve" --source mock
 *   node cli.mjs --matter <dir> --source patentsview --write        # PATENTSVIEW_API_KEY required
 *
 * Exit: 0 ok · 2 MEDIUM scan findings (re-run with --yes to proceed) · 3 HIGH scan findings (blocked).
 */

import { runSearch, buildQueryFromClaims } from "./search.mjs";
import { writeLandscape } from "./writers.mjs";
import { listSources } from "./sources/index.mjs";

function parseArgs(argv) {
  const a = { sources: [], limit: 25 };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--query") a.query = argv[++i];
    else if (t === "--matter") a.matter = argv[++i];
    else if (t === "--source") a.sources.push(...argv[++i].split(","));
    else if (t === "--limit") a.limit = parseInt(argv[++i], 10) || 25;
    else if (t === "--json") a.json = true;
    else if (t === "--write") a.write = true;
    else if (t === "--yes") a.yes = true;
    else if (t === "--list-sources") a.listSources = true;
  }
  return a;
}

function mask(f) { return `${f.tier} ${f.patternName} @${f.start}`; }

async function main() {
  const a = parseArgs(process.argv.slice(2));
  if (a.listSources) {
    for (const s of listSources()) console.log(`  ${s.id.padEnd(18)} ${s.accessMode.padEnd(14)} ${s.status.padEnd(14)} ${s.note}`);
    return;
  }
  const query = a.query ? { keywords: a.query.split(/\s+/).filter(Boolean), cpc: [], limit: a.limit }
    : a.matter ? buildQueryFromClaims(a.matter, { limit: a.limit })
    : null;
  if (!query) { console.error("provide --query \"...\" or --matter <dir>"); process.exit(2); }

  const opts = { apiKey: process.env.PATENTSVIEW_API_KEY };
  const res = await runSearch({ query, sources: a.sources, opts, confirmMedium: a.yes });

  if (res.blocked) {
    console.error("BLOCKED: the query contains HIGH-tier confidential/secret content; not sent.");
    res.verdict.high.forEach((f) => console.error("  " + mask(f)));
    process.exit(3);
  }
  if (res.needsConfirm) {
    console.error("HOLD: the query contains MEDIUM-tier sensitive content. Re-run with --yes to proceed.");
    res.verdict.medium.forEach((f) => console.error("  " + mask(f)));
    process.exit(2);
  }

  if (a.json) {
    console.log(JSON.stringify({ query, ...res }, null, 2));
  } else {
    console.log(`Query: ${query.keywords.join(", ")}`);
    for (const s of res.perSource) console.log(`  source ${s.id}: ${s.count} result(s)${s.error ? ` [error: ${s.error}]` : ""}${(s.notes || []).length ? ` — ${s.notes.join("; ")}` : ""}`);
    console.log(`\nRanked candidates (${res.ranked.length}):`);
    res.ranked.slice(0, a.limit).forEach((r, i) => console.log(`  ${String(i + 1).padStart(2)}. [score ${r.score}] ${r.docNumber}  ${r.title || ""}`));
  }

  if (a.write && a.matter) {
    // Honor --limit on WRITE too (some sources, e.g. mock, ignore query.limit and return all matches,
    // so the preview showed N but the un-sliced array would file every match).
    const { assigned } = writeLandscape(a.matter, res.ranked.slice(0, a.limit));
    console.log(`\nWrote ${assigned.length} reference(s) into ${a.matter}: ${assigned.map((x) => x.paId).join(", ")}`);
    console.log(`Updated logic/prior_art.md + evidence/prior_art/ + logic/reference_matrix.md (scaffold).`);
  }

  console.log("\nNOTE: candidates are UNVERIFIED and possibly incomplete (examiner-grade PPS is UI-only; NPL is");
  console.log("paywalled). A human must verify each reference and select the closest art. This is NOT a clearance");
  console.log("and never asserts \"no anticipating art found.\"");
}

main().catch((e) => { console.error("error:", e.message); process.exit(1); });
