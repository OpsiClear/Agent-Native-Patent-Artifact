#!/usr/bin/env node
/**
 * build_manifest.mjs - Walk a patent matter directory and emit manifest.json for the viewer.
 *
 * Usage:
 *   node build_manifest.mjs <matter-dir> [> manifest.json]
 *   node build_manifest.mjs <matter-dir> --out manifest.json
 *
 * Emits, exactly per docs/protocol.md S4:
 *   { meta: {...}, nodes: [...], edges: [...] }
 *
 * Node kinds: claim, claim-limitation, spec-paragraph, drawing-figure, reference-numeral,
 *             prior-art-reference, defined-term, prosecution-node, inventor.
 * Edge kinds: supported_by, illustrated_by, practiced_by, antecedent_of, depends_on,
 *             distinguished_over, scope_set_at, contributed_to.
 *
 * DELIBERATE DIVERGENCE FROM ARA: an edge whose target node id does not exist is NOT dropped.
 * It is emitted with "resolved": false (ARA silently drops such edges). This is the
 * S112-support / unsupported-edge warning surface; it must live in both the builder and viewer.js.
 *
 * Zero dependencies. Reuses the shared parser at ../../lib/apa-parse.mjs (no private YAML parser).
 * Node.js >= 21, ES module.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseFrontmatter,
  extractBindingBlocks,
  loadYaml,
  iterEntitySections,
} from "../../lib/apa-parse.mjs";
import { rulePackSummary } from "../apa-rules/rule-packs.mjs";

// ------------------------------------------------------------------------------------------------
// small fs helpers
// ------------------------------------------------------------------------------------------------

function read(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

/** First non-empty paragraph of a section body, stripped of the binding fence and bullets. */
function firstProse(body, maxLen = 400) {
  const cut = body.indexOf("```binding");
  const prose = (cut >= 0 ? body.slice(0, cut) : body).trim();
  const compact = prose.replace(/\s+/g, " ").trim();
  return compact.length > maxLen ? compact.slice(0, maxLen - 1) + "…" : compact;
}

/** Heading text after the ID, with any trailing "(...)" parenthetical kept. */
function headingTitle(heading) {
  return String(heading || "")
    .replace(/^[-–—\s]+/, "")
    .trim();
}

// ------------------------------------------------------------------------------------------------
// builder
// ------------------------------------------------------------------------------------------------

