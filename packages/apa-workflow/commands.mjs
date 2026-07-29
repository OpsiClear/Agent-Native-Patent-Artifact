import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { canonicalSha256, sha256 } from "../apa-core/canonical.mjs";
import { withMatterWriteLock } from "../apa-core/matter-lock.mjs";
import {
  harnessPaths,
  initializeMatter,
  listArtifactEnvelopes,
  listProposals,
  loadMatterManifest,
  loadProposal,
  normalizeActor,
  storeArtifactRevision,
  storeDecision,
  storeProposal,
  storeSource,
  verifyHarnessStore,
} from "../apa-core/store.mjs";
import {
  RUNLOG_GENESIS_HASH,
  currentRunlogHead,
  humanCheckpoint,
  validateRunlog,
} from "../apa-trace/runlog.mjs";
import { loadSkillGraph } from "../apa-skillgraph/skillgraph.mjs";

import {
  appendWorkflowEvent,
  buildWorkflowEvent,
  findIdempotentEvent,
  validateWorkflowLedger,
  workflowEvents,
} from "./ledger.mjs";
import { workflowLoopPolicy } from "./definition.mjs";

const DEFAULT_STAGE_BY_ARTIFACT_TYPE = {
  claims: "apa-claims",
  specification: "apa-spec",
  drawings: "apa-figures",
  "drawing-set": "apa-figures",
  "search-dossier": "apa-priorart",
  patentability: "apa-analyze",
  "filing-package": "apa-assemble",
};
const REVIEWER_ROLES = new Set([
  "inventor",
  "pro_se",
  "registered_practitioner",
  "reviewer",
]);

export function initializeHarness(matterDir, {
  matterId,
  applicationType,
  jurisdiction,
  userRole,
  title,
  actor = { kind: "human", id: "local-user" },
  idempotencyKey,
  timestamp = new Date().toISOString(),
} = {}) {
  if (existsSync(harnessPaths(matterDir).manifest)) {
    const manifest = loadMatterManifest(matterDir);
    const existing = findIdempotentEvent(matterDir, idempotencyKey);
    if (!existing || existing.type !== "matter-initialized") {
      throw new Error("matter already exists and the idempotency key does not match its initialization");
    }
    if (
      manifest.matter_id !== matterId
      || manifest.application_type !== (applicationType || "provisional")
      || manifest.jurisdiction !== (jurisdiction || "USPTO")
      || manifest.user_role !== (userRole || "unknown")
    ) {
      throw new Error(`idempotency key '${idempotencyKey}' was already used for different matter metadata`);
    }
    return {
      manifest,
      event: existing,
      existing: true,
      head: currentRunlogHead(matterDir),
    };
  }
  buildWorkflowEvent({
    type: "matter-initialized",
    actor,
    idempotencyKey,
    expectedHead: RUNLOG_GENESIS_HASH,
    timestamp,
    payload: {
      matter_id: matterId,
      application_type: applicationType || "provisional",
      jurisdiction: jurisdiction || "USPTO",
      user_role: userRole || "unknown",
    },
  });
  const manifest = initializeMatter(matterDir, {
    matterId,
    applicationType,
    jurisdiction,
    userRole,
    title,
    createdAt: timestamp,
  });
  const appended = appendWorkflowEvent(matterDir, {
    type: "matter-initialized",
    actor,
    idempotencyKey,
    expectedHead: RUNLOG_GENESIS_HASH,
    timestamp,
    payload: {
      matter_id: manifest.matter_id,
      application_type: manifest.application_type,
      jurisdiction: manifest.jurisdiction,
      user_role: manifest.user_role,
    },
  });
  return { manifest, ...appended };
}

