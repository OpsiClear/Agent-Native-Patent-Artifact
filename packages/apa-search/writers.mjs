/**
 * Write a ranked prior-art landscape into a matter: append PA## blocks to logic/prior_art.md, write a
 * raw record per reference under evidence/prior_art/, and emit a reference-matrix scaffold. Every
 * reference is written UNVERIFIED (verification: false) - a human must confirm discloses-vs-lacks
 * before it is relied on or listed on an IDS. Node >=21, ESM, zero deps.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { iterEntitySections } from "../../lib/apa-parse.mjs";
import { refSummary, refToPaBlock, refToEvidence } from "./lib/refs.mjs";
import { queryToString } from "./search.mjs";
import { sourceHealth } from "./sources/index.mjs";

function nextPaNumber(priorArtPath) {
  let max = 0;
  if (existsSync(priorArtPath)) {
    for (const sec of iterEntitySections(readFileSync(priorArtPath, "utf8"))) {
      const m = /^PA(\d+)$/.exec(sec.id);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
  }
  return max + 1;
}

const paId = (n) => `PA${String(n).padStart(2, "0")}`;

/**
 * @param {string} matterDir
 * @param {object[]} rankedRefs  NormalizedRef[] (ranked)
 * @returns {{ assigned: {paId:string, docNumber:string}[], referenceMatrix:string }}
 */
export function writeLandscape(matterDir, rankedRefs) {
  const priorArtPath = join(matterDir, "logic", "prior_art.md");
  const evidenceDir = join(matterDir, "evidence", "prior_art");
  mkdirSync(evidenceDir, { recursive: true });
  if (!existsSync(priorArtPath)) {
    mkdirSync(join(matterDir, "logic"), { recursive: true });
    writeFileSync(priorArtPath, "# Prior-art landscape\n\n> Typed by legal role. For patentability, NOT a freedom-to-operate / clearance opinion.\n");
  }

  let n = nextPaNumber(priorArtPath);
  const assigned = [];
  for (const ref of rankedRefs) {
    const id = paId(n++);
    appendFileSync(priorArtPath, "\n" + refToPaBlock(ref, id));
    writeFileSync(join(evidenceDir, `${id.toLowerCase()}.md`), refToEvidence(ref, id));
    assigned.push({ paId: id, docNumber: ref.docNumber, title: ref.title });
  }

  const referenceMatrix = renderReferenceMatrix(assigned);
  writeFileSync(join(matterDir, "logic", "reference_matrix.md"), referenceMatrix);
  return { assigned, referenceMatrix };
}

