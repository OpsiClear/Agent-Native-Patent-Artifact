#!/usr/bin/env node
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, watchFile } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { readJsonFile, updateJsonFile } from "./review_io.mjs";
import { buildReviewTargetFingerprint } from "./review_fingerprint.mjs";

function usage() {
  console.error([
    "usage: node serve_review_app.mjs --matter <matter_dir> [--port N] [--host 127.0.0.1]",
    "",
    "Serves the APA review form as a local-only dynamic app with JSON state persistence."
  ].join("\n"));
}

function parseArgs(argv) {
  const args = { port: 8765, host: "127.0.0.1" };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--matter") args.matter = argv[++i];
    else if (a === "--port") args.port = Number(argv[++i] || 0);
    else if (a === "--host") args.host = argv[++i];
    else if (a === "--help" || a === "-h") { usage(); process.exit(0); }
    else throw new Error(`unknown argument: ${a}`);
  }
  if (!args.matter) throw new Error("--matter is required");
  if (!Number.isInteger(args.port) || args.port < 1 || args.port > 65535) throw new Error("--port must be 1-65535");
  if (!isLoopbackHost(args.host)) {
    throw new Error("review app only permits a loopback --host because the form may contain confidential matter data");
  }
  args.matter = resolve(args.matter);
  args.assembled = join(args.matter, "assembled");
  args.form = join(args.assembled, "human_review_form.html");
  args.state = join(args.assembled, "human_review_state.json");
  args.agentRequests = join(args.assembled, "agent_requests.json");
  return args;
}

function isLoopbackHost(host) {
  return ["127.0.0.1", "localhost", "::1", "[::1]"].includes(String(host || "").toLowerCase());
}

function nowIso() {
  return new Date().toISOString();
}

function readRequestBody(req) {
  return new Promise((resolveBody, reject) => {
    let body = "";
    let bytes = 0;
    let settled = false;
    req.on("data", chunk => {
      if (settled) return;
      bytes += chunk.length;
      body += chunk;
      if (bytes > 5_000_000) {
        settled = true;
        const err = new Error("request body too large");
        err.status = 413;
        reject(err);
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!settled) resolveBody(body);
    });
    req.on("error", err => {
      if (!settled) reject(err);
    });
  });
}

function responseHeaders(type = "") {
  const headers = {
    "cache-control": "no-store",
    "cross-origin-resource-policy": "same-origin",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY"
  };
  if (String(type).startsWith("text/html")) {
    headers["content-security-policy"] = [
      "default-src 'none'",
      "style-src 'unsafe-inline'",
      "script-src 'unsafe-inline'",
      "connect-src 'self'",
      "img-src 'self' data:",
      "font-src 'none'",
      "frame-ancestors 'none'",
      "base-uri 'none'",
      "form-action 'none'"
    ].join("; ");
  }
  return headers;
}

function sendJson(res, status, value) {
  res.writeHead(status, {
    ...responseHeaders("application/json"),
    "content-type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(value, null, 2));
}

function sendText(res, status, text, type = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    ...responseHeaders(type),
    "content-type": type,
  });
  res.end(text);
}

function loadState(args) {
  const state = readJsonFile(args.state, {});
  if (!isRecord(state)) throw new Error("human_review_state.json must contain a JSON object");
  const { matterPath, ...safeState } = state;
  return safeState;
}

function loadFormTargetFingerprint(args) {
  const html = readFileSync(args.form, "utf8");
  const match = html.match(/<script type="application\/json" id="review-data">([\s\S]*?)<\/script>/);
  if (!match) throw new Error("review form has no embedded review-data payload");
  const data = JSON.parse(match[1]);
  const fingerprint = data.reviewTargetFingerprint;
  if (
    !isRecord(fingerprint)
    || fingerprint.schema !== "apa-human-review-target-fingerprint-v1"
    || !/^[0-9a-f]{64}$/i.test(String(fingerprint.sha256 || ""))
  ) {
    throw new Error("review form has no valid target fingerprint; regenerate the form");
  }
  return fingerprint;
}

