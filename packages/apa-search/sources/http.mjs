export const DEFAULT_TIMEOUT_MS = 30000;
export const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export async function guardedFetch(url, init = {}, opts = {}) {
  const doFetch = opts.fetch || globalThis.fetch;
  if (typeof doFetch !== "function") throw new Error("global fetch unavailable");
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
