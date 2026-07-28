#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  loadOfficialFormRegistry,
  validateOfficialFormRegistry,
} from "../packages/apa-correspondence/forms.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OFFICIAL_HOSTS = new Set(["uspto.gov", "www.uspto.gov"]);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_REDIRECTS = 3;
const ZIP_DOS_DATE_1980_01_01 = 0x0021;
const ZIP_DOS_TIME_MIDNIGHT = 0;

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export function assertOfficialUsptoUrl(value, label = "URL") {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }
  if (url.protocol !== "https:") throw new Error(`${label} must use HTTPS`);
  if (!OFFICIAL_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error(`${label} host '${url.hostname}' is not an allowed official USPTO host`);
  }
  if (url.username || url.password || url.port) {
    throw new Error(`${label} must not contain credentials or a non-default port`);
  }
  return url;
}

async function boundedBody(response, maxBytes) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error(`PDF exceeds the ${maxBytes}-byte limit (declared ${declared})`);
  }
  if (!response.body) throw new Error("PDF response has no body");
  const chunks = [];
  let total = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      total += chunk.length;
      if (total > maxBytes) throw new Error(`PDF exceeds the ${maxBytes}-byte limit`);
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

export async function fetchOfficialPdf(form, {
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxBytes = DEFAULT_MAX_BYTES,
  maxRedirects = DEFAULT_MAX_REDIRECTS,
} = {}) {
  if (typeof fetchImpl !== "function") throw new Error("fetch implementation is unavailable");
  let current = assertOfficialUsptoUrl(form.direct_url, `${form.id || "form"} direct URL`);
  const visited = new Set();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("USPTO form download timed out")), timeoutMs);
  try {
    for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
      const key = current.href;
      if (visited.has(key)) throw new Error("USPTO form redirect loop detected");
      visited.add(key);
      const response = await fetchImpl(current, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          accept: "application/pdf",
          "user-agent": "Agent-Native-Patent-Artifact-USPTO-Form-Verifier/1",
        },
      });
      if (REDIRECT_STATUSES.has(response.status)) {
        if (redirects >= maxRedirects) throw new Error(`USPTO form exceeded ${maxRedirects} redirects`);
        const location = response.headers.get("location");
        if (!location) throw new Error(`USPTO form redirect ${response.status} omitted Location`);
        current = assertOfficialUsptoUrl(new URL(location, current).href, "redirect URL");
        continue;
      }
      if (!response.ok) throw new Error(`USPTO form request failed with HTTP ${response.status}`);
      assertOfficialUsptoUrl(current.href, "final URL");
      const mediaType = String(response.headers.get("content-type") || "")
        .split(";")[0]
        .trim()
        .toLowerCase();
      if (mediaType !== "application/pdf") {
        throw new Error(`USPTO form media type '${mediaType || "missing"}' is not application/pdf`);
      }
      const bytes = await boundedBody(response, maxBytes);
      if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
        throw new Error("USPTO form body does not begin with the %PDF- signature");
      }
      if (Number.isSafeInteger(form.expected_bytes) && bytes.length !== form.expected_bytes) {
        throw new Error(`USPTO form byte count changed: expected ${form.expected_bytes}, received ${bytes.length}`);
      }
      const digest = sha256(bytes);
      if (digest !== form.sha256) {
        throw new Error(`USPTO form SHA-256 changed: expected ${form.sha256}, received ${digest}`);
      }
      return {
        bytes,
        sha256: digest,
        media_type: mediaType,
        final_url: current.href,
        redirects,
      };
    }
    throw new Error("USPTO form redirect limit exhausted");
  } finally {
    clearTimeout(timer);
  }
}

function crc32Table() {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    }
    table[index] = value >>> 0;
  }
  return table;
}

const CRC32_TABLE = crc32Table();

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = CRC32_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function safeZipName(name) {
  const normalized = String(name || "").replace(/\\/g, "/");
  if (
    !normalized
    || normalized.startsWith("/")
    || /^[A-Za-z]:/.test(normalized)
    || normalized.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error(`unsafe ZIP entry name '${name}'`);
  }
  return normalized;
}