function loadAgentRequests(args) {
  const value = readJsonFile(args.agentRequests, []);
  if (!Array.isArray(value)) throw new Error("agent_requests.json must contain a JSON array");
  return value.map(normalizeAgentRequest);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeAgentRequest(value) {
  const req = isRecord(value) ? value : {};
  const status = req.status === "open" ? "queued" : (req.status || "queued");
  return {
    schema: "apa-agent-request-v1",
    id: req.id || `REQ-${randomUUID().slice(0, 8)}`,
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

async function createAgentRequest(args, body) {
  if (!isRecord(body)) {
    const err = new Error("request body must be a JSON object");
    err.status = 400;
    throw err;
  }
  const prompt = String(body.prompt || "").trim();
  if (!prompt) {
    const err = new Error("prompt is required");
    err.status = 400;
    throw err;
  }
  if (prompt.length > 20_000) {
    const err = new Error("prompt is too long");
    err.status = 400;
    throw err;
  }
  let request;
  await updateJsonFile(args.agentRequests, [], value => {
    if (!Array.isArray(value)) throw new Error("agent_requests.json must contain a JSON array");
    const requests = value.map(normalizeAgentRequest);
    const createdAt = nowIso();
    request = normalizeAgentRequest({
      id: `REQ-${createdAt.replace(/\D/g, "").slice(0, 14)}-${randomUUID().slice(0, 6)}`,
      status: "queued",
      source: isRecord(body.source) ? body.source : {},
      prompt,
      context: isRecord(body.context) ? body.context : {},
      response: "",
      error: "",
      metadata: isRecord(body.metadata) ? body.metadata : {},
      createdAt,
      updatedAt: createdAt
    });
    requests.push(request);
    return requests;
  });
  return request;
}

async function patchAgentRequest(args, id, patch) {
  if (!isRecord(patch)) {
    const err = new Error("request body must be a JSON object");
    err.status = 400;
    throw err;
  }
  const allowedStatuses = new Set(["queued", "running", "answered", "error", "cancelled"]);
  if (patch.status !== undefined && !allowedStatuses.has(patch.status)) {
    const err = new Error("invalid agent request status");
    err.status = 400;
    throw err;
  }
  if (String(patch.response || "").length > 200_000 || String(patch.error || "").length > 20_000) {
    const err = new Error("agent response or error is too long");
    err.status = 400;
    throw err;
  }
  let next;
  await updateJsonFile(args.agentRequests, [], value => {
    if (!Array.isArray(value)) throw new Error("agent_requests.json must contain a JSON array");
    const requests = value.map(normalizeAgentRequest);
    const index = requests.findIndex(req => req.id === id);
    if (index < 0) {
      const err = new Error("agent request not found");
      err.status = 404;
      throw err;
    }
    const current = requests[index];
    next = normalizeAgentRequest({
      ...current,
      status: patch.status ?? current.status,
      response: patch.response ?? current.response,
      error: patch.error ?? current.error,
      metadata: isRecord(patch.metadata) ? { ...current.metadata, ...patch.metadata } : current.metadata,
      updatedAt: nowIso(),
      claimedAt: patch.claimedAt ?? current.claimedAt,
      completedAt: patch.completedAt ?? current.completedAt,
      cancelledAt: patch.cancelledAt ?? current.cancelledAt
    });
    requests[index] = next;
    return requests;
  });
  return next;
}

async function cancelAgentRequest(args, id) {
  let cancelled;
  await updateJsonFile(args.agentRequests, [], value => {
    if (!Array.isArray(value)) throw new Error("agent_requests.json must contain a JSON array");
    const requests = value.map(normalizeAgentRequest);
    const index = requests.findIndex(req => req.id === id);
    if (index < 0) {
      const err = new Error("agent request not found");
      err.status = 404;
      throw err;
    }
    const current = requests[index];
    if (["answered", "error", "cancelled"].includes(current.status)) {
      cancelled = current;
      return requests;
    }
    const cancelledAt = nowIso();
    cancelled = normalizeAgentRequest({
      ...current,
      status: "cancelled",
      cancelledAt,
      updatedAt: cancelledAt
    });
    requests[index] = cancelled;
    return requests;
  });
  return cancelled;
}

function sendSse(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function broadcastAgentRequests(args) {
  const requests = loadAgentRequests(args);
  for (const client of args.sseClients || []) {
    sendSse(client, "agent-requests", requests);
  }
}

function addSseClient(args, res) {
  args.sseClients = args.sseClients || new Set();
  res.writeHead(200, {
    ...responseHeaders("text/event-stream"),
    "content-type": "text/event-stream; charset=utf-8",
    connection: "keep-alive",
    "x-accel-buffering": "no"
  });
  args.sseClients.add(res);
  sendSse(res, "connected", { ok: true, connectedAt: nowIso() });
  sendSse(res, "agent-requests", loadAgentRequests(args));
  const heartbeat = setInterval(() => sendSse(res, "heartbeat", { at: nowIso() }), 25_000);
  res.on("close", () => {
    clearInterval(heartbeat);
    args.sseClients.delete(res);
  });
}

function augmentedHtml(args) {
  const html = readFileSync(args.form, "utf8");
  const match = html.match(/(<script type="application\/json" id="review-data">)([\s\S]*?)(<\/script>)/);
  if (!match) return html;
  const data = JSON.parse(match[2]);
  const state = loadState(args);
  const augmented = {
    ...data,
    serverMode: true,
    initialAnswers: state.answers || {},
    initialTargetFingerprint: state.targetFingerprint || null,
    initialRevision: Number.isSafeInteger(state.revision) ? state.revision : 0,
    agentRequests: loadAgentRequests(args)
  };
  const json = JSON.stringify(augmented).replace(/<\/script/gi, "<\\/script");
  return `${html.slice(0, match.index)}${match[1]}${json}${match[3]}${html.slice(match.index + match[0].length)}`;
}

async function readJsonBody(req) {
  const type = String(req.headers["content-type"] || "").split(";", 1)[0].trim().toLowerCase();
  if (type !== "application/json") {
    const err = new Error("content-type must be application/json");
    err.status = 415;
    throw err;
  }
  const text = await readRequestBody(req);
  try {
    return JSON.parse(text || "{}");
  } catch {
    const err = new Error("request body must be valid JSON");
    err.status = 400;
    throw err;
  }
}

async function handleApi(req, res, args, pathname) {
  const agentMatch = pathname.match(/^\/api\/agent-requests\/([^/]+)(?:\/(cancel))?$/);
  if (pathname === "/api/state" && req.method === "GET") {
    return sendJson(res, 200, loadState(args));
  }
  if (pathname === "/api/state" && req.method === "PUT") {
    const body = await readJsonBody(req);
    if (!isRecord(body) || !isRecord(body.answers || {})) {
      const err = new Error("answers must be a JSON object");
      err.status = 400;
      throw err;
    }
    if (body.revision !== undefined && (!Number.isSafeInteger(body.revision) || body.revision < 0)) {
      const err = new Error("revision must be a non-negative safe integer");
      err.status = 400;
      throw err;
    }
    let state;
    let revisionConflict = false;
    const formTargetFingerprint = loadFormTargetFingerprint(args);
    const liveTarget = buildReviewTargetFingerprint(args.matter);
    const submitted = body.targetFingerprint;
    if (submitted?.schema !== formTargetFingerprint.schema
      || submitted?.contract !== formTargetFingerprint.contract
      || submitted?.sha256 !== formTargetFingerprint.sha256
      || liveTarget.sha256 !== formTargetFingerprint.sha256) {
      return sendJson(res, 409, { code: "REVIEW_TARGET_CHANGED", targetFingerprint: liveTarget,
        error: "Review target changed or missing; regenerate the form and review again." });
    }
    await updateJsonFile(args.state, {}, currentValue => {
      if (!isRecord(currentValue)) throw new Error("human_review_state.json must contain a JSON object");
      const current = currentValue;
      const currentRevision = Number.isSafeInteger(current.revision) ? current.revision : 0;
      const requestedRevision = body.revision ?? currentRevision + 1;
      if (requestedRevision <= currentRevision) {
        revisionConflict = true;
        state = current;
        return current;
      }
      state = {
        schema: "apa-human-review-state-v2",
        revision: requestedRevision,
        updatedAt: new Date().toISOString(),
        targetFingerprint: submitted,
        answers: body.answers || {}
      };
      return state;
    });
    if (revisionConflict) {
      return sendJson(res, 409, { ...state, error: "state revision conflict" });
    }
    return sendJson(res, 200, state);
  }
  if (pathname === "/api/agent-requests" && req.method === "GET") {
    return sendJson(res, 200, loadAgentRequests(args));
  }
  if (pathname === "/api/agent-requests" && req.method === "POST") {
    const body = await readJsonBody(req);
    const request = await createAgentRequest(args, body);
    broadcastAgentRequests(args);
    return sendJson(res, 201, request);
  }
  if (agentMatch && req.method === "PATCH" && !agentMatch[2]) {
    const body = await readJsonBody(req);
    const request = await patchAgentRequest(args, decodeURIComponent(agentMatch[1]), body);
    broadcastAgentRequests(args);
    return sendJson(res, 200, request);
  }
  if (agentMatch && req.method === "POST" && agentMatch[2] === "cancel") {
    const request = await cancelAgentRequest(args, decodeURIComponent(agentMatch[1]));
    broadcastAgentRequests(args);
    return sendJson(res, 200, request);
  }
  if (pathname === "/api/agent-events" && req.method === "GET") {
    return addSseClient(args, res);
  }
  if (pathname === "/api/status" && req.method === "GET") {
    return sendJson(res, 200, {
      ok: true,
      serverMode: true
    });
  }
  return sendJson(res, 404, { error: "not found" });
}

function hostForUrl(host) {
  const value = String(host || "");
  return value.includes(":") && !value.startsWith("[") ? `[${value}]` : value;
}

function serverOrigin(args) {
  return `http://${hostForUrl(args.host)}:${args.port}`;
}

function requestOriginAllowed(req, args) {
  const authority = `${hostForUrl(args.host)}:${args.port}`.toLowerCase();
  if (String(req.headers.host || "").toLowerCase() !== authority) return false;
  const origin = req.headers.origin;
  return !origin || String(origin).toLowerCase() === `http://${authority}`;
}

function main() {
  const args = parseArgs(process.argv);
  if (!existsSync(args.matter)) throw new Error(`matter directory not found: ${args.matter}`);
  if (!existsSync(args.form)) throw new Error(`review form not found: ${args.form}`);
  mkdirSync(args.assembled, { recursive: true });
  args.sseClients = new Set();
  watchFile(args.agentRequests, { interval: 500 }, () => broadcastAgentRequests(args));

  const server = createServer(async (req, res) => {
    try {
      if (!requestOriginAllowed(req, args)) return sendText(res, 403, "forbidden origin");
      const url = new URL(req.url || "/", serverOrigin(args));
      if (url.pathname.startsWith("/api/")) return await handleApi(req, res, args, url.pathname);
      if (url.pathname === "/favicon.ico") {
        res.writeHead(204, { ...responseHeaders(), "cache-control": "public, max-age=86400" });
        return res.end();
      }
      if (req.method !== "GET" || !["/", "/human_review_form.html"].includes(url.pathname)) {
        return sendText(res, 404, "not found");
      }
      return sendText(res, 200, augmentedHtml(args), "text/html; charset=utf-8");
    } catch (err) {
      return sendJson(res, err.status || 500, { error: err.message });
    }
  });

  server.listen(args.port, args.host, () => {
    console.log(`APA review app: ${serverOrigin(args)}/human_review_form.html`);
    console.log(`State file: ${args.state}`);
  });
}

try {
  main();
} catch (err) {
  console.error(`error: ${err.message}`);
  usage();
  process.exit(1);
}