export function buildSearchDossier({ query, result, assigned = [], limit = 25, generatedAt = new Date().toISOString() }) {
  const queryBytes = result?.verdict?.text || `${queryToString(query)}\n${JSON.stringify(query || {})}`;
  const ranked = result?.ranked || [];
  const raw = result?.rawRecords || ranked;
  const deduped = result?.deduped || ranked;
  const dedupeClusters = result?.dedupe?.clusters || [];
  const dedupeExclusions = result?.dedupe?.excludedResults || [];
  const sourceExclusions = sourceLevelExclusions(result?.perSource || []);
  return {
    schema: "apa-search-dossier-v1",
    generated_at: generatedAt,
    query: {
      keywords: query?.keywords || [],
      cpc: query?.cpc || [],
      limit,
      serialized_sha256: createHash("sha256").update(queryBytes).digest("hex"),
      scan_verdict: {
        blocked: Boolean(result?.blocked),
        needs_confirm: Boolean(result?.needsConfirm),
        high_count: result?.verdict?.high?.length || 0,
        medium_count: result?.verdict?.medium?.length || 0,
      },
    },
    search_plan: result?.searchPlan || [{ id: "claim-keywords", label: "Claim-derived keywords", query: { keywords: query?.keywords || [], cpc: query?.cpc || [], limit } }],
    sources: (result?.perSource || []).map((s) => ({
      source_id: s.id,
      access_mode: s.accessMode || "unknown",
      status: s.status || "",
      count: s.count || 0,
      raw_count: s.rawCount ?? null,
      error: s.error || null,
      skipped: Boolean(s.skipped),
      query_parameters: s.parameters || null,
      source_health: s.source_health || s.sourceHealth || safeSourceHealth(s.id),
      notes: s.notes || [],
    })),
    top_n: {
      before_dedupe: raw.slice(0, limit).map((r, index) => candidateRecord(r, { rank: index + 1, stage: "before-dedupe" })),
      after_dedupe_before_ranking: deduped.slice(0, limit).map((r, index) => candidateRecord(r, { rank: index + 1, stage: "after-dedupe-before-ranking" })),
      after_ranking: ranked.slice(0, limit).map((r, index) => candidateRecord(r, { rank: index + 1, stage: "after-ranking" })),
    },
    dedupe_clusters: dedupeClusters,
    excluded_results: [...dedupeExclusions, ...sourceExclusions],
    citation_expansion: result?.citationExpansion || { enabled: false, added_count: 0, seeds: [], relations: [] },
    coverage_limits: coverageLimits(result?.perSource || []),
    ranked_candidates: ranked.slice(0, limit).map((r, index) => candidateRecord(r, { rank: index + 1 })),
    assigned_references: assigned.map((a) => ({
      pa_id: a.paId,
      doc_number: a.docNumber,
      title: a.title || "",
      verification: idsVerificationStatus(),
    })),
    analysis_handoff: analysisHandoff({ assigned, ranked }),
    closest_art_selection: {
      human_verified: false,
      selected_pa_ids: [],
      rationale: "",
      verification: idsVerificationStatus(),
    },
    caveats: [
      "This run is not a complete search and never asserts no anticipating art was found.",
      "USPTO Patent Public Search and paywalled NPL sources require human handoff/verification.",
      "Do not rely on or list a reference on an IDS until a human verifies the citation and relied-on passages.",
    ],
  };
}

export function idsVerificationStatus(checks = {}) {
  const required = {
    title: Boolean(checks.title || checks.title_verified || checks.titleVerified),
    venue: Boolean(checks.venue || checks.venue_verified || checks.venueVerified),
    canonical_link: Boolean(checks.canonical_link || checks.canonical_link_verified || checks.canonicalLinkVerified),
    relied_on_passage: Boolean(checks.relied_on_passage || checks.relied_on_passage_verified || checks.reliedOnPassageVerified),
  };
  const idsReady = Object.values(required).every(Boolean);
  const humanVerified = Boolean(checks.human_verified || checks.humanVerified);
  return {
    human_verified: humanVerified,
    confidence: humanVerified ? (checks.confidence || "human-verified") : "unverified",
    ids_ready: idsReady,
    required_checks: required,
    ...(checks.reviewer ? { reviewer: String(checks.reviewer) } : {}),
    ...(checks.verified_at || checks.verifiedAt ? { verified_at: String(checks.verified_at || checks.verifiedAt) } : {}),
    ids_ready_reason: idsReady
      ? "title, venue, canonical link, and relied-on passage verified"
      : "IDS-ready requires human verification of title, venue, canonical link, and relied-on passage",
  };
}

export function updateReferenceVerification(dossierPath, {
  paIds = [],
  notes = "",
  reviewer = "",
  verifiedAt = new Date().toISOString(),
  checks = {},
} = {}) {
  const dossier = JSON.parse(readFileSync(dossierPath, "utf8"));
  const selected = asList(paIds);
  const assignedIds = new Set((dossier.assigned_references || []).map((r) => r.pa_id).filter(Boolean));
  const missing = selected.filter((id) => !assignedIds.has(id));
  if (!selected.length) throw new Error("paIds must include at least one PA## id");
  if (missing.length) throw new Error(`selected PA id(s) not in dossier assigned_references: ${missing.join(", ")}`);
  if (!String(notes || "").trim()) throw new Error("notes are required for reference verification");

  const verification = idsVerificationStatus({
    ...checks,
    human_verified: true,
    reviewer,
    verified_at: verifiedAt,
  });
  dossier.assigned_references = (dossier.assigned_references || []).map((r) => (
    selected.includes(r.pa_id)
      ? { ...r, verification, verification_notes: String(notes).trim() }
      : r
  ));
  dossier.reference_verification_history = [
    ...(dossier.reference_verification_history || []),
    {
      pa_ids: selected,
      reviewer: String(reviewer || ""),
      verified_at: verifiedAt,
      notes: String(notes).trim(),
      verification,
    },
  ];
  writeFileSync(dossierPath, JSON.stringify(dossier, null, 2) + "\n");
  return dossier;
}

