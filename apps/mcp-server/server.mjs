#!/usr/bin/env node
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  executeApplicationCommand,
  matterHead,
  planMatter,
  statusMatter,
} from "../../packages/apa-application/service.mjs";
import { loadMatterManifest } from "../../packages/apa-core/store.mjs";

const SHA256 = /^[0-9a-f]{64}$/;
const IDEMPOTENCY = z.string().min(8).max(200);

export function createApaMcpServer({ matter } = {}) {
  const matterRoot = resolve(String(matter || ""));
  if (!matter || !existsSync(matterRoot)) throw new Error("--matter must identify an existing harness matter");
  const manifest = loadMatterManifest(matterRoot);
  const server = new McpServer(
    { name: "apa-patent-drafting-harness", version: "0.1.0" },
    {
      capabilities: { logging: {} },
      instructions: [
        `This server is confined to APA matter '${manifest.matter_id}'.`,
        "Models propose; only an identified human may adopt or reject exact proposal bytes.",
        "Every mutation requires the current expected head and a caller-stable idempotency key.",
        "Never represent APA as signing, certifying, paying, or filing.",
      ].join(" "),
    },
  );

  registerResources(server, matterRoot, manifest);
  registerReadTools(server, matterRoot);
  registerMutationTools(server, matterRoot);
  registerPrompts(server, manifest);
  return server;
}

function registerResources(server, matter, manifest) {
  server.registerResource(
    "matter-summary",
    "apa://matter/summary",
    {
      title: "APA matter summary",
      description: "Minimal lifecycle, review, and ledger status without draft content.",
      mimeType: "application/json",
    },
    async (uri) => resourceJson(uri, executeApplicationCommand("summary", { matter })),
  );
  server.registerResource(
    "workflow-plan",
    "apa://matter/workflow",
    {
      title: "APA workflow plan",
      description: "Executor, proposal, gate, checkpoint, invalidation, alternative, and loop contracts.",
      mimeType: "application/json",
    },
    async (uri) => resourceJson(uri, minimalPlan(planMatter({ matter }), manifest.matter_id)),
  );
  server.registerResource(
    "workflow-status",
    "apa://matter/status",
    {
      title: "APA workflow status",
      description: "Stage status derived from hash-bound ledger evidence.",
      mimeType: "application/json",
    },
    async (uri) => resourceJson(uri, minimalStatus(statusMatter({ matter }), manifest.matter_id)),
  );
  server.registerResource(
    "proposal-queue",
    "apa://matter/proposals",
    {
      title: "APA proposal queue",
      description: "Pending/adopted/rejected proposal metadata; content is not returned by default.",
      mimeType: "application/json",
    },
    async (uri) => resourceJson(uri, {
      schema: "apa-mcp-proposal-queue-v1",
      matter_id: manifest.matter_id,
      proposals: minimalProposals(executeApplicationCommand("proposals", { matter })),
    }),
  );
  server.registerResource(
    "current-artifacts",
    "apa://matter/artifacts",
    {
      title: "APA current artifacts",
      description: "Current adopted artifact hashes and revisions without artifact bytes.",
      mimeType: "application/json",
    },
    async (uri) => resourceJson(uri, {
      schema: "apa-mcp-current-artifacts-v1",
      matter_id: manifest.matter_id,
      artifacts: minimalArtifacts(executeApplicationCommand("artifacts", { matter })),
    }),
  );
}

function registerReadTools(server, matter) {
  server.registerTool(
    "apa_head",
    {
      title: "Read matter head",
      description: "Return the exact ledger head required by mutating tools.",
      annotations: readOnlyAnnotations(),
    },
    async () => toolResult(matterHead({ matter })),
  );
  server.registerTool(
    "apa_plan",
    {
      title: "Plan patent workflow",
      description: "Return the workflow-v2 stage contract with optional domain/support packs.",
      inputSchema: {
        domains: z.array(z.string()).default([]),
        supports: z.array(z.string()).default([]),
      },
      annotations: readOnlyAnnotations(),
    },
    async ({ domains, supports }) => {
      const manifest = loadMatterManifest(matter);
      return toolResult(minimalPlan(planMatter({ matter, domains, supports }), manifest.matter_id));
    },
  );
  server.registerTool(
    "apa_verify",
    {
      title: "Verify patent harness evidence",
      description: "Verify contracts, content hashes, decisions, and the chained ledger.",
      annotations: readOnlyAnnotations(),
    },
    async () => toolResult(executeApplicationCommand("verify", { matter })),
  );
  server.registerTool(
    "apa_summary",
    {
      title: "Read matter summary",
      description: "Return a minimal matter, proposal, artifact, and ledger summary.",
      annotations: readOnlyAnnotations(),
    },
    async () => toolResult(executeApplicationCommand("summary", { matter })),
  );
}

