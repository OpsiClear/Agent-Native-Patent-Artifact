import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { harnessPaths } from "../../apa-core/store.mjs";
import { RUNLOG_GENESIS_HASH, currentRunlogHead } from "../../apa-trace/runlog.mjs";
import { planPipeline } from "../../apa-run/runner.mjs";
import {
  currentArtifacts,
  decideProposal,
  harnessSummary,
  ingestSource,
  initializeHarness,
  proposalQueue,
  proposeArtifact,
  recordCheckpoint,
  requestLoop,
  verifyHarness,
} from "../commands.mjs";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "apa-harness-"));
  const matter = join(root, "matter");
  const initialized = initializeHarness(matter, {
    matterId: "test-matter",
    applicationType: "provisional",
    userRole: "pro_se",
    actor: { kind: "human", id: "inventor-1" },
    idempotencyKey: "init-test-matter",
    timestamp: "2026-07-29T12:00:00.000Z",
  });
  return { root, matter, initialized };
}

test("workflow-v2 compiles executor, proposal, alternative, invalidation, and loop contracts", () => {
  const plan = planPipeline({ matter: "examples/minimal-patent-artifact" });
  assert.equal(plan.workflow.schema, "apa-workflow-plan-v2");
  assert.ok(plan.workflow.stages.length >= 10);
  assert.equal(plan.workflow.stages.find((stage) => stage.id === "apa-spec").commit_mode, "proposal-required");
  assert.ok(plan.workflow.stages.find((stage) => stage.id === "apa-claims").invalidates.includes("apa-assemble"));
  assert.deepEqual(plan.workflow.alternatives.find((item) => item.id === "intake").members, [
    "apa-disclose",
    "apa-compile",
  ]);
  assert.deepEqual(
    plan.workflow.loops.map((loop) => [loop.from, loop.to, loop.max_iterations]),
    [
      ["apa-examiner", "apa-claims", 2],
      ["apa-examiner", "apa-spec", 2],
    ],
  );
});