export function build(matterRoot) {
  const nodes = [];
  const edges = [];
  const seen = new Set();

  function addNode(node) {
    if (seen.has(node.id)) return;
    seen.add(node.id);
    nodes.push(node);
  }

  // Edges are collected raw; `resolved` is computed AFTER all nodes are known, so an edge to a
  // node declared later in the walk still resolves. Never drop an edge.
  const rawEdges = [];
  function addEdge(from, to, kind, extra = {}) {
    if (!to) return;
    rawEdges.push({ from, to, kind, ...extra });
  }

  // --- PATENT.md frontmatter (meta + inventors + inventorship matrix) -----------------------------
  const patentText = read(join(matterRoot, "PATENT.md"));
  const fm = parseFrontmatter(patentText);
  const title = fm.title || basename(matterRoot);

  // inventor nodes
  const inventors = Array.isArray(fm.inventors) ? fm.inventors : [];
  for (const inv of inventors) {
    if (!inv || typeof inv !== "object" || !inv.id) continue;
    addNode({
      id: inv.id,
      kind: "inventor",
      title: inv.name || inv.id,
      fields: { name: inv.name || "", inventor_id: inv.id },
      provenance: "inventor:" + inv.id,
    });
  }

  // contributed_to edges from the inventorship matrix (CLM## -> [inventor id, ...])
  const matrix = fm.inventorship_matrix && typeof fm.inventorship_matrix === "object"
    ? fm.inventorship_matrix
    : {};
  for (const [clm, invIds] of Object.entries(matrix)) {
    const list = Array.isArray(invIds) ? invIds : [invIds];
    for (const invId of list) {
      if (invId == null) continue;
      addEdge(String(invId), clm, "contributed_to");
    }
  }

  // --- logic/claims.md : claim + claim-limitation nodes; most edges ------------------------------
  const claimsText = read(join(matterRoot, "logic", "claims.md"));
  for (const sec of iterEntitySections(claimsText)) {
    if (!/^CLM\d+$/.test(sec.id)) continue;
    const blocks = extractBindingBlocks(sec.body);
    const b = blocks[0] || {};
    const clmId = sec.id;
    addNode({
      id: clmId,
      kind: "claim",
      title: headingTitle(sec.heading),
      fields: {
        type: b.type || "",
        category: b.category || "",
        depends_on: b.depends_on || null,
        statement: firstProse(sec.body),
      },
      provenance: b.provenance || "",
    });

    // claim-level edges
    if (b.depends_on) addEdge(clmId, b.depends_on, "depends_on");
    for (const pa of asArray(b.distinguished_over)) addEdge(clmId, pa, "distinguished_over");
    for (const ph of asArray(b.scope_set_at)) addEdge(clmId, ph, "scope_set_at");

    // limitations
    for (const lim of asArray(b.limitations)) {
      if (!lim || typeof lim !== "object" || !lim.id) continue;
      const limId = lim.id; // bare id, e.g. LIM03
      const qualified = `${clmId}.${limId}`; // CLM01.LIM03 - used as the edge `from` endpoint
      addNode({
        id: limId,
        kind: "claim-limitation",
        title: lim.text || limId,
        fields: {
          claim: clmId,
          text: lim.text || "",
          introduces: lim.introduces || null,
          references: asArray(lim.references),
        },
        provenance: lim.provenance || "",
      });
      // typed edges from each limitation; `from` is the qualified CLM##.LIM## for legibility.
      for (const spec of asArray(lim.supported_by)) addEdge(qualified, spec, "supported_by");
      for (const fig of asArray(lim.illustrated_by)) addEdge(qualified, fig, "illustrated_by");
      for (const sp of asArray(lim.practiced_by)) addEdge(qualified, sp, "practiced_by");
      // antecedent_of: LIM -> earlier LIM (bare ids, same claim)
      for (const ant of asArray(lim.antecedent_of)) addEdge(qualified, ant, "antecedent_of");
    }
  }

  // --- logic/concepts.md : defined-term nodes ----------------------------------------------------
  const conceptsText = read(join(matterRoot, "logic", "concepts.md"));
  for (const sec of iterEntitySections(conceptsText)) {
    if (!/^TERM\d+$/.test(sec.id)) continue;
    const b = extractBindingBlocks(sec.body)[0] || {};
    addNode({
      id: sec.id,
      kind: "defined-term",
      title: b.term || headingTitle(sec.heading),
      fields: {
        term: b.term || "",
        objective_bound: b.objective_bound === undefined ? null : b.objective_bound,
        definition: firstProse(sec.body),
      },
      provenance: b.provenance || "",
    });
  }

  // --- logic/prior_art.md : prior-art-reference nodes --------------------------------------------
  const priorArtText = read(join(matterRoot, "logic", "prior_art.md"));
  for (const sec of iterEntitySections(priorArtText)) {
    if (!/^PA\d+$/.test(sec.id)) continue;
    const b = extractBindingBlocks(sec.body)[0] || {};
    addNode({
      id: sec.id,
      kind: "prior-art-reference",
      title: headingTitle(sec.heading) || b.citation || sec.id,
      fields: {
        role: b.role || "",
        citation: b.citation || "",
        relied_on_passage: b.relied_on_passage || "",
        discloses: asArray(b.discloses),
        lacks: asArray(b.lacks),
        verification: b.verification || null,
      },
      provenance: b.provenance || "",
    });
  }

  // --- src/embodiments.md : spec-paragraph nodes -------------------------------------------------
  const embText = read(join(matterRoot, "src", "embodiments.md"));
  for (const sec of iterEntitySections(embText)) {
    if (!/^SPEC\d+$/.test(sec.id)) continue;
    const b = extractBindingBlocks(sec.body)[0] || {};
    addNode({
      id: sec.id,
      kind: "spec-paragraph",
      title: headingTitle(sec.heading),
      fields: {
        grounding: b.grounding || "",
        defines_numerals: asArray(b.defines_numerals),
        text: firstProse(sec.body, 800),
      },
      provenance: b.provenance || "",
    });
  }

  // --- evidence/drawings/*.md : drawing-figure + reference-numeral nodes -------------------------
  // Walk the well-known drawings directory. Each FIG## section declares numerals; each numeral
  // becomes a reference-numeral node with id "FIG##0#<numeral>" matching illustrated_by endpoints.
  const drawingsDir = join(matterRoot, "evidence", "drawings");
  for (const figFile of listMarkdown(drawingsDir)) {
    const figText = read(figFile);
    for (const sec of iterEntitySections(figText)) {
      if (!/^FIG\d+$/.test(sec.id)) continue;
      const b = extractBindingBlocks(sec.body)[0] || {};
      const figId = sec.id;
      addNode({
        id: figId,
        kind: "drawing-figure",
        title: headingTitle(sec.heading),
        fields: {
          representative: b.representative === undefined ? null : b.representative,
          description: firstProse(sec.body),
        },
        provenance: b.provenance || "",
      });
      for (const num of asArray(b.numerals)) {
        if (!num || typeof num !== "object" || num.numeral == null) continue;
        const numId = `${figId}#${num.numeral}`; // e.g. FIG01#10 - matches illustrated_by targets
        addNode({
          id: numId,
          kind: "reference-numeral",
          title: `${num.numeral} – ${num.element || ""}`.trim(),
          fields: {
            figure: figId,
            numeral: String(num.numeral),
            element: num.element || "",
            defined_in: num.defined_in || null,
          },
          provenance: b.provenance || "",
        });
        // a numeral is described by a SPEC paragraph (a supporting edge, surfaces orphans too)
        if (num.defined_in) addEdge(numId, num.defined_in, "practiced_by");
      }
    }
  }

  // --- trace/prosecution.yaml : prosecution-node nodes ------------------------------------------
  const prosText = read(join(matterRoot, "trace", "prosecution.yaml"));
  if (prosText.trim()) {
    const pros = loadYaml(prosText) || {};
    for (const pn of asArray(pros.nodes)) {
      if (!pn || typeof pn !== "object" || !pn.id) continue;
      addNode({
        id: pn.id,
        kind: "prosecution-node",
        title: pn.summary || pn.id,
        fields: {
          type: pn.type || "",
          summary: pn.summary || "",
          choice: pn.choice || "",
          alternatives: asArray(pn.alternatives),
          failure_mode: pn.failure_mode || "",
          lesson: pn.lesson || "",
          hypothesis: pn.hypothesis || "",
          children: asArray(pn.children),
        },
        provenance: pn.provenance || "",
      });
    }
  }

  // --- resolve edges (THE divergence): emit every edge, stamping resolved against node ids -------
  for (const e of rawEdges) {
    edges.push({
      from: e.from,
      to: e.to,
      kind: e.kind,
      resolved: targetExists(e.to, seen),
    });
  }

  return {
    meta: {
      title,
      application_type: fm.application_type || "",
      status: fm.status || "",
      rules_effective_date: fm.rules_effective_date || "",
      rule_pack: rulePackSummary(),
      provenance_summary:
        fm.provenance_summary && typeof fm.provenance_summary === "object"
          ? fm.provenance_summary
          : {},
    },
    nodes,
    edges,
  };
}