export function updateClosestArtSelection(dossierPath, {
  selectedPaIds = [],
  rationale = "",
  reviewer = "",
  verifiedAt = new Date().toISOString(),
  checks = {},
} = {}) {
  const dossier = JSON.parse(readFileSync(dossierPath, "utf8"));
  const selected = asList(selectedPaIds);
  const assignedIds = new Set((dossier.assigned_references || []).map((r) => r.pa_id).filter(Boolean));
  const missing = selected.filter((id) => !assignedIds.has(id));
  if (!selected.length) throw new Error("selectedPaIds must include at least one PA## id");
  if (missing.length) throw new Error(`selected PA id(s) not in dossier assigned_references: ${missing.join(", ")}`);
  if (!String(rationale || "").trim()) throw new Error("rationale is required for closest-art verification");

  const humanVerified = true;
  const verification = idsVerificationStatus({
    ...checks,
    human_verified: humanVerified,
    reviewer,
    verified_at: verifiedAt,
  });
  dossier.closest_art_selection = {
    human_verified: humanVerified,
    selected_pa_ids: selected,
    rationale: String(rationale).trim(),
    reviewer: String(reviewer || ""),
    verified_at: verifiedAt,
    verification,
  };
  dossier.assigned_references = (dossier.assigned_references || []).map((r) => (
    selected.includes(r.pa_id)
      ? { ...r, verification }
      : r
  ));
  writeFileSync(dossierPath, JSON.stringify(dossier, null, 2) + "\n");
  return dossier;
}

function candidateRecord(ref, extra = {}) {
  return {
    ...extra,
    ...refSummary(ref),
    score: ref?.score ?? null,
    rank_explanation: ref?.rank_explanation || ref?.rankExplanation || null,
    quote_handoff: quoteHandoff(ref),
    verification: idsVerificationStatus(),
  };
}

function analysisHandoff({ assigned = [], ranked = [] } = {}) {
  return {
    schema: "apa-search-to-patentability-handoff-v1",
    purpose: "Preserve quote/location candidates for /apa-analyze claim-chart cells; does not decide whether a limitation is taught.",
    candidate_cells: assigned.map((a) => {
      const ref = ranked.find((r) => String(r.docNumber || "") === String(a.docNumber || "")) || {};
      return {
        pa_id: a.paId,
        reference: a.docNumber || ref.docNumber || "",
        title: a.title || ref.title || "",
        appears_teaches: "unknown",
        ...quoteHandoff(ref),
      };
    }),
  };
}

function quoteHandoff(ref = {}) {
  const quote = oneLine(ref.snippet || ref.abstract || "");
  return {
    quote: quote || "not located",
    page_or_para: quote ? `${ref.source || "unknown"} abstract/snippet` : "not located",
    confidence: "unknown",
    human_verified: false,
  };
}

