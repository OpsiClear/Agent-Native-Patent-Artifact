export const DEFAULT_TIMEOUT_MS = 30000;
export const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

const LAST_REQUEST_AT = new Map();

export async function guardedFetch(url, init = {}, opts = {}) {
  const doFetch = opts.fetch || globalThis.fetch;
  if (typeof doFetch !== "function") throw new Error("global fetch unavailable");
  await applyRateLimit(opts);
  const timeoutMs = Math.max(1, Number(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS) | 0);
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort();
    else opts.signal.addEventListener("abort", abortFromCaller, { once: true });
  }
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await doFetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    if (opts.signal) opts.signal.removeEventListener("abort", abortFromCaller);
  }
}

export async function applyRateLimit(opts = {}) {
  if (opts.disableRateLimit) return { waited_ms: 0 };
  const key = opts.rateLimitKey;
  const minIntervalMs = Math.max(0, Number(opts.minIntervalMs ?? 0) | 0);
  if (!key || !minIntervalMs) return { waited_ms: 0 };

  const now = Date.now();
  const last = LAST_REQUEST_AT.get(key) || 0;
  const waitMs = Math.max(0, last + minIntervalMs - now);
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
  LAST_REQUEST_AT.set(key, Date.now());
  return { waited_ms: waitMs };
}

export function resetRateLimitState() {
  LAST_REQUEST_AT.clear();
}

export async function readTextCapped(res, opts = {}) {
  const maxBytes = Math.max(1, Number(opts.maxBytes ?? DEFAULT_MAX_RESPONSE_BYTES) | 0);
  if (res?.body && typeof res.body.getReader === "function") {
    const reader = res.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value instanceof Uint8Array ? value : new TextEncoder().encode(String(value));
      total += chunk.byteLength;
      if (total > maxBytes) throw new Error(`response too large (${total} bytes > ${maxBytes})`);
      chunks.push(chunk);
    }
    return new TextDecoder().decode(concat(chunks, total));
  }
  if (typeof res?.text === "function") {
    const text = await res.text();
    const bytes = new TextEncoder().encode(String(text)).byteLength;
    if (bytes > maxBytes) throw new Error(`response too large (${bytes} bytes > ${maxBytes})`);
    return String(text);
  }
  if (typeof res?.json === "function") {
    const text = JSON.stringify(await res.json());
    const bytes = new TextEncoder().encode(text).byteLength;
    if (bytes > maxBytes) throw new Error(`response too large (${bytes} bytes > ${maxBytes})`);
    return text;
  }
  throw new Error("response body unavailable");
}

export async function readJsonCapped(res, opts = {}) {
  return JSON.parse(await readTextCapped(res, opts));
}

function concat(chunks, total) {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}