function registerMutationTools(server, matter) {
  const mutationFields = {
    expectedHead: z.string().regex(SHA256),
    idempotencyKey: IDEMPOTENCY,
  };
  server.registerTool(
    "apa_propose",
    {
      title: "Propose patent artifact",
      description: "Store immutable candidate bytes. This does not adopt or overwrite canonical matter state.",
      inputSchema: {
        artifactId: z.string().regex(/^[a-z][a-z0-9._-]{1,127}$/),
        artifactType: z.string().regex(/^[a-z][a-z0-9._-]{1,127}$/),
        stageId: z.string().regex(/^apa-[a-z0-9-]+$/).optional(),
        content: z.string().max(2_000_000),
        mediaType: z.string().max(200).default("text/markdown"),
        actorId: z.string().min(1).max(200),
        provider: z.string().min(1).max(100).optional(),
        model: z.string().min(1).max(200).optional(),
        suggestedView: z.string().max(500).optional(),
        notes: z.string().max(5000).optional(),
        ...mutationFields,
      },
      annotations: mutationAnnotations(false),
    },
    async (args) => {
      const result = executeApplicationCommand("propose", {
        matter,
        artifactId: args.artifactId,
        artifactType: args.artifactType,
        stageId: args.stageId,
        content: args.content,
        mediaType: args.mediaType,
        actor: {
          kind: "agent",
          id: args.actorId,
          ...(args.provider ? { provider: args.provider } : {}),
          ...(args.model ? { model: args.model } : {}),
        },
        suggestedView: args.suggestedView,
        notes: args.notes,
        inputs: [],
        expectedHead: args.expectedHead,
        idempotencyKey: args.idempotencyKey,
      });
      return toolResult({
        proposal_id: result.proposal.proposal_id,
        proposal_sha256: result.proposalSha256 || result.event.payload.proposal_sha256,
        artifact_id: result.proposal.artifact_id,
        artifact_type: result.proposal.artifact_type,
        ...(result.proposal.stage_id ? { stage_id: result.proposal.stage_id } : {}),
        content_sha256: result.proposal.content.sha256,
        existing: result.existing,
        head: result.head,
        review_required: true,
      });
    },
  );
  for (const outcome of ["adopt", "reject"]) {
    server.registerTool(
      `apa_${outcome}`,
      {
        title: `${outcome === "adopt" ? "Adopt" : "Reject"} exact proposal`,
        description: outcome === "adopt"
          ? "Record an identified human adoption and create an immutable artifact revision."
          : "Record an identified human rejection without creating an artifact revision.",
        inputSchema: {
          proposalId: z.string().regex(/^prop_[0-9a-f]{24}$/),
          reviewerId: z.string().min(1).max(200),
          reviewerRole: z.enum(["inventor", "pro_se", "registered_practitioner", "reviewer"]),
          rationale: z.string().max(10000).optional(),
          ...mutationFields,
        },
        annotations: mutationAnnotations(outcome === "reject"),
      },
      async (args) => {
        const result = executeApplicationCommand(outcome, {
          matter,
          proposalId: args.proposalId,
          reviewer: { id: args.reviewerId, role: args.reviewerRole },
          rationale: args.rationale,
          expectedHead: args.expectedHead,
          idempotencyKey: args.idempotencyKey,
        });
        return toolResult({
          proposal_id: result.proposal.proposal_id,
          decision_id: result.decision?.decision_id || result.event.payload.decision_id,
          outcome: result.event.payload.outcome,
          ...(result.envelope ? {
            artifact_id: result.envelope.artifact_id,
            artifact_revision: result.envelope.revision,
            content_sha256: result.envelope.content.sha256,
          } : {}),
          existing: result.existing,
          head: result.head,
        });
      },
    );
  }
  server.registerTool(
    "apa_record_checkpoint",
    {
      title: "Record human checkpoint",
      description: "Record an identified human's satisfaction of a declared stage checkpoint against the exact current ledger head.",
      inputSchema: {
        stageId: z.string().regex(/^apa-[a-z0-9-]+$/),
        checkpointId: z.string().min(1).max(200),
        reviewerId: z.string().min(1).max(200),
        reviewerRole: z.enum(["inventor", "pro_se", "registered_practitioner", "reviewer"]),
        rationale: z.string().max(10000).optional(),
        ...mutationFields,
      },
      annotations: mutationAnnotations(false),
    },
    async (args) => {
      const result = executeApplicationCommand("checkpoint", {
        matter,
        stageId: args.stageId,
        checkpointId: args.checkpointId,
        reviewer: { id: args.reviewerId, role: args.reviewerRole },
        rationale: args.rationale,
        expectedHead: args.expectedHead,
        idempotencyKey: args.idempotencyKey,
      });
      return toolResult({
        stage_id: result.checkpoint.stage_id,
        checkpoint_id: result.checkpoint.checkpoint_id,
        satisfied: result.checkpoint.satisfied,
        reviewer_id: result.checkpoint.reviewer_id,
        reviewer_role: result.checkpoint.reviewer_role,
        reviewed_head: result.checkpoint.reviewed_head,
        existing: result.existing,
        head: result.head,
      });
    },
  );
  server.registerTool(
    "apa_request_loop",
    {
      title: "Request bounded workflow loop",
      description: "Request a declared examiner-to-draft loop and enforce its iteration cap.",
      inputSchema: {
        from: z.string().min(1).max(200),
        to: z.string().min(1).max(200),
        actorId: z.string().min(1).max(200),
        humanOverride: z.boolean().default(false),
        ...mutationFields,
      },
      annotations: mutationAnnotations(false),
    },
    async (args) => toolResult(executeApplicationCommand("loop", {
      matter,
      from: args.from,
      to: args.to,
      actor: {
        kind: args.humanOverride ? "human" : "tool",
        id: args.actorId,
      },
      humanOverride: args.humanOverride,
      expectedHead: args.expectedHead,
      idempotencyKey: args.idempotencyKey,
    })),
  );
}