function coverageLimits(perSource) {
  const searched = new Set((perSource || []).filter((s) => !s.skipped && !s.error).map((s) => s.id));
  const sourceLimitRows = [
    {
      source_id: "uspto-pps",
      access_mode: "ui-only",
      status: searched.has("uspto-pps") ? "searched" : "unsearched",
      reason: "USPTO Patent Public Search is UI-only/human-handoff in APA; not automated.",
    },
    {
      source_id: "google-patents-ui",
      access_mode: "ui-restricted",
      status: searched.has("google-patents-ui") ? "searched" : "unsearched",
      reason: "Google Patents UI scraping is disabled by source-registry policy.",
    },
    {
      source_id: "paywalled-npl-full-text",
      access_mode: "paywalled/human-handoff",
      status: "unsearched",
      reason: "Crossref/arXiv metadata discovery is not full-text NPL coverage; paywalled literature and web literature remain human-handoff.",
    },
    {
      source_id: "foreign-patent-full-text",
      access_mode: "dataset/API-dependent",
      status: "unsearched",
      reason: "Foreign full-text coverage is not enabled in the USPTO-only v0.1 source set.",
    },
  ];
  return {
    search_complete_asserted: false,
    searched_source_ids: [...searched].sort(),
    known_unsearched_sources: sourceLimitRows.filter((r) => r.status === "unsearched"),
    source_errors_or_skips: (perSource || []).filter((s) => s.skipped || s.error).map((s) => ({
      source_id: s.id,
      status: s.skipped ? "skipped" : "error",
      reason: s.error || (s.notes || []).join("; ") || "not queried",
    })),
  };
}

function sourceLevelExclusions(perSource) {
  const excluded = [];
  for (const s of perSource || []) {
    if (s.skipped) {
      excluded.push({
        reason: "source-skipped",
        source_id: s.id,
        detail: (s.notes || []).join("; ") || "source not queried",
      });
    }
    if (s.error) {
      excluded.push({
        reason: "source-error",
        source_id: s.id,
        detail: s.error,
      });
    }
  }
  return excluded;
}

function safeSourceHealth(id) {
  try {
    return sourceHealth(id);
  } catch (err) {
    return {
      source_id: id || "",
      status: "unknown",
      access_mode: "unknown",
      implemented: false,
      configured: false,
      automation_ready: false,
      error: err && err.message ? err.message : String(err),
    };
  }
}

function asList(v) {
  if (Array.isArray(v)) return v.map(String).map((s) => s.trim()).filter(Boolean);
  return String(v || "").split(",").map((s) => s.trim()).filter(Boolean);
}

function oneLine(text) {
  return String(text == null ? "" : text).replace(/[\r\n\u2028\u2029]+/g, " ").trim();
}

export function writeSearchDossier(matterDir, opts) {
  const evidenceDir = join(matterDir, "evidence", "prior_art");
  mkdirSync(evidenceDir, { recursive: true });
  const dossier = buildSearchDossier(opts);
  const stamp = dossier.generated_at.replace(/[^0-9A-Za-z]+/g, "-").replace(/^-|-$/g, "");
  const path = join(evidenceDir, `search-dossier-${stamp}.json`);
  writeFileSync(path, JSON.stringify(dossier, null, 2) + "\n");
  return { path, dossier };
}

/** A reference/claim matrix SCAFFOLD (the g2tree "Blocks / Does-NOT-block" pattern) for human+agent completion. */
function renderReferenceMatrix(assigned) {
  const rows = assigned.map((a) => `| ${a.paId} | ${escapePipe(a.title || a.docNumber)} | _tbd_ | _(fill: claim language it blocks)_ | _(fill: what it does not reach)_ |`).join("\n");
  return [
    "# Reference matrix (scaffold)",
    "",
    "> Auto-seeded from a prior-art search. Each reference is UNVERIFIED and its blocking analysis is",
    "> empty - the patentability-analysis + hardened-verification steps and a human fill the `Blocks` /",
    "> `Does NOT block` columns. This is for patentability, NOT a freedom-to-operate opinion, and never",
    "> asserts \"no anticipating art found\".",
    "",
    "| Ref | Title | Tier | Blocks | Does NOT block |",
    "|---|---|---|---|---|",
    rows || "| _(none)_ | | | | |",
    "",
    "**Strongest examiner combination:** _(to be identified)_",
    "",
    "**Practical claim boundary:** _(to be identified)_",
    "",
  ].join("\n");
}

function escapePipe(s) { return String(s).replace(/\|/g, "\\|"); }
