#!/usr/bin/env node
/**
 * apa-search - prior-art search CLI. Builds a query (from --query or a matter's claims), SCANS IT at
 * the sink before egress, queries enabled sources, ranks, and optionally writes the landscape into a
 * matter. Node >=21, ESM, zero deps.
 *
 *   node cli.mjs --query "self-watering planter float valve" --source mock
 *   node cli.mjs --matter <dir> --source patentsview --write        # PATENTSVIEW_API_KEY required
 *   node cli.mjs --matter <dir> --source patentsview,crossref,arxiv --broad --write
 *   node cli.mjs --matter <dir> --source patentsview --broad --citation-expand --write
 *
 * Exit: 0 ok · 2 MEDIUM scan findings (re-run with --yes to proceed) · 3 HIGH scan findings (blocked).
 */

import { runSearch, buildQueryFromClaims } from "./search.mjs";
import { updateClosestArtSelection, updateReferenceVerification, writeLandscape, writeSearchDossier } from "./writers.mjs";
import { listSources } from "./sources/index.mjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter } from "../../lib/apa-parse.mjs";
import {
  appendRunlog,
  buildRunlogEntry,
  commandRecord,
  existingFileRecords,
  externalSinkRecord,
  humanCheckpoint,
} from "../apa-trace/runlog.mjs";

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
    else if (t === "--broad") a.broad = true;
    else if (t === "--citation-expand") a.citationExpand = true;
    else if (t === "--list-sources") a.listSources = true;
  }
  return a;
}

function value(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
}

function values(argv, name) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === name && i + 1 < argv.length) out.push(argv[i + 1]);
  }
  return out;
}

function mask(f) { return `${f.tier} ${f.patternName} @${f.start}`; }

async function main() {
  const startedAt = new Date().toISOString();
  const rawArgs = process.argv.slice(2);
  if (rawArgs[0] === "verify-closest-art") {
    process.exit(cmdVerifyClosestArt(rawArgs.slice(1)));
  }
  if (rawArgs[0] === "verify-reference") {
    process.exit(cmdVerifyReference(rawArgs.slice(1)));
  }
  const a = parseArgs(rawArgs);
  if (a.listSources) {
    for (const s of listSources()) console.log(`  ${s.id.padEnd(18)} ${s.accessMode.padEnd(14)} ${s.status.padEnd(14)} ${s.note}`);
    return;
  }
  const query = a.query ? { keywords: a.query.split(/\s+/).filter(Boolean), cpc: [], limit: a.limit }
    : a.matter ? buildQueryFromClaims(a.matter, { limit: a.limit })
    : null;
  if (!query) { console.error("provide --query \"...\" or --matter <dir>"); process.exit(2); }

  const opts = { apiKey: process.env.PATENTSVIEW_API_KEY, broadSearch: a.broad, citationExpand: a.citationExpand };
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
    if (res.searchPlan?.length > 1) console.log(`Search plan: ${res.searchPlan.map((s) => s.id).join(", ")}`);
    for (const s of res.perSource) console.log(`  source ${s.id}: ${s.count} result(s)${s.error ? ` [error: ${s.error}]` : ""}${(s.notes || []).length ? ` — ${s.notes.join("; ")}` : ""}`);
    console.log(`\nRanked candidates (${res.ranked.length}):`);
    res.ranked.slice(0, a.limit).forEach((r, i) => console.log(`  ${String(i + 1).padStart(2)}. [score ${r.score}] ${r.docNumber}  ${r.title || ""}`));
  }

  if (a.write && a.matter) {
    // Honor --limit on WRITE too (some sources, e.g. mock, ignore query.limit and return all matches,
    // so the preview showed N but the un-sliced array would file every match).
    const { assigned } = writeLandscape(a.matter, res.ranked.slice(0, a.limit));
    const { path: dossierPath } = writeSearchDossier(a.matter, {
      query,
      result: { ...res, ranked: res.ranked.slice(0, a.limit) },
      assigned,
      limit: a.limit,
    });
    const outputPaths = [
      join(a.matter, "logic", "prior_art.md"),
      join(a.matter, "logic", "reference_matrix.md"),
      dossierPath,
      ...assigned.map((x) => join(a.matter, "evidence", "prior_art", `${x.paId.toLowerCase()}.md`)),
    ];
    appendRunlog(a.matter, buildRunlogEntry({
      timestamp: new Date().toISOString(),
      skill: "apa-priorart",
      ruleVersion: ruleVersionOf(a.matter),
      inputs: existingFileRecords(a.matter, [
        join(a.matter, "PATENT.md"),
        join(a.matter, "logic", "claims.md"),
      ]),
      outputs: existingFileRecords(a.matter, outputPaths),
      commands: [commandRecord({
        argv: ["node", "packages/apa-search/cli.mjs", ...process.argv.slice(2)],
        cwd: process.cwd(),
        exitCode: 0,
        startedAt,
        endedAt: new Date().toISOString(),
      })],
      externalSinks: [externalSinkRecord({
        kind: "prior-art-query",
        bytes: res.verdict?.text || JSON.stringify(query),
        scanVerdict: res.verdict,
        humanApproved: Boolean(res.verdict?.needsConfirm && a.yes),
      })],
      humanCheckpoints: [humanCheckpoint({ id: "closest-art-selection", required: true, satisfied: false })],
    }));
    console.log(`\nWrote ${assigned.length} reference(s) into ${a.matter}: ${assigned.map((x) => x.paId).join(", ")}`);
    console.log(`Updated logic/prior_art.md + evidence/prior_art/ + logic/reference_matrix.md (scaffold).`);
    console.log(`Wrote search dossier: ${dossierPath}`);
  }

  console.log("\nNOTE: candidates are UNVERIFIED and possibly incomplete (examiner-grade PPS is UI-only; NPL is");
  console.log("paywalled). A human must verify each reference and select the closest art. This is NOT a clearance");
  console.log("and never asserts \"no anticipating art found.\"");
}

