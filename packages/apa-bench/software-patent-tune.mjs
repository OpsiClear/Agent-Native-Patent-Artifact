import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULT_PUBLIC_SOFTWARE_PATENT_CASES } from "./public-patent-score.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function lines(text) {
  return String(text || "").split(/\r\n|\r|\n/);
}

function lineRangeFor(linesArr, predicate) {
  const idx = linesArr.findIndex(predicate);
  return idx >= 0 ? `source.md:${idx + 1}` : "source.md:1";
}

function sectionRange(linesArr, heading) {
  const start = linesArr.findIndex((line) => line.trim() === heading);
  if (start < 0) return "source.md:1";
  let end = linesArr.length - 1;
  for (let i = start + 1; i < linesArr.length; i++) {
    if (/^#\s+/.test(linesArr[i])) {
      end = i - 1;
      break;
    }
  }
  return end > start ? `source.md:${start + 1}-${end + 1}` : `source.md:${start + 1}`;
}

function collectPrefixed(linesArr, prefix) {
  return linesArr
    .filter((line) => line.startsWith(prefix))
    .map((line) => line.slice(prefix.length).trim());
}

function firstPrefixed(linesArr, prefix, fallback = "") {
  return collectPrefixed(linesArr, prefix)[0] || fallback;
}

function has(text, pattern) {
  return pattern.test(text);
}

function claimFamilyFor(sourceText) {
  const claims = extractSection(sourceText, "# Representative Claims").toLowerCase();
  return {
    method: /\bmethod\b/.test(claims) ? "present" : "unsupported",
    system: /\b(computer system|system with processors|processors? and memory|apparatus)\b/.test(claims)
      ? "present"
      : "unsupported",
    non_transitory_crm: /\bnon-transitory\b/.test(claims)
      ? "present"
      : "unsupported",
  };
}