export function ingestSource(matterDir, {
  file,
  label,
  mediaType,
  actor = { kind: "human", id: "local-user" },
  idempotencyKey,
  expectedHead,
  timestamp = new Date().toISOString(),
} = {}) {
  return withMatterWriteLock(matterDir, () => {
    const existing = existingCommand(matterDir, idempotencyKey, "source-ingested");
    if (existing) {
      const sourceBytes = readFileSync(file);
      const recordPath = join(
        harnessPaths(matterDir).root,
        ...String(existing.event.payload.record_path).split("/"),
      );
      const record = JSON.parse(readFileSync(recordPath, "utf8"));
      const normalizedActor = normalizeActor(actor, "human");
      if (
        existing.event.payload.content_sha256 !== sha256(sourceBytes)
        || record.label !== String(label || record.original_name)
        || canonicalSha256(record.actor) !== canonicalSha256(normalizedActor)
      ) {
        throw new Error(`idempotency key '${idempotencyKey}' was already used for a different source ingestion`);
      }
      return { ...existing, record, recordPath, created: false };
    }
    assertExpectedHead(matterDir, expectedHead);
    const stored = storeSource(matterDir, {
      file,
      label,
      mediaType,
      actor,
      ingestedAt: timestamp,
    });
    const appended = appendWorkflowEvent(matterDir, {
      type: "source-ingested",
      actor,
      idempotencyKey,
      expectedHead,
      timestamp,
      lockHeld: true,
      payload: {
        source_id: stored.record.source_id,
        record_path: posixRelative(harnessPaths(matterDir).root, stored.recordPath),
        record_sha256: canonicalSha256(stored.record),
        content_sha256: stored.record.content.sha256,
      },
    });
    return { ...stored, ...appended };
  }, { owner: "apa-workflow:source-ingested" });
}

export function proposeArtifact(matterDir, {
  artifactId,
  artifactType,
  stageId = "",
  content,
  mediaType,
  inputs,
  actor,
  idempotencyKey,
  expectedHead,
  suggestedView,
  notes,
  timestamp = new Date().toISOString(),
} = {}) {
  const resolvedStageId = resolveProposalStage(stageId, artifactType);
  return withMatterWriteLock(matterDir, () => {
    const existing = existingCommand(matterDir, idempotencyKey, "proposal-created");
    if (existing) {
      const proposal = loadProposal(matterDir, existing.event.payload.proposal_id);
      const normalizedActor = normalizeActor(actor, "agent");
      const contentDigest = sha256(Buffer.isBuffer(content) ? content : Buffer.from(String(content ?? ""), "utf8"));
      if (
        proposal.artifact_id !== artifactId
        || proposal.artifact_type !== artifactType
        || String(proposal.stage_id || "") !== resolvedStageId
        || proposal.content.sha256 !== contentDigest
        || proposal.content.media_type !== (mediaType || "text/markdown")
        || canonicalSha256(proposal.inputs) !== canonicalSha256(inputs || [])
        || canonicalSha256(proposal.actor) !== canonicalSha256(normalizedActor)
      ) {
        throw new Error(`idempotency key '${idempotencyKey}' was already used for a different proposal`);
      }
      return {
        ...existing,
        proposal,
        proposalSha256: existing.event.payload.proposal_sha256,
      };
    }
    assertExpectedHead(matterDir, expectedHead);
    const normalizedActor = normalizeActor(actor, "agent");
    const stored = storeProposal(matterDir, {
      artifactId,
      artifactType,
      stageId: resolvedStageId,
      content,
      mediaType,
      inputs,
      actor: normalizedActor,
      idempotencyKey,
      suggestedView,
      notes,
      createdAt: timestamp,
    });
    const proposalSha256 = canonicalSha256(stored.proposal);
    const appended = appendWorkflowEvent(matterDir, {
      type: "proposal-created",
      actor: normalizedActor,
      idempotencyKey,
      expectedHead,
      timestamp,
      lockHeld: true,
      payload: {
        proposal_id: stored.proposal.proposal_id,
        proposal_sha256: proposalSha256,
        artifact_id: stored.proposal.artifact_id,
        artifact_type: stored.proposal.artifact_type,
        ...(stored.proposal.stage_id ? { stage_id: stored.proposal.stage_id } : {}),
        content_sha256: stored.proposal.content.sha256,
      },
    });
    return { ...stored, proposalSha256, ...appended };
  }, { owner: "apa-workflow:proposal-created" });
}

