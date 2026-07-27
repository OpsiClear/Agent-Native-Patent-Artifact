#!/usr/bin/env node
import { existsSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { updateJsonFile } from "./review_io.mjs";

function usage() {
  console.error([
    "usage: node agent_worker.mjs --matter <matter_dir> [--adapter mock|manual] [--once] [--interval N] [--mock-delay N]",
    "",
    "Processes queued APA review-form agent requests from assembled/agent_requests.json."
  ].join("\n"));
}

function parseArgs(argv) {
  const args = { adapter: "mock", once: false, interval: 1000, mockDelay: 0 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--matter") args.matter = argv[++i];
    else if (a === "--adapter") args.adapter = argv[++i];
    else if (a === "--once") args.once = true;
    else if (a === "--interval") args.interval = Number(argv[++i] || 0);
    else if (a === "--mock-delay") args.mockDelay = Number(argv[++i] || 0);
    else if (a === "--help" || a === "-h") { usage(); process.exit(0); }
    else throw new Error(`unknown argument: ${a}`);
  }
  if (!args.matter) throw new Error("--matter is required");
  if (!["mock", "manual"].includes(args.adapter)) throw new Error("--adapter must be mock or manual");
  if (!Number.isInteger(args.interval) || args.interval < 100) throw new Error("--interval must be at least 100");
  if (!Number.isInteger(args.mockDelay) || args.mockDelay < 0 || args.mockDelay > 10_000) {
    throw new Error("--mock-delay must be an integer from 0 to 10000");
  }
  args.matter = resolve(args.matter);
  args.assembled = join(args.matter, "assembled");
  args.agentRequests = join(args.assembled, "agent_requests.json");
  return args;
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeRequest(value) {
  const req = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const status = req.status === "open" ? "queued" : (req.status || "queued");
  return {
    schema: "apa-agent-request-v1",
    id: req.id || `REQ-${nowIso().replace(/\D/g, "").slice(0, 14)}`,
    status,
    source: req.source && typeof req.source === "object" ? req.source : {},
    prompt: String(req.prompt || ""),
    context: req.context && typeof req.context === "object" ? req.context : {},
    response: String(req.response || ""),
    error: String(req.error || ""),
    metadata: req.metadata && typeof req.metadata === "object" ? req.metadata : {},
    createdAt: req.createdAt || nowIso(),
    updatedAt: req.updatedAt || req.createdAt || nowIso(),
    claimedAt: req.claimedAt || "",
    completedAt: req.completedAt || "",
    cancelledAt: req.cancelledAt || ""
  };
}

function sourceLabel(req) {
  const page = req.source?.pageId || req.source?.page || "general";
  const card = req.source?.cardId || req.source?.id || "";
  const title = req.source?.title || "";
  return [page, card, title].filter(Boolean).join(" / ");
}

async function answerWithMock(req) {
  const exactText = String(req.context?.exactText || "").trim();
  const title = sourceLabel(req);
  const textSummary = exactText
    ? `${exactText.split(/\s+/).slice(0, 28).join(" ")}${exactText.split(/\s+/).length > 28 ? "..." : ""}`
    : "No exact source text was attached to this request.";
  return [
    "Findings:",
    `- Mock local agent reviewed ${title || "the request"} using the attached context.`,
    "- No legal conclusion is provided; this is a drafting and consistency review aid for human review.",
    "",
    "Suggested note:",
    `${req.prompt}`,
    exactText ? `Context excerpt: ${textSummary}` : "Context excerpt: unavailable.",
    "",
    "Confidence: mock-response",
    "Files checked: request context only"
  ].join("\n");
}

async function answerRequest(req, args) {
  if (args.adapter === "manual") {
    return [
      "Manual adapter placeholder.",
      "This request is ready for a human or interactive agent session to answer.",
      "No model was invoked."
    ].join("\n");
  }
  if (args.mockDelay) await sleep(args.mockDelay);
  return answerWithMock(req);
}

async function processOne(args) {
  let claimed = null;
  await updateJsonFile(args.agentRequests, [], value => {
    if (!Array.isArray(value)) throw new Error("agent_requests.json must contain a JSON array");
    const requests = value.map(normalizeRequest);
    const index = requests.findIndex(req => ["queued", "open"].includes(req.status));
    if (index < 0) return requests;
    const claimedAt = nowIso();
    const claimId = randomUUID();
    claimed = {
      ...requests[index],
      status: "running",
      claimedAt,
      updatedAt: claimedAt,
      metadata: {
        ...requests[index].metadata,
        worker: {
          adapter: args.adapter,
          pid: process.pid,
          claimId,
        }
      }
    };
    requests[index] = claimed;
    return requests;
  });
  if (!claimed) return null;

  try {
    const response = await answerRequest(claimed, args);
    let completed = null;
    await updateJsonFile(args.agentRequests, [], value => {
      if (!Array.isArray(value)) throw new Error("agent_requests.json must contain a JSON array");
      const latest = value.map(normalizeRequest);
      const latestIndex = latest.findIndex(req => req.id === claimed.id);
      if (latestIndex < 0) return latest;
      const current = latest[latestIndex];
      if (current.status === "cancelled") {
        completed = current;
        return latest;
      }
      if (
        current.status !== "running" ||
        current.metadata?.worker?.claimId !== claimed.metadata?.worker?.claimId
      ) {
        completed = current;
        return latest;
      }
      const completedAt = nowIso();
      completed = {
        ...current,
        status: "answered",
        response,
        error: "",
        completedAt,
        updatedAt: completedAt
      };
      latest[latestIndex] = completed;
      return latest;
    });
    return completed;
  } catch (err) {
    let failed = null;
    await updateJsonFile(args.agentRequests, [], value => {
      if (!Array.isArray(value)) throw new Error("agent_requests.json must contain a JSON array");
      const latest = value.map(normalizeRequest);
      const latestIndex = latest.findIndex(req => req.id === claimed.id);
      if (latestIndex < 0) return latest;
      const current = latest[latestIndex];
      if (
        current.status !== "running" ||
        current.metadata?.worker?.claimId !== claimed.metadata?.worker?.claimId
      ) {
        failed = current;
        return latest;
      }
      failed = {
        ...current,
        status: "error",
        error: err.message,
        updatedAt: nowIso()
      };
      latest[latestIndex] = failed;
      return latest;
    });
    return failed;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const args = parseArgs(process.argv);
  if (!existsSync(args.matter)) throw new Error(`matter directory not found: ${args.matter}`);
  mkdirSync(args.assembled, { recursive: true });

  do {
    const processed = await processOne(args);
    if (processed) {
      console.log(`${processed.status} ${processed.id}`);
    } else if (args.once) {
      console.log("no queued agent requests");
    }
    if (args.once) break;
    await sleep(args.interval);
  } while (true);
}

try {
  await main();
} catch (err) {
  console.error(`error: ${err.message}`);
  usage();
  process.exit(1);
}