function registerPrompts(server, manifest) {
  const prompt = (name, title, text) => server.registerPrompt(
    name,
    { title, description: `${title} for the configured local APA matter.` },
    async () => ({
      description: title,
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: [
            `Matter: ${manifest.matter_id}; application type: ${manifest.application_type}.`,
            text,
            "Use APA resources for state. Submit drafts through apa_propose.",
            "Do not adopt on the user's behalf and do not sign, certify, pay, or file.",
          ].join("\n"),
        },
      }],
    }),
  );
  prompt(
    "disclosure-interview",
    "Disclosure interview",
    "Ask source-grounded factual questions, distinguish known facts from uncertainty, and identify contributors without making legal conclusions.",
  );
  prompt(
    "provisional-drafting",
    "Provisional drafting",
    "Prepare a source-grounded candidate disclosure with alternatives and drawing support. Flag unsupported detail and new-matter risk.",
  );
  prompt(
    "nonprovisional-conversion",
    "Nonprovisional conversion",
    "Compare provisional source support against each proposed claim and specification addition. Preserve explicit priority and new-matter review flags.",
  );
  prompt(
    "claim-review",
    "Claim review",
    "Review antecedent basis, source support, terminology, dependencies, and contribution records. Treat legal characterizations as practitioner-review items.",
  );
}

function resourceJson(uri, value) {
  return {
    contents: [{
      uri: uri.href,
      mimeType: "application/json",
      text: JSON.stringify(value, null, 2),
    }],
  };
}

function toolResult(value) {
  const structuredContent = Array.isArray(value) ? { items: value } : value;
  return {
    content: [{ type: "text", text: JSON.stringify(structuredContent, null, 2) }],
    structuredContent,
  };
}

function minimalPlan(plan, matterId) {
  return {
    schema: plan.workflow.schema,
    matter_id: matterId,
    domains: plan.workflow.domains,
    supports: plan.workflow.supports,
    stages: plan.workflow.stages,
    alternatives: plan.workflow.alternatives,
    loops: plan.workflow.loops,
    global_gates: plan.workflow.global_gates,
  };
}

function minimalStatus(status, matterId) {
  return {
    schema: "apa-mcp-workflow-status-v1",
    matter_id: matterId,
    runlog_ok: status.runlog_ok,
    steps: status.steps.map((step) => ({
      id: step.id,
      status: step.completion.status,
      completed: step.completed,
      reasons: step.completion.reasons.map((reason) => ({
        code: reason.code,
        message: reason.message,
      })),
      pending_checkpoints: step.completion.pending_checkpoints,
    })),
  };
}

function minimalProposals(queue) {
  return queue.map(({ proposal, status }) => ({
    proposal_id: proposal.proposal_id,
    artifact_id: proposal.artifact_id,
    artifact_type: proposal.artifact_type,
    ...(proposal.stage_id ? { stage_id: proposal.stage_id } : {}),
    content_sha256: proposal.content.sha256,
    content_bytes: proposal.content.bytes,
    actor: proposal.actor,
    created_at: proposal.created_at,
    status,
  }));
}

function minimalArtifacts(items) {
  return items.map(({ envelope }) => envelope && ({
    artifact_id: envelope.artifact_id,
    artifact_type: envelope.artifact_type,
    revision: envelope.revision,
    content_sha256: envelope.content.sha256,
    adopted_at: envelope.adopted_at,
    source_proposal_id: envelope.source_proposal_id,
    decision_id: envelope.decision_id,
  })).filter(Boolean);
}

function readOnlyAnnotations() {
  return {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  };
}

function mutationAnnotations(destructiveHint) {
  return {
    readOnlyHint: false,
    destructiveHint,
    idempotentHint: true,
    openWorldHint: false,
  };
}

function parseArgs(argv) {
  if (argv.includes("--help") || argv.includes("-h")) return { help: true };
  const matterIndex = argv.indexOf("--matter");
  if (matterIndex < 0 || !argv[matterIndex + 1]) {
    throw new Error("usage: apa-mcp --matter <harness-matter>");
  }
  return { matter: argv[matterIndex + 1] };
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log("usage: apa-mcp --matter <harness-matter>");
    return;
  }
  const server = createApaMcpServer(args);
  await server.connect(new StdioServerTransport());
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(`APA MCP server failed: ${error.message}`);
    process.exit(2);
  }
}