export function decideProposal(matterDir, {
  proposalId,
  outcome,
  reviewer,
  rationale,
  idempotencyKey,
  expectedHead,
  timestamp = new Date().toISOString(),
} = {}) {
  if (!["adopted", "rejected"].includes(outcome)) throw new Error("outcome must be adopted or rejected");
  const eventType = outcome === "adopted" ? "proposal-adopted" : "proposal-rejected";
  return withMatterWriteLock(matterDir, () => {
    const existing = existingCommand(matterDir, idempotencyKey, eventType);
    if (existing) {
      const result = existingDecisionResult(matterDir, existing);
      if (
        result.proposal.proposal_id !== proposalId
        || result.decision.outcome !== outcome
        || result.decision.reviewer.id !== String(reviewer?.id || "")
        || result.decision.reviewer.role !== String(reviewer?.role || "reviewer")
        || String(result.decision.rationale || "") !== String(rationale || "")
      ) {
        throw new Error(`idempotency key '${idempotencyKey}' was already used for a different review decision`);
      }
      return result;
    }
    assertExpectedHead(matterDir, expectedHead);
    const proposal = loadProposal(matterDir, proposalId);
    const priorDecision = workflowEvents(matterDir).find((event) =>
      ["proposal-adopted", "proposal-rejected"].includes(event.type)
      && event.payload.proposal_id === proposalId
    );
    if (priorDecision) {
      throw new Error(`proposal '${proposalId}' already has a ${priorDecision.type} decision`);
    }
    const storedDecision = storeDecision(matterDir, {
      proposal,
      outcome,
      reviewer,
      rationale,
      decidedAt: timestamp,
    });
    const storedArtifact = outcome === "adopted"
      ? storeArtifactRevision(matterDir, {
          proposal,
          decision: storedDecision.decision,
          adoptedAt: timestamp,
        })
      : null;
    const actor = {
      kind: "human",
      id: storedDecision.decision.reviewer.id,
    };
    const invalidates = outcome === "adopted" ? downstreamStages(proposal.stage_id) : [];
    const payload = {
      proposal_id: proposal.proposal_id,
      proposal_sha256: canonicalSha256(proposal),
      decision_id: storedDecision.decision.decision_id,
      decision_sha256: canonicalSha256(storedDecision.decision),
      outcome,
      reviewer_id: storedDecision.decision.reviewer.id,
      reviewer_role: storedDecision.decision.reviewer.role,
      ...(proposal.stage_id ? {
        stage_id: proposal.stage_id,
        ...(outcome === "adopted" ? { invalidates } : {}),
      } : {}),
      ...(storedArtifact ? {
        artifact_id: storedArtifact.envelope.artifact_id,
        artifact_revision: storedArtifact.envelope.revision,
        artifact_sha256: canonicalSha256(storedArtifact.envelope),
        artifact_record_path: posixRelative(harnessPaths(matterDir).root, storedArtifact.recordPath),
        content_sha256: storedArtifact.envelope.content.sha256,
      } : {}),
    };
    const appended = appendWorkflowEvent(matterDir, {
      type: eventType,
      actor,
      idempotencyKey,
      expectedHead,
      timestamp,
      lockHeld: true,
      payload,
    });
    return {
      proposal,
      ...storedDecision,
      ...(storedArtifact || {}),
      ...appended,
    };
  }, { owner: `apa-workflow:${eventType}` });
}

