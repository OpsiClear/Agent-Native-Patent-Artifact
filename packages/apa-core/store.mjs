import {
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

import { assertContract, validateContract } from "./contracts.mjs";
import { canonicalJson, canonicalSha256, sha256 } from "./canonical.mjs";

const FORBIDDEN_ARTIFACT_TYPES = new Set([
  "signature",
  "certification",
  "fee-payment",
  "filing-submission",
]);

export function harnessPaths(matterDir) {
  const root = resolve(matterDir);
  return {
    root,
    manifest: join(root, "matter.yaml"),
    sourceObjects: join(root, "sources", "objects"),
    sourceRecords: join(root, "sources", "records"),
    draftObjects: join(root, "drafts", "objects"),
    artifactRecords: join(root, "drafts", "records"),
    proposals: join(root, "reviews", "proposals"),
    decisions: join(root, "reviews", "decisions"),
    trace: join(root, "trace"),
  };
}

export function initializeMatter(matterDir, {
  matterId,
  applicationType = "provisional",
  jurisdiction = "USPTO",
  userRole = "unknown",
  title = "",
  createdAt = new Date().toISOString(),
} = {}) {
  const paths = harnessPaths(matterDir);
  mkdirSync(paths.root, { recursive: true });
  if (existsSync(paths.manifest)) throw new Error("matter.yaml already exists");
  const manifest = {
    schema: "apa-matter-v1",
    matter_id: matterId,
    jurisdiction,
    application_type: applicationType,
    user_role: userRole,
    ...(title ? { title } : {}),
    created_at: createdAt,
  };
  assertContract(manifest.schema, manifest);
  for (const path of [
    paths.sourceObjects,
    paths.sourceRecords,
    paths.draftObjects,
    paths.artifactRecords,
    paths.proposals,
    paths.decisions,
    paths.trace,
  ]) {
    mkdirSync(path, { recursive: true });
  }
  writeExclusive(paths.manifest, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export function loadMatterManifest(matterDir) {
  const { manifest } = harnessPaths(matterDir);
  if (!existsSync(manifest)) throw new Error("matter.yaml is missing; run `apa init` first");
  let parsed;
  try {
    // JSON is a strict YAML subset. Keeping the manifest in this subset gives every host the same
    // deterministic parser while retaining the intended matter.yaml name.
    parsed = JSON.parse(readFileSync(manifest, "utf8"));
  } catch (error) {
    throw new Error(`matter.yaml must use the canonical JSON-compatible YAML form: ${error.message}`);
  }
  return assertContract("apa-matter-v1", parsed);
}

export function normalizeActor(actor, defaultKind = "tool") {
  const value = typeof actor === "string" ? { kind: defaultKind, id: actor } : { ...(actor || {}) };
  if (!value.kind) value.kind = defaultKind;
  if (!value.id) throw new Error("actor.id is required");
  return value;
}

export function assertArtifactTypeAllowed(artifactType) {
  const value = String(artifactType || "").trim();
  if (FORBIDDEN_ARTIFACT_TYPES.has(value)) {
    throw new Error(`artifact type '${value}' is human-only and cannot be created by APA`);
  }
  return value;
}

export function storeSource(matterDir, {
  file,
  label,
  mediaType = "application/octet-stream",
  actor,
  ingestedAt = new Date().toISOString(),
} = {}) {
  const paths = harnessPaths(matterDir);
  loadMatterManifest(matterDir);
  const sourcePath = resolve(file || "");
  if (!existsSync(sourcePath) || !statSync(sourcePath).isFile()) throw new Error("source file does not exist");
  const bytes = readFileSync(sourcePath);
  const digest = sha256(bytes);
  const sourceId = `src_${canonicalSha256({
    sha256: digest,
    label: String(label || basename(sourcePath)),
    original_name: basename(sourcePath),
  }).slice(0, 24)}`;
  const objectPath = join(paths.sourceObjects, digest);
  writeContentAddressed(objectPath, bytes, digest);
  const record = {
    schema: "apa-source-record-v1",
    source_id: sourceId,
    label: String(label || basename(sourcePath)),
    original_name: basename(sourcePath),
    content: {
      sha256: digest,
      bytes: bytes.length,
      media_type: mediaType,
      object_path: posixRelative(paths.root, objectPath),
    },
    actor: normalizeActor(actor),
    ingested_at: ingestedAt,
  };
  assertContract(record.schema, record);
  const recordPath = join(paths.sourceRecords, `${sourceId}.json`);
  const created = writeImmutableJson(recordPath, record);
  return { record, recordPath, created };
}

export function storeProposal(matterDir, {
  artifactId,
  artifactType,
  stageId = "",
  content,
  mediaType = "text/markdown",
  inputs = [],
  actor,
  idempotencyKey,
  suggestedView = "",
  notes = "",
  createdAt = new Date().toISOString(),
} = {}) {
  const paths = harnessPaths(matterDir);
  const matter = loadMatterManifest(matterDir);
  const type = assertArtifactTypeAllowed(artifactType);
  const bytes = Buffer.isBuffer(content) ? content : Buffer.from(String(content ?? ""), "utf8");
  const digest = sha256(bytes);
  const objectPath = join(paths.draftObjects, digest);
  writeContentAddressed(objectPath, bytes, digest);
  const normalizedActor = normalizeActor(actor, "agent");
  const seed = {
    matter_id: matter.matter_id,
    artifact_id: artifactId,
    artifact_type: type,
    ...(stageId ? { stage_id: stageId } : {}),
    content_sha256: digest,
    inputs,
    actor: normalizedActor,
    idempotency_key: idempotencyKey,
  };
  const proposalId = `prop_${canonicalSha256(seed).slice(0, 24)}`;
  const proposal = {
    schema: "apa-artifact-proposal-v1",
    proposal_id: proposalId,
    matter_id: matter.matter_id,
    artifact_id: artifactId,
    artifact_type: type,
    ...(stageId ? { stage_id: stageId } : {}),
    content: {
      sha256: digest,
      bytes: bytes.length,
      media_type: mediaType,
      object_path: posixRelative(paths.root, objectPath),
    },
    inputs,
    actor: normalizedActor,
    created_at: createdAt,
    idempotency_key: idempotencyKey,
    ...(suggestedView ? { suggested_view: normalizeRelativePath(suggestedView) } : {}),
    ...(notes ? { notes } : {}),
  };
  assertContract(proposal.schema, proposal);
  const proposalPath = join(paths.proposals, `${proposalId}.json`);
  const created = writeImmutableJson(proposalPath, proposal);
  return { proposal, proposalPath, created };
}

export function loadProposal(matterDir, proposalId) {
  assertSafeId(proposalId, /^prop_[0-9a-f]{24}$/);
  const path = join(harnessPaths(matterDir).proposals, `${proposalId}.json`);
  if (!existsSync(path)) throw new Error(`proposal '${proposalId}' does not exist`);
  const proposal = JSON.parse(readFileSync(path, "utf8"));
  assertContract("apa-artifact-proposal-v1", proposal);
  verifyContentRecord(matterDir, proposal.content);
  return proposal;
}

export function proposalForReview(matterDir, proposalId, { maxBytes = 2_000_000 } = {}) {
  const proposal = loadProposal(matterDir, proposalId);
  if (proposal.content.bytes > maxBytes) {
    throw new Error(`proposal content exceeds the ${maxBytes}-byte local review limit`);
  }
  const path = safeMatterPath(harnessPaths(matterDir).root, proposal.content.object_path);
  const bytes = readFileSync(path);
  const textual = /^(?:text\/|application\/(?:json|xml|yaml))/.test(proposal.content.media_type);
  return {
    proposal,
    content: textual ? bytes.toString("utf8") : bytes.toString("base64"),
    content_encoding: textual ? "utf8" : "base64",
  };
}

export function storeDecision(matterDir, {
  proposal,
  outcome,
  reviewer,
  rationale = "",
  decidedAt = new Date().toISOString(),
} = {}) {
  const paths = harnessPaths(matterDir);
  const proposalDigest = canonicalSha256(proposal);
  const normalizedReviewer = {
    kind: "human",
    id: String(reviewer?.id || ""),
    role: String(reviewer?.role || "reviewer"),
  };
  const decisionId = `dec_${canonicalSha256({
    proposal_id: proposal.proposal_id,
    proposal_sha256: proposalDigest,
    outcome,
    reviewer: normalizedReviewer,
  }).slice(0, 24)}`;
  const decision = {
    schema: "apa-review-decision-v1",
    decision_id: decisionId,
    proposal_id: proposal.proposal_id,
    proposal_sha256: proposalDigest,
    outcome,
    reviewer: normalizedReviewer,
    decided_at: decidedAt,
    ...(rationale ? { rationale } : {}),
  };
  assertContract(decision.schema, decision);
  const decisionPath = join(paths.decisions, `${decisionId}.json`);
  const created = writeImmutableJson(decisionPath, decision);
  return { decision, decisionPath, created };
}

export function storeArtifactRevision(matterDir, {
  proposal,
  decision,
  adoptedAt = decision?.decided_at || new Date().toISOString(),
} = {}) {
  if (decision?.outcome !== "adopted") throw new Error("only an adopted decision can create an artifact revision");
  if (decision.proposal_id !== proposal.proposal_id) throw new Error("decision does not match proposal");
  const proposalDigest = canonicalSha256(proposal);
  if (decision.proposal_sha256 !== proposalDigest) throw new Error("decision proposal digest does not match");
  const paths = harnessPaths(matterDir);
  const artifactDir = join(paths.artifactRecords, proposal.artifact_id);
  mkdirSync(artifactDir, { recursive: true });
  const existing = readdirSync(artifactDir)
    .filter((name) => /^r\d{6}\.json$/.test(name))
    .sort();
  for (const name of existing) {
    const prior = JSON.parse(readFileSync(join(artifactDir, name), "utf8"));
    assertContract("apa-artifact-envelope-v1", prior);
    if (prior.decision_id === decision.decision_id) {
      return { envelope: prior, recordPath: join(artifactDir, name), created: false };
    }
  }
  const revision = existing.length
    ? Number(existing.at(-1).slice(1, 7)) + 1
    : 1;
  const envelope = {
    schema: "apa-artifact-envelope-v1",
    artifact_id: proposal.artifact_id,
    artifact_type: proposal.artifact_type,
    revision,
    status: "adopted",
    content: proposal.content,
    inputs: proposal.inputs,
    source_proposal_id: proposal.proposal_id,
    decision_id: decision.decision_id,
    provenance: {
      actor: proposal.actor,
      proposal_sha256: proposalDigest,
    },
    adopted_at: adoptedAt,
    ...(proposal.suggested_view ? { suggested_view: proposal.suggested_view } : {}),
  };
  assertContract(envelope.schema, envelope);
  const recordPath = join(artifactDir, `r${String(revision).padStart(6, "0")}.json`);
  writeImmutableJson(recordPath, envelope);
  return { envelope, recordPath, created: true };
}

export function listProposals(matterDir) {
  const paths = harnessPaths(matterDir);
  if (!existsSync(paths.proposals)) return [];
  return readdirSync(paths.proposals)
    .filter((name) => /^prop_[0-9a-f]{24}\.json$/.test(name))
    .sort()
    .map((name) => {
      const value = JSON.parse(readFileSync(join(paths.proposals, name), "utf8"));
      assertContract("apa-artifact-proposal-v1", value);
      return value;
    });
}

export function listArtifactEnvelopes(matterDir) {
  const root = harnessPaths(matterDir).artifactRecords;
  if (!existsSync(root)) return [];
  const out = [];
  for (const artifactId of readdirSync(root).sort()) {
    const dir = join(root, artifactId);
    if (!lstatSync(dir).isDirectory() || lstatSync(dir).isSymbolicLink()) continue;
    for (const name of readdirSync(dir).filter((item) => /^r\d{6}\.json$/.test(item)).sort()) {
      const value = JSON.parse(readFileSync(join(dir, name), "utf8"));
      assertContract("apa-artifact-envelope-v1", value);
      out.push(value);
    }
  }
  return out;
}

export function verifyHarnessStore(matterDir) {
  const findings = [];
  const checkRecordDir = (dir, contract) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir).filter((item) => item.endsWith(".json")).sort()) {
      const path = join(dir, name);
      try {
        const value = JSON.parse(readFileSync(path, "utf8"));
        const result = validateContract(contract, value);
        if (!result.ok) {
          for (const error of result.errors) findings.push({
            code: "CONTRACT_INVALID",
            path: posixRelative(harnessPaths(matterDir).root, path),
            message: `${error.path}: ${error.message}`,
          });
        } else if (value.content) {
          verifyContentRecord(matterDir, value.content);
        }
      } catch (error) {
        findings.push({
          code: "RECORD_INVALID",
          path: posixRelative(harnessPaths(matterDir).root, path),
          message: error.message,
        });
      }
    }
  };
  try {
    loadMatterManifest(matterDir);
  } catch (error) {
    findings.push({ code: "MATTER_INVALID", path: "matter.yaml", message: error.message });
  }
  const paths = harnessPaths(matterDir);
  checkRecordDir(paths.sourceRecords, "apa-source-record-v1");
  checkRecordDir(paths.proposals, "apa-artifact-proposal-v1");
  checkRecordDir(paths.decisions, "apa-review-decision-v1");
  for (const envelope of listArtifactEnvelopesSafe(matterDir, findings)) {
    try {
      verifyContentRecord(matterDir, envelope.content);
    } catch (error) {
      findings.push({
        code: "CONTENT_INVALID",
        path: `drafts/records/${envelope.artifact_id}/r${String(envelope.revision).padStart(6, "0")}.json`,
        message: error.message,
      });
    }
  }
  return { ok: findings.length === 0, findings };
}

