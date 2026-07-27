import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "../packages/apa-viewer/build_manifest.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const EXAMPLE = join(ROOT, "examples", "minimal-patent-artifact");
const VIEWER = join(ROOT, "packages", "apa-viewer");

function browserExecutable() {
  const candidates = process.platform === "win32"
    ? [
        join(process.env["ProgramFiles(x86)"] || "", "Microsoft", "Edge", "Application", "msedge.exe"),
        join(process.env.ProgramFiles || "", "Microsoft", "Edge", "Application", "msedge.exe"),
        join(process.env.ProgramFiles || "", "Google", "Chrome", "Application", "chrome.exe"),
        join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"),
      ]
    : process.platform === "darwin"
      ? [
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        ]
      : [
          "/usr/bin/google-chrome",
          "/usr/bin/google-chrome-stable",
          "/usr/bin/chromium",
          "/usr/bin/chromium-browser",
          "/usr/bin/microsoft-edge",
        ];
  return candidates.find((candidate) => candidate && existsSync(candidate)) || "";
}

function contentType(path) {
  return {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
  }[extname(path)] || "application/octet-stream";
}

function dumpDom(executable, url) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--no-sandbox",
      "--dump-dom",
      url,
    ], { windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`browser DOM dump timed out: ${stderr.slice(0, 500)}`));
    }, 30_000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`browser exited ${code}: ${stderr.slice(0, 1000)}`));
      else resolve(stdout);
    });
  });
}

test("real browser renders viewer review panels and wrong-kind/collision diagnostics", async (t) => {
  const executable = browserExecutable();
  if (!executable) {
    t.skip("Chrome/Edge/Chromium is not installed");
    return;
  }
  const root = mkdtempSync(join(tmpdir(), "apa-viewer-browser-"));
  const matter = join(root, "matter");
  const site = join(root, "site");
  let server;
  try {
    cpSync(EXAMPLE, matter, { recursive: true });
    cpSync(VIEWER, site, { recursive: true });
    const patentPath = join(matter, "PATENT.md");
    const claimsPath = join(matter, "logic", "claims.md");
    const specPath = join(matter, "src", "embodiments.md");
    writeFileSync(patentPath, readFileSync(patentPath, "utf8").replaceAll("AINVENTOR", "CLM01"));
    writeFileSync(
      claimsPath,
      readFileSync(claimsPath, "utf8")
        .replaceAll("AINVENTOR", "CLM01")
        .replace("supported_by: [SPEC0002]", "supported_by: [CLM01]"),
    );
    writeFileSync(specPath, readFileSync(specPath, "utf8").replaceAll("AINVENTOR", "CLM01"));
    writeFileSync(join(site, "manifest.json"), JSON.stringify(build(matter)));

    server = createServer((req, res) => {
      const name = req.url === "/" ? "index.html" : String(req.url || "").replace(/^\/+/, "").split("?", 1)[0];
      const path = join(site, name);
      if (!["index.html", "viewer.js", "style.css", "manifest.json"].includes(name) || !existsSync(path)) {
        res.writeHead(404).end("not found");
        return;
      }
      res.writeHead(200, {
        "content-type": contentType(path),
        "cache-control": "no-store",
      });
      res.end(readFileSync(path));
    });
    await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
    const address = server.address();
    const dom = await dumpDom(executable, `http://127.0.0.1:${address.port}/`);
    assert.match(dom, /Review <span class="blurb">read-only checklist<\/span>/);
    assert.match(dom, /duplicate node id \(inventor, claim\)/);
    assert.match(dom, /expected spec-paragraph; found claim/);
    assert.match(dom, /unresolved edge/);
    assert.doesNotMatch(dom, /APA Viewer error:/);
  } finally {
    if (server) await new Promise((resolveClose) => server.close(resolveClose));
    rmSync(root, { recursive: true, force: true });
  }
});
