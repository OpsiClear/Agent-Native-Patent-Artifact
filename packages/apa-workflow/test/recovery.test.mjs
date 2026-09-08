import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync, existsSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hostname } from "node:os";
import { spawnSync } from "node:child_process";
import { commitMatterFiles, recoverMatterTransaction, transactionPath } from "../../apa-core/transaction.mjs";
import { storeDecision, storeArtifactRevision } from "../../apa-core/store.mjs";
import { canonicalSha256 } from "../../apa-core/canonical.mjs";
import { buildRunlogEntry, planRunlogAppend } from "../../apa-trace/runlog.mjs";
import { buildWorkflowEvent } from "../ledger.mjs";
import { initializeHarness, proposeArtifact, decideProposal, recoverHarness, verifyHarness, currentArtifacts } from "../commands.mjs";

function fixture(t) {
  const matter = mkdtempSync(join(tmpdir(), "apa-transaction-test-"));
  t.after(() => rmSync(matter, { recursive: true, force: true }));
  const init = initializeHarness(matter, { matterId: "recovery", idempotencyKey: "init-recovery" });
  const proposal = proposeArtifact(matter, { artifactId: "claims-main", artifactType: "claims", content: "Synthetic claim",
    actor: { kind: "agent", id: "test-agent" }, idempotencyKey: "proposal-recovery", expectedHead: init.head.sha256 });
  const options = { proposalId: proposal.proposal.proposal_id, outcome: "adopted", reviewer: { id: "human", role: "reviewer" },
    idempotencyKey: "adoption-recovery", expectedHead: proposal.head.sha256 };
  return { matter, proposal, options };
}

test("rejected adoption input leaves no records and corrected retries succeed", (t) => {
  const { matter, options } = fixture(t);
  const before = readFileSync(join(matter, "trace/runlog.jsonl"));
  for (const bad of [{ idempotencyKey: "short" }, { timestamp: "invalid" }, { reviewer: { id: "", role: "reviewer" } }]) {
    assert.throws(() => decideProposal(matter, { ...options, ...bad }));
    assert.deepEqual(readdirSync(join(matter, "reviews/decisions")), []);
    assert.deepEqual(readdirSync(join(matter, "drafts/records")), []);
    assert.deepEqual(readFileSync(join(matter, "trace/runlog.jsonl")), before);
    assert.equal(existsSync(transactionPath(matter)), false);
  }
  decideProposal(matter, options);
  assert.equal(verifyHarness(matter).ok, true);
});

test("verification detects orphan decisions and schema-valid decision tampering", (t) => {
  const { matter, proposal, options } = fixture(t);
  const orphan = storeDecision(matter, { proposal: proposal.proposal, ...options, decidedAt: "2026-09-08T00:00:00Z" });
  assert.ok(verifyHarness(matter).errors.some(e => e.code === "ORPHAN_RECORD"));
  rmSync(orphan.decisionPath);
  const adopted = decideProposal(matter, options);
  writeFileSync(adopted.decisionPath, JSON.stringify({ ...adopted.decision, rationale: "Changed after commit" }));
  assert.ok(verifyHarness(matter).errors.some(e => e.code === "RECORD_EVENT_INVALID"));
});

for (let boundary = 0; boundary < 4; boundary++) test(`recovery finishes exact adoption bytes after interruption at write ${boundary}`, (t) => {
  const { matter, proposal, options } = fixture(t);
  const timestamp = "2026-09-08T00:00:00Z";
  const decision = storeDecision(matter, { proposal: proposal.proposal, ...options, decidedAt: timestamp }, { planOnly: true });
  const artifact = storeArtifactRevision(matter, { proposal: proposal.proposal, decision: decision.decision }, { planOnly: true });
  const payload = { proposal_id: options.proposalId, proposal_sha256: canonicalSha256(proposal.proposal),
    decision_id: decision.decision.decision_id, decision_sha256: canonicalSha256(decision.decision),
    artifact_id: artifact.envelope.artifact_id, artifact_revision: artifact.envelope.revision,
    artifact_record_path: "drafts/records/claims-main/r000001.json", artifact_sha256: canonicalSha256(artifact.envelope) };
  const event = buildWorkflowEvent({ ...options, type: "proposal-adopted", actor: { kind: "human", id: "human" }, timestamp, payload });
  const writes = [...decision.writes, ...artifact.writes, ...planRunlogAppend(matter,
    buildRunlogEntry({ skill: "apa-workflow", workflowEvent: event, timestamp }), options.expectedHead)];
  assert.throws(() => commitMatterFiles(matter, writes, { afterWrite(index) { if (index === boundary) throw new Error("simulated interruption"); } }), /interruption/);
  assert.equal(verifyHarness(matter).ok, false);
  // Simulate the lock left by a terminated local writer (a real exited child PID).
  const exited = spawnSync(process.execPath, ["-e", ""], { windowsHide: true });
  writeFileSync(join(matter, "trace/.apa-write.lock"), JSON.stringify({ pid: exited.pid, host: hostname(), token: "dead-test", owner: "test" }));
  assert.equal(recoverHarness(matter).ok, true);
  assert.equal(existsSync(transactionPath(matter)), false);
  const retried = decideProposal(matter, { ...options, timestamp: "2026-09-09T00:00:00Z" });
  assert.equal(retried.existing, true);
  assert.equal(retried.decision.decided_at, timestamp);
  assert.equal(currentArtifacts(matter).length, 1);
});

test("recovery preserves unexpected conflicting bytes and does not reclaim live locks", (t) => {
  const { matter } = fixture(t);
  const path = join(matter, "reviews/example.json");
  assert.throws(() => commitMatterFiles(matter, [{ path, bytes: "original" }], { afterWrite() { throw new Error("stop"); } }));
  writeFileSync(path, "external change");
  assert.throws(() => recoverHarness(matter), /transaction conflict/);
  assert.equal(readFileSync(path, "utf8"), "external change");
  assert.equal(existsSync(transactionPath(matter)), true);
  writeFileSync(join(matter, "trace/.apa-write.lock"), JSON.stringify({ pid: process.pid, host: hostname(), token: "live", owner: "active" }));
  assert.throws(() => recoverHarness(matter), /held by active/);
});

test("transactions refuse dangling target and journal symbolic links", (t) => {
  const { matter } = fixture(t);
  const target = join(matter, "reviews/dangling.json");
  try { symlinkSync(join(matter, "missing-target"), target); }
  catch (error) { if (error.code === "EPERM") { t.skip("symlink privilege unavailable"); return; } throw error; }
  assert.throws(() => commitMatterFiles(matter, [{ path: target, bytes: "data" }]), /symbolic links/);
  symlinkSync(join(matter, "missing-journal"), transactionPath(matter));
  assert.throws(() => recoverMatterTransaction(matter), /symbolic links/);
  assert.throws(() => commitMatterFiles(matter, [{ path: join(matter, "reviews/new.json"), bytes: "data" }]), /symbolic links/);
});