/**
 * Whether an edge target id resolves to a node.
 * An edge `from` is sometimes the qualified form CLM##.LIM##, but edge TARGETS are always bare
 * node ids (SPEC####, FIG##numeral, LIM##, CLM##, PA##, PH##, inventor id), so a direct membership
 * test is correct. We also accept a qualified CLM##.LIM## target by falling back to its bare LIM##.
 */
function targetExists(to, seen) {
  if (seen.has(to)) return true;
  const dot = to.indexOf(".");
  if (dot > 0) {
    const bare = to.slice(dot + 1);
    if (seen.has(bare)) return true;
  }
  return false;
}

function asArray(v) {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function listMarkdown(dir) {
  if (!existsSync(dir)) return [];
  let entries = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".md"))
    .map((e) => join(dir, e.name))
    .sort();
}

// ------------------------------------------------------------------------------------------------
// CLI
// ------------------------------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { matter: null, out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out" || a === "-o") {
      args.out = argv[++i];
    } else if (a.startsWith("--out=")) {
      args.out = a.slice("--out=".length);
    } else if (!a.startsWith("-") && args.matter == null) {
      args.matter = a;
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.matter) {
    process.stderr.write(
      "usage: node build_manifest.mjs <matter-dir> [--out <file>]\n" +
        "       node build_manifest.mjs <matter-dir> > manifest.json\n"
    );
    process.exit(1);
  }
  const matterRoot = resolve(args.matter);
  if (!existsSync(join(matterRoot, "PATENT.md"))) {
    process.stderr.write(`error: ${join(matterRoot, "PATENT.md")} not found\n`);
    process.exit(2);
  }
  // The bounded parser fails loud by THROWING on a malformed matter (tab indent / over-indent / too-deep).
  // Convert that to a documented structured error + exit 2, never a raw uncaught stack from a CLI command.
  let manifest;
  try { manifest = build(matterRoot); }
  catch (e) { process.stderr.write(`error: matter failed to parse (route to counsel): ${e && e.message ? e.message : e}\n`); process.exit(2); }
  const json = JSON.stringify(manifest, null, 2);
  if (args.out) {
    writeFileSync(args.out, json + "\n", "utf8");
    process.stderr.write(
      `wrote ${args.out} (${manifest.nodes.length} nodes, ${manifest.edges.length} edges, ` +
        `${manifest.edges.filter((e) => !e.resolved).length} unresolved)\n`
    );
  } else {
    process.stdout.write(json + "\n");
  }
}

// Run main() only when invoked directly (not when imported by the test suite).
const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
