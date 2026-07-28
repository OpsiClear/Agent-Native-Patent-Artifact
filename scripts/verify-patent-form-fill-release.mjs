#!/usr/bin/env node

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FormFillError,
  createConfirmationRecord,
  fillConfirmedPlan,
  initializePlan,
  inspectPdf,
  loadPdfEngine,
  loadProfiles,
  sha256Bytes,
  validateAndReviewPlan,
  verifyDraft,
} from "../skills/apa-form-fill/scripts/form_fill_lib.mjs";

const EXPECTED_SUPPORTED_FORMS = 6;
const EXPECTED_XFA_REFUSALS = 3;
const EXPECTED_ALLOWED_FIELDS = 223;
const EXPECTED_SUPPORTED_PAGES = 13;
const QA_TIME = "2031-01-02T03:04:05.000Z";

function option(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 && index + 1 < argv.length ? argv[index + 1] : undefined;
}

function usage(message) {
  if (message) process.stderr.write(`error: ${message}\n\n`);
  process.stderr.write(
    "Usage: node scripts/verify-patent-form-fill-release.mjs " +
    "--forms-dir <verified-official-bundle> [--visual-output <new-dir>]\n",
  );
  return message ? 2 : 0;
}

function syntheticValue(descriptor, index) {
  const preferred = `QA${String(index + 1).padStart(3, "0")}`;
  const limits = [descriptor.max_length, descriptor.profile_max_chars]
    .filter((value) => Number.isSafeInteger(value));
  const limit = limits.length ? Math.min(...limits) : preferred.length;
  return preferred.slice(0, Math.max(1, limit));
}

async function verifyProfile({ profile, formsDir, visualOutput, registry, engine }) {
  const matter = mkdtempSync(join(tmpdir(), `apa-form-release-${profile.id}-`));
  try {
    writeFileSync(
      join(matter, "PATENT.md"),
      "---\ntitle: Synthetic form release verification\n" +
      "confidential_workflow_mode: ordinary_local\n---\n",
    );
    mkdirSync(join(matter, "forms"), { recursive: true });
    const officialSource = join(formsDir, profile.filename);
    if (!existsSync(officialSource)) throw new Error(`missing official form: ${officialSource}`);
    const matterSource = join(matter, "forms", profile.filename);
    copyFileSync(officialSource, matterSource);
    const beforeHash = sha256Bytes(readFileSync(matterSource));
    if (beforeHash !== profile.sha256) {
      throw new Error(`official form hash mismatch for ${profile.id}`);
    }

    if (profile.xfa) {
      let refusal;
      try {
        await inspectPdf({
          matter,
          source: `forms/${profile.filename}`,
          registry,
          engine,
        });
      } catch (error) {
        refusal = error;
      }
      if (!(refusal instanceof FormFillError) || refusal.code !== "XFA_UNSUPPORTED") {
        throw refusal || new Error(`${profile.id} did not refuse XFA`);
      }
      if (sha256Bytes(readFileSync(matterSource)) !== beforeHash) {
        throw new Error(`${profile.id} source changed during XFA refusal`);
      }
      return {
        profile_id: profile.id,
        result: "XFA-REFUSED",
        pages: profile.page_count,
        allowed_fields: 0,
        source_preserved: true,
      };
    }

    const inspection = await inspectPdf({
      matter,
      source: `forms/${profile.filename}`,
      registry,
      engine,
    });
    const descriptors = new Map(inspection.fields.map((field) => [field.name, field]));
    const plan = await initializePlan({
      matter,
      source: `forms/${profile.filename}`,
      registry,
      engine,
      formRouteHumanSelected: true,
      dataHandling: "local-only",
      interactionHost: "codex",
      now: QA_TIME,
    });
    for (const [index, field] of plan.fields.entries()) {
      field.include = true;
      field.value = syntheticValue(descriptors.get(field.name), index);
      field.provenance = { kind: "human-confirmed", source: "chat" };
    }
    const review = await validateAndReviewPlan({ matter, plan, registry, engine });
    const confirmation = createConfirmationRecord(review, {
      humanConfirmed: true,
      presentedDigest: review.confirmation_digest,
      now: QA_TIME,
    });
    const confirmationPath = "assembled/forms/release-confirmation.json";
    mkdirSync(join(matter, "assembled", "forms"), { recursive: true });
    writeFileSync(
      join(matter, ...confirmationPath.split("/")),
      `${JSON.stringify(confirmation, null, 2)}\n`,
    );
    const filled = await fillConfirmedPlan({
      matter,
      plan,
      confirmation,
      confirmationPath,
      registry,
      engine,
      now: QA_TIME,
    });
    const manifest = JSON.parse(
      readFileSync(join(matter, ...filled.review_manifest.split("/")), "utf8"),
    );
    const verified = await verifyDraft({
      matter,
      plan,
      confirmation,
      manifest,
      registry,
      engine,
    });
    if (verified.status !== "MECHANICAL-VERIFICATION-PASSED") {
      throw new Error(`${profile.id} did not pass mechanical verification`);
    }
    if (sha256Bytes(readFileSync(matterSource)) !== beforeHash) {
      throw new Error(`${profile.id} source changed during filling`);
    }
    if (visualOutput) {
      copyFileSync(
        join(matter, ...filled.output_pdf.split("/")),
        join(visualOutput, `${profile.id}_DRAFT.pdf`),
      );
    }
    return {
      profile_id: profile.id,
      result: "WRITE-REOPEN-COMPARE-PASSED",
      pages: profile.page_count,
      allowed_fields: plan.fields.length,
      source_preserved: true,
      visual_draft: visualOutput ? `${profile.id}_DRAFT.pdf` : null,
    };
  } finally {
    rmSync(matter, { recursive: true, force: true });
  }
}

