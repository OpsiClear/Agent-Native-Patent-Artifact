import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  parse,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";

export const PROFILE_SCHEMA = "apa-pdf-form-profiles-v1";
export const PLAN_SCHEMA = "apa-pdf-fill-plan-v1";
export const CONFIRMATION_SCHEMA = "apa-pdf-fill-confirmation-v1";
export const REVIEW_MANIFEST_SCHEMA = "apa-pdf-fill-review-v1";
export const ENGINE_VERSION = "1.17.1";
export const MAX_JSON_BYTES = 5 * 1024 * 1024;
export const MAX_PDF_BYTES = 64 * 1024 * 1024;
export const MAX_FIELD_VALUE_CHARS = 10_000;
export const MAX_SELECTED_VALUE_BYTES = 1024 * 1024;
export const MAX_AUTOMATED_FONT_SIZE = 10;
export const MIN_AUTOMATED_FONT_SIZE = 4;
export const CONFIDENTIAL_WORKFLOW_MODES = Object.freeze([
  "ordinary_local",
  "counsel_controlled",
  "shareable_redacted",
]);
export const DATA_HANDLING_MODES = Object.freeze([
  "local-only",
  "remote-host-acknowledged",
]);
export const INTERACTION_HOSTS = Object.freeze([
  "claude-code",
  "codex",
  "cursor",
  "chatgpt",
  "other",
]);
const CONFIRMATION_SCOPE = "field values displayed in the plan review only";
const CONFIRMATION_EXCLUSIONS = Object.freeze([
  "signature",
  "certification",
  "entity-status assertion",
  "fee election",
  "payment",
  "filing",
]);
const MANIFEST_BOUNDARIES = Object.freeze({
  filing_ready: false,
  signatures_left_human_owned: true,
  certifications_left_human_owned: true,
  entity_status_left_human_owned: true,
  fee_elections_left_human_owned: true,
  payment_left_human_owned: true,
  filing_confirmation: false,
});
const MANIFEST_PRIVACY = Object.freeze({
  classification: "private-matter-artifact",
  plaintext_field_values_omitted: true,
  contains_value_derived_digest: true,
});
const WINDOWS_INVALID_SEGMENT_CHARACTERS = /[<>:"|?*\u0000-\u001f\u007f]/u;
const WINDOWS_RESERVED_SEGMENT =
  /^(?:con|prn|aux|nul|clock\$|conin\$|conout\$|com[1-9\u00b9\u00b2\u00b3]|lpt[1-9\u00b9\u00b2\u00b3])(?:\..*)?$/iu;

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = resolve(SCRIPT_DIR, "..");
const DEFAULT_PROFILE_PATH = join(SKILL_DIR, "references", "form-profiles.json");
const DEFAULT_ENGINE_PATH = join(SCRIPT_DIR, "vendor", `pdf-lib-${ENGINE_VERSION}.cjs`);
const DEFAULT_ENGINE_SHA256 = "0f9a5cad07941f0826586c94e089d89b918c46e5c17cf2d5a3c6f666e3bc694f";
const require = createRequire(import.meta.url);

let defaultEngineCache;
let defaultProfilesCache;

export class FormFillError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "FormFillError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function fail(code, message, details) {
  throw new FormFillError(code, message, details);
}