export function recordCheckpoint(matterDir, {
  stageId,
  checkpointId,
  reviewer,
  rationale,
  idempotencyKey,
  expectedHead,
  timestamp = new Date().toISOString(),
  graph = loadSkillGraph(),
} = {}) {
  const stage = workflowStage(graph, stageId);
  const checkpoint = String(checkpointId || "").trim();
  const allowed = stageBoundaryIds(stage);
  if (!allowed.includes(checkpoint)) {
    throw new Error(
      `checkpoint '${checkpoint}' is not declared for '${stage.id}'; expected one of: ${allowed.join(", ") || "(none)"}`,
    );
  }
  const normalizedReviewer = checkpointReviewer(reviewer);
  const normalizedRationale = String(rationale || "");
  if (normalizedRationale.length > 10_000) {
    throw new Error("checkpoint rationale must not exceed 10000 characters");
  }

  return withMatterWriteLock(matterDir, () => {
    const existing = existingCommand(matterDir, idempotencyKey, "checkpoint-recorded");
    if (existing) {
      const payload = existing.event.payload;
      if (
        payload.stage_id !== stage.id
        || payload.checkpoint_id !== checkpoint
        || payload.reviewer_id !== normalizedReviewer.id
        || payload.reviewer_role !== normalizedReviewer.role
        || payload.reviewed_head !== expectedHead
        || String(payload.rationale || "") !== normalizedRationale
      ) {
        throw new Error(`idempotency key '${idempotencyKey}' was already used for a different checkpoint`);
      }
      return {
        ...existing,
        checkpoint: payload,
      };
    }

    assertExpectedHead(matterDir, expectedHead);
    const payload = {
      stage_id: stage.id,
      checkpoint_id: checkpoint,
      satisfied: true,
      reviewer_id: normalizedReviewer.id,
      reviewer_role: normalizedReviewer.role,
      reviewed_head: expectedHead,
      ...(normalizedRationale ? { rationale: normalizedRationale } : {}),
    };
    const appended = appendWorkflowEvent(matterDir, {
      type: "checkpoint-recorded",
      actor: { kind: "human", id: normalizedReviewer.id },
      idempotencyKey,
      expectedHead,
      timestamp,
      lockHeld: true,
      payload,
      humanCheckpoints: [
        humanCheckpoint({
          id: checkpoint,
          required: true,
          satisfied: true,
          reviewer: normalizedReviewer.id,
          timestamp,
        }),
      ],
    });
    return {
      checkpoint: payload,
      ...appended,
    };
  }, { owner: "apa-workflow:checkpoint-recorded" });
}

export function requestLoop(matterDir, {
  from,
  to,
  actor,
  humanOverride = false,
  idempotencyKey,
  expectedHead,
  timestamp = new Date().toISOString(),
  graph = loadSkillGraph(),
} = {}) {
  const policy = workflowLoopPolicy(graph.registry, from, to);
  if (!policy) throw new Error(`workflow loop '${from}' -> '${to}' is not allowed`);
  const normalizedActor = normalizeActor(actor, humanOverride ? "human" : "tool");
  if (humanOverride && normalizedActor.kind !== "human") {
    throw new Error("a loop-cap override requires a human actor");
  }
  return withMatterWriteLock(matterDir, () => {
    const existing = findIdempotentEvent(matterDir, idempotencyKey);
    if (existing) {
      if (!["loop-requested", "loop-blocked"].includes(existing.type)) {
        throw new Error(`idempotency key '${idempotencyKey}' belongs to ${existing.type}`);
      }
      if (
        existing.payload.from !== from
        || existing.payload.to !== to
        || existing.payload.human_override !== Boolean(humanOverride)
        || canonicalSha256(existing.actor) !== canonicalSha256(normalizedActor)
      ) {
        throw new Error(`idempotency key '${idempotencyKey}' was already used for a different loop request`);
      }
      return { event: existing, existing: true, head: currentRunlogHead(matterDir) };
    }
    assertExpectedHead(matterDir, expectedHead);
    const prior = workflowEvents(matterDir).filter((event) =>
      event.type === "loop-requested"
      && event.payload.from === from
      && event.payload.to === to
    );
    const iteration = prior.length + 1;
    const allowed = iteration <= policy.max_iterations || humanOverride;
    const type = allowed ? "loop-requested" : "loop-blocked";
    const appended = appendWorkflowEvent(matterDir, {
      type,
      actor: normalizedActor,
      idempotencyKey,
      expectedHead,
      timestamp,
      lockHeld: true,
      payload: {
        from,
        to,
        iteration,
        max_iterations: policy.max_iterations,
        human_override: Boolean(humanOverride),
        allowed,
      },
    });
    return { ...appended, allowed, iteration, maxIterations: policy.max_iterations };
  }, { owner: "apa-workflow:loop" });
}

export function proposalQueue(matterDir) {
  const decisions = new Map(
    workflowEvents(matterDir)
      .filter((event) => ["proposal-adopted", "proposal-rejected"].includes(event.type))
      .map((event) => [event.payload.proposal_id, event]),
  );
  return listProposals(matterDir).map((proposal) => ({
    proposal,
    status: decisions.get(proposal.proposal_id)?.payload?.outcome || "pending",
    decision_event: decisions.get(proposal.proposal_id) || null,
  }));
}

