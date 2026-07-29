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
 * Edge kinds: supported_by, defined_by, illustrated_by, practiced_by, antecedent_of, depends_on,
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
} from "../apa-core/apa-parse.mjs";
import { rulePackSummary } from "../apa-rules/rule-packs.mjs";

const EDGE_TARGET_KINDS = Object.freeze({
  supported_by: "spec-paragraph",
  defined_by: "defined-term",
  illustrated_by: "reference-numeral",
  practiced_by: "spec-paragraph",
  antecedent_of: "claim-limitation",
  depends_on: "claim",
  distinguished_over: "prior-art-reference",
  scope_set_at: "prosecution-node",
  contributed_to: "claim",
  contributed_to_limitation: "claim-limitation",
});
const FIXED_PROVENANCE_VALUES = new Set(["attorney", "ai-suggested", "ai-executed", "human-revised"]);

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
  const nodeIndexById = new Map();
  const collisionsById = new Map();

  function addNode(node) {
    if (!node || node.id == null) return;
    if (!nodeIndexById.has(node.id)) {
      nodeIndexById.set(node.id, nodes.length);
      nodes.push(node);
      return;
    }

    const index = nodeIndexById.get(node.id);
    const existing = nodes[index];
    const canonicalKind = canonicalKindForId(node.id);
    const retainIncoming = canonicalKind === node.kind && canonicalKind !== existing.kind;
    const retained = retainIncoming ? node : existing;
    if (retainIncoming) nodes[index] = node;

    let collision = collisionsById.get(node.id);
    if (!collision) {
      collision = {
        id: node.id,
        declarations: [{ kind: existing.kind, title: existing.title || "" }],
      };
      collisionsById.set(node.id, collision);
    }
    collision.declarations.push({ kind: node.kind, title: node.title || "" });
    collision.kinds = [...new Set(collision.declarations.map((d) => d.kind))];
    collision.declaration_count = collision.declarations.length;
    collision.retained_kind = retained.kind;
    collision.status = `duplicate node id; manifest retained '${retained.kind}', and validator review is required`;
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
      for (const inventor of asArray(lim.contributors)) addEdge(inventor, limId, "contributed_to_limitation");
      for (const spec of asArray(lim.supported_by)) addEdge(qualified, spec, "supported_by");
      for (const term of asArray(lim.defined_by)) addEdge(qualified, term, "defined_by");
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

  // --- resolve edges (THE divergence): emit every edge, stamping typed target resolution ----------
  const nodeKindsById = new Map(nodes.map((n) => [n.id, n.kind]));
  for (const e of rawEdges) {
    const resolution = targetResolution(e, nodeKindsById);
    edges.push({
      from: e.from,
      to: e.to,
      kind: e.kind,
      resolved: resolution.resolved,
      ...(resolution.issue ? { resolution_issue: resolution.issue } : {}),
      ...(resolution.issue && resolution.targetKind ? { target_kind: resolution.targetKind } : {}),
      ...(resolution.issue && resolution.expectedTargetKind ? { expected_target_kind: resolution.expectedTargetKind } : {}),
    });
  }

  const nodeCollisions = [...collisionsById.values()];
  const review = buildReview(matterRoot, nodes, edges, nodeCollisions);

  return {
    meta: {
      title,
      apa_version: fm.apa_version || "",
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
    review,
  };
}

function buildReview(matterRoot, nodes, edges, nodeCollisions = []) {
  const limitations = nodes.filter((n) => n.kind === "claim-limitation");
  const unadoptedLimitations = limitations
    .filter((n) => (n.provenance || "ai-suggested") === "ai-suggested")
    .map((n) => ({
      id: n.id,
      claim: n.fields?.claim || "",
      title: n.title || "",
      provenance: n.provenance || "ai-suggested",
      status: "human adoption required before assembly",
    }));
  const declaredInventorIds = new Set(nodes.filter((n) => n.kind === "inventor").map((n) => n.id));
  const invalidProvenance = nodes
    .filter((node) => {
      const provenance = node.provenance;
      if (!provenance) return false;
      if (FIXED_PROVENANCE_VALUES.has(provenance)) return false;
      return !(
        typeof provenance === "string"
        && provenance.startsWith("inventor:")
        && declaredInventorIds.has(provenance.slice("inventor:".length))
      );
    })
    .map((node) => ({
      id: node.id,
      kind: node.kind,
      claim: node.fields?.claim || "",
      title: node.title || "",
      provenance: node.provenance,
      status: "invalid or undeclared provenance; validator review required",
    }));

  const priorArt = nodes.filter((n) => n.kind === "prior-art-reference");
  const unverifiedPriorArt = priorArt
    .filter((n) => !(n.fields?.verification && n.fields.verification.verified === true))
    .map((n) => ({
      id: n.id,
      title: n.title || "",
      citation: n.fields?.citation || "",
      verification: n.fields?.verification || null,
      status: "human IDS/reference verification required",
    }));

  const unresolvedEdges = edges
    .filter((e) => e.resolved === false)
    .map((e) => ({
      from: e.from,
      to: e.to,
      kind: e.kind,
      resolution_issue: e.resolution_issue || "missing-target",
      target_kind: e.target_kind || null,
      expected_target_kind: e.expected_target_kind || null,
      severity: e.kind === "supported_by" ? "fix-before-filing" : "warning",
    }));

  const drawingFigures = nodes.filter((n) => n.kind === "drawing-figure");
  const drawingReview = loadDrawingReview(matterRoot, drawingFigures.length);

  return {
    schema: "apa-viewer-review-v1",
    provenance: {
      unadopted_limitations: unadoptedLimitations,
      invalid_provenance: invalidProvenance,
      invalid_count: invalidProvenance.length,
      blocking_count: unadoptedLimitations.length + invalidProvenance.length,
    },
    ids: {
      node_collisions: nodeCollisions,
      collision_count: nodeCollisions.length,
      unverified_prior_art: unverifiedPriorArt,
      warning_count: unverifiedPriorArt.length + nodeCollisions.length,
    },
    support: {
      unresolved_edges: unresolvedEdges,
      unsupported_support_edges: unresolvedEdges.filter((e) => e.kind === "supported_by"),
      warning_count: unresolvedEdges.length,
    },
    drawings: drawingReview,
  };
}

function loadDrawingReview(matterRoot, drawingFigureCount) {
  const path = join(matterRoot, "evidence", "drawings", "quality-review.json");
  if (drawingFigureCount === 0) {
    return {
      status: "not-applicable",
      findings: [],
      blocking_count: 0,
      warning_count: 0,
    };
  }
  if (!existsSync(path)) {
    return {
      status: "missing",
      path: "evidence/drawings/quality-review.json",
      findings: [],
      blocking_count: 0,
      warning_count: 1,
      message: "drawing-quality review not found",
    };
  }
  try {
    const review = JSON.parse(readFileSync(path, "utf8"));
    const findings = Array.isArray(review.findings) ? review.findings : [];
    return {
      status: (review.blocking_count || 0) > 0 ? "blocking-findings" : "reviewed",
      path: "evidence/drawings/quality-review.json",
      min_score: review.min_score ?? null,
      mean_score: review.mean_score ?? null,
      verdict: review.verdict || "",
      findings,
      blocking_count: review.blocking_count || 0,
      warning_count: findings.filter((f) => f && f.severity !== "info").length,
    };
  } catch (e) {
    return {
      status: "parse-error",
      path: "evidence/drawings/quality-review.json",
      findings: [],
      blocking_count: 0,
      warning_count: 1,
      message: e.message,
    };
  }
}

function canonicalKindForId(id) {
  const value = String(id);
  if (/^CLM\d+$/.test(value)) return "claim";
  if (/^LIM\d+$/.test(value)) return "claim-limitation";
  if (/^TERM\d+$/.test(value)) return "defined-term";
  if (/^PA\d+$/.test(value)) return "prior-art-reference";
  if (/^SPEC\d+$/.test(value)) return "spec-paragraph";
  if (/^FIG\d+#.+$/.test(value)) return "reference-numeral";
  if (/^FIG\d+$/.test(value)) return "drawing-figure";
  if (/^PH\d+$/.test(value)) return "prosecution-node";
  return null;
}

/**
 * Resolve an edge target by both id and protocol node kind.
 * Qualified CLM##.LIM## targets fall back to their bare limitation id.
 */
function targetResolution(edge, nodeKindsById) {
  let targetId = edge.to;
  let targetKind = nodeKindsById.get(targetId);
  if (!targetKind) {
    const value = String(edge.to);
    const dot = value.indexOf(".");
    if (dot > 0) {
      const bare = value.slice(dot + 1);
      targetKind = nodeKindsById.get(bare);
      if (targetKind) targetId = bare;
    }
  }
  if (!targetKind) return { resolved: false, issue: "missing-target" };

  const expectedTargetKind = EDGE_TARGET_KINDS[edge.kind];
  if (expectedTargetKind && targetKind !== expectedTargetKind) {
    return {
      resolved: false,
      issue: "wrong-target-kind",
      targetId,
      targetKind,
      expectedTargetKind,
    };
  }
  return { resolved: true, targetId, targetKind };
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