export async function verifyRelease({ formsDir, visualOutput } = {}) {
  if (!formsDir) throw new Error("--forms-dir is required");
  const resolvedFormsDir = resolve(formsDir);
  if (!existsSync(resolvedFormsDir)) throw new Error(`forms directory does not exist: ${resolvedFormsDir}`);
  const resolvedVisualOutput = visualOutput ? resolve(visualOutput) : null;
  if (resolvedVisualOutput) {
    if (existsSync(resolvedVisualOutput)) {
      throw new Error(`visual output directory already exists: ${resolvedVisualOutput}`);
    }
    mkdirSync(resolvedVisualOutput, { recursive: true });
  }
  const registry = loadProfiles();
  const engine = loadPdfEngine();
  const forms = [];
  for (const profile of registry.profiles) {
    forms.push(await verifyProfile({
      profile,
      formsDir: resolvedFormsDir,
      visualOutput: resolvedVisualOutput,
      registry,
      engine,
    }));
  }
  const supported = forms.filter((form) => form.result === "WRITE-REOPEN-COMPARE-PASSED");
  const refused = forms.filter((form) => form.result === "XFA-REFUSED");
  const allowedFields = supported.reduce((total, form) => total + form.allowed_fields, 0);
  const supportedPages = supported.reduce((total, form) => total + form.pages, 0);
  if (
    supported.length !== EXPECTED_SUPPORTED_FORMS
    || refused.length !== EXPECTED_XFA_REFUSALS
    || allowedFields !== EXPECTED_ALLOWED_FIELDS
    || supportedPages !== EXPECTED_SUPPORTED_PAGES
  ) {
    throw new Error(
      "release matrix totals changed; independently review the new forms/fields/pages before " +
      "updating the evidence constants",
    );
  }
  return {
    schema: "apa-patent-form-fill-release-verification-v1",
    status: "PASSED",
    official_source_page: registry.official_source_page,
    retrieved_date: registry.retrieved_date,
    engine: {
      name: engine.name,
      version: engine.version,
      sha256: engine.sha256,
    },
    supported_forms: supported.length,
    xfa_refusals: refused.length,
    supported_pages: supportedPages,
    automated_fields_write_reopen_compared: allowedFields,
    source_preserved_for_all_forms: forms.every((form) => form.source_preserved),
    visual_output: resolvedVisualOutput ? basename(resolvedVisualOutput) : null,
    forms,
  };
}

async function main(argv) {
  if (argv.includes("--help") || argv.includes("-h")) return usage();
  try {
    const result = await verifyRelease({
      formsDir: option(argv, "--forms-dir"),
      visualOutput: option(argv, "--visual-output"),
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`error: ${error?.message || String(error)}\n`);
    return 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = await main(process.argv.slice(2));
}
