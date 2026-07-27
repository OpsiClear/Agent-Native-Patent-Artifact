#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { atomicWriteJson } from "./review_io.mjs";

function usage() {
  console.error([
    "usage: node test_agent_bridge_e2e.mjs --matter <matter_dir> [--port N]",
    "",
    "Runs a local end-to-end test for agent request API, SSE updates, and mock worker processing."
  ].join("\n"));
}

function parseArgs(argv) {
  const args = { port: 8799 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--matter") args.matter = argv[++i];
    else if (a === "--port") args.port = Number(argv[++i] || 0);
    else if (a === "--help" || a === "-h") { usage(); process.exit(0); }
    else throw new Error(`unknown argument: ${a}`);
  }
  if (!args.matter) throw new Error("--matter is required");
  if (!Number.isInteger(args.port) || args.port < 1 || args.port > 65535) throw new Error("--port must be 1-65535");
  args.matter = resolve(args.matter);
  args.assembled = join(args.matter, "assembled");
  args.form = join(args.assembled, "human_review_form.html");
  args.agentRequests = join(args.assembled, "agent_requests.json");
  return args;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitFor(fn, label, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (err) {
      lastError = err;
    }
    await sleep(100);
  }
  throw new Error(`timed out waiting for ${label}${lastError ? `: ${lastError.message}` : ""}`);
}

async function fetchJson(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`${res.status} ${data.error || text}`);
  return data;
}

