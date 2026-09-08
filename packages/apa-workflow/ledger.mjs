import {
  appendRunlog,
  buildRunlogEntry,
  currentRunlogHead,
  planRunlogAppend,
  validateRunlog,
} from "../apa-trace/runlog.mjs";
import { assertContract } from "../apa-core/contracts.mjs";
import { canonicalSha256 } from "../apa-core/canonical.mjs";
import { normalizeActor } from "../apa-core/store.mjs";
import { withMatterWriteLock } from "../apa-core/matter-lock.mjs";
import { commitMatterFiles } from "../apa-core/transaction.mjs";

export function commitWorkflowTransition(matterDir, options, writes) {
  const event = buildWorkflowEvent(options);
  const entry = buildRunlogEntry({ timestamp: event.timestamp, skill: "apa-workflow",
    ruleVersion: "apa-workflow-v2", workflowEvent: event, notes: [`workflow event ${event.type}`] });
  const ledgerWrites = planRunlogAppend(matterDir, entry, options.expectedHead);
  commitMatterFiles(matterDir, [...writes, ...ledgerWrites]);
  return { event, existing: false, head: currentRunlogHead(matterDir) };
}

export function workflowEvents(matterDir) {
  const runlog = validateRunlog(matterDir);
  if (!runlog.ok) {
    throw new Error(`runlog is invalid: ${runlog.errors.map((item) => item.message).join("; ")}`);
  }
  return runlog.entries
    .map((entry) => entry?.workflow_event)
    .filter(Boolean)
    .map((event) => assertContract("apa-workflow-event-v1", event));
}

export function findIdempotentEvent(matterDir, idempotencyKey) {
  return workflowEvents(matterDir)
    .find((event) => event.idempotency_key === idempotencyKey) || null;
}

export function buildWorkflowEvent({
  type,
  actor,
  idempotencyKey,
  expectedHead,
  payload = {},
  timestamp = new Date().toISOString(),
} = {}) {
  if (!/^[0-9a-f]{64}$/.test(String(expectedHead || ""))) {
    throw new Error("expectedHead must be the exact 64-character matter head");
  }
  if (String(idempotencyKey || "").length < 8) {
    throw new Error("idempotencyKey must contain at least 8 characters");
  }
  const normalizedActor = normalizeActor(actor);
  const payloadSha256 = canonicalSha256(payload);
  const event = {
    schema: "apa-workflow-event-v1",
    event_id: `evt_${canonicalSha256({
      type,
      actor: normalizedActor,
      idempotency_key: idempotencyKey,
      payload_sha256: payloadSha256,
    }).slice(0, 24)}`,
    type,
    timestamp,
    actor: normalizedActor,
    idempotency_key: idempotencyKey,
    expected_head: expectedHead,
    payload_sha256: payloadSha256,
    payload,
  };
  return assertContract(event.schema, event);
}

export function appendWorkflowEvent(matterDir, {
  type,
  actor,
  idempotencyKey,
  expectedHead,
  payload = {},
  humanCheckpoints = [],
  timestamp = new Date().toISOString(),
  lockHeld = false,
} = {}) {
  if (!lockHeld) {
    return withMatterWriteLock(
      matterDir,
      () => appendWorkflowEvent(matterDir, {
        type,
        actor,
        idempotencyKey,
        expectedHead,
        payload,
        humanCheckpoints,
        timestamp,
        lockHeld: true,
      }),
      { owner: `apa-workflow:${type || "event"}` },
    );
  }
  const event = buildWorkflowEvent({
    type,
    actor,
    idempotencyKey,
    expectedHead,
    payload,
    timestamp,
  });
  const existing = findIdempotentEvent(matterDir, idempotencyKey);
  if (existing) {
    if (
      existing.type !== type
      || existing.payload_sha256 !== event.payload_sha256
      || canonicalSha256(existing.actor) !== canonicalSha256(event.actor)
    ) {
      throw new Error(`idempotency key '${idempotencyKey}' was already used for a different event`);
    }
    return {
      event: existing,
      existing: true,
      head: currentRunlogHead(matterDir),
    };
  }
  const headBefore = currentRunlogHead(matterDir);
  if (headBefore.sha256 !== expectedHead) {
    throw new Error(`stale matter head: expected ${expectedHead}, current ${headBefore.sha256}`);
  }
  appendRunlog(matterDir, buildRunlogEntry({
    timestamp,
    skill: "apa-workflow",
    ruleVersion: "apa-workflow-v2",
    workflowEvent: event,
    humanCheckpoints,
    notes: [`workflow event ${type}`],
  }), {
    expectedHead,
    lockHeld: true,
  });
  return {
    event,
    existing: false,
    head: currentRunlogHead(matterDir),
  };
}

export function validateWorkflowLedger(matterDir) {
  const runlog = validateRunlog(matterDir);
  const errors = [...runlog.errors.map((error) => ({
    code: "RUNLOG_INVALID",
    path: `trace/runlog.jsonl:${error.line}`,
    message: error.message,
  }))];
  const idempotency = new Map();
  for (const [index, entry] of runlog.entries.entries()) {
    const event = entry?.workflow_event;
    if (!event) continue;
    try {
      assertContract("apa-workflow-event-v1", event);
      if (canonicalSha256(event.payload) !== event.payload_sha256) {
        errors.push({
          code: "WORKFLOW_PAYLOAD_HASH_MISMATCH",
          path: `trace/runlog.jsonl:${index + 1}`,
          message: "workflow payload digest differs",
        });
      }
      if (event.expected_head !== entry?.chain?.previous_sha256) {
        errors.push({
          code: "WORKFLOW_EXPECTED_HEAD_MISMATCH",
          path: `trace/runlog.jsonl:${index + 1}`,
          message: "workflow event expected head differs from its chained predecessor",
        });
      }
      if (event.type === "checkpoint-recorded") {
        const payload = event.payload || {};
        const recordedCheckpoint = Array.isArray(entry?.human_checkpoints)
          && entry.human_checkpoints.some((checkpoint) =>
            checkpoint?.id === payload.checkpoint_id
            && checkpoint?.required === true
            && checkpoint?.satisfied === true
            && checkpoint?.reviewer === payload.reviewer_id
          );
        const valid = (
          event.actor?.kind === "human"
          && /^apa-[a-z0-9-]+$/.test(String(payload.stage_id || ""))
          && String(payload.checkpoint_id || "").length > 0
          && payload.satisfied === true
          && payload.reviewer_id === event.actor.id
          && ["inventor", "pro_se", "registered_practitioner", "reviewer"].includes(payload.reviewer_role)
          && payload.reviewed_head === event.expected_head
          && recordedCheckpoint
        );
        if (!valid) {
          errors.push({
            code: "CHECKPOINT_EVENT_INVALID",
            path: `trace/runlog.jsonl:${index + 1}`,
            message: "checkpoint event must identify a human reviewer and bind satisfaction to its expected head",
          });
        }
      }
      const prior = idempotency.get(event.idempotency_key);
      if (prior && prior !== event.event_id) {
        errors.push({
          code: "IDEMPOTENCY_KEY_REUSED",
          path: `trace/runlog.jsonl:${index + 1}`,
          message: `idempotency key '${event.idempotency_key}' identifies multiple events`,
        });
      }
      idempotency.set(event.idempotency_key, event.event_id);
    } catch (error) {
      errors.push({
        code: "WORKFLOW_EVENT_INVALID",
        path: `trace/runlog.jsonl:${index + 1}`,
        message: error.message,
      });
    }
  }
  return { ok: errors.length === 0, errors };
}
