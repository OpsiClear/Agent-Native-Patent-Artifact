import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { initializeHarness } from "../../packages/apa-workflow/commands.mjs";
import { createApaMcpServer } from "./server.mjs";

test("MCP exposes confined resources and completes propose/adopt through the shared service", async () => {
  const root = mkdtempSync(join(tmpdir(), "apa-mcp-"));
  const matter = join(root, "matter");
  const initialized = initializeHarness(matter, {
    matterId: "mcp-test-matter",
    applicationType: "utility",
    userRole: "registered_practitioner",
    actor: { kind: "human", id: "practitioner-1" },
    idempotencyKey: "initialize-mcp-test",
  });
  const server = createApaMcpServer({ matter });
  const client = new Client({ name: "apa-test-client", version: "0.1.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const resources = await client.listResources();
    assert.deepEqual(
      resources.resources.map((resource) => resource.uri).sort(),
      [
        "apa://matter/artifacts",
        "apa://matter/proposals",
        "apa://matter/status",
        "apa://matter/summary",
        "apa://matter/workflow",
      ],
    );
    const tools = await client.listTools();
    assert.deepEqual(
      tools.tools.map((tool) => tool.name).sort(),
      [
        "apa_adopt",
        "apa_head",
        "apa_plan",
        "apa_propose",
        "apa_record_checkpoint",
        "apa_reject",
        "apa_request_loop",
        "apa_summary",
        "apa_verify",
      ],
    );

    const summaryResource = await client.readResource({ uri: "apa://matter/summary" });
    const summary = JSON.parse(summaryResource.contents[0].text);
    assert.equal(summary.matter.matter_id, "mcp-test-matter");
    assert.equal(JSON.stringify(summary).includes(root), false);

    const proposed = await client.callTool({
      name: "apa_propose",
      arguments: {
        artifactId: "claims-main",
        artifactType: "claims",
        content: "1. A source-grounded candidate claim.",
        mediaType: "text/plain",
        actorId: "codex-agent",
        provider: "local-test",
        model: "fixture",
        expectedHead: initialized.head.sha256,
        idempotencyKey: "mcp-proposal-claims-001",
      },
    });
    assert.equal(proposed.isError, undefined);
    assert.match(proposed.structuredContent.proposal_id, /^prop_[0-9a-f]{24}$/);
    assert.equal(proposed.structuredContent.stage_id, "apa-claims");
    assert.equal(proposed.structuredContent.review_required, true);
    assert.equal(Object.hasOwn(proposed.structuredContent, "content"), false);

    const adopted = await client.callTool({
      name: "apa_adopt",
      arguments: {
        proposalId: proposed.structuredContent.proposal_id,
        reviewerId: "practitioner-1",
        reviewerRole: "registered_practitioner",
        rationale: "Reviewed exact proposal digest.",
        expectedHead: proposed.structuredContent.head.sha256,
        idempotencyKey: "mcp-adopt-claims-001",
      },
    });
    assert.equal(adopted.structuredContent.outcome, "adopted");
    assert.equal(adopted.structuredContent.artifact_revision, 1);

    const checkpointed = await client.callTool({
      name: "apa_record_checkpoint",
      arguments: {
        stageId: "apa-claims",
        checkpointId: "claim-scope-adoption",
        reviewerId: "practitioner-1",
        reviewerRole: "registered_practitioner",
        rationale: "Reviewed the adopted claim scope.",
        expectedHead: adopted.structuredContent.head.sha256,
        idempotencyKey: "mcp-checkpoint-claims-001",
      },
    });
    assert.equal(checkpointed.structuredContent.satisfied, true);
    assert.equal(
      checkpointed.structuredContent.reviewed_head,
      adopted.structuredContent.head.sha256,
    );

    const artifacts = await client.readResource({ uri: "apa://matter/artifacts" });
    const current = JSON.parse(artifacts.contents[0].text);
    assert.equal(current.artifacts.length, 1);
    assert.equal(current.artifacts[0].artifact_id, "claims-main");

    const verified = await client.callTool({ name: "apa_verify", arguments: {} });
    assert.equal(verified.structuredContent.ok, true);
  } finally {
    await client.close().catch(() => {});
    await server.close().catch(() => {});
    rmSync(root, { recursive: true, force: true });
  }
});

test("MCP refuses a missing or non-harness matter", () => {
  assert.throws(
    () => createApaMcpServer({ matter: join(tmpdir(), "does-not-exist-apa-matter") }),
    /existing harness matter/,
  );
});
