#!/usr/bin/env node

import { basename, parse } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FormFillError,
  createConfirmationRecord,
  fillConfirmedPlan,
  initializePlan,
  inspectPdf,
  nextMatterJsonPath,
  readMatterJson,
  relativeMatterPath,
  requireMatter,
  validateAndReviewPlan,
  verifyDraft,
  writeMatterJsonExclusive,
} from "./form_fill_lib.mjs";

const DISCLAIMER =
  "Drafting aid only. A human must choose and confirm every form value and checkbox, verify every page, " +
  "sign, execute any payment, upload, and file.";

function option(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 && index + 1 < argv.length ? argv[index + 1] : undefined;
}

function usage(message) {
  const lines = [];
  if (message) lines.push(`error: ${message}`, "");
  lines.push(
    "patent_form_fill - prompt-driven, local USPTO AcroForm draft filling",
    "",
    "Usage:",
    "  node scripts/patent_form_fill.mjs inspect --matter <dir> --source <pdf> [--json]",
    "  node scripts/patent_form_fill.mjs init --matter <dir> --source <pdf> --form-route-human-selected --data-handling <local-only|remote-host-acknowledged> --interaction-host <claude-code|codex|cursor|chatgpt|other> [--plan <json>] [--json]",
    "  node scripts/patent_form_fill.mjs review --matter <dir> --plan <json> [--json]",
    "  node scripts/patent_form_fill.mjs confirm --matter <dir> --plan <json> --digest <sha256> --human-confirmed [--out <json>] [--json]",
    "  node scripts/patent_form_fill.mjs fill --matter <dir> --plan <json> --confirmation <json> [--json]",
    "  node scripts/patent_form_fill.mjs verify --matter <dir> --plan <json> --confirmation <json> --manifest <json> [--json]",
    "",
    "All PDFs, plans, confirmations, and manifests must remain inside an APA matter containing PATENT.md.",
    "The source PDF is never overwritten. XFA forms are refused.",
    "",
    DISCLAIMER,
    "",
  );
  process.stderr.write(lines.join("\n"));
  return message ? 2 : 0;
}

function emitJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function emitInspection(value) {
  process.stdout.write(`Form: ${value.profile ? `${value.profile.form_code} (${value.profile.id})` : "unrecognized revision"}\n`);
  process.stdout.write(`Source SHA-256: ${value.source.sha256}\n`);
  process.stdout.write(`Pages: ${value.page_count}; fields: ${value.field_count}; automation-allowed fields: ${value.allowed_field_count}\n`);
  process.stdout.write(`Supported for filling: ${value.supported ? "yes" : "no"}\n`);
  process.stdout.write(`\n${DISCLAIMER}\n`);
}

function emitPlanResult(result) {
  process.stdout.write(`Wrote fill plan: ${result.plan}\n`);
  process.stdout.write(`Allowed text and checkbox fields: ${result.allowed_field_count}\n`);
  process.stdout.write("Edit only fields with include=true, a type-appropriate value, and supported provenance.\n");
  process.stdout.write(`\n${DISCLAIMER}\n`);
}

export function formatReviewValue(value) {
  return JSON.stringify(value);
}

function emitReview(review) {
  process.stdout.write("Field-by-field confirmation summary\n");
  process.stdout.write(`Form: ${review.profile.form_code} (${review.profile.id})\n`);
  process.stdout.write(`Source SHA-256: ${review.source.sha256}\n`);
  process.stdout.write(`Workflow approval (JSON): ${formatReviewValue(review.workflow_approval)}\n`);
  for (const [index, field] of review.fields.entries()) {
    process.stdout.write(`${index + 1}. ${field.label} [${field.name}]\n`);
    process.stdout.write(`   Type: ${field.type}\n`);
    process.stdout.write(`   Value (JSON): ${formatReviewValue(field.value)}\n`);
    process.stdout.write(`   Provenance (JSON): ${formatReviewValue(field.provenance)}\n`);
  }
  process.stdout.write(`\nConfirmation digest: ${review.confirmation_digest}\n`);
  process.stdout.write(`${review.confirmation_prompt}\n`);
  process.stdout.write("No PDF has been written.\n");
}

function emitFillResult(result) {
  process.stdout.write(`Draft PDF: ${result.output_pdf}\n`);
  process.stdout.write(`Review manifest: ${result.review_manifest}\n`);
  process.stdout.write(`Output SHA-256: ${result.output_sha256}\n`);
  process.stdout.write("Mechanical verification passed. Visual review of every page is still required.\n");
  process.stdout.write(`\n${DISCLAIMER}\n`);
}

function emitVerification(result) {
  process.stdout.write(`Mechanical status: ${result.status}\n`);
  process.stdout.write(`Visual review status: ${result.visual_review_status}\n`);
  process.stdout.write(`Filing ready: ${result.filing_ready ? "yes" : "no"}\n`);
  process.stdout.write(`\n${DISCLAIMER}\n`);
}

async function cmdInspect(argv) {
  const result = await inspectPdf({
    matter: option(argv, "--matter"),
    source: option(argv, "--source"),
  });
  if (argv.includes("--json")) emitJson(result);
  else emitInspection(result);
  return 0;
}