export function verifyContentRecord(matterDir, content) {
  const root = harnessPaths(matterDir).root;
  const path = safeMatterPath(root, content.object_path);
  if (!existsSync(path) || !statSync(path).isFile()) throw new Error(`content object is missing: ${content.object_path}`);
  const bytes = readFileSync(path);
  if (bytes.length !== content.bytes) throw new Error(`content byte count differs: ${content.object_path}`);
  if (sha256(bytes) !== content.sha256) throw new Error(`content digest differs: ${content.object_path}`);
  return true;
}

function listArtifactEnvelopesSafe(matterDir, findings) {
  try {
    return listArtifactEnvelopes(matterDir);
  } catch (error) {
    findings.push({ code: "ARTIFACT_RECORD_INVALID", path: "drafts/records", message: error.message });
    return [];
  }
}

function safeMatterPath(root, relPath) {
  const normalized = normalizeRelativePath(relPath);
  const candidate = resolve(root, ...normalized.split("/"));
  const rel = relative(root, candidate);
  if (rel === ".." || rel.startsWith(`..${sep}`)) throw new Error("matter-relative path escapes matter root");
  return candidate;
}

function normalizeRelativePath(value) {
  const normalized = String(value || "").replace(/\\/g, "/").replace(/^\.\//, "");
  if (
    !normalized
    || normalized.startsWith("/")
    || /^[A-Za-z]:/.test(normalized)
    || normalized.split("/").includes("..")
    || normalized.includes("\0")
  ) {
    throw new Error("path must be a safe matter-relative POSIX path");
  }
  return normalized;
}

function assertSafeId(value, pattern) {
  if (!pattern.test(String(value || ""))) throw new Error("unsafe record identifier");
}

function posixRelative(root, path) {
  return relative(root, path).replace(/\\/g, "/");
}

function writeContentAddressed(path, bytes, expectedDigest) {
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path)) {
    if (!statSync(path).isFile() || sha256(readFileSync(path)) !== expectedDigest) {
      throw new Error("content-addressed object path contains different bytes");
    }
    return false;
  }
  writeExclusive(path, bytes);
  return true;
}

function writeImmutableJson(path, value) {
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path)) {
    const prior = JSON.parse(readFileSync(path, "utf8"));
    if (canonicalJson(prior) !== canonicalJson(value)) {
      throw new Error(`immutable record already exists with different content: ${basename(path)}`);
    }
    return false;
  }
  writeExclusive(path, serialized);
  return true;
}

function writeExclusive(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  const fd = openSync(path, "wx", 0o600);
  try {
    writeFileSync(fd, data);
  } finally {
    closeSync(fd);
  }
}

export function writeJsonAtomic(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    renameSync(temp, path);
  } finally {
    rmSync(temp, { force: true });
  }
}