test("initialization preflights workflow identity before writing matter.yaml", () => {
  const root = mkdtempSync(join(tmpdir(), "apa-init-preflight-"));
  try {
    const cases = [
      {
        name: "short-idempotency-key",
        overrides: { idempotencyKey: "short" },
        pattern: /at least 8 characters/,
      },
      {
        name: "invalid-actor-kind",
        overrides: {
          actor: { kind: "robot", id: "draft-agent" },
          idempotencyKey: "init-invalid-actor",
        },
        pattern: /validation failed/,
      },
      {
        name: "invalid-timestamp",
        overrides: {
          idempotencyKey: "init-invalid-time",
          timestamp: "not-a-timestamp",
        },
        pattern: /validation failed/,
      },
    ];
    for (const item of cases) {
      const matter = join(root, item.name);
      assert.throws(() => initializeHarness(matter, {
        matterId: `matter-${item.name}`,
        applicationType: "provisional",
        userRole: "pro_se",
        actor: { kind: "human", id: "inventor-1" },
        ...item.overrides,
      }), item.pattern);
      assert.equal(existsSync(harnessPaths(matter).manifest), false);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("immutable source, proposal, human adoption, rejection, CAS, and verification compose", () => {
  const { root, matter, initialized } = fixture();
  try {
    assert.equal(initialized.event.type, "matter-initialized");
    assert.equal(initialized.event.expected_head, RUNLOG_GENESIS_HASH);
    assert.equal(initializeHarness(matter, {
      matterId: "test-matter",
      applicationType: "provisional",
      userRole: "pro_se",
      actor: { kind: "human", id: "inventor-1" },
      idempotencyKey: "init-test-matter",
    }).existing, true);

    const disclosure = join(root, "inventor-disclosure.txt");
    writeFileSync(disclosure, "A source-grounded disclosure.\n", "utf8");
    const ingested = ingestSource(matter, {
      file: disclosure,
      label: "Inventor disclosure",
      mediaType: "text/plain",
      actor: { kind: "human", id: "inventor-1" },
      expectedHead: initialized.head.sha256,
      idempotencyKey: "ingest-disclosure-001",
      timestamp: "2026-07-29T12:01:00.000Z",
    });
    assert.match(ingested.record.source_id, /^src_[0-9a-f]{24}$/);
    assert.equal(ingested.record.original_name, "inventor-disclosure.txt");
    assert.equal(JSON.stringify(ingested.record).includes(root), false);
    assert.equal(
      existsSync(join(matter, ...ingested.record.content.object_path.split("/"))),
      true,
    );

    const proposed = proposeArtifact(matter, {
      artifactId: "specification-main",
      artifactType: "specification",
      content: "# Candidate specification\n",
      mediaType: "text/markdown",
      actor: { kind: "agent", id: "draft-agent", provider: "local", model: "fixture" },
      inputs: [{
        ref: ingested.record.source_id,
        sha256: ingested.record.content.sha256,
      }],
      suggestedView: "views/specification.md",
      expectedHead: ingested.head.sha256,
      idempotencyKey: "proposal-specification-001",
      timestamp: "2026-07-29T12:02:00.000Z",
    });
    assert.match(proposed.proposal.proposal_id, /^prop_[0-9a-f]{24}$/);
    assert.equal(proposed.proposal.stage_id, "apa-spec");
    assert.equal(currentArtifacts(matter).length, 0);
    assert.equal(proposalQueue(matter)[0].status, "pending");

    const retried = proposeArtifact(matter, {
      artifactId: "specification-main",
      artifactType: "specification",
      content: "# Candidate specification\n",
      mediaType: "text/markdown",
      actor: { kind: "agent", id: "draft-agent", provider: "local", model: "fixture" },
      inputs: [{
        ref: ingested.record.source_id,
        sha256: ingested.record.content.sha256,
      }],
      suggestedView: "views/specification.md",
      expectedHead: ingested.head.sha256,
      idempotencyKey: "proposal-specification-001",
    });
    assert.equal(retried.existing, true);
    assert.equal(retried.proposal.proposal_id, proposed.proposal.proposal_id);
    assert.throws(() => proposeArtifact(matter, {
      artifactId: "specification-main",
      artifactType: "specification",
      content: "different bytes",
      actor: { kind: "agent", id: "draft-agent", provider: "local", model: "fixture" },
      inputs: [{
        ref: ingested.record.source_id,
        sha256: ingested.record.content.sha256,
      }],
      expectedHead: proposed.head.sha256,
      idempotencyKey: "proposal-specification-001",
    }), /different proposal/);
    assert.throws(() => proposeArtifact(matter, {
      artifactId: "claims-main",
      artifactType: "claims",
      content: "stale proposal",
      actor: { kind: "agent", id: "draft-agent" },
      expectedHead: ingested.head.sha256,
      idempotencyKey: "proposal-stale-001",
    }), /stale matter head/);
    assert.throws(() => proposeArtifact(matter, {
      artifactId: "signature-main",
      artifactType: "signature",
      content: "not allowed",
      actor: { kind: "agent", id: "draft-agent" },
      expectedHead: proposed.head.sha256,
      idempotencyKey: "proposal-signature-001",
    }), /human-only/);

    const adopted = decideProposal(matter, {
      proposalId: proposed.proposal.proposal_id,
      outcome: "adopted",
      reviewer: { id: "inventor-1", role: "inventor" },
      rationale: "Exact bytes reviewed.",
      expectedHead: proposed.head.sha256,
      idempotencyKey: "adopt-specification-001",
      timestamp: "2026-07-29T12:03:00.000Z",
    });
    assert.equal(adopted.envelope.revision, 1);
    assert.equal(adopted.envelope.content.sha256, proposed.proposal.content.sha256);
    assert.equal(adopted.event.payload.stage_id, "apa-spec");
    assert.ok(adopted.event.payload.invalidates.includes("apa-assemble"));
    assert.equal(currentArtifacts(matter)[0].envelope.artifact_id, "specification-main");
    assert.equal(proposalQueue(matter)[0].status, "adopted");

    const adoptedRetry = decideProposal(matter, {
      proposalId: proposed.proposal.proposal_id,
      outcome: "adopted",
      reviewer: { id: "inventor-1", role: "inventor" },
      rationale: "Exact bytes reviewed.",
      expectedHead: proposed.head.sha256,
      idempotencyKey: "adopt-specification-001",
    });
    assert.equal(adoptedRetry.existing, true);
    assert.equal(adoptedRetry.envelope.revision, 1);

    assert.throws(() => recordCheckpoint(matter, {
      stageId: "apa-spec",
      checkpointId: "not-a-declared-checkpoint",
      reviewer: { id: "inventor-1", role: "inventor" },
      expectedHead: adopted.head.sha256,
      idempotencyKey: "bad-checkpoint-name-001",
    }), /not declared/);
    assert.throws(() => recordCheckpoint(matter, {
      stageId: "apa-spec",
      checkpointId: "spec-support-review",
      reviewer: { kind: "agent", id: "draft-agent", role: "reviewer" },
      expectedHead: adopted.head.sha256,
      idempotencyKey: "bad-checkpoint-reviewer-001",
    }), /human reviewer/);
    const checkpoint = recordCheckpoint(matter, {
      stageId: "apa-spec",
      checkpointId: "spec-support-review",
      reviewer: { id: "inventor-1", role: "inventor" },
      rationale: "Reviewed the adopted specification revision.",
      expectedHead: adopted.head.sha256,
      idempotencyKey: "checkpoint-specification-001",
      timestamp: "2026-07-29T12:03:30.000Z",
    });
    assert.equal(checkpoint.checkpoint.reviewed_head, adopted.head.sha256);
    assert.equal(checkpoint.event.actor.kind, "human");
    assert.equal(recordCheckpoint(matter, {
      stageId: "apa-spec",
      checkpointId: "spec-support-review",
      reviewer: { id: "inventor-1", role: "inventor" },
      rationale: "Reviewed the adopted specification revision.",
      expectedHead: adopted.head.sha256,
      idempotencyKey: "checkpoint-specification-001",
    }).existing, true);

    const second = proposeArtifact(matter, {
      artifactId: "claims-main",
      artifactType: "claims",
      content: "1. A candidate claim.",
      actor: { kind: "agent", id: "draft-agent" },
      expectedHead: checkpoint.head.sha256,
      idempotencyKey: "proposal-claims-001",
      timestamp: "2026-07-29T12:04:00.000Z",
    });
    const rejected = decideProposal(matter, {
      proposalId: second.proposal.proposal_id,
      outcome: "rejected",
      reviewer: { id: "practitioner-1", role: "registered_practitioner" },
      rationale: "Scope requires revision.",
      expectedHead: second.head.sha256,
      idempotencyKey: "reject-claims-001",
      timestamp: "2026-07-29T12:05:00.000Z",
    });
    assert.equal(rejected.decision.outcome, "rejected");
    assert.equal(currentArtifacts(matter).length, 1);

    const summary = harnessSummary(matter);
    assert.deepEqual(summary.proposals, { total: 2, pending: 0, adopted: 1, rejected: 1 });
    assert.equal(summary.submit_boundary, "APA does not sign, certify, pay, or file.");
    assert.deepEqual(verifyHarness(matter), { ok: true, errors: [] });

    const objectPath = join(matter, ...adopted.envelope.content.object_path.split("/"));
    writeFileSync(objectPath, "tampered", "utf8");
    const invalid = verifyHarness(matter);
    assert.equal(invalid.ok, false);
    assert.ok(invalid.errors.some((error) => /CONTENT|RECORD/.test(error.code)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("bounded workflow loops block after the cap and require a human override", () => {
  const { root, matter, initialized } = fixture();
  try {
    let head = initialized.head.sha256;
    for (const index of [1, 2]) {
      const result = requestLoop(matter, {
        from: "apa-examiner",
        to: "apa-claims",
        actor: { kind: "tool", id: "runner" },
        expectedHead: head,
        idempotencyKey: `examiner-claims-loop-${index}`,
      });
      assert.equal(result.allowed, true);
      assert.equal(result.iteration, index);
      head = result.head.sha256;
    }
    const blocked = requestLoop(matter, {
      from: "apa-examiner",
      to: "apa-claims",
      actor: { kind: "tool", id: "runner" },
      expectedHead: head,
      idempotencyKey: "examiner-claims-loop-3",
    });
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.event.type, "loop-blocked");
    const overridden = requestLoop(matter, {
      from: "apa-examiner",
      to: "apa-claims",
      actor: { kind: "human", id: "practitioner-1" },
      humanOverride: true,
      expectedHead: blocked.head.sha256,
      idempotencyKey: "examiner-claims-loop-override",
    });
    assert.equal(overridden.allowed, true);
    assert.equal(overridden.iteration, 3);
    assert.throws(() => requestLoop(matter, {
      from: "apa-examiner",
      to: "apa-claims",
      actor: { kind: "tool", id: "runner" },
      humanOverride: true,
      expectedHead: overridden.head.sha256,
      idempotencyKey: "bad-nonhuman-override",
    }), /requires a human actor/);
    assert.equal(currentRunlogHead(matter).sha256, overridden.head.sha256);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
