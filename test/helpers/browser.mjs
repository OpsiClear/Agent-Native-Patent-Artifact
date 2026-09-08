import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

export function browserExecutable() {
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

export function dumpDom(executable, url) {
  return new Promise((resolve, reject) => {
    const profile = mkdtempSync(join(tmpdir(), "apa-browser-profile-"));
    const child = spawn(executable, [
      `--user-data-dir=${profile}`,
      "--virtual-time-budget=5000",
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
      rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      if (code !== 0) reject(new Error(`browser exited ${code}: ${stderr.slice(0, 1000)}`));
      else resolve(stdout);
    });
  });
}