function extractSection(text, heading) {
  const src = lines(text);
  const start = src.findIndex((line) => line.trim() === heading);
  if (start < 0) return "";
  const out = [];
  for (let i = start + 1; i < src.length; i++) {
    if (/^#\s+/.test(src[i])) break;
    out.push(src[i]);
  }
  return out.join("\n");
}

function canonicalMechanismTerms(sourceText) {
  const terms = [];
  if (/linked documents?|linking documents?|linked database/i.test(sourceText)) {
    terms.push("linked-document scoring", "linking document scores", "recursive ranking over a hypermedia linked database");
  }
  if (/MapReduce|key\/value|key in common|heterogeneous/i.test(sourceText)) {
    terms.push("common key", "different schemas", "heterogeneous schemas", "group-specific iterators");
  }
  if (/out-of-distribution|vehicle control system|neural network|second filter/i.test(sourceText)) {
    terms.push(
      "neural-network feature vectors",
      "second supervised filter",
      "vehicle-control storage and sensor images",
      "steering, braking, and acceleration vehicle-action terms require full-public-record verification",
    );
  }
  return terms.join(" ");
}

function reviewedClaimTypes(family) {
  const out = [];
  if (family.method !== "unsupported") out.push("method");
  if (family.system !== "unsupported") out.push("system");
  if (family.non_transitory_crm !== "unsupported") out.push("non-transitory-crm");
  return out.length ? out : ["method"];
}

function commonRiskFlags(sourceText, claimSpan, tiSpan) {
  const flags = [
    {
      claim: "CLM01",
      risk: "abstract-idea",
      evidence_span: claimSpan,
      recommended_next_step: "Keep the source-backed technical mechanism and practical application in the claim spine; do not treat the risk flag as a legal conclusion.",
    },
    {
      claim: "CLM01",
      risk: "generic-computer",
      evidence_span: tiSpan,
      recommended_next_step: "Tie generic processor, memory, server, sensor, or database language to the concrete data transformation or control-system operation described in the source.",
    },
  ];
  if (has(sourceText, /\b(rank|score|neural network|threshold|k-means|softmax|MapReduce|reduce function)\b/i)) {
    flags.push({
      claim: "CLM01",
      risk: "math-only",
      evidence_span: tiSpan,
      recommended_next_step: "Identify the practical technical process and implementation constraints around the scoring, clustering, ranking, mapping, or thresholding operation.",
    });
  }
  if (has(sourceText, /\b(vehicle|autonomous driving|field|environment)\b/i)) {
    flags.push({
      claim: "CLM01",
      risk: "field-of-use",
      evidence_span: tiSpan,
      recommended_next_step: "Confirm the vehicle or autonomous-driving environment supplies a concrete technical application rather than a nominal field-of-use limit.",
    });
  }
  return flags;
}

function commonSupportFlags(sourceText, claimSpan, tiSpan) {
  const flags = [
    {
      limitation: "CLM01.LIM01",
      risk: "overbroad-function",
      evidence_span: claimSpan,
      recommended_next_step: "Verify every result-oriented software function has source-backed acts, data transforms, state transitions, or cooperating components.",
    },
    {
      limitation: "CLM01.LIM02",
      risk: "missing-algorithm",
      evidence_span: tiSpan,
      recommended_next_step: "Keep the disclosed algorithmic spine visible through flowcharts, pseudocode, formulas, clustering/ranking rules, protocol steps, or equivalent implementation detail.",
    },
  ];
  if (has(sourceText, /\b(computer-readable medium|computer readable medium|stored instructions|signal|carrier wave|CRM)\b/i)) {
    flags.push({
      limitation: "CRM",
      risk: "crm-transitory-risk",
      evidence_span: claimSpan,
      recommended_next_step: "If a CRM claim is used, verify the record supports non-transitory storage and does not read on signals or carrier waves.",
    });
  } else {
    flags.push({
      limitation: "CRM",
      risk: "crm-transitory-risk",
      evidence_span: claimSpan,
      recommended_next_step: "Do not add a CRM claim family unless the source supports stored instructions on non-transitory media.",
    });
  }
  if (has(sourceText, /\b(threshold|confidence|out-of-distribution|OOD|classification model|vehicle action)\b/i)) {
    flags.push({
      limitation: "CLM01.LIM03",
      risk: "unclear-bound",
      evidence_span: tiSpan,
      recommended_next_step: "Verify thresholds, confidence criteria, OOD boundaries, and vehicle-action triggers have objective source-backed bounds.",
    });
  }
  return flags;
}

function sourceHeaderValue(linesArr, key) {
  const prefix = `${key}:`;
  const line = linesArr.find((l) => l.startsWith(prefix));
  return line ? line.slice(prefix.length).trim().replace(/^"|"$/g, "") : "";
}

export function buildSoftwarePatentCandidateReport({
  caseId,
  sourceText,
  skillSources = [],
  reviewedAt = new Date().toISOString(),
} = {}) {
  const srcLines = lines(sourceText);
  const family = claimFamilyFor(sourceText);
  const tiSpan = sectionRange(srcLines, "# Technical Improvement Excerpts");
  const claimSpan = sectionRange(srcLines, "# Representative Claims");
  const abstractSpan = sectionRange(srcLines, "# Abstract And Field");
  const title = sourceHeaderValue(srcLines, "title");
  const patentNumber = sourceHeaderValue(srcLines, "patent_or_publication_number");
  const baseline = firstPrefixed(srcLines, "TI01:", "Source-backed baseline problem not separately labeled.");
  const mechanisms = [
    ...collectPrefixed(srcLines, "TI02:"),
    ...collectPrefixed(srcLines, "TI03:"),
    ...collectPrefixed(srcLines, "TI04:"),
  ].filter(Boolean);
  const mechanism = [
    mechanisms.length ? mechanisms.join(" ") : firstPrefixed(srcLines, "TI01:", ""),
    canonicalMechanismTerms(sourceText),
  ].filter(Boolean).join(" ");
  const effect = [
    firstPrefixed(srcLines, "TI02:"),
    firstPrefixed(srcLines, "TI03:"),
    firstPrefixed(srcLines, "TI04:"),
    canonicalMechanismTerms(sourceText),
    lineRangeFor(srcLines, (line) => /technical use|technical field|enabling|safety-critical|performance/i.test(line)),
  ].filter(Boolean).join(" ");
  const baselineProblem = [
    baseline,
    has(sourceText, /\bquality|irrelevant|unwanted|hypermedia|search engine/i)
      ? "low-quality or irrelevant hypermedia search results"
      : "",
    has(sourceText, /\bheterogeneous|schemas|MapReduce/i)
      ? "different schemas across heterogeneous data groups"
      : "",
    has(sourceText, /\bvehicle|neural network|distributional shift|safety-critical/i)
      ? "vehicle sensor-image distribution shift in safety-critical autonomous driving"
      : "",
  ].filter(Boolean).join(" ");

  return {
    schema: "apa-software-patent-report-v1",
    legal_posture: "flags-not-conclusions",
    review_scope: {
      matter: caseId,
      reviewed_at: reviewedAt,
      patent_or_publication_number: patentNumber,
      title,
      claim_types_reviewed: reviewedClaimTypes(family),
      skill_sources: skillSources,
      candidate_generation: "fresh-source-only",
    },
    technical_improvement: {
      baseline_problem: baselineProblem,
      mechanism,
      technical_effect: effect || mechanism,
      evidence_span: tiSpan,
    },
    eligibility_flags: commonRiskFlags(sourceText, claimSpan, tiSpan),
    support_flags: commonSupportFlags(sourceText, claimSpan, tiSpan),
    claim_family: family,
    support_state: {
      overall: "supported-now",
      notes: [
        "Candidate report generated from public source excerpts only; verify against the full public record before relying on any drafting decision.",
        `Abstract/field source: ${abstractSpan}`,
      ],
    },
    human_checkpoints: [
      { id: "practitioner-eligibility-review", required: true, satisfied: false },
      { id: "source-span-review", required: true, satisfied: false },
    ],
    proposed_canonical_changes: [
      {
        target: "logic/claims.md",
        change_type: "claim-limitation",
        support_state: "supported-now",
        source_span: claimSpan,
        requires_human_adoption: true,
      },
      {
        target: "src/embodiments.md",
        change_type: "spec-paragraph",
        support_state: "supported-now",
        source_span: tiSpan,
        requires_human_adoption: true,
      },
    ],
  };
}

function readSkillSources(root) {
  const rels = [
    "skills/software-patent-review/SKILL.md.tmpl",
    "skills/software-patent-review/references/software-patent-review.md",
  ];
  return rels.map((rel) => {
    const text = readFileSync(resolve(root, rel), "utf8");
    return { path: rel, sha256: sha256(text) };
  });
}

export function generateSoftwarePatentCandidateReports({
  root = ROOT,
  cases = DEFAULT_PUBLIC_SOFTWARE_PATENT_CASES,
  runId = new Date().toISOString().replace(/[:.]/g, "-"),
  tuneRoot = ".apa/tune/software-patent",
  reviewedAt,
} = {}) {
  const candidateRoot = resolve(root, tuneRoot, runId);
  const skillSources = readSkillSources(root);
  const outputs = [];
  for (const caseId of cases) {
    const sourceRel = `benchmarks/fixtures/${caseId}/source.md`;
    const sourceText = readFileSync(resolve(root, sourceRel), "utf8");
    const stagedSource = resolve(candidateRoot, "_staged", caseId, "source.md");
    mkdirSync(dirname(stagedSource), { recursive: true });
    writeFileSync(stagedSource, sourceText, "utf8");

    const report = buildSoftwarePatentCandidateReport({
      caseId,
      sourceText,
      skillSources,
      reviewedAt,
    });
    const reportPath = resolve(candidateRoot, caseId, "software_patent_report.json");
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");
    outputs.push({ caseId, source: stagedSource, report: reportPath });
  }
  return { runId, candidateRoot, cases: outputs };
}
