import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const METADATA_FETCH_POLICY = Object.freeze({
  boundary: "apa-safe-review-metadata-fetch-v1",
  scanAtSink: "apa-redact exact URL bytes",
  httpsOnly: true,
  timeoutMs: 12_000,
  maxResponseBytes: 2_000_000,
  maxRedirects: 3,
  allowedHosts: Object.freeze([
    "api.crossref.org",
    "export.arxiv.org",
    "api2.openreview.net",
    "openreview.net",
    "www.openreview.net",
    "api.github.com",
    "patents.google.com",
    "image-ppubs.uspto.gov",
    "iso.org",
    "www.iso.org",
    "mpeg.org",
    "www.mpeg.org",
    "mpeg.expert",
    "www.mpeg.expert",
  ]),
});

const ALLOWED_FETCH_HOSTS = new Set(METADATA_FETCH_POLICY.allowedHosts);
let defaultScannerPromise;

function sha256(value) {
  return createHash("sha256").update(String(value), "utf8").digest("hex");
}

export function allowedMetadataUrl(value, base) {
  const url = new URL(value, base);
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:"
    || url.username
    || url.password
    || (url.port && url.port !== "443")
    || !ALLOWED_FETCH_HOSTS.has(host)
  ) {
    throw new Error(`public metadata URL is not allowlisted: ${url.origin}`);
  }
  return url;
}

export async function responseTextBounded(response, maxBytes = METADATA_FETCH_POLICY.maxResponseBytes) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error(`public metadata response exceeds ${maxBytes} bytes`);
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function loadDefaultScanner() {
  if (!defaultScannerPromise) {
    defaultScannerPromise = (async () => {
      const candidates = [
        new URL("../../../packages/apa-redact/redact-engine.mjs", import.meta.url),
        pathToFileURL(resolve(process.cwd(), "packages", "apa-redact", "redact-engine.mjs")),
      ];
      for (const candidate of candidates) {
        try {
          const module = await import(candidate.href);
          if (typeof module.scan === "function") return module.scan;
        } catch {
          // Try the next explicit APA toolkit location.
        }
      }
      throw new Error("APA redaction engine is unavailable; public metadata network access is disabled");
    })();
  }
  return defaultScannerPromise;
}

function uniqueFindings(findings) {
  const seen = new Set();
  return findings.filter((finding) => {
    const key = `${finding?.patternName || ""}:${finding?.tier || ""}:${finding?.start ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function scanRequestUrl(requestUrl, scanImpl, approveEgress) {
  let decoded = requestUrl;
  try { decoded = decodeURIComponent(requestUrl); } catch { /* exact bytes are still scanned */ }
  const findings = uniqueFindings([
    ...scanImpl(requestUrl, { repoVisibility: "private" }),
    ...(decoded === requestUrl ? [] : scanImpl(decoded, { repoVisibility: "private" })),
  ]);
  const high = findings.filter((finding) => finding.tier === "HIGH");
  const medium = findings.filter((finding) => finding.tier === "MEDIUM");
  if (high.length) {
    throw new Error(`public metadata URL blocked by exact-egress redaction scan (${high.length} HIGH finding(s))`);
  }
  if (medium.length && !approveEgress) {
    throw new Error(
      `public metadata URL requires explicit --approve-egress (${medium.length} MEDIUM finding(s))`,
    );
  }
  return {
    high: high.length,
    medium: medium.length,
    approved: medium.length > 0 && Boolean(approveEgress),
  };
}

export async function safeMetadataFetch(url, opts = {}) {
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    return { ok: false, status: 0, url: String(url), error: "public metadata fetch is unavailable", text: "" };
  }
  const timeoutMs = Number.isFinite(opts.timeoutMs) && opts.timeoutMs > 0
    ? opts.timeoutMs
    : METADATA_FETCH_POLICY.timeoutMs;
  const maxBytes = Number.isFinite(opts.maxBytes) && opts.maxBytes > 0
    ? opts.maxBytes
    : METADATA_FETCH_POLICY.maxResponseBytes;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const egress = [];
  try {
    const scanImpl = opts.scanImpl || await loadDefaultScanner();
    let current = allowedMetadataUrl(url);
    for (let redirects = 0; redirects <= METADATA_FETCH_POLICY.maxRedirects; redirects++) {
      const requestUrl = current.href;
      const egressRecord = {
        boundary: METADATA_FETCH_POLICY.boundary,
        host: current.hostname.toLowerCase(),
        requestUrlSha256: sha256(requestUrl),
        redirectIndex: redirects,
      };
      egress.push(egressRecord);
      try {
        egressRecord.scan = scanRequestUrl(requestUrl, scanImpl, opts.approveEgress === true);
      } catch (error) {
        egressRecord.scan = { blocked: true };
        throw error;
      }
      const response = await fetchImpl(requestUrl, {
        signal: controller.signal,
        redirect: "manual",
        headers: {
          accept: opts.accept || "application/json,text/html;q=0.9,*/*;q=0.8",
          "accept-language": "en-US,en;q=0.9",
          "user-agent": "Mozilla/5.0 (compatible; apa-date-verifier/1.0; +local-evidence-gathering)",
        },
      });
      if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
        if (redirects === METADATA_FETCH_POLICY.maxRedirects) {
          throw new Error(`public metadata redirect limit exceeded for ${url}`);
        }
        current = allowedMetadataUrl(response.headers.get("location"), current);
        continue;
      }
      const text = await responseTextBounded(response, maxBytes);
      return {
        ok: response.ok,
        status: response.status,
        url: requestUrl,
        text,
        egress,
      };
    }
    throw new Error(`public metadata redirect limit exceeded for ${url}`);
  } catch (error) {
    return {
      ok: false,
      status: 0,
      url: String(url),
      error: error?.name === "AbortError"
        ? `public metadata request timed out after ${timeoutMs} ms`
        : error?.message || String(error),
      text: "",
      egress,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export default { METADATA_FETCH_POLICY, allowedMetadataUrl, responseTextBounded, safeMetadataFetch };
