import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..");
const EXAMPLE = join(REPO_ROOT, "examples", "minimal-patent-artifact");
const SCRIPTS = join(REPO_ROOT, "skills", "apa-review-form", "scripts");
const GENERATOR = join(SCRIPTS, "generate_review_form.mjs");
const E2E = join(SCRIPTS, "test_agent_bridge_e2e.mjs");
const SERVER = join(SCRIPTS, "serve_review_app.mjs");

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

test("review-form agent bridge handles create, SSE answer, and cancellation", async () => {
  const matter = mkdtempSync(join(tmpdir(), "apa-review-form-e2e-"));
  try {
    cpSync(EXAMPLE, matter, { recursive: true });
    const unrelatedPrivateSentinel = "SYNTHETIC-PRIVATE-NOTE-DO-NOT-EMBED-7F3A";
    writeFileSync(join(matter, "unrelated-private-notes.md"), unrelatedPrivateSentinel, "utf8");
    const generated = spawnSync(process.execPath, [GENERATOR, "--matter", matter], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    assert.equal(generated.status, 0, generated.stderr || generated.stdout);
    const html = readFileSync(join(matter, "assembled", "human_review_form.html"), "utf8");
    const match = html.match(/<script type="application\/json" id="review-data">([\s\S]*?)<\/script>/);
    assert.ok(match, "generated form should contain review data");
    const data = JSON.parse(match[1]);
    const strings = collectStrings(data);
    assert.equal(data.matterPath, undefined, "portable form must not embed an absolute matter path");
    assert.equal(data.apaKit, undefined, "portable form must not embed an absolute toolkit path");
    assert.equal(data.generator?.scriptPath, undefined, "portable form must not embed a generator script path");
    assert.equal(data.generator?.templatePath, undefined, "portable form must not embed a template path");
    assert.equal(strings.some(value => value.includes(matter)), false, "portable form must not contain its local matter path");
    assert.equal(
      html.includes(unrelatedPrivateSentinel),
      false,
      "generic review form must not inject unrelated private notes",
    );

    const port = await freePort();
    const result = spawnSync(
      process.execPath,
      [E2E, "--matter", matter, "--port", String(port)],
      { cwd: REPO_ROOT, encoding: "utf8", timeout: 30_000 },
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const summary = JSON.parse(result.stdout);
    assert.equal(summary.ok, true);
    assert.equal(summary.answered, summary.created);
    assert.ok(summary.sseEventCount > 0);
    assert.ok(summary.concurrentCreated >= 6);

    const networkBind = spawnSync(
      process.execPath,
      [SERVER, "--matter", matter, "--host", "0.0.0.0"],
      { cwd: REPO_ROOT, encoding: "utf8", timeout: 10_000 },
    );
    assert.notEqual(networkBind.status, 0, "review server must refuse non-loopback binding");
    assert.match(networkBind.stderr, /only permits a loopback --host/);
  } finally {
    rmSync(matter, { recursive: true, force: true });
  }
});

function collectStrings(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach(item => collectStrings(item, out));
  else if (value && typeof value === "object") {
    Object.values(value).forEach(item => collectStrings(item, out));
  }
  return out;
}