export function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function assertExactObjectKeys(value, expectedKeys, code, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(code, `${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    fail(code, `${label} contains missing or unexpected properties`);
  }
}

export function hasXfaMarker(bytes) {
  const text = Buffer.from(bytes).toString("latin1");
  return /\/XFA(?:\s|\/|\[|<)/.test(text)
    || /<xdp:xdp(?:\s|>)/i.test(text)
    || /<template(?:\s|>)[\s\S]{0,2048}xmlns="http:\/\/www\.xfa\.org\//i.test(text);
}

function fwd(path) {
  return String(path).split("\\").join("/");
}

function isWithin(root, candidate) {
  const rel = relative(root, candidate);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function assertMatterRelativePathString(path, label) {
  if (typeof path !== "string" || !path || isAbsolute(path) || path.includes("\\")) {
    fail("PATH_NOT_RELATIVE", `${label} must be a normalized matter-relative path using forward slashes`);
  }
  const segments = path.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    fail("PATH_NOT_RELATIVE", `${label} must be a normalized matter-relative path using forward slashes`);
  }
  for (const segment of segments) {
    if (
      WINDOWS_INVALID_SEGMENT_CHARACTERS.test(segment)
      || /[ .]$/u.test(segment)
      || WINDOWS_RESERVED_SEGMENT.test(segment)
    ) {
      fail(
        "PATH_SEGMENT_UNSAFE",
        `${label} contains a Windows-invalid, reserved, control-character, or alternate-data-stream path segment`,
      );
    }
  }
  return path;
}

function assertPlainFile(path, label) {
  if (!existsSync(path)) fail("FILE_NOT_FOUND", `${label} does not exist`);
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) fail("SYMLINK_REFUSED", `${label} must not be a symbolic link`);
  if (!stat.isFile()) fail("NOT_A_FILE", `${label} must be a regular file`);
}

function readBoundedFile(path, {
  label,
  maxBytes,
  code,
}) {
  assertPlainFile(path, label);
  const size = lstatSync(path).size;
  if (size > maxBytes) fail(code, `${label} exceeds the local size limit`);
  return readFileSync(path);
}

function assertSafeExistingPath(matter, candidate, label) {
  assertPlainFile(candidate, label);
  const real = realpathSync(candidate);
  if (!isWithin(matter, real)) fail("PATH_ESCAPE", `${label} escapes the matter directory`);
  return real;
}

function assertNoSymlinkComponents(matter, targetParent) {
  if (!isWithin(matter, targetParent)) fail("PATH_ESCAPE", "output directory escapes the matter directory");
  const rel = relative(matter, targetParent);
  let cursor = matter;
  for (const segment of rel.split(sep).filter(Boolean)) {
    cursor = join(cursor, segment);
    if (!existsSync(cursor)) continue;
    const stat = lstatSync(cursor);
    if (stat.isSymbolicLink()) fail("SYMLINK_REFUSED", "output path contains a symbolic-link directory");
    if (!stat.isDirectory()) fail("NOT_A_DIRECTORY", "output path contains a non-directory component");
  }
}

export function requireMatter(matterPath) {
  if (!matterPath) fail("MATTER_REQUIRED", "--matter <dir> is required");
  const candidate = resolve(matterPath);
  if (!existsSync(candidate)) fail("MATTER_NOT_FOUND", "matter directory does not exist");
  const stat = lstatSync(candidate);
  if (stat.isSymbolicLink()) fail("SYMLINK_REFUSED", "matter directory must not be a symbolic link");
  if (!stat.isDirectory()) fail("MATTER_INVALID", "matter path must be a directory");
  const matter = realpathSync(candidate);
  const patent = join(matter, "PATENT.md");
  assertSafeExistingPath(matter, patent, "PATENT.md");
  return matter;
}

export function resolveMatterFile(matter, inputPath, {
  label = "file",
  mustExist = true,
  extension = undefined,
} = {}) {
  if (!inputPath || typeof inputPath !== "string") fail("PATH_REQUIRED", `${label} path is required`);
  const relativePath = assertMatterRelativePathString(inputPath, label);
  const candidate = resolve(matter, relativePath);
  if (!isWithin(matter, candidate)) fail("PATH_ESCAPE", `${label} must stay inside the matter directory`);
  if (extension && extname(candidate).toLowerCase() !== extension.toLowerCase()) {
    fail("WRONG_EXTENSION", `${label} must use the ${extension} extension`);
  }
  if (mustExist) return assertSafeExistingPath(matter, candidate, label);
  assertNoSymlinkComponents(matter, dirname(candidate));
  return candidate;
}

function parseRequiredConfidentialWorkflowMode(matter) {
  const patentPath = join(matter, "PATENT.md");
  const bytes = readBoundedFile(patentPath, {
    label: "PATENT.md",
    maxBytes: MAX_JSON_BYTES,
    code: "PATENT_METADATA_TOO_LARGE",
  });
  const text = bytes.toString("utf8");
  const frontmatter = /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/u.exec(text);
  if (!frontmatter) {
    fail("PATENT_FRONTMATTER_REQUIRED", "PATENT.md needs YAML frontmatter with confidential_workflow_mode");
  }
  const matches = [];
  for (const line of frontmatter[1].split(/\r?\n/u)) {
    const match = /^confidential_workflow_mode[ \t]*:[ \t]*(.*)$/u.exec(line);
    if (match) matches.push(match[1]);
  }
  if (matches.length !== 1) {
    fail(
      "CONFIDENTIAL_WORKFLOW_MODE_REQUIRED",
      "PATENT.md must declare confidential_workflow_mode exactly once at the top level",
    );
  }
  let raw = matches[0].trim();
  let mode;
  if (raw.startsWith('"')) {
    const quoted = /^("(?:[^"\\]|\\.)*")[ \t]*(?:#.*)?$/u.exec(raw);
    if (!quoted) {
      fail("CONFIDENTIAL_WORKFLOW_MODE_INVALID", "confidential_workflow_mode has invalid quoting");
    }
    try {
      mode = JSON.parse(quoted[1]);
    } catch {
      fail("CONFIDENTIAL_WORKFLOW_MODE_INVALID", "confidential_workflow_mode has invalid quoting");
    }
  } else if (raw.startsWith("'")) {
    const quoted = /^'((?:[^']|'')*)'[ \t]*(?:#.*)?$/u.exec(raw);
    if (!quoted) {
      fail("CONFIDENTIAL_WORKFLOW_MODE_INVALID", "confidential_workflow_mode has invalid quoting");
    }
    mode = quoted[1].replace(/''/gu, "'");
  } else {
    raw = raw.replace(/[ \t]+#.*$/u, "").trim();
    mode = raw;
  }
  if (!CONFIDENTIAL_WORKFLOW_MODES.includes(mode)) {
    fail(
      "CONFIDENTIAL_WORKFLOW_MODE_INVALID",
      `confidential_workflow_mode must be one of ${CONFIDENTIAL_WORKFLOW_MODES.join(", ")}`,
    );
  }
  return mode;
}

export function relativeMatterPath(matter, path) {
  const rel = relative(matter, path);
  if (!rel || rel === "." || !isWithin(matter, path)) fail("PATH_ESCAPE", "path is not a matter-local file");
  return fwd(rel);
}

function readJson(path, label) {
  const bytes = readBoundedFile(path, {
    label,
    maxBytes: MAX_JSON_BYTES,
    code: "JSON_TOO_LARGE",
  });
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    fail("INVALID_JSON", `${label} is not valid JSON: ${error.message}`);
  }
}

export function loadProfiles(profilePath = DEFAULT_PROFILE_PATH) {
  if (profilePath === DEFAULT_PROFILE_PATH && defaultProfilesCache) return defaultProfilesCache;
  const registry = readJson(profilePath, "form profile registry");
  validateProfiles(registry);
  if (profilePath === DEFAULT_PROFILE_PATH) defaultProfilesCache = registry;
  return registry;
}

export function validateProfiles(registry) {
  if (!registry || typeof registry !== "object" || Array.isArray(registry)) {
    fail("PROFILE_REGISTRY_INVALID", "form profile registry must be an object");
  }
  if (registry.schema !== PROFILE_SCHEMA) {
    fail("PROFILE_REGISTRY_INVALID", `form profile registry schema must be ${PROFILE_SCHEMA}`);
  }
  if (
    registry.official_source_page !== "https://www.uspto.gov/patents/apply/forms"
    || !/^\d{4}-\d{2}-\d{2}$/u.test(String(registry.retrieved_date || ""))
  ) {
    fail("PROFILE_REGISTRY_INVALID", "form profile registry needs its official USPTO source page and retrieval date");
  }
  if (!Array.isArray(registry.profiles) || registry.profiles.length === 0) {
    fail("PROFILE_REGISTRY_INVALID", "form profile registry must contain profiles");
  }
  const ids = new Set();
  const hashes = new Set();
  for (const profile of registry.profiles) {
    if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
      fail("PROFILE_REGISTRY_INVALID", "each form profile must be an object");
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(profile.id || ""))) {
      fail("PROFILE_REGISTRY_INVALID", "form profile id must be lowercase and hyphenated");
    }
    if (ids.has(profile.id)) fail("PROFILE_REGISTRY_INVALID", `duplicate form profile id ${profile.id}`);
    ids.add(profile.id);
    if (!/^[0-9a-f]{64}$/.test(String(profile.sha256 || ""))) {
      fail("PROFILE_REGISTRY_INVALID", `form profile ${profile.id} needs a SHA-256`);
    }
    if (!/^https:\/\/www\.uspto\.gov\//u.test(String(profile.direct_url || ""))) {
      fail("PROFILE_REGISTRY_INVALID", `form profile ${profile.id} needs an official USPTO direct URL`);
    }
    if (hashes.has(profile.sha256)) fail("PROFILE_REGISTRY_INVALID", `duplicate form hash ${profile.sha256}`);
    hashes.add(profile.sha256);
    if (typeof profile.xfa !== "boolean") {
      fail("PROFILE_REGISTRY_INVALID", `form profile ${profile.id} must declare XFA status`);
    }
    if (!Number.isSafeInteger(profile.page_count) || profile.page_count < 1) {
      fail("PROFILE_REGISTRY_INVALID", `form profile ${profile.id} needs a page count`);
    }
    if (!Number.isSafeInteger(profile.field_count) || profile.field_count < 0) {
      fail("PROFILE_REGISTRY_INVALID", `form profile ${profile.id} needs a field count`);
    }
    if (!profile.allowed_text_fields || typeof profile.allowed_text_fields !== "object") {
      fail("PROFILE_REGISTRY_INVALID", `form profile ${profile.id} needs allowed_text_fields`);
    }
    if (
      profile.prohibited_text_fields !== undefined
      && (
        !profile.prohibited_text_fields
        || typeof profile.prohibited_text_fields !== "object"
        || Array.isArray(profile.prohibited_text_fields)
      )
    ) {
      fail("PROFILE_REGISTRY_INVALID", `form profile ${profile.id} prohibited_text_fields must be an object`);
    }
    if (
      profile.allow_all_text_fields !== undefined
      && typeof profile.allow_all_text_fields !== "boolean"
    ) {
      fail("PROFILE_REGISTRY_INVALID", `form profile ${profile.id} allow_all_text_fields must be boolean`);
    }
    if (
      profile.field_constraints !== undefined
      && (
        !profile.field_constraints
        || typeof profile.field_constraints !== "object"
        || Array.isArray(profile.field_constraints)
      )
    ) {
      fail("PROFILE_REGISTRY_INVALID", `form profile ${profile.id} field_constraints must be an object`);
    }
    for (const [name, label] of Object.entries(profile.allowed_text_fields)) {
      if (!name || typeof label !== "string" || !label) {
        fail("PROFILE_REGISTRY_INVALID", `form profile ${profile.id} has an invalid allowed text field`);
      }
      if (Object.hasOwn(profile.prohibited_text_fields || {}, name)) {
        fail("PROFILE_REGISTRY_INVALID", `form profile ${profile.id} both allows and prohibits field ${name}`);
      }
    }
    for (const [name, reason] of Object.entries(profile.prohibited_text_fields || {})) {
      if (!name || typeof reason !== "string" || !reason) {
        fail("PROFILE_REGISTRY_INVALID", `form profile ${profile.id} has an invalid prohibited text field`);
      }
    }
    for (const [name, constraints] of Object.entries(profile.field_constraints || {})) {
      if (
        !name
        || !constraints
        || typeof constraints !== "object"
        || Array.isArray(constraints)
        || Object.keys(constraints).some((key) => key !== "max_chars")
        || !Number.isSafeInteger(constraints.max_chars)
        || constraints.max_chars < 1
        || constraints.max_chars > MAX_FIELD_VALUE_CHARS
      ) {
        fail("PROFILE_REGISTRY_INVALID", `form profile ${profile.id} has invalid constraints for field ${name}`);
      }
      if (
        profile.allow_all_text_fields !== true
        && !Object.hasOwn(profile.allowed_text_fields, name)
      ) {
        fail("PROFILE_REGISTRY_INVALID", `form profile ${profile.id} constrains a field it does not allow: ${name}`);
      }
      if (Object.hasOwn(profile.prohibited_text_fields || {}, name)) {
        fail("PROFILE_REGISTRY_INVALID", `form profile ${profile.id} constrains prohibited field ${name}`);
      }
    }
    if (
      profile.xfa
      && (
        profile.allow_all_text_fields === true
        || Object.keys(profile.allowed_text_fields).length > 0
      )
    ) {
      fail("PROFILE_REGISTRY_INVALID", `XFA profile ${profile.id} must not authorize text filling`);
    }
  }
  return true;
}

export function loadPdfEngine({
  enginePath = DEFAULT_ENGINE_PATH,
  expectedSha256 = DEFAULT_ENGINE_SHA256,
} = {}) {
  if (enginePath === DEFAULT_ENGINE_PATH && expectedSha256 === DEFAULT_ENGINE_SHA256 && defaultEngineCache) {
    return defaultEngineCache;
  }
  assertPlainFile(enginePath, "vendored PDF engine");
  const engineBytes = readFileSync(enginePath);
  const actual = sha256Bytes(engineBytes);
  if (actual !== expectedSha256) {
    fail("PDF_ENGINE_INTEGRITY", "vendored PDF engine failed its pinned SHA-256 integrity check", {
      expected_sha256: expectedSha256,
      actual_sha256: actual,
    });
  }
  const engine = require(enginePath);
  if (!engine?.PDFDocument || !engine?.PDFTextField || !engine?.StandardFonts) {
    fail("PDF_ENGINE_INVALID", "vendored PDF engine does not expose the required PDF APIs");
  }
  const loaded = {
    api: engine,
    name: "pdf-lib",
    version: ENGINE_VERSION,
    sha256: actual,
  };
  if (enginePath === DEFAULT_ENGINE_PATH && expectedSha256 === DEFAULT_ENGINE_SHA256) {
    defaultEngineCache = loaded;
  }
  return loaded;
}

function profileDigest(profile) {
  return sha256Bytes(Buffer.from(canonicalJson(profile), "utf8"));
}

function profileForHash(registry, hash) {
  return registry.profiles.find((profile) => profile.sha256 === hash) || null;
}

function fieldType(field, pdf) {
  if (field instanceof pdf.PDFTextField) return "text";
  if (field instanceof pdf.PDFCheckBox) return "checkbox";
  if (field instanceof pdf.PDFRadioGroup) return "radio";
  if (field instanceof pdf.PDFDropdown) return "dropdown";
  if (field instanceof pdf.PDFOptionList) return "option-list";
  if (field instanceof pdf.PDFButton) return "button";
  if (field instanceof pdf.PDFSignature) return "signature";
  return "unknown";
}

function numberFromFieldName(name) {
  const match = /^text\s*(\d+)$/i.exec(String(name || ""));
  return match ? Number(match[1]) : null;
}

function sb08aLabel(name, type) {
  const top = {
    Text1: "Sheet number",
    text2: "Total sheets",
    text3: "Application number",
    text4: "Filing date",
    text5: "First named inventor",
    text6: "Art unit",
    text7: "Examiner name",
    text8: "Attorney docket number",
  };
  if (top[name]) return top[name];
  const n = numberFromFieldName(name);
  if (n !== null && n >= 9 && n <= 103) {
    const row = Math.floor((n - 9) / 5) + 1;
    const labels = [
      "Citation number",
      "US patent or publication document number",
      "Publication date",
      "Patentee or applicant",
      "Relevant pages, columns, lines, or figures",
    ];
    return `US patent citation row ${row}: ${labels[(n - 9) % 5]}`;
  }
  const foreignRows = [
    [104, 105, 106, 107, 108],
    [110, 111, 112, 113, 114],
    [116, 117, 118, 119, 120],
    [122, 123, 124, 125, 126],
    [128, 129, 130, 131, 132],
    [134, 135, 136, 137, 138],
  ];
  const foreignLabels = [
    "Citation number",
    "Foreign patent document number",
    "Publication date",
    "Patentee or applicant",
    "Relevant pages, columns, lines, or figures",
  ];
  for (let index = 0; index < foreignRows.length; index += 1) {
    const column = foreignRows[index].indexOf(n);
    if (column >= 0) return `Foreign patent citation row ${index + 1}: ${foreignLabels[column]}`;
  }
  if (type === "checkbox") return "Translation-attached choice (human-owned)";
  return `SB/08A field ${name}; confirm against the rendered page`;
}

function sb08bLabel(name, type) {
  const top = {
    text1: "Sheet number",
    text2: "Total sheets",
    text3: "Application number",
    text4: "Filing date",
    text5: "First named inventor",
    "text 6": "Art unit",
    text7: "Examiner name",
    text8: "Attorney docket number",
  };
  if (top[name]) return top[name];
  const n = numberFromFieldName(name);
  if (n !== null && n >= 9 && n <= 38) {
    const row = Math.floor((n - 9) / 3) + 1;
    const column = (n - 9) % 3;
    if (column === 0) return `Non-patent literature row ${row}: citation number`;
    if (column === 1) return `Non-patent literature row ${row}: document description`;
    return `Non-patent literature row ${row}: translation-attached choice (human-owned)`;
  }
  if (type === "checkbox") return "Translation-attached choice (human-owned)";
  return `SB/08B field ${name}; confirm against the rendered page`;
}

function profileFieldLabel(profile, name, type) {
  if (profile?.allowed_text_fields?.[name]) return profile.allowed_text_fields[name];
  if (profile?.label_scheme === "sb08a") return sb08aLabel(name, type);
  if (profile?.label_scheme === "sb08b") return sb08bLabel(name, type);
  return name;
}

function fieldPolicy(profile, name, type) {
  const label = profileFieldLabel(profile, name, type);
  if (!profile) {
    return {
      status: "prohibited",
      reason: "unknown or revised form hash; add an independently verified profile before filling",
      label,
    };
  }
  if (type !== "text") {
    return {
      status: "prohibited",
      reason: type === "signature"
        ? "signature fields are always human-owned"
        : "buttons and selections remain human-owned",
      label,
    };
  }
  if (Object.hasOwn(profile.prohibited_text_fields || {}, name)) {
    return {
      status: "prohibited",
      reason: profile.prohibited_text_fields[name],
      label,
    };
  }
  if (profile.allow_all_text_fields === true || Object.hasOwn(profile.allowed_text_fields, name)) {
    return { status: "allowed", reason: "profile-approved text field", label };
  }
  return {
    status: "prohibited",
    reason: profile.prohibited_text_fields?.[name] || "field is not allowlisted by the verified form profile",
    label,
  };
}

function widgetLocations(field, pages) {
  const pageNumbers = new Map(pages.map((page, index) => [page.ref.toString(), index + 1]));
  return field.acroField.getWidgets().map((widget) => {
    const rect = widget.getRectangle();
    const left = Math.min(rect.x, rect.x + rect.width);
    const bottom = Math.min(rect.y, rect.y + rect.height);
    return {
      page: pageNumbers.get(widget.P()?.toString()) || null,
      x: Math.round(left * 100) / 100,
      y: Math.round(bottom * 100) / 100,
      width: Math.round(Math.abs(rect.width) * 100) / 100,
      height: Math.round(Math.abs(rect.height) * 100) / 100,
    };
  });
}

function fieldDescriptor(field, pages, profile, pdf) {
  const type = fieldType(field, pdf);
  const name = field.getName();
  const policy = fieldPolicy(profile, name, type);
  const currentValue = fieldValue(field, type);
  const descriptor = {
    name,
    label: policy.label,
    type,
    policy: policy.status,
    policy_reason: policy.reason,
    read_only: typeof field.isReadOnly === "function" ? field.isReadOnly() : false,
    required: typeof field.isRequired === "function" ? field.isRequired() : false,
    has_existing_value: type === "checkbox"
      ? currentValue === true
      : Array.isArray(currentValue)
        ? currentValue.length > 0
        : currentValue !== null && currentValue !== "",
    widgets: widgetLocations(field, pages),
  };
  if (type === "text") {
    descriptor.multiline = field.isMultiline();
    descriptor.max_length = field.getMaxLength() ?? null;
    descriptor.profile_max_chars = profile?.field_constraints?.[name]?.max_chars ?? null;
  }
  return descriptor;
}

function fieldValue(field, type) {
  if (type === "text") return field.getText() ?? null;
  if (type === "checkbox") return field.isChecked();
  if (type === "radio") return field.getSelected() ?? null;
  if (type === "dropdown" || type === "option-list") return field.getSelected();
  if (type === "signature") return field.acroField.getValue()?.toString() ?? null;
  return null;
}

async function loadPdfDocument(bytes, engine, label) {
  try {
    return await engine.api.PDFDocument.load(bytes, {
      ignoreEncryption: false,
      parseSpeed: engine.api.ParseSpeeds?.Slow,
      throwOnInvalidObject: true,
      updateMetadata: false,
    });
  } catch (error) {
    fail("PDF_PARSE_FAILED", `${label} could not be parsed as a supported PDF: ${error.message}`);
  }
}

function documentHasXfa(document, pdf) {
  const acroFormRef = document.catalog.get(pdf.PDFName.of("AcroForm"));
  if (!acroFormRef) return false;
  const acroForm = document.context.lookup(acroFormRef);
  return Boolean(acroForm?.has?.(pdf.PDFName.of("XFA")));
}

export async function inspectPdf({
  matter,
  source,
  registry = loadProfiles(),
  engine = loadPdfEngine(),
} = {}) {
  const matterRoot = requireMatter(matter);
  const confidentialWorkflowMode = parseRequiredConfidentialWorkflowMode(matterRoot);
  const sourcePath = resolveMatterFile(matterRoot, source, {
    label: "source PDF",
    extension: ".pdf",
  });
  const bytes = readBoundedFile(sourcePath, {
    label: "source PDF",
    maxBytes: MAX_PDF_BYTES,
    code: "PDF_TOO_LARGE",
  });
  if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
    fail("NOT_A_PDF", "source PDF does not have a PDF file signature");
  }
  const hash = sha256Bytes(bytes);
  const profile = profileForHash(registry, hash);
  if (profile?.xfa || hasXfaMarker(bytes)) {
    fail(
      "XFA_UNSUPPORTED",
      "XFA form filling is refused because generic PDF libraries can discard or corrupt XFA data; use Adobe Acrobat Reader and human review",
      { profile_id: profile?.id || null, source_sha256: hash },
    );
  }
  const document = await loadPdfDocument(bytes, engine, "source PDF");
  if (documentHasXfa(document, engine.api)) {
    fail(
      "XFA_UNSUPPORTED",
      "XFA form filling is refused because generic PDF libraries can discard or corrupt XFA data; use Adobe Acrobat Reader and human review",
      { profile_id: profile?.id || null, source_sha256: hash },
    );
  }
  const pages = document.getPages();
  const fields = document.getForm().getFields();
  if (profile) {
    if (pages.length !== profile.page_count || fields.length !== profile.field_count) {
      fail("PROFILE_MISMATCH", "source PDF structure does not match its pinned form profile");
    }
  }
  return {
    schema: "apa-pdf-form-inspection-v1",
    supported: Boolean(profile),
    fill_mode: profile ? profile.fill_support : "inspect-only",
    source: {
      path: relativeMatterPath(matterRoot, sourcePath),
      sha256: hash,
      bytes: bytes.length,
    },
    profile: profile ? {
      id: profile.id,
      form_code: profile.form_code,
      filename: profile.filename,
      digest: profileDigest(profile),
    } : null,
    engine: {
      name: engine.name,
      version: engine.version,
      sha256: engine.sha256,
    },
    workflow: {
      confidential_workflow_mode: confidentialWorkflowMode,
    },
    page_count: pages.length,
    field_count: fields.length,
    allowed_field_count: fields.filter((field) => (
      fieldPolicy(profile, field.getName(), fieldType(field, engine.api)).status === "allowed"
    )).length,
    fields: fields.map((field) => fieldDescriptor(field, pages, profile, engine.api)),
    boundaries: {
      source_preserved: true,
      signatures_automated: false,
      certifications_automated: false,
      entity_status_automated: false,
      fee_elections_automated: false,
      filing_automated: false,
    },
  };
}

export function createFillPlan(inspection, {
  now = new Date().toISOString(),
  formRouteHumanSelected = false,
  dataHandling,
  interactionHost,
} = {}) {
  if (!inspection?.supported || !inspection.profile) {
    fail("UNSUPPORTED_FORM_REVISION", "a verified, hash-pinned form profile is required before creating a fill plan");
  }
  if (formRouteHumanSelected !== true) {
    fail(
      "FORM_ROUTE_SELECTION_REQUIRED",
      "a human or registered practitioner must select the form route before plan creation",
    );
  }
  if (!DATA_HANDLING_MODES.includes(dataHandling)) {
    fail(
      "DATA_HANDLING_APPROVAL_REQUIRED",
      `data handling must be one of ${DATA_HANDLING_MODES.join(", ")}`,
    );
  }
  if (!INTERACTION_HOSTS.includes(interactionHost)) {
    fail(
      "INTERACTION_HOST_REQUIRED",
      `interaction host must be one of ${INTERACTION_HOSTS.join(", ")}`,
    );
  }
  if (!CONFIDENTIAL_WORKFLOW_MODES.includes(inspection.workflow?.confidential_workflow_mode)) {
    fail("CONFIDENTIAL_WORKFLOW_MODE_INVALID", "inspection lacks a valid confidential workflow mode");
  }
  const fields = inspection.fields
    .filter((field) => field.policy === "allowed")
    .map((field) => ({
      name: field.name,
      label: field.label,
      include: false,
      value: null,
      provenance: null,
    }));
  return {
    schema: PLAN_SCHEMA,
    created_at: now,
    status: "DRAFT-INTAKE",
    source_pdf: inspection.source.path,
    source_sha256: inspection.source.sha256,
    profile_id: inspection.profile.id,
    profile_digest: inspection.profile.digest,
    output_directory: "assembled/forms",
    workflow_approval: {
      confidential_workflow_mode: inspection.workflow.confidential_workflow_mode,
      form_route_human_selected: true,
      data_handling: dataHandling,
      interaction_host: interactionHost,
      approved_at: now,
    },
    fields,
    blocked_field_names: inspection.fields
      .filter((field) => field.policy !== "allowed")
      .map((field) => field.name),
    human_confirmation: {
      required_before_fill: true,
      status: "pending",
    },
    filing_ready: false,
  };
}

export async function initializePlan(options = {}) {
  return createFillPlan(await inspectPdf(options), {
    now: options.now,
    formRouteHumanSelected: options.formRouteHumanSelected,
    dataHandling: options.dataHandling,
    interactionHost: options.interactionHost,
  });
}

export function jsonPointerGet(value, pointer) {
  if (pointer === "") return value;
  if (typeof pointer !== "string" || !pointer.startsWith("/")) {
    fail("PROVENANCE_POINTER_INVALID", "JSON pointer must be empty or start with /");
  }
  let cursor = value;
  for (const raw of pointer.slice(1).split("/")) {
    const key = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (cursor === null || typeof cursor !== "object" || !Object.hasOwn(cursor, key)) {
      fail("PROVENANCE_POINTER_MISSING", `JSON pointer does not resolve: ${pointer}`);
    }
    cursor = cursor[key];
  }
  return cursor;
}

function assertPlanShape(plan) {
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    fail("PLAN_INVALID", "fill plan must be an object");
  }
  assertExactObjectKeys(
    plan,
    [
      "schema",
      "created_at",
      "status",
      "source_pdf",
      "source_sha256",
      "profile_id",
      "profile_digest",
      "output_directory",
      "workflow_approval",
      "fields",
      "blocked_field_names",
      "human_confirmation",
      "filing_ready",
    ],
    "PLAN_INVALID",
    "fill plan",
  );
  if (plan.schema !== PLAN_SCHEMA) fail("PLAN_INVALID", `fill plan schema must be ${PLAN_SCHEMA}`);
  if (
    typeof plan.created_at !== "string"
    || Number.isNaN(Date.parse(plan.created_at))
    || plan.status !== "DRAFT-INTAKE"
  ) {
    fail("PLAN_INVALID", "fill plan must retain its valid creation time and DRAFT-INTAKE status");
  }
  assertMatterRelativePathString(plan.source_pdf, "fill plan source_pdf");
  if (!/^[0-9a-f]{64}$/.test(String(plan.source_sha256 || ""))) {
    fail("PLAN_INVALID", "fill plan source_sha256 is invalid");
  }
  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(plan.profile_id || ""))
    || !/^[0-9a-f]{64}$/.test(String(plan.profile_digest || ""))
  ) {
    fail("PLAN_INVALID", "fill plan profile binding is invalid");
  }
  if (!Array.isArray(plan.fields)) fail("PLAN_INVALID", "fill plan fields must be an array");
  if (
    !Array.isArray(plan.blocked_field_names)
    || !plan.blocked_field_names.every((name) => typeof name === "string")
  ) {
    fail("PLAN_INVALID", "fill plan blocked_field_names must remain an array of field names");
  }
  if (plan.output_directory !== "assembled/forms") {
    fail("PLAN_INVALID", "fill plan output_directory must remain assembled/forms");
  }
  if (
    plan.workflow_approval?.form_route_human_selected !== true
    || !CONFIDENTIAL_WORKFLOW_MODES.includes(plan.workflow_approval?.confidential_workflow_mode)
    || !DATA_HANDLING_MODES.includes(plan.workflow_approval?.data_handling)
    || !INTERACTION_HOSTS.includes(plan.workflow_approval?.interaction_host)
    || typeof plan.workflow_approval?.approved_at !== "string"
    || Number.isNaN(Date.parse(plan.workflow_approval.approved_at))
    || Object.keys(plan.workflow_approval || {}).sort().join(",")
      !== "approved_at,confidential_workflow_mode,data_handling,form_route_human_selected,interaction_host"
  ) {
    fail(
      "PLAN_INVALID",
      "fill plan must retain its confidential workflow, human-selected form route, data-handling approval, interaction host, and approval time",
    );
  }
  if (
    plan.human_confirmation?.required_before_fill !== true
    || plan.human_confirmation?.status !== "pending"
    || plan.filing_ready !== false
  ) {
    fail(
      "PLAN_INVALID",
      "fill plan must retain pending human confirmation and filing_ready=false safety bindings",
    );
  }
  assertExactObjectKeys(
    plan.human_confirmation,
    ["required_before_fill", "status"],
    "PLAN_INVALID",
    "fill plan human confirmation",
  );
}

function selectedPlanFields(plan) {
  const seen = new Set();
  const selected = [];
  for (const field of plan.fields) {
    if (!field || typeof field !== "object" || Array.isArray(field) || typeof field.name !== "string") {
      fail("PLAN_INVALID", "every fill plan field must be an object with a name");
    }
    assertExactObjectKeys(
      field,
      ["name", "label", "include", "value", "provenance"],
      "PLAN_INVALID",
      `fill plan field ${field.name}`,
    );
    if (seen.has(field.name)) fail("PLAN_INVALID", `fill plan repeats field ${field.name}`);
    seen.add(field.name);
    if (field.include === true) selected.push(field);
    else if (field.include !== false) fail("PLAN_INVALID", `field ${field.name} include must be true or false`);
    else if (field.value !== null || field.provenance !== null) {
      fail("PLAN_INVALID", `unselected field ${field.name} must retain null value and provenance`);
    }
  }
  if (selected.length === 0) fail("PLAN_EMPTY", "fill plan has no fields selected for writing");
  return selected;
}

function validateTextValue(planField, descriptor) {
  if (typeof planField.value !== "string" || planField.value.length === 0) {
    fail("FIELD_VALUE_INVALID", `selected field ${planField.name} needs a non-empty string value`);
  }
  if (Array.from(planField.value).length > MAX_FIELD_VALUE_CHARS) {
    fail("FIELD_VALUE_INVALID", `selected field ${planField.name} exceeds the safety length limit`);
  }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(planField.value)) {
    fail("FIELD_VALUE_INVALID", `selected field ${planField.name} contains unsupported control characters`);
  }
  if (/[\u0080-\u009f\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/u.test(planField.value)) {
    fail(
      "FIELD_VALUE_INVALID",
      `selected field ${planField.name} contains unsafe control, line-separator, or bidirectional-format characters`,
    );
  }
  if (!descriptor.multiline && /[\r\n]/.test(planField.value)) {
    fail("FIELD_VALUE_INVALID", `selected field ${planField.name} is not multiline`);
  }
  if (descriptor.max_length !== null && Array.from(planField.value).length > descriptor.max_length) {
    fail("FIELD_VALUE_INVALID", `selected field ${planField.name} exceeds the PDF field maximum length`);
  }
  if (
    descriptor.profile_max_chars !== null
    && Array.from(planField.value).length > descriptor.profile_max_chars
  ) {
    fail(
      "FIELD_VALUE_INVALID",
      `selected field ${planField.name} exceeds the verified form's printed ${descriptor.profile_max_chars}-character limit`,
    );
  }
}