export function currentArtifacts(matterDir) {
  const adopted = workflowEvents(matterDir).filter((event) => event.type === "proposal-adopted");
  const current = new Map();
  for (const event of adopted) current.set(event.payload.artifact_id, event);
  const envelopes = new Map(
    listArtifactEnvelopes(matterDir).map((envelope) => [
      `${envelope.artifact_id}:${envelope.revision}`,
      envelope,
    ]),
  );
  return [...current.values()].map((event) => ({
    event,
    envelope: envelopes.get(`${event.payload.artifact_id}:${event.payload.artifact_revision}`) || null,
  }));
}

export function harnessSummary(matterDir) {
  const manifest = loadMatterManifest(matterDir);
  const head = currentRunlogHead(matterDir);
  const queue = proposalQueue(matterDir);
  const artifacts = currentArtifacts(matterDir);
  return {
    schema: "apa-harness-summary-v1",
    matter: {
      matter_id: manifest.matter_id,
      jurisdiction: manifest.jurisdiction,
      application_type: manifest.application_type,
      user_role: manifest.user_role,
    },
    head,
    proposals: {
      total: queue.length,
      pending: queue.filter((item) => item.status === "pending").length,
      adopted: queue.filter((item) => item.status === "adopted").length,
      rejected: queue.filter((item) => item.status === "rejected").length,
    },
    current_artifacts: artifacts.map(({ envelope }) => envelope && ({
      artifact_id: envelope.artifact_id,
      artifact_type: envelope.artifact_type,
      revision: envelope.revision,
      content_sha256: envelope.content.sha256,
    })).filter(Boolean),
    submit_boundary: "APA does not sign, certify, pay, or file.",
  };
}

