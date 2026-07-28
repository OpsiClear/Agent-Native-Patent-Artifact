import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const USPTO_FORM_REGISTRY_SCHEMA = "apa-uspto-form-registry-v1";

export function loadOfficialFormRegistry(path = join(ROOT, "docs", "uspto-forms.json")) {
  const registry = JSON.parse(readFileSync(path, "utf8"));
  const check = validateOfficialFormRegistry(registry);
  if (!check.ok) {
    throw new Error(`official form registry is invalid: ${check.errors.map((item) => `${item.path}: ${item.message}`).join("; ")}`);
  }
  return registry;
}

export function validateOfficialFormRegistry(registry) {
  const errors = [];
  const push = (path, message) => errors.push({ path, message });
  if (!registry || typeof registry !== "object" || Array.isArray(registry)) {
    push("$", "registry must be an object");
    return { ok: false, errors };
  }
  if (registry.schema !== USPTO_FORM_REGISTRY_SCHEMA) push("schema", `expected ${USPTO_FORM_REGISTRY_SCHEMA}`);
  if (!Array.isArray(registry.forms) || !registry.forms.length) push("forms", "at least one form is required");
  const ids = new Set();
  const filenames = new Set();
  for (let index = 0; index < (registry.forms || []).length; index += 1) {
    const form = registry.forms[index];
    const base = `forms[${index}]`;
    if (!form.id || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.id)) push(`${base}.id`, "lowercase hyphenated id is required");
    if (ids.has(form.id)) push(`${base}.id`, "duplicate id");
    ids.add(form.id);
    if (!form.form_code) push(`${base}.form_code`, "form code is required");
    if (!form.title) push(`${base}.title`, "title is required");
    if (!Array.isArray(form.applicability) || !form.applicability.length) {
      push(`${base}.applicability`, "at least one applicability label is required");
    }
    if (!["core", "manual-fallback"].includes(form.release_role)) {
      push(`${base}.release_role`, "release role must be core or manual-fallback");
    }
    if (!form.published_or_updated_label) {
      push(`${base}.published_or_updated_label`, "a USPTO-published/updated label is required");
    }
    if (!form.filename || !/^[A-Za-z0-9._-]+\.pdf$/i.test(form.filename)) push(`${base}.filename`, "stable PDF filename is required");
    if (filenames.has(form.filename)) push(`${base}.filename`, "duplicate filename");
    filenames.add(form.filename);
    for (const field of ["source_page", "direct_url"]) {
      try {
        const url = new URL(form[field]);
        if (url.protocol !== "https:") push(`${base}.${field}`, "HTTPS is required");
        if (!["uspto.gov", "www.uspto.gov"].includes(url.hostname.toLowerCase())) {
          push(`${base}.${field}`, "only official uspto.gov hosts are allowed");
        }
      } catch {
        push(`${base}.${field}`, "valid official URL is required");
      }
    }
    if (!/^[0-9a-f]{64}$/.test(String(form.sha256 || ""))) push(`${base}.sha256`, "pinned SHA-256 is required");
    if (!Number.isSafeInteger(form.expected_bytes) || form.expected_bytes < 5) {
      push(`${base}.expected_bytes`, "positive expected byte count is required");
    }
    if (form.media_type !== "application/pdf") push(`${base}.media_type`, "media type must be application/pdf");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(form.retrieved_date || ""))) push(`${base}.retrieved_date`, "retrieved date must be YYYY-MM-DD");
    if (typeof form.xfa !== "boolean") push(`${base}.xfa`, "XFA status must be explicit");
    if (!form.viewer_requirement) push(`${base}.viewer_requirement`, "viewer requirement is required");
  }
  return { ok: errors.length === 0, errors };
}

export function formByCode(registry, code) {
  const normalized = String(code || "").toUpperCase().replace(/\s+/g, "");
  const matches = registry.forms.filter((form) => String(form.form_code).toUpperCase().replace(/\s+/g, "") === normalized);
  return matches.find((form) => form.release_role === "core") || matches[0] || null;
}
