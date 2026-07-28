import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";

export const REVIEW_TARGET_CONTRACT = "apa-human-review-target-contract-v2";

const EXACT_TARGETS = [
  "PATENT.md",
  "logic/claims.md",
  "assembled/ADS.md",
  "assembled/IDS_SB08.md",
  "assembled/PREFLIGHT.md",
  "assembled/specification.html",
  "assembled/upload_manifest.json",
  "assembled/upload_set/MANIFEST.txt",
  "assembled/date_verification.json",
  "evidence/README.md",
];

const TARGET_TREES = [
  {
    dir: "evidence/drawings",
    include: (name) => /\.(?:md|svg|json|pdf)$/i.test(name),
  },
  {
    dir: "assembled",
    include: (name) => /\.(?:pdf|docx)$/i.test(name),
  },
  {
    dir: "correspondence",
    include: (name) => /\.(?:json|md|pdf)$/i.test(name),
  },
];

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const posixRelative = (root, path) => relative(root, path).replace(/\\/g, "/");
const isWithin = (root, candidate) => {
  const rel = relative(root, candidate);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
};

function listTreeFiles(root, rootReal, relDir, include, unsafePaths) {
  const base = join(root, ...relDir.split("/"));
  const baseStat = lstatSync(base, { throwIfNoEntry: false });
  if (!baseStat) return [];
  if (baseStat.isSymbolicLink() || !isWithin(rootReal, realpathSync(base))) {
    unsafePaths.push(relDir);
    return [];
  }
  if (!baseStat.isDirectory()) return [];
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) {
        unsafePaths.push(posixRelative(root, path));
      } else if (stat.isDirectory()) {
        walk(path);
      } else if (stat.isFile() && include(name)) {
        files.push(path);
      }
    }
  };
  walk(base);
  return files;
}

function countMatches(text, pattern) {
  return [...String(text || "").matchAll(pattern)].length;
}

function readTarget(root, rootReal, relPath) {
  const path = join(root, ...relPath.split("/"));
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (
    !stat
    || stat.isSymbolicLink()
    || !stat.isFile()
    || !isWithin(rootReal, realpathSync(path))
  ) {
    return "";
  }
  return readFileSync(path, "utf8");
}

export function buildReviewTargetFingerprint(matterDir) {
  const unsafePaths = [];
  const paths = [];
  const rootReal = realpathSync(matterDir);
  for (const relPath of EXACT_TARGETS) {
    const path = join(matterDir, ...relPath.split("/"));
    const stat = lstatSync(path, { throwIfNoEntry: false });
    if (!stat) continue;
    if (stat.isSymbolicLink() || !isWithin(rootReal, realpathSync(path))) unsafePaths.push(relPath);
    else if (stat.isFile()) paths.push(path);
  }
  for (const tree of TARGET_TREES) {
    paths.push(...listTreeFiles(matterDir, rootReal, tree.dir, tree.include, unsafePaths));
  }

  const records = [...new Set(paths)].map((path) => {
    const bytes = readFileSync(path);
    return {
      path: posixRelative(matterDir, path),
      bytes: bytes.length,
      sha256: sha256(bytes),
    };
  }).sort((a, b) => a.path.localeCompare(b.path));

  const claims = readTarget(matterDir, rootReal, "logic/claims.md");
  const ids = readTarget(matterDir, rootReal, "assembled/IDS_SB08.md");
  const evidenceIndex = readTarget(matterDir, rootReal, "evidence/README.md");
  const counts = {
    claims: countMatches(claims, /^###\s+CLM\d+\b/gm),
    ids_references: countMatches(ids, /^\d+\.\s+\[PA\d+\](?:\s|$)/gm),
    figures: countMatches(evidenceIndex, /^\|\s*FIG\d+\s*\|/gm),
    pdf_docx_files: records.filter((record) => /\.(?:pdf|docx)$/i.test(record.path)).length,
    correspondence_files: records.filter((record) => record.path.startsWith("correspondence/")).length,
    missing_parts_responses: records.filter((record) => /^correspondence\/response-\d+\.json$/i.test(record.path)).length,
  };
  const pdfTargets = records
    .filter((record) => /\.(?:pdf|docx)$/i.test(record.path))
    .map((record) => ({ ...record }));
  const serialized = [
    REVIEW_TARGET_CONTRACT,
    JSON.stringify(counts),
    ...records.map((record) => `${record.path}\0${record.bytes}\0${record.sha256}`),
  ].join("\n");

  return {
    schema: "apa-human-review-target-fingerprint-v1",
    contract: REVIEW_TARGET_CONTRACT,
    algorithm: "sha256",
    file_count: records.length,
    sha256: sha256(serialized),
    counts,
    pdf_targets: pdfTargets,
    files: records,
    unsafe_paths: unsafePaths.sort(),
  };
}

export function compareReviewTargetFingerprint(stored, matterDir) {
  const current = buildReviewTargetFingerprint(matterDir);
  const reasons = [];
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
    reasons.push("review record has no target fingerprint");
    return { ok: false, reasons, current };
  }
  if (stored.schema !== current.schema) reasons.push(`unsupported review fingerprint schema '${stored.schema || "missing"}'`);
  if (stored.contract !== current.contract) reasons.push("review target contract changed");
  if (stored.algorithm !== "sha256") reasons.push(`unsupported review fingerprint algorithm '${stored.algorithm || "missing"}'`);
  if (!Array.isArray(stored.files)) reasons.push("review fingerprint files must be an array");
  if (current.unsafe_paths.length) reasons.push(`unsafe linked review target(s): ${current.unsafe_paths.join(", ")}`);
  if (stored.sha256 !== current.sha256) reasons.push("review target digest differs");
  for (const [key, value] of Object.entries(current.counts)) {
    if (Number(stored.counts?.[key]) !== value) reasons.push(`${key} count differs`);
  }
  return { ok: reasons.length === 0, reasons, current };
}

export function requiredQuestionIds(queue) {
  return (Array.isArray(queue?.questions) ? queue.questions : [])
    .filter((question) => question?.requiredForReadiness === true)
    .map((question) => String(question.id || ""))
    .filter(Boolean);
}

export function unansweredRequiredQuestions(queue, answers) {
  const answered = new Set(
    (Array.isArray(answers?.answers) ? answers.answers : [])
      .map((answer) => String(answer?.id || ""))
      .filter(Boolean),
  );
  return requiredQuestionIds(queue).filter((id) => !answered.has(id));
}
