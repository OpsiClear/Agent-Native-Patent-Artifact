import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CLI = join(ROOT, "apps", "cli", "cli.mjs");

function run(args) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    windowsHide: true,
  });
}

test("unified apa CLI drives init, proposal, adoption, summary, and verification", () => {
  const root = mkdtempSync(join(tmpdir(), "apa-cli-"));
  const matter = join(root, "matter");
  const candidate = join(root, "claims.md");
  writeFileSync(candidate, "1. A candidate claim.\n", "utf8");
  try {
    const help = run(["--help"]);
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /APA patent drafting harness/);
    assert.match(help.stdout, /never signs, certifies, pays, or files/i);

    const initialized = run([
      "init",
      "--matter", matter,
      "--matter-id", "cli-test-matter",
      "--application-type", "utility",
      "--user-role", "registered_practitioner",
      "--idempotency-key", "cli-initialize-001",
      "--json",
    ]);
    assert.equal(initialized.status, 0, initialized.stderr);
    const init = JSON.parse(initialized.stdout);

    const proposed = run([
      "propose",
      "--matter", matter,
      "--artifact-id", "claims-main",
      "--artifact-type", "claims",
      "--stage", "apa-claims",
      "--content-file", candidate,
      "--actor-id", "codex-agent",
      "--provider", "local-test",
      "--model", "fixture",
      "--expected-head", init.head.sha256,
      "--idempotency-key", "cli-proposal-001",
      "--json",
    ]);
    assert.equal(proposed.status, 0, proposed.stderr);
    const proposal = JSON.parse(proposed.stdout);

    const adopted = run([
      "adopt",
      "--matter", matter,
      "--proposal", proposal.proposal.proposal_id,
      "--reviewer-id", "practitioner-1",
      "--reviewer-role", "registered_practitioner",
      "--rationale", "Reviewed exact bytes.",
      "--expected-head", proposal.head.sha256,
      "--idempotency-key", "cli-adoption-001",
      "--json",
    ]);
    assert.equal(adopted.status, 0, adopted.stderr);
    const adoption = JSON.parse(adopted.stdout);
    assert.equal(adoption.envelope.revision, 1);

    const checkpointed = run([
      "checkpoint",
      "--matter", matter,
      "--stage", "apa-claims",
      "--checkpoint", "claim-scope-adoption",
      "--reviewer-id", "practitioner-1",
      "--reviewer-role", "registered_practitioner",
      "--rationale", "Reviewed the adopted claim scope.",
      "--expected-head", adoption.head.sha256,
      "--idempotency-key", "cli-checkpoint-001",
      "--json",
    ]);
    assert.equal(checkpointed.status, 0, checkpointed.stderr);
    assert.equal(JSON.parse(checkpointed.stdout).checkpoint.reviewed_head, adoption.head.sha256);

    const summary = run(["summary", "--matter", matter, "--json"]);
    assert.equal(summary.status, 0, summary.stderr);
    assert.equal(JSON.parse(summary.stdout).current_artifacts.length, 1);

    const verified = run(["verify", "--matter", matter, "--json"]);
    assert.equal(verified.status, 0, verified.stderr);
    assert.deepEqual(JSON.parse(verified.stdout), { ok: true, errors: [] });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
