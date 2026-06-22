import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DEFAULT_CASES = [
  "public-software-patent-pagerank",
  "public-software-patent-mapreduce",
  "public-software-patent-ood-vehicle",
];
const DEFAULT_THRESHOLD = 0.85;
const TUNING_FLOORS = {
  source_integrity: 1,
  technical_mechanism_coverage: 0.85,
  source_span_discipline: 0.9,
  legal_overclaim_avoidance: 1,
};

const WEIGHTS = {
  source_integrity: 20,
  report_shape: 10,
  technical_mechanism_coverage: 20,
  claim_family_accuracy: 15,
  risk_flag_coverage: 15,
  source_span_discipline: 10,
  legal_overclaim_avoidance: 10,
};

function relFixture(caseId) {
  return `benchmarks/fixtures/${caseId}`;
}

function jsonParseFinding(path, message) {
  return { severity: "blocking", path, dimension: "source_integrity", message };
}

function readText(root, rel, findings, label = rel) {
  const abs = resolve(root, rel);
  if (!existsSync(abs)) {
    findings.push({
      severity: "blocking",
      path: rel,
      dimension: "source_integrity",
      message: `${label} does not exist: ${rel}`,
    });
    return null;
  }
  try {
    return readFileSync(abs, "utf8");
  } catch (e) {
    findings.push({
      severity: "blocking",
      path: rel,
      dimension: "source_integrity",
      message: `could not read ${label}: ${e.message}`,
    });
    return null;
  }
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function valuesAtPath(obj, path) {
  const segments = String(path || "").split(".").filter(Boolean);
  let current = [obj];
  for (const segment of segments) {
    const arraySegment = segment.endsWith("[]");
    const key = arraySegment ? segment.slice(0, -2) : segment;
    const next = [];
    for (const value of current) {
      if (value === null || value === undefined) continue;
      const child = value[key];
      if (arraySegment) {
        if (Array.isArray(child)) next.push(...child);
      } else {
        next.push(child);
      }
    }
    current = next;
  }
  return current.filter((v) => v !== undefined && v !== null);
}

function latestRunReport(root, fixtureRel, runId, findings) {
  const runsRel = `${fixtureRel}/runs`;
  const runsAbs = resolve(root, runsRel);
  if (runId) {
    return `${runsRel}/${runId}/software_patent_report.json`;
  }
  if (!existsSync(runsAbs)) {
    findings.push({
      severity: "blocking",
      path: runsRel,
      dimension: "source_integrity",
      message: `fixture runs directory does not exist: ${runsRel}`,
    });
    return `${runsRel}/<missing>/software_patent_report.json`;
  }
  const dirs = readdirSync(runsAbs)
    .filter((name) => statSync(resolve(runsAbs, name)).isDirectory())
    .sort();
  if (dirs.length === 0) {
    findings.push({
      severity: "blocking",
      path: runsRel,
      dimension: "source_integrity",
      message: `fixture runs directory has no run directories: ${runsRel}`,
    });
    return `${runsRel}/<missing>/software_patent_report.json`;
  }
  return `${runsRel}/${dirs[dirs.length - 1]}/software_patent_report.json`;
}

function candidateReportPath(root, candidateRoot, caseId) {
  return resolve(root, candidateRoot, caseId, "software_patent_report.json");
}

function displayPath(root, path) {
  const rel = relative(root, resolve(root, path)).replace(/\\/g, "/");
  return rel && !rel.startsWith("..") ? rel : path;
}

function isFixtureRunPath(root, path) {
  const rel = displayPath(root, path);
  return rel.startsWith("benchmarks/fixtures/") && rel.includes("/runs/");
}

function ratio(passed, total) {
  if (total === 0) return 1;
  return passed / total;
}

function sourceIntegrityScore({ sourceText, expected, report, expectedText, reportText, sourceHashOk }) {
  const checks = [
    sourceText !== null,
    expectedText !== null,
    reportText !== null,
    expected !== null,
    report !== null,
    sourceHashOk,
  ];
  return ratio(checks.filter(Boolean).length, checks.length);
}

function scoreReportShape(report, findings) {
  if (!report) return 0;
  const checks = [
    ["schema", report.schema === "apa-software-patent-report-v1", "report schema must be apa-software-patent-report-v1"],
    ["legal_posture", report.legal_posture === "flags-not-conclusions", "report legal_posture must be flags-not-conclusions"],
    ["review_scope", Boolean(report.review_scope), "report must include review_scope"],
    ["technical_improvement", Boolean(report.technical_improvement), "report must include technical_improvement"],
    ["eligibility_flags", Array.isArray(report.eligibility_flags), "report must include eligibility_flags array"],
    ["support_flags", Array.isArray(report.support_flags), "report must include support_flags array"],
    ["claim_family", Boolean(report.claim_family), "report must include claim_family"],
    ["support_state", Boolean(report.support_state), "report must include support_state"],
    ["human_checkpoints", Array.isArray(report.human_checkpoints), "report must include human_checkpoints array"],
  ];
  for (const [path, ok, message] of checks) {
    if (!ok) {
      findings.push({
        severity: path === "schema" || path === "legal_posture" ? "blocking" : "warning",
        path,
        dimension: "report_shape",
        message,
      });
    }
  }
  return ratio(checks.filter(([, ok]) => ok).length, checks.length);
}

function scoreRequiredTerms(report, checks = [], findings) {
  let passed = 0;
  let total = 0;
  for (const check of checks) {
    const text = normalizeText(valuesAtPath(report, check.field).join(" "));
    for (const term of check.all || []) {
      total += 1;
      if (text.includes(normalizeText(term))) {
        passed += 1;
      } else {
        findings.push({
          severity: "warning",
          path: check.field,
          dimension: "technical_mechanism_coverage",
          message: `${check.id || check.field}: missing required term '${term}'`,
        });
      }
    }
    if (Array.isArray(check.any) && check.any.length > 0) {
      total += 1;
      if (check.any.some((term) => text.includes(normalizeText(term)))) {
        passed += 1;
      } else {
        findings.push({
          severity: "warning",
          path: check.field,
          dimension: "technical_mechanism_coverage",
          message: `${check.id || check.field}: missing any required term from [${check.any.join(", ")}]`,
        });
      }
    }
  }
  return ratio(passed, total);
}

function scoreClaimFamily(report, expected = {}, findings) {
  const actual = report?.claim_family || {};
  let passed = 0;
  const entries = Object.entries(expected);
  for (const [type, allowed] of entries) {
    const allowedValues = Array.isArray(allowed) ? allowed : [allowed];
    if (allowedValues.includes(actual[type])) {
      passed += 1;
    } else {
      findings.push({
        severity: "warning",
        path: `claim_family.${type}`,
        dimension: "claim_family_accuracy",
        message: `expected ${type} claim family to be one of [${allowedValues.join(", ")}], got ${JSON.stringify(actual[type])}`,
      });
    }
  }
  return ratio(passed, entries.length);
}

function scoreRiskFlags(report, checks = {}, findings) {
  const actualEligibility = new Set((report?.eligibility_flags || []).map((f) => f?.risk));
  const actualSupport = new Set((report?.support_flags || []).map((f) => f?.risk));
  const expectedEligibility = checks.required_eligibility_risks || [];
  const expectedSupport = checks.required_support_risks || [];
  let passed = 0;
  let total = expectedEligibility.length + expectedSupport.length;

  for (const risk of expectedEligibility) {
    if (actualEligibility.has(risk)) {
      passed += 1;
    } else {
      findings.push({
        severity: "warning",
        path: "eligibility_flags",
        dimension: "risk_flag_coverage",
        message: `missing expected eligibility risk '${risk}'`,
      });
    }
  }
  for (const risk of expectedSupport) {
    if (actualSupport.has(risk)) {
      passed += 1;
    } else {
      findings.push({
        severity: "warning",
        path: "support_flags",
        dimension: "risk_flag_coverage",
        message: `missing expected support risk '${risk}'`,
      });
    }
  }
  return ratio(passed, total);
}

function sourceLineCount(sourceText) {
  if (typeof sourceText !== "string") return 0;
  return sourceText.split(/\r\n|\r|\n/).length;
}

function spanIsValid(span, sourceLines) {
  const m = /^source\.md:(\d+)(?:-(\d+))?$/.exec(String(span || ""));
  if (!m) return false;
  const start = Number(m[1]);
  const end = Number(m[2] || m[1]);
  return start >= 1 && end >= start && end <= sourceLines;
}

function scoreEvidenceSpans(report, required = [], sourceText, findings) {
  const sourceLines = sourceLineCount(sourceText);
  let passed = 0;
  for (const path of required) {
    const values = valuesAtPath(report, path);
    const ok = values.length > 0 && values.every((v) => typeof v === "string" && spanIsValid(v, sourceLines));
    if (ok) {
      passed += 1;
    } else {
      findings.push({
        severity: "warning",
        path,
        dimension: "source_span_discipline",
        message: `missing or invalid source.md evidence span at ${path}`,
      });
    }
  }
  return ratio(passed, required.length);
}

function scoreLegalOverclaim(report, forbidden = [], findings) {
  const text = normalizeText(JSON.stringify(report || {}));
  const hits = forbidden.filter((term) => text.includes(normalizeText(term)));
  for (const term of hits) {
    findings.push({
      severity: "blocking",
      path: "software_patent_report.json",
      dimension: "legal_overclaim_avoidance",
      message: `report contains forbidden legal-conclusion phrase '${term}'`,
    });
  }
  return hits.length === 0 ? 1 : 0;
}

function weightedScore(dimensions) {
  let points = 0;
  let max = 0;
  for (const [name, weight] of Object.entries(WEIGHTS)) {
    max += weight;
    points += weight * (dimensions[name] ?? 0);
  }
  return { score_points: Number(points.toFixed(2)), max_points: max, score: Number((points / max).toFixed(4)) };
}

function floorFindings(dimensions) {
  const findings = [];
  for (const [dimension, floor] of Object.entries(TUNING_FLOORS)) {
    const actual = dimensions[dimension] ?? 0;
    if (actual < floor) {
      findings.push({
        severity: "blocking",
        path: "software_patent_report.json",
        dimension,
        message: `tuning floor failed: ${dimension} ${actual.toFixed(4)} < ${floor}`,
      });
    }
  }
  return findings;
}

export function scorePublicPatentFixture({
  root = ROOT,
  caseId,
  fixtureDir,
  runId,
  candidateRoot,
  enforceFloors = false,
} = {}) {
  const id = caseId || (fixtureDir ? fixtureDir.split(/[\\/]/).filter(Boolean).pop() : null);
  if (!id) throw new Error("scorePublicPatentFixture requires caseId or fixtureDir");

  const fixtureRel = fixtureDir || relFixture(id);
  const findings = [];
  const sourceRel = `${fixtureRel}/source.md`;
  const expectedRel = `${fixtureRel}/expected.json`;
  const reportRel = candidateRoot
    ? candidateReportPath(root, candidateRoot, id)
    : latestRunReport(root, fixtureRel, runId, findings);

  const sourceText = readText(root, sourceRel, findings, "source.md");
  const expectedText = readText(root, expectedRel, findings, "expected.json");
  const reportText = readText(root, reportRel, findings, "software_patent_report.json");
  let expected = null;
  let report = null;
  if (expectedText !== null) {
    try {
      expected = JSON.parse(expectedText);
    } catch (e) {
      findings.push(jsonParseFinding(expectedRel, `expected.json is invalid JSON: ${e.message}`));
    }
  }
  if (reportText !== null) {
    try {
      report = JSON.parse(reportText);
    } catch (e) {
      findings.push(jsonParseFinding(reportRel, `software_patent_report.json is invalid JSON: ${e.message}`));
    }
  }

  let sourceHashOk = false;
  if (sourceText !== null && expected?.source_hash) {
    const actualHash = sha256(sourceText);
    sourceHashOk = actualHash === expected.source_hash;
    if (!sourceHashOk) {
      findings.push({
        severity: "blocking",
        path: expectedRel,
        dimension: "source_integrity",
        message: `source_hash mismatch: expected ${expected.source_hash}, got ${actualHash}`,
      });
    }
  } else if (expected) {
    findings.push({
      severity: "blocking",
      path: expectedRel,
      dimension: "source_integrity",
      message: "expected.json is missing source_hash",
    });
  }

  if (expected?.case_id && expected.case_id !== id) {
    findings.push({
      severity: "blocking",
      path: expectedRel,
      dimension: "source_integrity",
      message: `expected case_id '${expected.case_id}' does not match fixture id '${id}'`,
    });
  }

  const checks = expected?.checks || {};
  const dimensions = {
    source_integrity: sourceIntegrityScore({ sourceText, expected, report, expectedText, reportText, sourceHashOk }),
    report_shape: scoreReportShape(report, findings),
    technical_mechanism_coverage: scoreRequiredTerms(report, checks.required_terms || [], findings),
    claim_family_accuracy: scoreClaimFamily(report, checks.required_claim_family || {}, findings),
    risk_flag_coverage: scoreRiskFlags(report, checks, findings),
    source_span_discipline: scoreEvidenceSpans(report, checks.required_evidence_spans || [], sourceText, findings),
    legal_overclaim_avoidance: scoreLegalOverclaim(report, checks.forbidden_legal_conclusion_terms || [], findings),
  };
  if (enforceFloors) {
    findings.push(...floorFindings(dimensions));
    if (!candidateRoot) {
      findings.push({
        severity: "blocking",
        path: reportRel,
        dimension: "source_integrity",
        message: "tuning mode requires a fresh candidateRoot outside committed fixture runs",
      });
    } else if (isFixtureRunPath(root, reportRel)) {
      findings.push({
        severity: "blocking",
        path: reportRel,
        dimension: "source_integrity",
        message: "candidate reports must not be read from benchmarks/fixtures/**/runs",
      });
    }
  }
  const score = weightedScore(dimensions);
  const blockingFailures = findings.filter((f) => f.severity === "blocking").length;
  const warningCount = findings.filter((f) => f.severity === "warning").length;

  return {
    id,
    source_class: expected?.source_class || "public_patent",
    target_skill: "apa-software-patent",
    mode: candidateRoot ? "fresh-candidate" : "offline-fixture",
    status: blockingFailures ? "fail" : "pass",
    fixture: fixtureRel,
    report: displayPath(root, reportRel),
    score: score.score,
    score_points: score.score_points,
    max_points: score.max_points,
    dimensions,
    blocking_failures: blockingFailures,
    warning_count: warningCount,
    findings,
  };
}

export function scorePublicSoftwarePatentFixtures({
  root = ROOT,
  cases = DEFAULT_CASES,
  runId,
  candidateRoot,
  enforceFloors = false,
  threshold = DEFAULT_THRESHOLD,
} = {}) {
  const results = cases.map((caseId) => scorePublicPatentFixture({
    root,
    caseId,
    runId,
    candidateRoot,
    enforceFloors,
  }));
  const averageScore = results.length
    ? Number((results.reduce((sum, c) => sum + c.score, 0) / results.length).toFixed(4))
    : 0;
  const blockingFailures = results.reduce((sum, c) => sum + c.blocking_failures, 0);
  const warningCount = results.reduce((sum, c) => sum + c.warning_count, 0);
  const belowThreshold = results.filter((c) => c.score < threshold);
  const status = blockingFailures === 0 && averageScore >= threshold ? "pass" : "fail";
  return {
    schema: "apa-real-public-patent-score-v1",
    generated_at: new Date().toISOString(),
    mode: candidateRoot ? "fresh-candidate" : "offline-fixture",
    status,
    ok: status === "pass",
    threshold,
    metrics: {
      cases: results.length,
      average_score: averageScore,
      blocking_failures: blockingFailures,
      warning_count: warningCount,
      below_threshold: belowThreshold.length,
      candidate_source: candidateRoot ? displayPath(root, candidateRoot) : "benchmarks/fixtures/**/runs",
    },
    cases: results,
  };
}

export function formatPublicPatentScore(summary) {
  const lines = [
    `real-software-patents: ${summary.status} score=${summary.metrics.average_score.toFixed(2)} cases=${summary.metrics.cases} blocking=${summary.metrics.blocking_failures}`,
  ];
  for (const c of summary.cases) {
    lines.push(`  ${c.status === "pass" ? "ok" : "FAIL"} - ${c.id} score=${c.score.toFixed(2)}`);
    for (const f of c.findings) lines.push(`    ${f.severity}: ${f.message}`);
  }
  return lines.join("\n");
}

export const DEFAULT_PUBLIC_SOFTWARE_PATENT_CASES = DEFAULT_CASES;