async function cmdInit(argv) {
  const matter = requireMatter(option(argv, "--matter"));
  const source = option(argv, "--source");
  const plan = await initializePlan({
    matter,
    source,
    formRouteHumanSelected: argv.includes("--form-route-human-selected"),
    dataHandling: option(argv, "--data-handling"),
    interactionHost: option(argv, "--interaction-host"),
  });
  const sourceStem = parse(basename(plan.source_pdf)).name;
  const requested = option(argv, "--plan");
  const path = nextMatterJsonPath(
    matter,
    requested,
    `assembled/forms/${sourceStem}.fill-plan.json`,
  );
  const written = writeMatterJsonExclusive(matter, path, plan);
  const result = {
    schema: "apa-pdf-fill-init-result-v1",
    plan: written,
    source_pdf: plan.source_pdf,
    profile_id: plan.profile_id,
    workflow_approval: plan.workflow_approval,
    allowed_field_count: plan.fields.length,
    next_step: "Infer verified values, ask only for missing values in chat, edit the plan, then run review.",
  };
  if (argv.includes("--json")) emitJson(result);
  else emitPlanResult(result);
  return 0;
}

async function loadPlanForCommand(argv) {
  const matter = option(argv, "--matter");
  const loaded = readMatterJson(matter, option(argv, "--plan"), "fill plan");
  return { matter: requireMatter(matter), path: loaded.path, value: loaded.value };
}

async function cmdReview(argv) {
  const plan = await loadPlanForCommand(argv);
  const review = await validateAndReviewPlan({ matter: plan.matter, plan: plan.value });
  if (argv.includes("--json")) emitJson(review);
  else emitReview(review);
  return 0;
}

async function cmdConfirm(argv) {
  const plan = await loadPlanForCommand(argv);
  const digest = option(argv, "--digest");
  if (!digest) return usage("confirm requires --digest <sha256> from the displayed review");
  if (!argv.includes("--human-confirmed")) {
    return usage("confirm requires --human-confirmed only after the user explicitly confirms the displayed values");
  }
  const review = await validateAndReviewPlan({ matter: plan.matter, plan: plan.value });
  const confirmation = createConfirmationRecord(review, {
    humanConfirmed: true,
    presentedDigest: digest,
  });
  const planStem = parse(basename(plan.path)).name.replace(/\.fill-plan$/i, "");
  const output = nextMatterJsonPath(
    plan.matter,
    option(argv, "--out"),
    `assembled/forms/${planStem}.fill-confirmation.json`,
  );
  const written = writeMatterJsonExclusive(plan.matter, output, confirmation);
  const result = {
    schema: "apa-pdf-fill-confirm-result-v1",
    confirmation: written,
    plan_digest: confirmation.plan_digest,
    next_step: "Run fill with this unchanged plan and confirmation record.",
  };
  if (argv.includes("--json")) emitJson(result);
  else {
    process.stdout.write(`Wrote confirmation record: ${result.confirmation}\n`);
    process.stdout.write("This confirms displayed draft values only; it does not authorize signing, payment execution, or filing.\n");
  }
  return 0;
}

async function cmdFill(argv) {
  const plan = await loadPlanForCommand(argv);
  const loadedConfirmation = readMatterJson(
    plan.matter,
    option(argv, "--confirmation"),
    "fill confirmation",
  );
  const result = await fillConfirmedPlan({
    matter: plan.matter,
    plan: plan.value,
    confirmation: loadedConfirmation.value,
    confirmationPath: loadedConfirmation.path,
  });
  if (argv.includes("--json")) emitJson(result);
  else emitFillResult(result);
  return 0;
}

async function cmdVerify(argv) {
  const plan = await loadPlanForCommand(argv);
  const confirmation = readMatterJson(
    plan.matter,
    option(argv, "--confirmation"),
    "fill confirmation",
  );
  const manifest = readMatterJson(
    plan.matter,
    option(argv, "--manifest"),
    "review manifest",
  );
  const result = await verifyDraft({
    matter: plan.matter,
    plan: plan.value,
    confirmation: confirmation.value,
    manifest: manifest.value,
  });
  if (argv.includes("--json")) emitJson(result);
  else emitVerification(result);
  return 0;
}

export async function runCli(argv = process.argv.slice(2)) {
  const args = [...argv];
  const command = args.shift();
  try {
    switch (command) {
      case "inspect": return await cmdInspect(args);
      case "init": return await cmdInit(args);
      case "review": return await cmdReview(args);
      case "confirm": return await cmdConfirm(args);
      case "fill": return await cmdFill(args);
      case "verify": return await cmdVerify(args);
      case "help":
      case "--help":
      case "-h":
        return usage();
      default:
        return usage(command ? `unknown command '${command}'` : "no command given");
    }
  } catch (error) {
    if (error instanceof FormFillError) {
      process.stderr.write(`error [${error.code}]: ${error.message}\n`);
      return 2;
    }
    process.stderr.write(`error [UNEXPECTED]: ${error?.message || String(error)}\n`);
    return 2;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = await runCli();
}