function cmdVerifyClosestArt(argv) {
  const dossier = value(argv, "--dossier");
  const selected = values(argv, "--pa").flatMap((v) => v.split(",")).map((s) => s.trim()).filter(Boolean);
  const rationale = value(argv, "--rationale") || "";
  const reviewer = value(argv, "--reviewer") || "";
  if (!dossier || !selected.length || !rationale) {
    console.error("usage: verify-closest-art --dossier <search-dossier.json> --pa PA02[,PA03] --rationale <text> [--reviewer name] [--title-verified --venue-verified --canonical-link-verified --relied-on-passage-verified] [--json]");
    return 2;
  }
  try {
    const updated = updateClosestArtSelection(dossier, {
      selectedPaIds: selected,
      rationale,
      reviewer,
      checks: {
        title_verified: argv.includes("--title-verified"),
        venue_verified: argv.includes("--venue-verified"),
        canonical_link_verified: argv.includes("--canonical-link-verified"),
        relied_on_passage_verified: argv.includes("--relied-on-passage-verified"),
      },
    });
    if (argv.includes("--json")) {
      console.log(JSON.stringify(updated.closest_art_selection, null, 2));
    } else {
      const v = updated.closest_art_selection.verification;
      console.log(`updated ${dossier}: closest art ${selected.join(", ")} human_verified=true ids_ready=${v.ids_ready}`);
      if (!v.ids_ready) console.log(`  ${v.ids_ready_reason}`);
    }
    return 0;
  } catch (e) {
    console.error(`error: ${e.message}`);
    return 2;
  }
}

function cmdVerifyReference(argv) {
  const dossier = value(argv, "--dossier");
  const selected = values(argv, "--pa").flatMap((v) => v.split(",")).map((s) => s.trim()).filter(Boolean);
  const notes = value(argv, "--notes") || value(argv, "--rationale") || "";
  const reviewer = value(argv, "--reviewer") || "";
  if (!dossier || !selected.length || !notes) {
    console.error("usage: verify-reference --dossier <search-dossier.json> --pa PA02[,PA03] --notes <verification notes> [--reviewer name] [--title-verified --venue-verified --canonical-link-verified --relied-on-passage-verified] [--json]");
    return 2;
  }
  try {
    const updated = updateReferenceVerification(dossier, {
      paIds: selected,
      notes,
      reviewer,
      checks: {
        title_verified: argv.includes("--title-verified"),
        venue_verified: argv.includes("--venue-verified"),
        canonical_link_verified: argv.includes("--canonical-link-verified"),
        relied_on_passage_verified: argv.includes("--relied-on-passage-verified"),
      },
    });
    const refs = (updated.assigned_references || []).filter((r) => selected.includes(r.pa_id));
    if (argv.includes("--json")) {
      console.log(JSON.stringify(refs, null, 2));
    } else {
      for (const ref of refs) {
        console.log(`updated ${dossier}: ${ref.pa_id} human_verified=${ref.verification.human_verified} ids_ready=${ref.verification.ids_ready}`);
        if (!ref.verification.ids_ready) console.log(`  ${ref.verification.ids_ready_reason}`);
      }
    }
    return 0;
  } catch (e) {
    console.error(`error: ${e.message}`);
    return 2;
  }
}

function ruleVersionOf(matterDir) {
  try {
    return parseFrontmatter(readFileSync(join(matterDir, "PATENT.md"), "utf8")).rules_effective_date || "";
  } catch {
    return "";
  }
}

main().catch((e) => { console.error("error:", e.message); process.exit(1); });