function validateVerifiedJsonProvenance(matter, provenance, value) {
  assertMatterRelativePathString(provenance.path, "provenance JSON path");
  const sourcePath = resolveMatterFile(matter, provenance.path, {
    label: "provenance JSON",
    extension: ".json",
  });
  const bytes = readBoundedFile(sourcePath, {
    label: "provenance JSON",
    maxBytes: MAX_JSON_BYTES,
    code: "PROVENANCE_INVALID",
  });
  const actualHash = sha256Bytes(bytes);
  if (actualHash !== provenance.sha256) {
    fail("PROVENANCE_HASH_MISMATCH", "verified-matter JSON changed after the field value was sourced");
  }
  let record;
  try {
    record = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    fail("PROVENANCE_INVALID", `provenance JSON cannot be parsed: ${error.message}`);
  }
  const sourced = jsonPointerGet(record, provenance.pointer);
  if (sourced === null || typeof sourced === "object" || String(sourced) !== value) {
    fail("PROVENANCE_VALUE_MISMATCH", "planned field value does not match its verified-matter JSON pointer");
  }
  if (jsonPointerGet(record, provenance.verification_pointer) !== true) {
    fail("PROVENANCE_UNVERIFIED", "verified-matter JSON verification pointer is not true");
  }
}

function validateProvenance(matter, planField) {
  const provenance = planField.provenance;
  if (!provenance || typeof provenance !== "object" || Array.isArray(provenance)) {
    fail("PROVENANCE_REQUIRED", `selected field ${planField.name} needs provenance`);
  }
  if (provenance.kind === "human-confirmed") {
    if (
      provenance.source !== "chat"
      || Object.keys(provenance).sort().join(",") !== "kind,source"
    ) {
      fail("PROVENANCE_INVALID", `field ${planField.name} human-confirmed provenance source must be chat`);
    }
    return { kind: "human-confirmed", source: "chat" };
  }
  if (provenance.kind === "verified-matter-json") {
    if (
      Object.keys(provenance).sort().join(",")
      !== "kind,path,pointer,sha256,verification_pointer"
    ) {
      fail("PROVENANCE_INVALID", `field ${planField.name} verified-matter provenance has unexpected keys`);
    }
    for (const key of ["path", "pointer", "verification_pointer", "sha256"]) {
      if (typeof provenance[key] !== "string" || !provenance[key]) {
        fail("PROVENANCE_INVALID", `field ${planField.name} provenance needs ${key}`);
      }
    }
    if (!/^[0-9a-f]{64}$/.test(provenance.sha256)) {
      fail("PROVENANCE_INVALID", `field ${planField.name} provenance SHA-256 is invalid`);
    }
    validateVerifiedJsonProvenance(matter, provenance, planField.value);
    return {
      kind: "verified-matter-json",
      path: provenance.path,
      pointer: provenance.pointer,
      verification_pointer: provenance.verification_pointer,
      sha256: provenance.sha256,
    };
  }
  fail("PROVENANCE_INVALID", `field ${planField.name} uses an unsupported provenance kind`);
}