export function verifyHarness(matterDir) {
  const store = verifyHarnessStore(matterDir);
  const ledger = validateWorkflowLedger(matterDir);
  const errors = [...store.findings, ...ledger.errors];
  const runlog = validateRunlog(matterDir);
  if (runlog.ok) {
    for (const event of workflowEvents(matterDir)) {
      if (event.type === "proposal-created") {
        try {
          const proposal = loadProposal(matterDir, event.payload.proposal_id);
          if (canonicalSha256(proposal) !== event.payload.proposal_sha256) {
            throw new Error("proposal digest differs from workflow event");
          }
        } catch (error) {
          errors.push({
            code: "PROPOSAL_EVENT_INVALID",
            path: event.event_id,
            message: error.message,
          });
        }
      }
      if (event.type === "proposal-adopted") {
        const record = join(
          harnessPaths(matterDir).root,
          ...String(event.payload.artifact_record_path).split("/"),
        );
        if (!existsSync(record)) {
          errors.push({
            code: "ADOPTED_ARTIFACT_MISSING",
            path: event.payload.artifact_record_path,
            message: "adopted artifact record is missing",
          });
        } else {
          try {
            const envelope = JSON.parse(readFileSync(record, "utf8"));
            if (canonicalSha256(envelope) !== event.payload.artifact_sha256) {
              throw new Error("adopted artifact digest differs from workflow event");
            }
          } catch (error) {
            errors.push({
              code: "ADOPTED_ARTIFACT_INVALID",
              path: event.payload.artifact_record_path,
              message: error.message,
            });
          }
        }
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

function existingCommand(matterDir, idempotencyKey, expectedType) {
  const existing = findIdempotentEvent(matterDir, idempotencyKey);
  if (!existing) return null;
  if (existing.type !== expectedType) {
    throw new Error(`idempotency key '${idempotencyKey}' belongs to ${existing.type}`);
  }
  return { event: existing, existing: true, head: currentRunlogHead(matterDir) };
}

function existingDecisionResult(matterDir, existing) {
  const proposal = loadProposal(matterDir, existing.event.payload.proposal_id);
  const decisionPath = join(
    harnessPaths(matterDir).decisions,
    `${existing.event.payload.decision_id}.json`,
  );
  const decision = JSON.parse(readFileSync(decisionPath, "utf8"));
  const envelope = existing.event.type === "proposal-adopted"
    ? listArtifactEnvelopes(matterDir).find((item) =>
        item.artifact_id === existing.event.payload.artifact_id
        && item.revision === existing.event.payload.artifact_revision
      )
    : null;
  return { ...existing, proposal, decision, ...(envelope ? { envelope } : {}) };
}

function assertExpectedHead(matterDir, expectedHead) {
  if (!/^[0-9a-f]{64}$/.test(String(expectedHead || ""))) {
    throw new Error("expectedHead must be the exact 64-character matter head");
  }
  const current = currentRunlogHead(matterDir);
  if (current.sha256 !== expectedHead) {
    throw new Error(`stale matter head: expected ${expectedHead}, current ${current.sha256}`);
  }
}

function resolveProposalStage(stageId, artifactType, graph = loadSkillGraph()) {
  const requested = String(stageId || "").trim();
  const inferred = DEFAULT_STAGE_BY_ARTIFACT_TYPE[String(artifactType || "").trim().toLowerCase()] || "";
  const resolved = requested || inferred;
  if (!resolved) return "";
  return workflowStage(graph, resolved).id;
}

function downstreamStages(stageId, graph = loadSkillGraph()) {
  const source = String(stageId || "").trim();
  if (!source) return [];
  workflowStage(graph, source);

  const stages = allWorkflowStages(graph);
  const adjacency = new Map(stages.map((stage) => [stage.id, new Set()]));
  const allowedLoops = new Set(
    asArray(graph.registry?.allowed_loops)
      .map((loop) => `${loop?.from || ""}->${loop?.to || ""}`),
  );
  const addEdge = (from, to) => {
    if (!adjacency.has(from) || !adjacency.has(to)) return;
    if (allowedLoops.has(`${from}->${to}`)) return;
    adjacency.get(from).add(to);
  };
  for (const stage of stages) {
    for (const next of asArray(stage.downstream)) addEdge(stage.id, next);
    for (const previous of asArray(stage.upstream)) addEdge(previous, stage.id);
  }

  const invalidated = new Set();
  const queue = [...(adjacency.get(source) || [])];
  while (queue.length) {
    const current = queue.shift();
    if (!current || current === source || invalidated.has(current)) continue;
    invalidated.add(current);
    queue.push(...(adjacency.get(current) || []));
  }

  const order = asArray(graph.registry?.pipeline?.order);
  const position = new Map(order.map((id, index) => [id, index]));
  return [...invalidated].sort((left, right) => {
    const leftPosition = position.has(left) ? position.get(left) : Number.MAX_SAFE_INTEGER;
    const rightPosition = position.has(right) ? position.get(right) : Number.MAX_SAFE_INTEGER;
    return leftPosition - rightPosition || left.localeCompare(right);
  });
}

function allWorkflowStages(graph) {
  const stages = [...asArray(graph?.skills)];
  for (const domain of asArray(graph?.domains)) stages.push(...asArray(domain?.skills));
  const unique = new Map();
  for (const stage of stages) {
    if (stage?.id && !unique.has(stage.id)) unique.set(stage.id, stage);
  }
  return [...unique.values()];
}

function workflowStage(graph, stageId) {
  const normalized = String(stageId || "").trim();
  if (!/^apa-[a-z0-9-]+$/.test(normalized)) {
    throw new Error("stageId must identify an apa-* workflow stage");
  }
  const stage = allWorkflowStages(graph).find((candidate) => candidate.id === normalized);
  if (!stage) throw new Error(`workflow stage '${normalized}' does not exist`);
  return stage;
}

function stageBoundaryIds(stage) {
  return [
    ...asArray(stage?.human_checkpoints).map(String).filter(Boolean),
    ...asArray(stage?.gates_after)
      .map((id) => String(id || "").trim())
      .filter(Boolean)
      .map((id) => `gate:${id}`),
  ];
}

function checkpointReviewer(reviewer) {
  if (reviewer?.kind && reviewer.kind !== "human") {
    throw new Error("a checkpoint requires a human reviewer");
  }
  const id = String(reviewer?.id || "").trim();
  const role = String(reviewer?.role || "reviewer").trim();
  if (!id || id.length > 200) {
    throw new Error("checkpoint reviewer id must contain 1 to 200 characters");
  }
  if (!REVIEWER_ROLES.has(role)) {
    throw new Error(`checkpoint reviewer role must be one of: ${[...REVIEWER_ROLES].join(", ")}`);
  }
  return { kind: "human", id, role };
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function posixRelative(root, path) {
  return relative(root, path).replace(/\\/g, "/");
}