export function buildDeterministicZip(entries) {
  const normalized = entries.map((entry) => ({
    name: safeZipName(entry.name),
    bytes: Buffer.from(entry.bytes),
  })).sort((a, b) => a.name.localeCompare(b.name));
  if (new Set(normalized.map((entry) => entry.name)).size !== normalized.length) {
    throw new Error("duplicate ZIP entry name");
  }

  const localChunks = [];
  const centralChunks = [];
  let offset = 0;
  for (const entry of normalized) {
    const name = Buffer.from(entry.name, "utf8");
    const checksum = crc32(entry.bytes);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(ZIP_DOS_TIME_MIDNIGHT, 10);
    local.writeUInt16LE(ZIP_DOS_DATE_1980_01_01, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(entry.bytes.length, 18);
    local.writeUInt32LE(entry.bytes.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localChunks.push(local, name, entry.bytes);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(ZIP_DOS_TIME_MIDNIGHT, 12);
    central.writeUInt16LE(ZIP_DOS_DATE_1980_01_01, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(entry.bytes.length, 20);
    central.writeUInt32LE(entry.bytes.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralChunks.push(central, name);

    offset += local.length + name.length + entry.bytes.length;
  }
  const centralDirectory = Buffer.concat(centralChunks);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(normalized.length, 8);
  end.writeUInt16LE(normalized.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localChunks, centralDirectory, end]);
}

export function readStoredZipEntries(zipBytes) {
  const bytes = Buffer.from(zipBytes);
  const entries = [];
  let offset = 0;
  while (offset + 4 <= bytes.length && bytes.readUInt32LE(offset) === 0x04034b50) {
    if (offset + 30 > bytes.length) throw new Error("truncated ZIP local header");
    const method = bytes.readUInt16LE(offset + 8);
    if (method !== 0) throw new Error("ZIP entry is not stored without compression");
    const expectedCrc = bytes.readUInt32LE(offset + 14);
    const compressedSize = bytes.readUInt32LE(offset + 18);
    const size = bytes.readUInt32LE(offset + 22);
    const nameLength = bytes.readUInt16LE(offset + 26);
    const extraLength = bytes.readUInt16LE(offset + 28);
    if (compressedSize !== size) throw new Error("stored ZIP entry size mismatch");
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + size;
    if (dataEnd > bytes.length) throw new Error("truncated ZIP entry");
    const name = safeZipName(bytes.subarray(nameStart, nameStart + nameLength).toString("utf8"));
    const data = bytes.subarray(dataStart, dataEnd);
    if (crc32(data) !== expectedCrc) throw new Error(`ZIP CRC mismatch for '${name}'`);
    entries.push({ name, bytes: Buffer.from(data) });
    offset = dataEnd;
  }
  if (!entries.length) throw new Error("ZIP contains no local entries");
  return entries;
}

function releaseReadme(registry) {
  const rows = registry.forms.map((form) => (
    `| ${form.form_code} | ${form.title} | ${form.release_role} | ${form.xfa ? "Adobe Reader/XFA" : "Standard PDF"} |`
  ));
  return [
    "# Verified official USPTO filing-form bundle",
    "",
    `Source listing: ${registry.source_page}`,
    `Registry retrieval date: ${registry.retrieved_date}`,
    "",
    "These are byte-for-byte copies downloaded from the official USPTO URLs in",
    "`uspto-forms-manifest.json`. Every file was restricted to official HTTPS hosts, checked for",
    "`application/pdf` and `%PDF-`, and verified against its pinned SHA-256 before bundling.",
    "",
    "Documentation aid only. Verify the current USPTO forms page, the paper's applicability, the",
    "notice, signer authority, entity status, fees, and every completed field before use. This bundle",
    "does not select a filing strategy, supply a signature or certification, pay a fee, or submit",
    "anything through Patent Center.",
    "",
    "Important viewer note: the Patent Center auto-load versions of SB/16, AIA/14, and SB/08 are",
    "Adobe XFA forms. Browser previews and generic renderers may display a blank page or only a",
    "one-page `Please wait` placeholder. Download those files and open them in Adobe Acrobat Reader. Manual SB/16 and SB/08A/B",
    "fallbacks are included for inspection; a human must decide which official form path applies.",
    "",
    "| Form | Title | Bundle role | Viewer |",
    "|---|---|---|---|",
    ...rows,
    "",
    "Use `SHA256SUMS.txt` to verify all files in the ZIP. The ZIP itself is deterministic when the",
    "registry and upstream PDF bytes are unchanged.",
    "",
  ].join("\n");
}

function bundleManifest(registry, verifiedForms) {
  return {
    schema: "apa-uspto-form-bundle-v1",
    bundle_version: registry.registry_version,
    source_page: registry.source_page,
    registry_retrieved_date: registry.retrieved_date,
    registry_sha256: sha256(`${JSON.stringify(registry, null, 2)}\n`),
    deterministic_zip: {
      compression: "store",
      entry_timestamp: "1980-01-01T00:00:00Z",
      entry_order: "UTF-8 filename ascending",
    },
    human_review_required: true,
    patent_center_submission_by_apa: false,
    forms: verifiedForms.map(({ form, result }) => ({
      id: form.id,
      form_code: form.form_code,
      title: form.title,
      applicability: form.applicability,
      release_role: form.release_role,
      filename: form.filename,
      source_page: form.source_page,
      direct_url: form.direct_url,
      verified_final_url: result.final_url,
      retrieved_date: form.retrieved_date,
      media_type: result.media_type,
      bytes: result.bytes.length,
      sha256: result.sha256,
      xfa: form.xfa,
      viewer_requirement: form.viewer_requirement,
    })),
  };
}

function checksumFile(entries) {
  return `${entries
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => `${sha256(entry.bytes)}  ${entry.name}`)
    .join("\n")}\n`;
}

function assertEmptyOutputDirectory(outputDir) {
  if (!existsSync(outputDir)) return;
  const stat = statSync(outputDir);
  if (!stat.isDirectory()) throw new Error(`output path is not a directory: ${outputDir}`);
  if (readdirSync(outputDir).length) {
    throw new Error(`output directory is not empty: ${outputDir}`);
  }
}

export async function buildUsptoFormBundle({
  registry = loadOfficialFormRegistry(),
  outputDir = join(ROOT, "dist", "uspto-forms"),
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxBytes = DEFAULT_MAX_BYTES,
  maxRedirects = DEFAULT_MAX_REDIRECTS,
} = {}) {
  const registryCheck = validateOfficialFormRegistry(registry);
  if (!registryCheck.ok) {
    throw new Error(`form registry is invalid: ${registryCheck.errors.map((item) => `${item.path}: ${item.message}`).join("; ")}`);
  }
  const output = resolve(outputDir);
  assertEmptyOutputDirectory(output);
  mkdirSync(output, { recursive: true });

  const verifiedForms = [];
  for (const form of [...registry.forms].sort((a, b) => a.filename.localeCompare(b.filename))) {
    const result = await fetchOfficialPdf(form, {
      fetchImpl,
      timeoutMs,
      maxBytes,
      maxRedirects,
    });
    writeFileSync(join(output, form.filename), result.bytes);
    verifiedForms.push({ form, result });
  }

  const readmeBytes = Buffer.from(`${releaseReadme(registry).trimEnd()}\n`, "utf8");
  const manifestBytes = Buffer.from(`${JSON.stringify(bundleManifest(registry, verifiedForms), null, 2)}\n`, "utf8");
  const payloadEntries = [
    ...verifiedForms.map(({ form, result }) => ({ name: form.filename, bytes: result.bytes })),
    { name: "README.md", bytes: readmeBytes },
    { name: "uspto-forms-manifest.json", bytes: manifestBytes },
  ];
  const checksumsBytes = Buffer.from(checksumFile(payloadEntries), "utf8");
  const zipEntries = [...payloadEntries, { name: "SHA256SUMS.txt", bytes: checksumsBytes }];
  const zipBytes = buildDeterministicZip(zipEntries);
  const zipName = `uspto-filing-forms-${registry.registry_version}.zip`;

  writeFileSync(join(output, "README.md"), readmeBytes);
  writeFileSync(join(output, "uspto-forms-manifest.json"), manifestBytes);
  writeFileSync(join(output, "SHA256SUMS.txt"), checksumsBytes);
  writeFileSync(join(output, zipName), zipBytes);

  const verification = verifyUsptoFormBundle(output, registry);
  if (!verification.ok) {
    throw new Error(`built bundle failed verification: ${verification.errors.join("; ")}`);
  }
  return {
    output_dir: output,
    zip_name: zipName,
    zip_sha256: sha256(zipBytes),
    form_count: verifiedForms.length,
    files: readdirSync(output).sort(),
  };
}

function parseChecksums(text) {
  const records = new Map();
  for (const line of String(text || "").trim().split(/\r?\n/)) {
    const match = /^([0-9a-f]{64})  ([A-Za-z0-9._-]+)$/.exec(line);
    if (!match) throw new Error(`invalid checksum line '${line}'`);
    if (records.has(match[2])) throw new Error(`duplicate checksum filename '${match[2]}'`);
    records.set(match[2], match[1]);
  }
  return records;
}

export function verifyUsptoFormBundle(outputDir, registry = loadOfficialFormRegistry()) {
  const errors = [];
  const output = resolve(outputDir);
  try {
    const manifestPath = join(output, "uspto-forms-manifest.json");
    const checksumsPath = join(output, "SHA256SUMS.txt");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const checksums = parseChecksums(readFileSync(checksumsPath, "utf8"));
    if (manifest.schema !== "apa-uspto-form-bundle-v1") errors.push("bundle manifest schema mismatch");
    if (manifest.forms?.length !== registry.forms.length) errors.push("bundle manifest form count mismatch");

    for (const form of registry.forms) {
      const path = join(output, form.filename);
      if (!existsSync(path)) {
        errors.push(`missing form '${form.filename}'`);
        continue;
      }
      const bytes = readFileSync(path);
      if (bytes.length !== form.expected_bytes) errors.push(`${form.filename}: byte count mismatch`);
      if (sha256(bytes) !== form.sha256) errors.push(`${form.filename}: SHA-256 mismatch`);
      if (checksums.get(form.filename) !== form.sha256) errors.push(`${form.filename}: checksum file mismatch`);
    }
    for (const name of ["README.md", "uspto-forms-manifest.json"]) {
      const path = join(output, name);
      if (!existsSync(path)) errors.push(`missing '${name}'`);
      else if (checksums.get(name) !== sha256(readFileSync(path))) errors.push(`${name}: checksum file mismatch`);
    }

    const zipNames = readdirSync(output).filter((name) => /\.zip$/i.test(name));
    if (zipNames.length !== 1) {
      errors.push(`expected one ZIP, found ${zipNames.length}`);
    } else {
      const zipEntries = readStoredZipEntries(readFileSync(join(output, zipNames[0])));
      const expected = [...registry.forms.map((form) => form.filename), "README.md", "SHA256SUMS.txt", "uspto-forms-manifest.json"].sort();
      const actual = zipEntries.map((entry) => entry.name).sort();
      if (JSON.stringify(actual) !== JSON.stringify(expected)) errors.push("ZIP entry set mismatch");
      const byName = new Map(zipEntries.map((entry) => [entry.name, entry.bytes]));
      for (const name of expected) {
        if (!byName.has(name)) continue;
        const disk = readFileSync(join(output, name));
        if (!disk.equals(byName.get(name))) errors.push(`ZIP entry differs from release file '${name}'`);
      }
    }

    const allowed = new Set([
      ...registry.forms.map((form) => form.filename),
      "README.md",
      "SHA256SUMS.txt",
      "uspto-forms-manifest.json",
      ...zipNames,
    ]);
    for (const name of readdirSync(output)) {
      if (!allowed.has(name)) errors.push(`unexpected bundle file '${name}'`);
    }
  } catch (error) {
    errors.push(error.message);
  }
  return { ok: errors.length === 0, errors };
}

function option(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 && index + 1 < argv.length ? argv[index + 1] : undefined;
}

async function main(argv) {
  const registryPath = option(argv, "--registry");
  const registry = registryPath
    ? loadOfficialFormRegistry(resolve(registryPath))
    : loadOfficialFormRegistry();
  const verifyDir = option(argv, "--verify");
  if (verifyDir) {
    const result = verifyUsptoFormBundle(resolve(verifyDir), registry);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result.ok ? 0 : 2;
  }
  const output = option(argv, "--output") || join(ROOT, "dist", "uspto-forms");
  const result = await buildUsptoFormBundle({ registry, outputDir: output });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main(process.argv.slice(2))
    .then((code) => { process.exitCode = code; })
    .catch((error) => {
      process.stderr.write(`error: ${error.message}\n`);
      process.exitCode = 2;
    });
}