async function watchSse(url, onEvent, signal) {
  const res = await fetch(url, { signal });
  if (!res.ok || !res.body) throw new Error(`SSE failed: ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (!signal.aborted) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let split;
    while ((split = buffer.indexOf("\n\n")) >= 0) {
      const chunk = buffer.slice(0, split);
      buffer = buffer.slice(split + 2);
      const event = { event: "message", data: "" };
      for (const line of chunk.split(/\n/)) {
        if (line.startsWith("event:")) event.event = line.slice(6).trim();
        if (line.startsWith("data:")) event.data += line.slice(5).trim();
      }
      onEvent(event);
    }
  }
}

function runNode(script, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [script, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", chunk => { output += chunk; });
    child.stderr.on("data", chunk => { output += chunk; });
    child.on("error", rejectRun);
    child.on("exit", code => {
      if (code === 0) resolveRun(output);
      else rejectRun(new Error(`child exited ${code}: ${output}`));
    });
  });
}

async function main() {
  const sourceArgs = parseArgs(process.argv);
  if (!existsSync(sourceArgs.form)) throw new Error(`review form not found: ${sourceArgs.form}`);

  const tempBase = resolve(tmpdir());
  const sandboxRoot = mkdtempSync(join(tempBase, "apa-review-bridge-"));
  const sandboxMatter = join(sandboxRoot, "matter");
  cpSync(sourceArgs.matter, sandboxMatter, { recursive: true });
  const args = {
    ...sourceArgs,
    matter: sandboxMatter,
    assembled: join(sandboxMatter, "assembled"),
    form: join(sandboxMatter, "assembled", "human_review_form.html"),
    agentRequests: join(sandboxMatter, "assembled", "agent_requests.json")
  };
  mkdirSync(args.assembled, { recursive: true });

  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const serverScript = join(scriptDir, "serve_review_app.mjs");
  const workerScript = join(scriptDir, "agent_worker.mjs");
  atomicWriteJson(args.agentRequests, []);

  const server = spawn(process.execPath, [serverScript, "--matter", args.matter, "--port", String(args.port)], {
    stdio: ["ignore", "pipe", "pipe"]
  });
  let serverLog = "";
  server.stdout.on("data", chunk => { serverLog += chunk; });
  server.stderr.on("data", chunk => { serverLog += chunk; });

  const base = `http://127.0.0.1:${args.port}`;
  const controller = new AbortController();
  const sseEvents = [];

  try {
    await waitFor(async () => {
      const status = await fetchJson(`${base}/api/status`);
      if (JSON.stringify(status).includes(args.matter)) throw new Error("status endpoint exposed the local matter path");
      return status.ok;
    }, "server status");

    const formResponse = await fetch(`${base}/human_review_form.html`);
    if (!formResponse.ok) throw new Error(`review form failed: ${formResponse.status}`);
    if (!formResponse.headers.get("content-security-policy")?.includes("default-src 'none'")) {
      throw new Error("review form response is missing its restrictive content security policy");
    }
    const privateStatic = await fetch(`${base}/agent_requests.json`);
    if (privateStatic.status !== 404) throw new Error(`assembled files must not be served; got ${privateStatic.status}`);
    const hostileOrigin = await fetch(`${base}/api/status`, { headers: { origin: "http://example.invalid" } });
    if (hostileOrigin.status !== 403) throw new Error(`hostile origin must be rejected; got ${hostileOrigin.status}`);
    const wrongContentType = await fetch(`${base}/api/agent-requests`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: JSON.stringify({ prompt: "must not be accepted" })
    });
    if (wrongContentType.status !== 415) {
      throw new Error(`non-JSON mutation must be rejected; got ${wrongContentType.status}`);
    }

    await fetchJson(`${base}/api/state`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ revision: 2, answers: { ordering: "newer" } })
    });
    const staleStateResponse = await fetch(`${base}/api/state`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ revision: 1, answers: { ordering: "stale" } })
    });
    if (staleStateResponse.status !== 409) {
      throw new Error(`stale state write must report a conflict; got ${staleStateResponse.status}`);
    }
    const staleState = await staleStateResponse.json();
    if (staleState.revision !== 2 || staleState.answers?.ordering !== "newer") {
      throw new Error("state conflict response must return the current persisted state");
    }
    const orderedState = await fetchJson(`${base}/api/state`);
    if (orderedState.revision !== 2 || orderedState.answers?.ordering !== "newer") {
      throw new Error("stale state write replaced a newer revision");
    }

    const ssePromise = watchSse(`${base}/api/agent-events`, event => {
      if (event.event === "agent-requests") {
        try { sseEvents.push(JSON.parse(event.data)); } catch {}
      }
    }, controller.signal).catch(err => {
      if (!controller.signal.aborted) throw err;
    });

    const created = await fetchJson(`${base}/api/agent-requests`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt: "E2E mock review request",
        source: { pageId: "claims", cardId: "CLM-E2E", title: "E2E Claim" },
        context: { exactText: "A test claim exact text.", currentStatus: "Pending", currentNotes: "" }
      })
    });
    if (created.status !== "queued") throw new Error(`expected queued request, got ${created.status}`);

    const worker = spawnSync(process.execPath, [workerScript, "--matter", args.matter, "--adapter", "mock", "--once"], {
      encoding: "utf8"
    });
    if (worker.status !== 0) throw new Error(`worker failed: ${worker.stderr || worker.stdout}`);

    const answered = await waitFor(async () => {
      const requests = await fetchJson(`${base}/api/agent-requests`);
      return requests.find(req => req.id === created.id && req.status === "answered");
    }, "answered request");
    if (!answered.response.includes("Mock local agent reviewed")) throw new Error("mock response missing expected text");

    await waitFor(() => {
      return sseEvents.some(list => Array.isArray(list) && list.some(req => req.id === created.id && req.status === "answered"));
    }, "answered SSE event");

    const cancellable = await fetchJson(`${base}/api/agent-requests`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "E2E cancel request" })
    });
    const cancelled = await fetchJson(`${base}/api/agent-requests/${encodeURIComponent(cancellable.id)}/cancel`, { method: "POST" });
    if (cancelled.status !== "cancelled") throw new Error(`expected cancelled request, got ${cancelled.status}`);

    const concurrent = await Promise.all(Array.from({ length: 8 }, (_, index) =>
      fetchJson(`${base}/api/agent-requests`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: `Concurrent request ${index + 1}` })
      })
    ));
    const afterConcurrent = await fetchJson(`${base}/api/agent-requests`);
    if (!concurrent.every(item => afterConcurrent.some(saved => saved.id === item.id))) {
      throw new Error("a concurrent request append was lost");
    }

    await Promise.all(concurrent.map(() =>
      runNode(workerScript, ["--matter", args.matter, "--adapter", "mock", "--once"])
    ));
    const afterWorkers = await fetchJson(`${base}/api/agent-requests`);
    if (!concurrent.every(item => afterWorkers.find(saved => saved.id === item.id)?.status === "answered")) {
      throw new Error("concurrent workers did not claim each queued request exactly once");
    }

    const racing = await fetchJson(`${base}/api/agent-requests`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "Cancellation must win over worker completion" })
    });
    const delayedWorker = runNode(workerScript, [
      "--matter", args.matter,
      "--adapter", "mock",
      "--once",
      "--mock-delay", "500"
    ]);
    await waitFor(async () => {
      const requests = await fetchJson(`${base}/api/agent-requests`);
      return requests.find(req => req.id === racing.id)?.status === "running";
    }, "worker claim before cancellation");
    await fetchJson(`${base}/api/agent-requests/${encodeURIComponent(racing.id)}/cancel`, { method: "POST" });
    await delayedWorker;
    const afterRace = await fetchJson(`${base}/api/agent-requests`);
    if (afterRace.find(req => req.id === racing.id)?.status !== "cancelled") {
      throw new Error("worker completion overwrote cancellation");
    }

    controller.abort();
    await ssePromise;
    console.log(JSON.stringify({
      ok: true,
      created: created.id,
      answered: answered.id,
      cancelled: cancelled.id,
      sseEventCount: sseEvents.length,
      concurrentCreated: concurrent.length,
      cancellationWon: racing.id
    }, null, 2));
  } finally {
    controller.abort();
    server.kill();
    if (server.exitCode === null) {
      await Promise.race([
        new Promise(resolve => server.on("exit", resolve)),
        sleep(1000)
      ]);
    }
    if (server.exitCode && server.exitCode !== 0 && serverLog) {
      console.error(serverLog);
    }
    const rel = relative(tempBase, resolve(sandboxRoot));
    if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
      throw new Error("refusing unsafe E2E sandbox cleanup");
    }
    rmSync(sandboxRoot, { recursive: true, force: true });
  }
}

try {
  await main();
} catch (err) {
  console.error(`error: ${err.message}`);
  usage();
  process.exit(1);
}