function confirmationPayload(inspection, reviewedFields, workflowApproval) {
  return {
    schema: "apa-pdf-fill-confirmation-payload-v1",
    source_sha256: inspection.source.sha256,
    profile_id: inspection.profile.id,
    profile_digest: inspection.profile.digest,
    workflow_approval: workflowApproval,
    fields: reviewedFields
      .map((field) => ({
        name: field.name,
        value: field.value,
        provenance: field.provenance,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export async function validateAndReviewPlan({
  matter,
  plan,
  registry = loadProfiles(),
  engine = loadPdfEngine(),
} = {}) {
  const matterRoot = requireMatter(matter);
  assertPlanShape(plan);
  const inspection = await inspectPdf({
    matter: matterRoot,
    source: plan.source_pdf,
    registry,
    engine,
  });
  if (!inspection.supported || !inspection.profile) {
    fail(
      "UNSUPPORTED_FORM_REVISION",
      "the source PDF no longer matches a verified, hash-pinned form profile",
    );
  }
  if (inspection.source.path !== plan.source_pdf) {
    fail("PLAN_INVALID", "fill plan source_pdf must remain the canonical matter-relative source path");
  }
  if (inspection.source.sha256 !== plan.source_sha256) {
    fail("SOURCE_HASH_MISMATCH", "source PDF changed after the fill plan was created");
  }
  if (inspection.profile.id !== plan.profile_id || inspection.profile.digest !== plan.profile_digest) {
    fail("PROFILE_MISMATCH", "fill plan does not match the current verified form profile");
  }
  if (
    inspection.workflow.confidential_workflow_mode
    !== plan.workflow_approval.confidential_workflow_mode
  ) {
    fail(
      "CONFIDENTIAL_WORKFLOW_MODE_CHANGED",
      "PATENT.md confidential_workflow_mode changed after the fill plan was created",
    );
  }
  const descriptors = new Map(inspection.fields.map((field) => [field.name, field]));
  const selected = selectedPlanFields(plan);
  const summary = [];
  for (const planField of selected) {
    const descriptor = descriptors.get(planField.name);
    if (!descriptor) fail("UNKNOWN_FIELD", `fill plan names a field absent from the source PDF: ${planField.name}`);
    if (descriptor.policy !== "allowed" || descriptor.type !== "text") {
      fail("PROHIBITED_FIELD", `automation is prohibited for field ${planField.name}: ${descriptor.policy_reason}`);
    }
    if (descriptor.read_only) fail("READ_ONLY_FIELD", `selected field ${planField.name} is read-only`);
    validateTextValue(planField, descriptor);
    const provenance = validateProvenance(matterRoot, planField);
    summary.push({
      name: planField.name,
      label: descriptor.label,
      value: planField.value,
      provenance,
    });
  }
  const selectedValueBytes = summary.reduce(
    (total, field) => total + Buffer.byteLength(field.value, "utf8"),
    0,
  );
  if (selectedValueBytes > MAX_SELECTED_VALUE_BYTES) {
    fail(
      "SELECTED_VALUES_TOO_LARGE",
      "selected values exceed the bounded human-review payload; split the work into smaller draft plans",
    );
  }
  const expectedAllowed = inspection.fields.filter((field) => field.policy === "allowed");
  const expectedAllowedNames = new Set(expectedAllowed.map((field) => field.name));
  if (
    plan.fields.length !== expectedAllowed.length
    || plan.fields.some((field) => !expectedAllowedNames.has(field.name))
  ) {
    fail("PLAN_FIELD_SET_MISMATCH", "fill plan field set no longer matches the verified form profile");
  }
  for (const planField of plan.fields) {
    if (planField.label !== descriptors.get(planField.name)?.label) {
      fail("PLAN_FIELD_SET_MISMATCH", `fill plan label changed for field ${planField.name}`);
    }
  }
  const expectedBlocked = inspection.fields
    .filter((field) => field.policy !== "allowed")
    .map((field) => field.name);
  if (canonicalJson(plan.blocked_field_names) !== canonicalJson(expectedBlocked)) {
    fail("PLAN_FIELD_SET_MISMATCH", "fill plan blocked-field binding no longer matches the source PDF");
  }
  const workflowApproval = {
    confidential_workflow_mode: plan.workflow_approval.confidential_workflow_mode,
    form_route_human_selected: true,
    data_handling: plan.workflow_approval.data_handling,
    interaction_host: plan.workflow_approval.interaction_host,
    approved_at: plan.workflow_approval.approved_at,
  };
  const payload = confirmationPayload(inspection, summary, workflowApproval);
  return {
    schema: "apa-pdf-fill-plan-review-v1",
    status: "READY-FOR-HUMAN-CONFIRMATION",
    source: inspection.source,
    profile: inspection.profile,
    workflow_approval: workflowApproval,
    confirmation_digest: sha256Bytes(Buffer.from(canonicalJson(payload), "utf8")),
    field_count: summary.length,
    selected_value_bytes: selectedValueBytes,
    fields: summary,
    confirmation_prompt: "Confirm that every displayed value should be written to this draft PDF. This does not sign, certify, pay, select entity status, or file anything.",
    boundaries: inspection.boundaries,
    filing_ready: false,
  };
}

export function createConfirmationRecord(review, {
  humanConfirmed = false,
  presentedDigest,
  now = new Date().toISOString(),
} = {}) {
  if (!humanConfirmed) {
    fail("HUMAN_CONFIRMATION_REQUIRED", "explicit human confirmation is required before creating a fill confirmation");
  }
  if (!review || review.status !== "READY-FOR-HUMAN-CONFIRMATION") {
    fail("REVIEW_REQUIRED", "a valid plan review is required before confirmation");
  }
  if (presentedDigest !== review.confirmation_digest) {
    fail("CONFIRMATION_DIGEST_MISMATCH", "confirmed digest does not match the values presented for review");
  }
  return {
    schema: CONFIRMATION_SCHEMA,
    decision: "confirmed-for-draft-fill",
    confirmed_at: now,
    plan_digest: review.confirmation_digest,
    source_sha256: review.source.sha256,
    profile_id: review.profile.id,
    workflow_approval: { ...review.workflow_approval },
    scope: CONFIRMATION_SCOPE,
    does_not_authorize: [...CONFIRMATION_EXCLUSIONS],
  };
}

function assertConfirmation(review, confirmation) {
  if (!confirmation || typeof confirmation !== "object" || Array.isArray(confirmation)) {
    fail("CONFIRMATION_INVALID", "confirmation record must be an object");
  }
  assertExactObjectKeys(
    confirmation,
    [
      "schema",
      "decision",
      "confirmed_at",
      "plan_digest",
      "source_sha256",
      "profile_id",
      "workflow_approval",
      "scope",
      "does_not_authorize",
    ],
    "CONFIRMATION_INVALID",
    "confirmation record",
  );
  assertExactObjectKeys(
    confirmation.workflow_approval,
    [
      "confidential_workflow_mode",
      "form_route_human_selected",
      "data_handling",
      "interaction_host",
      "approved_at",
    ],
    "CONFIRMATION_INVALID",
    "confirmation workflow approval",
  );
  if (
    confirmation.schema !== CONFIRMATION_SCHEMA
    || confirmation.decision !== "confirmed-for-draft-fill"
    || confirmation.plan_digest !== review.confirmation_digest
    || confirmation.source_sha256 !== review.source.sha256
    || confirmation.profile_id !== review.profile.id
    || canonicalJson(confirmation.workflow_approval) !== canonicalJson(review.workflow_approval)
  ) {
    fail("CONFIRMATION_STALE", "confirmation record does not match the current source and field values");
  }
  if (
    confirmation.scope !== CONFIRMATION_SCOPE
    || canonicalJson(confirmation.does_not_authorize) !== canonicalJson(CONFIRMATION_EXCLUSIONS)
  ) {
    fail("CONFIRMATION_INVALID", "confirmation record safety boundaries were changed");
  }
  if (typeof confirmation.confirmed_at !== "string" || Number.isNaN(Date.parse(confirmation.confirmed_at))) {
    fail("CONFIRMATION_INVALID", "confirmation record needs a valid confirmed_at timestamp");
  }
}

function textWidgetSize(field) {
  const rectangles = field.acroField.getWidgets().map((widget) => widget.getRectangle());
  if (rectangles.length === 0) fail("FIELD_LAYOUT_INVALID", `field ${field.getName()} has no widget rectangle`);
  return {
    width: Math.min(...rectangles.map((rect) => Math.abs(rect.width))),
    height: Math.min(...rectangles.map((rect) => Math.abs(rect.height))),
  };
}

function splitLongToken(token, availableWidth, font, size) {
  const pieces = [];
  let current = "";
  for (const char of Array.from(token)) {
    const candidate = `${current}${char}`;
    if (current && font.widthOfTextAtSize(candidate, size) > availableWidth) {
      pieces.push(current);
      current = char;
    } else {
      current = candidate;
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

function wrappedLineCount(value, availableWidth, font, size) {
  let count = 0;
  for (const paragraph of value.split(/\r?\n/)) {
    const tokens = paragraph.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) {
      count += 1;
      continue;
    }
    let line = "";
    for (const token of tokens) {
      const pieces = font.widthOfTextAtSize(token, size) <= availableWidth
        ? [token]
        : splitLongToken(token, availableWidth, font, size);
      for (const piece of pieces) {
        const candidate = line ? `${line} ${piece}` : piece;
        if (line && font.widthOfTextAtSize(candidate, size) > availableWidth) {
          count += 1;
          line = piece;
        } else {
          line = candidate;
        }
      }
    }
    if (line) count += 1;
  }
  return count;
}

function fittedFontSize(field, value, font) {
  const widget = textWidgetSize(field);
  const availableWidth = Math.max(1, widget.width - 4);
  const availableHeight = Math.max(1, widget.height - 2);
  for (
    let size = MAX_AUTOMATED_FONT_SIZE;
    size >= MIN_AUTOMATED_FONT_SIZE;
    size -= 0.5
  ) {
    const lineCount = field.isMultiline()
      ? wrappedLineCount(value, availableWidth, font, size)
      : 1;
    const widthFits = field.isMultiline()
      || font.widthOfTextAtSize(value, size) <= availableWidth;
    const height = font.heightAtSize(size, { descender: true }) * lineCount * 1.12;
    if (widthFits && height <= availableHeight) return size;
  }
  fail(
    "FIELD_TEXT_DOES_NOT_FIT",
    `field ${field.getName()} cannot fit the confirmed text at a legible automated font size`,
  );
}

function setFittedFieldFontSize(field, font, size) {
  if (field.acroField.getDefaultAppearance()) {
    field.setFontSize(size);
    return;
  }
  field.acroField.setDefaultAppearance(`0 g\n/${font.name} ${size} Tf`);
}

async function applyTextValues(sourceBytes, review, engine) {
  const document = await loadPdfDocument(sourceBytes, engine, "source PDF");
  const form = document.getForm();
  const fields = new Map(form.getFields().map((field) => [field.getName(), field]));
  try {
    const font = await document.embedFont(engine.api.StandardFonts.Helvetica);
    for (const item of review.fields) {
      const field = fields.get(item.name);
      if (!(field instanceof engine.api.PDFTextField)) {
        fail("FIELD_TYPE_CHANGED", `selected field ${item.name} is no longer a text field`);
      }
      field.setText(item.value);
      setFittedFieldFontSize(field, font, fittedFontSize(field, item.value, font));
    }
    form.updateFieldAppearances(font);
  } catch (error) {
    if (error instanceof FormFillError) throw error;
    if (/cannot encode|encoding|winansi|glyph/i.test(String(error?.message || ""))) {
      fail(
        "UNSUPPORTED_GLYPH",
        `a selected value cannot be represented safely by the bundled PDF font: ${error.message}`,
      );
    }
    fail("PDF_APPEARANCE_FAILED", `a selected field appearance could not be generated: ${error.message}`);
  }
  try {
    return Buffer.from(await document.save({
      addDefaultPage: false,
      objectsPerTick: 50,
      updateFieldAppearances: false,
      useObjectStreams: false,
    }));
  } catch (error) {
    fail("PDF_SAVE_FAILED", `draft PDF could not be generated: ${error.message}`);
  }
}

async function comparePdfFieldValues(sourceBytes, outputBytes, review, engine) {
  const sourceDoc = await loadPdfDocument(sourceBytes, engine, "source PDF");
  const outputDoc = await loadPdfDocument(outputBytes, engine, "draft PDF");
  if (sourceDoc.getPageCount() !== outputDoc.getPageCount()) {
    fail("DRAFT_VERIFY_FAILED", "draft PDF page count changed");
  }
  const sourceFields = sourceDoc.getForm().getFields();
  const outputFields = outputDoc.getForm().getFields();
  if (sourceFields.length !== outputFields.length) {
    fail("DRAFT_VERIFY_FAILED", "draft PDF form field count changed");
  }
  const sourceMap = new Map(sourceFields.map((field) => [field.getName(), field]));
  const outputMap = new Map(outputFields.map((field) => [field.getName(), field]));
  const selected = new Map(review.fields.map((field) => [field.name, field.value]));
  for (const [name, sourceField] of sourceMap) {
    const outputField = outputMap.get(name);
    if (!outputField) fail("DRAFT_VERIFY_FAILED", `draft PDF lost form field ${name}`);
    const sourceType = fieldType(sourceField, engine.api);
    const outputType = fieldType(outputField, engine.api);
    if (sourceType !== outputType) fail("DRAFT_VERIFY_FAILED", `draft PDF changed the type of field ${name}`);
    const outputValue = fieldValue(outputField, outputType);
    if (selected.has(name)) {
      if (outputType !== "text" || outputValue !== selected.get(name)) {
        fail("DRAFT_VERIFY_FAILED", `draft PDF value verification failed for field ${name}`);
      }
    } else if (canonicalJson(outputValue) !== canonicalJson(fieldValue(sourceField, sourceType))) {
      fail("DRAFT_VERIFY_FAILED", `draft PDF changed prohibited or unselected field ${name}`);
    }
  }
  return {
    status: "passed",
    page_count_unchanged: true,
    field_count_unchanged: true,
    selected_values_match: true,
    prohibited_and_unselected_values_unchanged: true,
  };
}

function ensureOutputDirectory(matter, relativeDirectory) {
  const safeRelativeDirectory = assertMatterRelativePathString(
    relativeDirectory,
    "fill plan output_directory",
  );
  const outputDirectory = resolve(matter, safeRelativeDirectory);
  if (!isWithin(matter, outputDirectory)) fail("PATH_ESCAPE", "output directory escapes the matter");
  assertNoSymlinkComponents(matter, outputDirectory);
  mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
  const stat = lstatSync(outputDirectory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    fail("OUTPUT_DIRECTORY_INVALID", "output directory must be a real directory");
  }
  const real = realpathSync(outputDirectory);
  if (!isWithin(matter, real)) fail("PATH_ESCAPE", "output directory resolves outside the matter");
  return real;
}

function nextDraftPaths(outputDirectory, sourcePdf) {
  const stem = parse(basename(sourcePdf)).name.replace(/_DRAFT(?:-\d+)?$/i, "");
  for (let index = 1; index <= 999; index += 1) {
    const suffix = index === 1 ? "" : `-${String(index).padStart(2, "0")}`;
    const pdf = join(outputDirectory, `${stem}_DRAFT${suffix}.pdf`);
    const manifest = join(outputDirectory, `${stem}_DRAFT${suffix}.review.json`);
    if (!existsSync(pdf) && !existsSync(manifest)) return { pdf, manifest };
  }
  fail("OUTPUT_EXHAUSTED", "no unused draft filename remains in the output directory");
}

function writeExclusive(path, bytes) {
  writeFileSync(path, bytes, { flag: "wx", mode: 0o600 });
}

function buildManifest({
  matter,
  sourcePath,
  outputPath,
  confirmationPath,
  confirmationBytes,
  sourceBytes,
  outputBytes,
  review,
  verification,
  engine,
  now,
}) {
  return {
    schema: REVIEW_MANIFEST_SCHEMA,
    status: "DRAFT-REQUIRES-HUMAN-REVIEW",
    created_at: now,
    form: {
      profile_id: review.profile.id,
      form_code: review.profile.form_code,
      profile_digest: review.profile.digest,
    },
    workflow_approval: { ...review.workflow_approval },
    source: {
      path: relativeMatterPath(matter, sourcePath),
      sha256: sha256Bytes(sourceBytes),
      bytes: sourceBytes.length,
      preserved: true,
    },
    output: {
      path: relativeMatterPath(matter, outputPath),
      sha256: sha256Bytes(outputBytes),
      bytes: outputBytes.length,
    },
    confirmation: {
      path: relativeMatterPath(matter, confirmationPath),
      sha256: sha256Bytes(confirmationBytes),
      bytes: confirmationBytes.length,
      plan_digest: review.confirmation_digest,
    },
    engine: {
      name: engine.name,
      version: engine.version,
      sha256: engine.sha256,
    },
    fields_written: review.fields.map((field) => ({
      name: field.name,
      label: field.label,
      provenance: field.provenance.kind,
    })),
    mechanical_verification: verification,
    human_review: {
      status: "required",
      pages_expected: verification.page_count,
      pages_reviewed: [],
      viewer: null,
      reviewer: null,
      reviewed_at: null,
    },
    privacy: { ...MANIFEST_PRIVACY },
    boundaries: { ...MANIFEST_BOUNDARIES },
  };
}

export async function fillConfirmedPlan({
  matter,
  plan,
  confirmation,
  confirmationPath,
  registry = loadProfiles(),
  engine = loadPdfEngine(),
  now = new Date().toISOString(),
} = {}) {
  const matterRoot = requireMatter(matter);
  const review = await validateAndReviewPlan({
    matter: matterRoot,
    plan,
    registry,
    engine,
  });
  const safeConfirmationPath = resolveMatterFile(matterRoot, confirmationPath, {
    label: "confirmation record",
    extension: ".json",
  });
  const confirmationBytes = readBoundedFile(safeConfirmationPath, {
    label: "confirmation record",
    maxBytes: MAX_JSON_BYTES,
    code: "CONFIRMATION_INVALID",
  });
  let onDiskConfirmation;
  try {
    onDiskConfirmation = JSON.parse(confirmationBytes.toString("utf8"));
  } catch (error) {
    fail("CONFIRMATION_INVALID", `confirmation record cannot be parsed: ${error.message}`);
  }
  if (canonicalJson(onDiskConfirmation) !== canonicalJson(confirmation)) {
    fail("CONFIRMATION_FILE_MISMATCH", "confirmation input does not match its matter-local file");
  }
  assertConfirmation(review, onDiskConfirmation);
  const sourcePath = resolveMatterFile(matterRoot, plan.source_pdf, {
    label: "source PDF",
    extension: ".pdf",
  });
  const sourceBytes = readBoundedFile(sourcePath, {
    label: "source PDF",
    maxBytes: MAX_PDF_BYTES,
    code: "PDF_TOO_LARGE",
  });
  if (sha256Bytes(sourceBytes) !== review.source.sha256) {
    fail("SOURCE_HASH_MISMATCH", "source PDF changed immediately before draft creation");
  }
  const outputBytes = await applyTextValues(sourceBytes, review, engine);
  const verification = await comparePdfFieldValues(sourceBytes, outputBytes, review, engine);
  verification.page_count = review.profile
    ? (registry.profiles.find((profile) => profile.id === review.profile.id)?.page_count || null)
    : null;
  const outputDirectory = ensureOutputDirectory(matterRoot, plan.output_directory);
  const paths = nextDraftPaths(outputDirectory, sourcePath);
  const manifest = buildManifest({
    matter: matterRoot,
    sourcePath,
    outputPath: paths.pdf,
    confirmationPath: safeConfirmationPath,
    confirmationBytes,
    sourceBytes,
    outputBytes,
    review,
    verification,
    engine,
    now,
  });
  writeExclusive(paths.pdf, outputBytes);
  try {
    writeExclusive(paths.manifest, `${JSON.stringify(manifest, null, 2)}\n`);
  } catch (error) {
    unlinkSync(paths.pdf);
    throw error;
  }
  let finalSourceHash;
  try {
    finalSourceHash = sha256Bytes(readBoundedFile(sourcePath, {
      label: "source PDF",
      maxBytes: MAX_PDF_BYTES,
      code: "PDF_TOO_LARGE",
    }));
  } catch (error) {
    unlinkSync(paths.manifest);
    unlinkSync(paths.pdf);
    throw error;
  }
  if (finalSourceHash !== review.source.sha256) {
    unlinkSync(paths.manifest);
    unlinkSync(paths.pdf);
    fail("SOURCE_HASH_MISMATCH", "source PDF changed during draft creation");
  }
  return {
    schema: "apa-pdf-fill-result-v1",
    status: "DRAFT-CREATED",
    output_pdf: relativeMatterPath(matterRoot, paths.pdf),
    review_manifest: relativeMatterPath(matterRoot, paths.manifest),
    source_sha256: review.source.sha256,
    output_sha256: manifest.output.sha256,
    fields_written: review.fields.length,
    visual_review_required: true,
    filing_ready: false,
  };
}

export async function verifyDraft({
  matter,
  plan,
  confirmation,
  manifest,
  registry = loadProfiles(),
  engine = loadPdfEngine(),
} = {}) {
  const matterRoot = requireMatter(matter);
  if (!manifest || manifest.schema !== REVIEW_MANIFEST_SCHEMA) {
    fail("MANIFEST_INVALID", `review manifest schema must be ${REVIEW_MANIFEST_SCHEMA}`);
  }
  assertExactObjectKeys(
    manifest,
    [
      "schema",
      "status",
      "created_at",
      "form",
      "workflow_approval",
      "source",
      "output",
      "confirmation",
      "engine",
      "fields_written",
      "mechanical_verification",
      "human_review",
      "privacy",
      "boundaries",
    ],
    "MANIFEST_INVALID",
    "review manifest",
  );
  for (const [value, keys, label] of [
    [manifest.form, ["profile_id", "form_code", "profile_digest"], "manifest form"],
    [
      manifest.workflow_approval,
      [
        "confidential_workflow_mode",
        "form_route_human_selected",
        "data_handling",
        "interaction_host",
        "approved_at",
      ],
      "manifest workflow approval",
    ],
    [manifest.source, ["path", "sha256", "bytes", "preserved"], "manifest source"],
    [manifest.output, ["path", "sha256", "bytes"], "manifest output"],
    [
      manifest.confirmation,
      ["path", "sha256", "bytes", "plan_digest"],
      "manifest confirmation",
    ],
    [manifest.engine, ["name", "version", "sha256"], "manifest engine"],
    [
      manifest.mechanical_verification,
      [
        "status",
        "page_count_unchanged",
        "field_count_unchanged",
        "selected_values_match",
        "prohibited_and_unselected_values_unchanged",
        "page_count",
      ],
      "manifest mechanical verification",
    ],
    [
      manifest.human_review,
      ["status", "pages_expected", "pages_reviewed", "viewer", "reviewer", "reviewed_at"],
      "manifest human review",
    ],
    [
      manifest.privacy,
      ["classification", "plaintext_field_values_omitted", "contains_value_derived_digest"],
      "manifest privacy",
    ],
    [
      manifest.boundaries,
      [
        "filing_ready",
        "signatures_left_human_owned",
        "certifications_left_human_owned",
        "entity_status_left_human_owned",
        "fee_elections_left_human_owned",
        "payment_left_human_owned",
        "filing_confirmation",
      ],
      "manifest boundaries",
    ],
  ]) {
    assertExactObjectKeys(value, keys, "MANIFEST_INVALID", label);
  }
  if (!Array.isArray(manifest.fields_written)) {
    fail("MANIFEST_INVALID", "manifest fields_written must be an array");
  }
  for (const field of manifest.fields_written) {
    assertExactObjectKeys(
      field,
      ["name", "label", "provenance"],
      "MANIFEST_INVALID",
      "manifest written-field entry",
    );
  }
  const review = await validateAndReviewPlan({
    matter: matterRoot,
    plan,
    registry,
    engine,
  });
  assertConfirmation(review, confirmation);
  const expectedFields = review.fields.map((field) => ({
    name: field.name,
    label: field.label,
    provenance: field.provenance.kind,
  }));
  const expectedForm = {
    profile_id: review.profile.id,
    form_code: review.profile.form_code,
    profile_digest: review.profile.digest,
  };
  const expectedMechanical = {
    status: "passed",
    page_count_unchanged: true,
    field_count_unchanged: true,
    selected_values_match: true,
    prohibited_and_unselected_values_unchanged: true,
    page_count: registry.profiles.find((profile) => profile.id === review.profile.id)?.page_count || null,
  };
  const expectedHumanReview = {
    status: "required",
    pages_expected: expectedMechanical.page_count,
    pages_reviewed: [],
    viewer: null,
    reviewer: null,
    reviewed_at: null,
  };
  if (
    manifest.status !== "DRAFT-REQUIRES-HUMAN-REVIEW"
    || typeof manifest.created_at !== "string"
    || Number.isNaN(Date.parse(manifest.created_at))
    || manifest.source?.preserved !== true
    || canonicalJson(manifest.engine) !== canonicalJson({
      name: engine.name,
      version: engine.version,
      sha256: engine.sha256,
    })
    || canonicalJson(manifest.form) !== canonicalJson(expectedForm)
    || canonicalJson(manifest.workflow_approval) !== canonicalJson(review.workflow_approval)
    || canonicalJson(manifest.fields_written) !== canonicalJson(expectedFields)
    || canonicalJson(manifest.mechanical_verification) !== canonicalJson(expectedMechanical)
    || canonicalJson(manifest.human_review) !== canonicalJson(expectedHumanReview)
    || canonicalJson(manifest.privacy) !== canonicalJson(MANIFEST_PRIVACY)
    || canonicalJson(manifest.boundaries) !== canonicalJson(MANIFEST_BOUNDARIES)
  ) {
    fail("MANIFEST_INVALID", "review manifest safety, verification, or human-review bindings were changed");
  }
  if (
    manifest.confirmation?.plan_digest !== review.confirmation_digest
    || manifest.source?.path !== plan.source_pdf
  ) {
    fail("MANIFEST_STALE", "review manifest does not match the current confirmed plan");
  }
  assertMatterRelativePathString(manifest.confirmation?.path, "manifest confirmation path");
  assertMatterRelativePathString(manifest.source?.path, "manifest source path");
  assertMatterRelativePathString(manifest.output?.path, "manifest draft path");
  if (
    manifest.output.path === manifest.source.path
    || dirname(manifest.output.path).replace(/\\/gu, "/") !== plan.output_directory
    || !/_DRAFT(?:-(?:0[2-9]|[1-9]\d|[1-9]\d{2}))?\.pdf$/i.test(basename(manifest.output.path))
  ) {
    fail(
      "MANIFEST_INVALID",
      "manifest output must identify a distinct generated *_DRAFT.pdf in the plan output_directory",
    );
  }
  const confirmationPath = resolveMatterFile(matterRoot, manifest.confirmation?.path, {
    label: "manifest confirmation record",
    extension: ".json",
  });
  const confirmationBytes = readBoundedFile(confirmationPath, {
    label: "confirmation record",
    maxBytes: MAX_JSON_BYTES,
    code: "CONFIRMATION_INVALID",
  });
  if (sha256Bytes(confirmationBytes) !== manifest.confirmation.sha256) {
    fail("MANIFEST_HASH_MISMATCH", "confirmation record no longer matches the review manifest");
  }
  let onDiskConfirmation;
  try {
    onDiskConfirmation = JSON.parse(confirmationBytes.toString("utf8"));
  } catch (error) {
    fail("CONFIRMATION_INVALID", `confirmation record cannot be parsed: ${error.message}`);
  }
  if (canonicalJson(onDiskConfirmation) !== canonicalJson(confirmation)) {
    fail("CONFIRMATION_FILE_MISMATCH", "confirmation input does not match its matter-local file");
  }
  assertConfirmation(review, onDiskConfirmation);
  const sourcePath = resolveMatterFile(matterRoot, manifest.source?.path, {
    label: "manifest source PDF",
    extension: ".pdf",
  });
  const outputPath = resolveMatterFile(matterRoot, manifest.output?.path, {
    label: "manifest draft PDF",
    extension: ".pdf",
  });
  const sourceBytes = readBoundedFile(sourcePath, {
    label: "manifest source PDF",
    maxBytes: MAX_PDF_BYTES,
    code: "PDF_TOO_LARGE",
  });
  const outputBytes = readBoundedFile(outputPath, {
    label: "manifest draft PDF",
    maxBytes: MAX_PDF_BYTES,
    code: "PDF_TOO_LARGE",
  });
  if (
    sha256Bytes(sourceBytes) !== manifest.source.sha256
    || sha256Bytes(outputBytes) !== manifest.output.sha256
    || sourceBytes.length !== manifest.source.bytes
    || outputBytes.length !== manifest.output.bytes
    || confirmationBytes.length !== manifest.confirmation.bytes
  ) {
    fail("MANIFEST_HASH_MISMATCH", "source, confirmation, or draft bytes no longer match the review manifest");
  }
  const verification = await comparePdfFieldValues(sourceBytes, outputBytes, review, engine);
  return {
    schema: "apa-pdf-fill-verification-v1",
    status: "MECHANICAL-VERIFICATION-PASSED",
    source_sha256: manifest.source.sha256,
    output_sha256: manifest.output.sha256,
    fields_written: review.fields.length,
    prohibited_and_unselected_values_unchanged:
      verification.prohibited_and_unselected_values_unchanged,
    visual_review_status: "required",
    filing_ready: false,
  };
}

export function readMatterJson(matter, path, label = "JSON file") {
  const matterRoot = requireMatter(matter);
  const file = resolveMatterFile(matterRoot, path, { label, extension: ".json" });
  return { path: relativeMatterPath(matterRoot, file), value: readJson(file, label) };
}

export function nextMatterJsonPath(matter, requestedPath, fallbackRelativePath) {
  const matterRoot = requireMatter(matter);
  const requestedRelativePath = requestedPath || fallbackRelativePath;
  const initial = resolveMatterFile(matterRoot, requestedRelativePath, {
    label: "output JSON",
    mustExist: false,
    extension: ".json",
  });
  const parent = dirname(initial);
  assertNoSymlinkComponents(matterRoot, parent);
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  if (!existsSync(initial)) return relativeMatterPath(matterRoot, initial);
  const parsed = parse(initial);
  for (let index = 2; index <= 999; index += 1) {
    const candidate = join(parsed.dir, `${parsed.name}-${String(index).padStart(2, "0")}${parsed.ext}`);
    if (!existsSync(candidate)) return relativeMatterPath(matterRoot, candidate);
  }
  fail("OUTPUT_EXHAUSTED", "no unused JSON output filename remains");
}

export function writeMatterJsonExclusive(matter, path, value) {
  const matterRoot = requireMatter(matter);
  const candidate = resolveMatterFile(matterRoot, path, {
    label: "output JSON",
    mustExist: false,
    extension: ".json",
  });
  assertNoSymlinkComponents(matterRoot, dirname(candidate));
  mkdirSync(dirname(candidate), { recursive: true, mode: 0o700 });
  writeExclusive(candidate, `${JSON.stringify(value, null, 2)}\n`);
  return relativeMatterPath(matterRoot, candidate);
}
