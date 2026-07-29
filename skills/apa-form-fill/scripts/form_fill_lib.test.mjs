import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  CONFIRMATION_SCHEMA,
  FormFillError,
  MAX_PDF_BYTES,
  MAX_SELECTED_VALUE_BYTES,
  PLAN_SCHEMA,
  PROFILE_SCHEMA,
  REVIEW_MANIFEST_SCHEMA,
  canonicalJson,
  createConfirmationRecord,
  fillConfirmedPlan,
  hasXfaMarker,
  initializePlan as initializePlanEngine,
  inspectPdf,
  jsonPointerGet,
  loadPdfEngine,
  loadProfiles,
  nextMatterJsonPath,
  readMatterJson,
  requireMatter,
  sha256Bytes,
  validateAndReviewPlan,
  validateProfiles,
  verifyDraft,
  writeMatterJsonExclusive,
} from "./form_fill_lib.mjs";
import { formatReviewValue } from "./patent_form_fill.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, "patent_form_fill.mjs");
const ROOT = resolve(HERE, "..", "..", "..");

function expectCode(code) {
  return (error) => error instanceof FormFillError && error.code === code;
}

async function makeMatter() {
  const matter = mkdtempSync(join(tmpdir(), "apa-form-fill-test-"));
  writeFileSync(
    join(matter, "PATENT.md"),
    "---\ntitle: Synthetic PDF test\nconfidential_workflow_mode: ordinary_local\n---\n",
  );
  mkdirSync(join(matter, "forms"), { recursive: true });
  const engine = loadPdfEngine();
  const { PDFDocument } = engine.api;
  const document = await PDFDocument.create();
  const page = document.addPage([612, 792]);
  const form = document.getForm();
  const application = form.createTextField("Application Number");
  application.addToPage(page, { x: 60, y: 680, width: 240, height: 24 });
  const title = form.createTextField("Title");
  title.enableMultiline();
  title.setMaxLength(80);
  title.addToPage(page, { x: 60, y: 620, width: 480, height: 42 });
  const signature = form.createTextField("Signature");
  signature.addToPage(page, { x: 60, y: 560, width: 240, height: 24 });
  const entity = form.createCheckBox("Micro Entity");
  entity.addToPage(page, { x: 60, y: 520, width: 18, height: 18 });
  entity.check();
  const fee = form.createCheckBox("Fee Enclosed");
  fee.addToPage(page, { x: 60, y: 490, width: 18, height: 18 });
  const sourceBytes = Buffer.from(await document.save({
    updateFieldAppearances: true,
    useObjectStreams: false,
  }));
  const source = join(matter, "forms", "synthetic-form.pdf");
  writeFileSync(source, sourceBytes);
  const profile = {
    id: "synthetic-test-form",
    form_code: "TEST/01",
    filename: "synthetic-form.pdf",
    direct_url: "https://www.uspto.gov/test/synthetic-form.pdf",
    sha256: sha256Bytes(sourceBytes),
    expected_bytes: sourceBytes.length,
    page_count: 1,
    field_count: 5,
    xfa: false,
    fill_support: "confirmed-text-and-checkboxes",
    allow_all_text_fields: true,
    allowed_text_fields: {
      "Application Number": "Application number",
      Title: "Title of invention",
    },
    allowed_checkbox_fields: {
      "Micro Entity": "Applicant certifies micro entity status",
      "Fee Enclosed": "Fee is enclosed",
    },
    signature_text_fields: {
      Signature: "Signature",
    },
    field_constraints: {
      Title: { max_chars: 50 },
    },
  };
  const registry = {
    schema: PROFILE_SCHEMA,
    version: "test",
    official_source_page: "https://www.uspto.gov/patents/apply/forms",
    retrieved_date: "2031-01-02",
    engine: {
      name: "pdf-lib",
      version: "1.17.1",
      file: "test",
      sha256: engine.sha256,
    },
    profiles: [profile],
  };
  return { matter, source, sourceBytes, profile, registry, engine };
}

function initializePlan(options = {}) {
  return initializePlanEngine({
    formRouteHumanSelected: true,
    dataHandling: "local-only",
    interactionHost: "codex",
    ...options,
  });
}

function cleanup(context) {
  rmSync(context.matter, { recursive: true, force: true });
}

function selectField(plan, name, value, provenance = { kind: "human-confirmed", source: "chat" }) {
  const field = plan.fields.find((item) => item.name === name);
  assert.ok(field, `missing plan field ${name}`);
  field.include = true;
  field.value = value;
  field.provenance = provenance;
  return plan;
}

test("vendored engine and official profiles pass pinned integrity checks", () => {
  const engine = loadPdfEngine();
  const profiles = loadProfiles();
  assert.equal(engine.name, "pdf-lib");
  assert.equal(engine.version, "1.17.1");
  assert.match(engine.sha256, /^[0-9a-f]{64}$/);
  assert.equal(validateProfiles(profiles), true);
  assert.equal(profiles.profiles.length, 9);
  assert.equal(profiles.profiles.filter((profile) => profile.xfa).length, 3);
  const aia01 = profiles.profiles.find((profile) => profile.id === "aia01-inventor-declaration");
  assert.equal(Object.keys(aia01.allowed_text_fields).length, 5);
  assert.equal(Object.hasOwn(aia01.allowed_text_fields, "Inventor"), true);
  assert.equal(aia01.signature_text_fields.Text4, "Inventor signature");
  assert.equal(Object.keys(aia01.allowed_checkbox_fields).length, 2);
  const sb16 = profiles.profiles.find((profile) => profile.id === "sb16-manual");
  assert.equal(
    sb16.field_constraints["TITLE OF THE INVENTION 500 characters maxRow1"].max_chars,
    500,
  );
  const contradictory = JSON.parse(JSON.stringify(profiles));
  const contradictoryAia01 = contradictory.profiles.find(
    (profile) => profile.id === "aia01-inventor-declaration",
  );
  contradictoryAia01.allowed_text_fields.Text4 = "Incorrectly allowed signature";
  assert.throws(() => validateProfiles(contradictory), expectCode("PROFILE_REGISTRY_INVALID"));
  assert.throws(
    () => loadPdfEngine({ expectedSha256: "0".repeat(64) }),
    expectCode("PDF_ENGINE_INTEGRITY"),
  );
});

test("form profiles stay bound to the official USPTO form registry", () => {
  const registry = loadProfiles();
  const official = JSON.parse(readFileSync(join(ROOT, "docs", "uspto-forms.json"), "utf8"));
  assert.equal(registry.official_source_page, official.source_page);
  assert.equal(registry.retrieved_date, official.retrieved_date);
  assert.equal(registry.profiles.length, official.forms.length);
  const profiles = new Map(registry.profiles.map((profile) => [profile.id, profile]));
  for (const form of official.forms) {
    const profile = profiles.get(form.id);
    assert.ok(profile, `missing profile for ${form.id}`);
    assert.equal(profile.form_code, form.form_code);
    assert.equal(profile.filename, form.filename);
    assert.equal(profile.direct_url, form.direct_url);
    assert.equal(profile.sha256, form.sha256);
    assert.equal(profile.expected_bytes, form.expected_bytes);
    assert.equal(profile.xfa, form.xfa);
  }
});

test("canonical JSON, hashes, pointers, and XFA markers are deterministic", () => {
  assert.equal(canonicalJson({ b: 2, a: [3, { z: true, y: null }] }), '{"a":[3,{"y":null,"z":true}],"b":2}');
  assert.equal(sha256Bytes(Buffer.from("abc")), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(jsonPointerGet({ a: { "b/c": { "~d": 7 } } }, "/a/b~1c/~0d"), 7);
  assert.equal(hasXfaMarker(Buffer.from("%PDF-1.7\n1 0 obj << /XFA 2 0 R >>")), true);
  assert.equal(hasXfaMarker(Buffer.from("%PDF-1.7\n1 0 obj << /AcroForm 2 0 R >>")), false);
  assert.throws(() => jsonPointerGet({}, "bad"), expectCode("PROVENANCE_POINTER_INVALID"));
});

test("inspection allows nonsignature text and allowlisted checkboxes while blocking signatures", async () => {
  const context = await makeMatter();
  try {
    const inspection = await inspectPdf({
      matter: context.matter,
      source: "forms/synthetic-form.pdf",
      registry: context.registry,
      engine: context.engine,
    });
    assert.equal(inspection.supported, true);
    assert.equal(inspection.page_count, 1);
    assert.equal(inspection.field_count, 5);
    assert.equal(inspection.allowed_field_count, 4);
    assert.equal(inspection.fields.find((field) => field.name === "Application Number").policy, "allowed");
    assert.equal(inspection.fields.find((field) => field.name === "Signature").policy, "prohibited");
    assert.equal(inspection.fields.find((field) => field.name === "Micro Entity").policy, "allowed");
    assert.equal(inspection.fields.find((field) => field.name === "Micro Entity").type, "checkbox");
    assert.equal(inspection.fields.find((field) => field.name === "Micro Entity").has_existing_value, true);
    assert.equal(inspection.fields.find((field) => field.name === "Fee Enclosed").policy, "allowed");
    assert.equal(inspection.fields.find((field) => field.name === "Title").multiline, true);

    const unknownRegistry = {
      ...context.registry,
      profiles: [{ ...context.profile, sha256: "0".repeat(64) }],
    };
    const unknown = await inspectPdf({
      matter: context.matter,
      source: "forms/synthetic-form.pdf",
      registry: unknownRegistry,
      engine: context.engine,
    });
    assert.equal(unknown.supported, false);
    assert.equal(unknown.allowed_field_count, 0);
    assert.ok(unknown.fields.every((field) => field.policy === "prohibited"));

    const denylistRegistry = {
      ...context.registry,
      profiles: [{
        ...context.profile,
        allow_all_text_fields: true,
        allowed_text_fields: {},
      }],
    };
    const denylisted = await inspectPdf({
      matter: context.matter,
      source: "forms/synthetic-form.pdf",
      registry: denylistRegistry,
      engine: context.engine,
    });
    assert.equal(
      denylisted.fields.find((field) => field.name === "Signature").policy,
      "prohibited",
    );
    assert.equal(denylisted.fields.find((field) => field.name === "Title").policy, "allowed");
  } finally {
    cleanup(context);
  }
});

test("inspection requires one valid explicit confidential workflow mode", async () => {
  const context = await makeMatter();
  const inspect = () => inspectPdf({
    matter: context.matter,
    source: "forms/synthetic-form.pdf",
    registry: context.registry,
    engine: context.engine,
  });
  try {
    writeFileSync(join(context.matter, "PATENT.md"), "---\ntitle: Missing mode\n---\n");
    await assert.rejects(inspect(), expectCode("CONFIDENTIAL_WORKFLOW_MODE_REQUIRED"));

    writeFileSync(
      join(context.matter, "PATENT.md"),
      "---\nconfidential_workflow_mode: ordinary_local\nconfidential_workflow_mode: counsel_controlled\n---\n",
    );
    await assert.rejects(inspect(), expectCode("CONFIDENTIAL_WORKFLOW_MODE_REQUIRED"));

    writeFileSync(
      join(context.matter, "PATENT.md"),
      "---\nconfidential_workflow_mode: public_release\n---\n",
    );
    await assert.rejects(inspect(), expectCode("CONFIDENTIAL_WORKFLOW_MODE_INVALID"));

    writeFileSync(
      join(context.matter, "PATENT.md"),
      "---\nconfidential_workflow_mode: \"shareable_redacted\" # reviewed\n---\n",
    );
    const result = await inspect();
    assert.equal(result.workflow.confidential_workflow_mode, "shareable_redacted");
  } finally {
    cleanup(context);
  }
});

test("XFA input fails closed before a PDF parser can rewrite it", async () => {
  const context = await makeMatter();
  try {
    const xfa = join(context.matter, "forms", "xfa.pdf");
    writeFileSync(xfa, "%PDF-1.7\n1 0 obj << /XFA 2 0 R >>\n");
    await assert.rejects(
      inspectPdf({
        matter: context.matter,
        source: "forms/xfa.pdf",
        registry: context.registry,
        engine: context.engine,
      }),
      expectCode("XFA_UNSUPPORTED"),
    );
    assert.equal(readFileSync(xfa, "utf8"), "%PDF-1.7\n1 0 obj << /XFA 2 0 R >>\n");

    const { PDFDocument, PDFHexString, PDFName } = context.engine.api;
    const compressed = await PDFDocument.create();
    compressed.addPage();
    compressed.getForm().acroForm.dict.set(
      PDFName.of("XFA"),
      PDFHexString.fromText("<xdp:xdp/>"),
    );
    const compressedBytes = Buffer.from(await compressed.save({ useObjectStreams: true }));
    assert.equal(hasXfaMarker(compressedBytes), false, "fixture should hide XFA in a compressed object stream");
    const compressedPath = join(context.matter, "forms", "compressed-xfa.pdf");
    writeFileSync(compressedPath, compressedBytes);
    await assert.rejects(
      inspectPdf({
        matter: context.matter,
        source: "forms/compressed-xfa.pdf",
        registry: context.registry,
        engine: context.engine,
      }),
      expectCode("XFA_UNSUPPORTED"),
    );
    assert.equal(sha256Bytes(readFileSync(compressedPath)), sha256Bytes(compressedBytes));
  } finally {
    cleanup(context);
  }
});

test("plan initialization is draft-only and requires selected fields", async () => {
  const context = await makeMatter();
  try {
    await assert.rejects(
      initializePlanEngine({
        matter: context.matter,
        source: "forms/synthetic-form.pdf",
        registry: context.registry,
        engine: context.engine,
      }),
      expectCode("FORM_ROUTE_SELECTION_REQUIRED"),
    );
    await assert.rejects(
      initializePlanEngine({
        matter: context.matter,
        source: "forms/synthetic-form.pdf",
        registry: context.registry,
        engine: context.engine,
        formRouteHumanSelected: true,
      }),
      expectCode("DATA_HANDLING_APPROVAL_REQUIRED"),
    );
    await assert.rejects(
      initializePlanEngine({
        matter: context.matter,
        source: "forms/synthetic-form.pdf",
        registry: context.registry,
        engine: context.engine,
        formRouteHumanSelected: true,
        dataHandling: "local-only",
      }),
      expectCode("INTERACTION_HOST_REQUIRED"),
    );
    const plan = await initializePlan({
      matter: context.matter,
      source: "forms/synthetic-form.pdf",
      registry: context.registry,
      engine: context.engine,
      now: "2031-01-02T03:04:05.000Z",
    });
    assert.equal(plan.schema, PLAN_SCHEMA);
    assert.equal(plan.status, "DRAFT-INTAKE");
    assert.equal(plan.fields.length, 4);
    assert.ok(plan.fields.every((field) => field.include === false && field.value === null));
    assert.ok(plan.fields.every((field) => ["text", "checkbox"].includes(field.type)));
    assert.deepEqual(plan.blocked_field_names, ["Signature"]);
    assert.equal(plan.human_confirmation.status, "pending");
    assert.deepEqual(plan.workflow_approval, {
      confidential_workflow_mode: "ordinary_local",
      form_route_human_selected: true,
      data_handling: "local-only",
      interaction_host: "codex",
      approved_at: "2031-01-02T03:04:05.000Z",
    });
    assert.equal(plan.filing_ready, false);
    await assert.rejects(
      validateAndReviewPlan({
        matter: context.matter,
        plan,
        registry: context.registry,
        engine: context.engine,
      }),
      expectCode("PLAN_EMPTY"),
    );
  } finally {
    cleanup(context);
  }
});

test("plan safety bindings, field inventory, and unselected values fail closed", async () => {
  const context = await makeMatter();
  try {
    const original = await initializePlan({
      matter: context.matter,
      source: "forms/synthetic-form.pdf",
      registry: context.registry,
      engine: context.engine,
    });
    const review = async (mutate) => {
      const plan = JSON.parse(JSON.stringify(original));
      selectField(plan, "Application Number", "12/345,678");
      mutate(plan);
      return validateAndReviewPlan({
        matter: context.matter,
        plan,
        registry: context.registry,
        engine: context.engine,
      });
    };
    await assert.rejects(review((plan) => { plan.status = "FILED"; }), expectCode("PLAN_INVALID"));
    await assert.rejects(
      review((plan) => { plan.response_selected = true; }),
      expectCode("PLAN_INVALID"),
    );
    await assert.rejects(
      review((plan) => { plan.human_confirmation.status = "confirmed"; }),
      expectCode("PLAN_INVALID"),
    );
    await assert.rejects(review((plan) => { plan.filing_ready = true; }), expectCode("PLAN_INVALID"));
    await assert.rejects(
      review((plan) => { plan.workflow_approval.data_handling = "unapproved"; }),
      expectCode("PLAN_INVALID"),
    );
    await assert.rejects(
      review((plan) => {
        const title = plan.fields.find((field) => field.name === "Title");
        title.value = "hidden, unconfirmed value";
      }),
      expectCode("PLAN_INVALID"),
    );
    await assert.rejects(
      review((plan) => {
        plan.fields.find((field) => field.name === "Application Number").legal_effect = "selected";
      }),
      expectCode("PLAN_INVALID"),
    );
    await assert.rejects(
      review((plan) => {
        plan.fields.find((field) => field.name === "Application Number").type = "checkbox";
      }),
      expectCode("FIELD_TYPE_CHANGED"),
    );
    await assert.rejects(
      review((plan) => { plan.blocked_field_names = []; }),
      expectCode("PLAN_FIELD_SET_MISMATCH"),
    );
    await assert.rejects(
      review((plan) => { plan.fields = plan.fields.filter((field) => field.name !== "Title"); }),
      expectCode("PLAN_FIELD_SET_MISMATCH"),
    );
    await assert.rejects(
      review((plan) => { plan.source_pdf = context.source; }),
      expectCode("PATH_NOT_RELATIVE"),
    );
    await assert.rejects(
      review((plan) => {
        plan.fields.find((field) => field.name === "Application Number").value =
          "12/345,678\u202eFORGED";
      }),
      expectCode("FIELD_VALUE_INVALID"),
    );
    writeFileSync(
      join(context.matter, "PATENT.md"),
      "---\ntitle: Synthetic PDF test\nconfidential_workflow_mode: counsel_controlled\n---\n",
    );
    await assert.rejects(review(() => {}), expectCode("CONFIDENTIAL_WORKFLOW_MODE_CHANGED"));
  } finally {
    cleanup(context);
  }
});

test("human-chat values produce a stable field-by-field confirmation digest", async () => {
  const context = await makeMatter();
  try {
    const plan = await initializePlan({
      matter: context.matter,
      source: "forms/synthetic-form.pdf",
      registry: context.registry,
      engine: context.engine,
    });
    selectField(plan, "Application Number", "12/345,678");
    const first = await validateAndReviewPlan({
      matter: context.matter,
      plan,
      registry: context.registry,
      engine: context.engine,
    });
    const second = await validateAndReviewPlan({
      matter: context.matter,
      plan: JSON.parse(JSON.stringify(plan)),
      registry: context.registry,
      engine: context.engine,
    });
    assert.equal(first.confirmation_digest, second.confirmation_digest);
    assert.equal(first.fields[0].value, "12/345,678");
    assert.deepEqual(first.fields[0].provenance, {
      kind: "human-confirmed",
      source: "chat",
    });
    assert.deepEqual(first.workflow_approval, plan.workflow_approval);
    assert.equal(first.filing_ready, false);
  } finally {
    cleanup(context);
  }
});

test("checkbox plans require exact booleans and bind checked and unchecked states into review", async () => {
  const context = await makeMatter();
  try {
    const plan = await initializePlan({
      matter: context.matter,
      source: "forms/synthetic-form.pdf",
      registry: context.registry,
      engine: context.engine,
    });
    selectField(plan, "Micro Entity", false);
    selectField(plan, "Fee Enclosed", true);
    const review = await validateAndReviewPlan({
      matter: context.matter,
      plan,
      registry: context.registry,
      engine: context.engine,
    });
    assert.deepEqual(
      review.fields.map((field) => ({
        name: field.name,
        type: field.type,
        value: field.value,
      })),
      [
        { name: "Micro Entity", type: "checkbox", value: false },
        { name: "Fee Enclosed", type: "checkbox", value: true },
      ],
    );

    const changed = JSON.parse(JSON.stringify(plan));
    changed.fields.find((field) => field.name === "Fee Enclosed").value = false;
    const changedReview = await validateAndReviewPlan({
      matter: context.matter,
      plan: changed,
      registry: context.registry,
      engine: context.engine,
    });
    assert.notEqual(review.confirmation_digest, changedReview.confirmation_digest);

    const invalid = JSON.parse(JSON.stringify(plan));
    invalid.fields.find((field) => field.name === "Fee Enclosed").value = "true";
    await assert.rejects(
      validateAndReviewPlan({
        matter: context.matter,
        plan: invalid,
        registry: context.registry,
        engine: context.engine,
      }),
      expectCode("FIELD_VALUE_INVALID"),
    );
  } finally {
    cleanup(context);
  }
});

test("verified matter JSON provenance checks hash, pointer, value, and human verification", async () => {
  const context = await makeMatter();
  try {
    mkdirSync(join(context.matter, "correspondence"), { recursive: true });
    const recordPath = join(context.matter, "correspondence", "receipt.json");
    const record = {
      application_number: { value: "12/345,678", human_verified: true },
      fee_enclosed: { value: true, human_verified: true },
    };
    const bytes = Buffer.from(`${JSON.stringify(record, null, 2)}\n`);
    writeFileSync(recordPath, bytes);
    const plan = await initializePlan({
      matter: context.matter,
      source: "forms/synthetic-form.pdf",
      registry: context.registry,
      engine: context.engine,
    });
    selectField(plan, "Application Number", "12/345,678", {
      kind: "verified-matter-json",
      path: "correspondence/receipt.json",
      pointer: "/application_number/value",
      verification_pointer: "/application_number/human_verified",
      sha256: sha256Bytes(bytes),
    });
    const review = await validateAndReviewPlan({
      matter: context.matter,
      plan,
      registry: context.registry,
      engine: context.engine,
    });
    assert.deepEqual(review.fields[0].provenance, {
      kind: "verified-matter-json",
      path: "correspondence/receipt.json",
      pointer: "/application_number/value",
      verification_pointer: "/application_number/human_verified",
      sha256: sha256Bytes(bytes),
    });

    const checkboxPlan = await initializePlan({
      matter: context.matter,
      source: "forms/synthetic-form.pdf",
      registry: context.registry,
      engine: context.engine,
    });
    selectField(checkboxPlan, "Fee Enclosed", true, {
      kind: "verified-matter-json",
      path: "correspondence/receipt.json",
      pointer: "/fee_enclosed/value",
      verification_pointer: "/fee_enclosed/human_verified",
      sha256: sha256Bytes(bytes),
    });
    const checkboxReview = await validateAndReviewPlan({
      matter: context.matter,
      plan: checkboxPlan,
      registry: context.registry,
      engine: context.engine,
    });
    assert.equal(checkboxReview.fields[0].value, true);
    assert.equal(checkboxReview.fields[0].type, "checkbox");

    plan.fields.find((field) => field.include).value = "wrong";
    await assert.rejects(
      validateAndReviewPlan({
        matter: context.matter,
        plan,
        registry: context.registry,
        engine: context.engine,
      }),
      expectCode("PROVENANCE_VALUE_MISMATCH"),
    );
  } finally {
    cleanup(context);
  }
});

test("profile text limits and removed profiles fail closed with typed errors", async () => {
  const context = await makeMatter();
  try {
    const tooLong = await initializePlan({
      matter: context.matter,
      source: "forms/synthetic-form.pdf",
      registry: context.registry,
      engine: context.engine,
    });
    selectField(tooLong, "Title", "x".repeat(51));
    await assert.rejects(
      validateAndReviewPlan({
        matter: context.matter,
        plan: tooLong,
        registry: context.registry,
        engine: context.engine,
      }),
      expectCode("FIELD_VALUE_INVALID"),
    );

    const valid = await initializePlan({
      matter: context.matter,
      source: "forms/synthetic-form.pdf",
      registry: context.registry,
      engine: context.engine,
    });
    selectField(valid, "Application Number", "12/345,678");
    const removedProfileRegistry = {
      ...context.registry,
      profiles: [{ ...context.profile, sha256: "0".repeat(64) }],
    };
    await assert.rejects(
      validateAndReviewPlan({
        matter: context.matter,
        plan: valid,
        registry: removedProfileRegistry,
        engine: context.engine,
      }),
      expectCode("UNSUPPORTED_FORM_REVISION"),
    );
  } finally {
    cleanup(context);
  }
});

test("aggregate selected values stay within the bounded human-review payload", async () => {
  const matter = mkdtempSync(join(tmpdir(), "apa-form-fill-aggregate-"));
  const valueLength = 10_000;
  const fieldCount = Math.floor(MAX_SELECTED_VALUE_BYTES / valueLength) + 2;
  try {
    writeFileSync(
      join(matter, "PATENT.md"),
      "---\ntitle: Aggregate payload test\nconfidential_workflow_mode: ordinary_local\n---\n",
    );
    mkdirSync(join(matter, "forms"), { recursive: true });
    const engine = loadPdfEngine();
    const document = await engine.api.PDFDocument.create();
    const page = document.addPage([612, 792]);
    const form = document.getForm();
    const allowedTextFields = {};
    for (let index = 0; index < fieldCount; index += 1) {
      const name = `Field ${String(index + 1).padStart(3, "0")}`;
      const field = form.createTextField(name);
      field.addToPage(page, { x: 20, y: 20, width: 40, height: 12 });
      allowedTextFields[name] = `Synthetic field ${index + 1}`;
    }
    const sourceBytes = Buffer.from(await document.save({
      updateFieldAppearances: true,
      useObjectStreams: false,
    }));
    writeFileSync(join(matter, "forms", "aggregate.pdf"), sourceBytes);
    const profile = {
      id: "aggregate-test-form",
      form_code: "TEST/AGGREGATE",
      filename: "aggregate.pdf",
      direct_url: "https://www.uspto.gov/test/aggregate.pdf",
      sha256: sha256Bytes(sourceBytes),
      expected_bytes: sourceBytes.length,
      page_count: 1,
      field_count: fieldCount,
      xfa: false,
      fill_support: "confirmed-text-and-checkboxes",
      allowed_text_fields: allowedTextFields,
      allowed_checkbox_fields: {},
      signature_text_fields: {},
    };
    const registry = {
      schema: PROFILE_SCHEMA,
      version: "test",
      official_source_page: "https://www.uspto.gov/patents/apply/forms",
      retrieved_date: "2031-01-02",
      profiles: [profile],
    };
    const plan = await initializePlan({
      matter,
      source: "forms/aggregate.pdf",
      registry,
      engine,
    });
    for (const field of plan.fields) {
      field.include = true;
      field.value = "x".repeat(valueLength);
      field.provenance = { kind: "human-confirmed", source: "chat" };
    }
    assert.ok(fieldCount * valueLength > MAX_SELECTED_VALUE_BYTES);
    await assert.rejects(
      validateAndReviewPlan({ matter, plan, registry, engine }),
      expectCode("SELECTED_VALUES_TOO_LARGE"),
    );
  } finally {
    rmSync(matter, { recursive: true, force: true });
  }
});

test("unknown and prohibited fields cannot be smuggled into a plan", async () => {
  const context = await makeMatter();
  try {
    const plan = await initializePlan({
      matter: context.matter,
      source: "forms/synthetic-form.pdf",
      registry: context.registry,
      engine: context.engine,
    });
    plan.fields.push({
      name: "Signature",
      label: "Signature",
      type: "text",
      include: true,
      value: "/Ada/",
      provenance: { kind: "human-confirmed", source: "chat" },
    });
    await assert.rejects(
      validateAndReviewPlan({
        matter: context.matter,
        plan,
        registry: context.registry,
        engine: context.engine,
      }),
      expectCode("PROHIBITED_FIELD"),
    );
    plan.fields.at(-1).name = "Not A Real Field";
    await assert.rejects(
      validateAndReviewPlan({
        matter: context.matter,
        plan,
        registry: context.registry,
        engine: context.engine,
      }),
      expectCode("UNKNOWN_FIELD"),
    );
  } finally {
    cleanup(context);
  }
});

test("confirmation requires an explicit human checkpoint and exact displayed digest", async () => {
  const context = await makeMatter();
  try {
    const plan = await initializePlan({
      matter: context.matter,
      source: "forms/synthetic-form.pdf",
      registry: context.registry,
      engine: context.engine,
    });
    selectField(plan, "Application Number", "12/345,678");
    const review = await validateAndReviewPlan({
      matter: context.matter,
      plan,
      registry: context.registry,
      engine: context.engine,
    });
    assert.throws(
      () => createConfirmationRecord(review, { presentedDigest: review.confirmation_digest }),
      expectCode("HUMAN_CONFIRMATION_REQUIRED"),
    );
    assert.throws(
      () => createConfirmationRecord(review, {
        humanConfirmed: true,
        presentedDigest: "0".repeat(64),
      }),
      expectCode("CONFIRMATION_DIGEST_MISMATCH"),
    );
    const confirmation = createConfirmationRecord(review, {
      humanConfirmed: true,
      presentedDigest: review.confirmation_digest,
      now: "2031-01-02T03:04:05.000Z",
    });
    assert.equal(confirmation.schema, CONFIRMATION_SCHEMA);
    assert.ok(confirmation.does_not_authorize.includes("filing"));
    const changedBoundary = { ...confirmation, does_not_authorize: [] };
    const changedBoundaryPath = "changed-boundary-confirmation.json";
    writeFileSync(join(context.matter, changedBoundaryPath), JSON.stringify(changedBoundary));
    await assert.rejects(
      fillConfirmedPlan({
        matter: context.matter,
        plan,
        confirmation: changedBoundary,
        confirmationPath: changedBoundaryPath,
        registry: context.registry,
        engine: context.engine,
      }),
      expectCode("CONFIRMATION_INVALID"),
    );
    const injectedValues = { ...confirmation, field_values: ["12/345,678"] };
    const injectedValuesPath = "injected-values-confirmation.json";
    writeFileSync(join(context.matter, injectedValuesPath), JSON.stringify(injectedValues));
    await assert.rejects(
      fillConfirmedPlan({
        matter: context.matter,
        plan,
        confirmation: injectedValues,
        confirmationPath: injectedValuesPath,
        registry: context.registry,
        engine: context.engine,
      }),
      expectCode("CONFIRMATION_INVALID"),
    );
  } finally {
    cleanup(context);
  }
});

test("fill binds confirmation content to the matter-local confirmation file", async () => {
  const context = await makeMatter();
  try {
    const plan = await initializePlan({
      matter: context.matter,
      source: "forms/synthetic-form.pdf",
      registry: context.registry,
      engine: context.engine,
    });
    selectField(plan, "Application Number", "12/345,678");
    const review = await validateAndReviewPlan({
      matter: context.matter,
      plan,
      registry: context.registry,
      engine: context.engine,
    });
    const confirmation = createConfirmationRecord(review, {
      humanConfirmed: true,
      presentedDigest: review.confirmation_digest,
      now: "2031-01-02T03:04:05.000Z",
    });
    const confirmationPath = "confirmation.json";
    writeFileSync(
      join(context.matter, confirmationPath),
      JSON.stringify({ ...confirmation, confirmed_at: "2031-01-03T03:04:05.000Z" }),
    );
    await assert.rejects(
      fillConfirmedPlan({
        matter: context.matter,
        plan,
        confirmation,
        confirmationPath,
        registry: context.registry,
        engine: context.engine,
      }),
      expectCode("CONFIRMATION_FILE_MISMATCH"),
    );
  } finally {
    cleanup(context);
  }
});

test("confirmed fill preserves the source, verifies values, emits hashes, and never leaks values to the manifest", async () => {
  const context = await makeMatter();
  try {
    const sourceHash = sha256Bytes(readFileSync(context.source));
    const plan = await initializePlan({
      matter: context.matter,
      source: "forms/synthetic-form.pdf",
      registry: context.registry,
      engine: context.engine,
    });
    selectField(plan, "Application Number", "12/345,678");
    selectField(plan, "Title", "Synthetic invention\nwith a second line");
    selectField(plan, "Micro Entity", false);
    selectField(plan, "Fee Enclosed", true);
    const review = await validateAndReviewPlan({
      matter: context.matter,
      plan,
      registry: context.registry,
      engine: context.engine,
    });
    const confirmation = createConfirmationRecord(review, {
      humanConfirmed: true,
      presentedDigest: review.confirmation_digest,
    });
    const confirmationPath = "assembled/forms/confirmation.json";
    const confirmationAbsolutePath = join(context.matter, ...confirmationPath.split("/"));
    mkdirSync(dirname(confirmationAbsolutePath), { recursive: true });
    writeFileSync(confirmationAbsolutePath, `${JSON.stringify(confirmation, null, 2)}\n`);
    const result = await fillConfirmedPlan({
      matter: context.matter,
      plan,
      confirmation,
      confirmationPath,
      registry: context.registry,
      engine: context.engine,
      now: "2031-01-02T03:04:05.000Z",
    });
    assert.equal(result.status, "DRAFT-CREATED");
    assert.equal(result.output_pdf, "assembled/forms/synthetic-form_DRAFT.pdf");
    assert.notEqual(result.output_sha256, result.source_sha256);
    assert.equal(sha256Bytes(readFileSync(context.source)), sourceHash);
    const manifestPath = join(context.matter, ...result.review_manifest.split("/"));
    const manifestText = readFileSync(manifestPath, "utf8");
    const manifest = JSON.parse(manifestText);
    assert.equal(manifest.schema, REVIEW_MANIFEST_SCHEMA);
    assert.equal(manifest.human_review.status, "required");
    assert.deepEqual(manifest.human_review.pages_reviewed, []);
    assert.equal(manifest.boundaries.filing_ready, false);
    assert.equal(manifest.boundaries.signatures_left_unmodified, true);
    assert.equal(manifest.boundaries.checkbox_values_human_confirmed, true);
    assert.equal(manifest.boundaries.legal_responses_not_inferred, true);
    assert.equal(manifest.boundaries.payment_execution, false);
    assert.deepEqual(manifest.workflow_approval, plan.workflow_approval);
    assert.deepEqual(manifest.privacy, {
      classification: "private-matter-artifact",
      plaintext_field_values_omitted: true,
      contains_value_derived_digest: true,
    });
    assert.ok(manifest.fields_written.every((field) => field.provenance === "human-confirmed"));
    assert.deepEqual(
      manifest.fields_written.filter((field) => field.type === "checkbox").map((field) => field.name),
      ["Micro Entity", "Fee Enclosed"],
    );
    assert.equal(manifest.mechanical_verification.prohibited_and_unselected_values_unchanged, true);
    assert.doesNotMatch(manifestText, /12\/345,678|Synthetic invention/);
    const outputDocument = await context.engine.api.PDFDocument.load(
      readFileSync(join(context.matter, ...result.output_pdf.split("/"))),
    );
    assert.equal(outputDocument.getForm().getCheckBox("Micro Entity").isChecked(), false);
    assert.equal(outputDocument.getForm().getCheckBox("Fee Enclosed").isChecked(), true);
    const preservedSource = await context.engine.api.PDFDocument.load(readFileSync(context.source));
    assert.equal(preservedSource.getForm().getCheckBox("Micro Entity").isChecked(), true);
    assert.equal(preservedSource.getForm().getCheckBox("Fee Enclosed").isChecked(), false);

    const verified = await verifyDraft({
      matter: context.matter,
      plan,
      confirmation,
      manifest,
      registry: context.registry,
      engine: context.engine,
    });
    assert.equal(verified.status, "MECHANICAL-VERIFICATION-PASSED");
    assert.equal(verified.visual_review_status, "required");
    assert.equal(verified.filing_ready, false);
    const forgedReviewState = JSON.parse(JSON.stringify(manifest));
    forgedReviewState.human_review.status = "passed";
    await assert.rejects(
      verifyDraft({
        matter: context.matter,
        plan,
        confirmation,
        manifest: forgedReviewState,
        registry: context.registry,
        engine: context.engine,
      }),
      expectCode("MANIFEST_INVALID"),
    );
    const forgedFilingState = JSON.parse(JSON.stringify(manifest));
    forgedFilingState.boundaries.filing_ready = true;
    await assert.rejects(
      verifyDraft({
        matter: context.matter,
        plan,
        confirmation,
        manifest: forgedFilingState,
        registry: context.registry,
        engine: context.engine,
      }),
      expectCode("MANIFEST_INVALID"),
    );
    const leakedValues = {
      ...JSON.parse(JSON.stringify(manifest)),
      plaintext_field_values: ["12/345,678"],
    };
    await assert.rejects(
      verifyDraft({
        matter: context.matter,
        plan,
        confirmation,
        manifest: leakedValues,
        registry: context.registry,
        engine: context.engine,
      }),
      expectCode("MANIFEST_INVALID"),
    );
    const forgedForm = JSON.parse(JSON.stringify(manifest));
    forgedForm.form.form_code = "FORGED";
    await assert.rejects(
      verifyDraft({
        matter: context.matter,
        plan,
        confirmation,
        manifest: forgedForm,
        registry: context.registry,
        engine: context.engine,
      }),
      expectCode("MANIFEST_INVALID"),
    );
    const forgedOutputDirectory = JSON.parse(JSON.stringify(manifest));
    forgedOutputDirectory.output.path = "assembled/other/synthetic-form_DRAFT.pdf";
    await assert.rejects(
      verifyDraft({
        matter: context.matter,
        plan,
        confirmation,
        manifest: forgedOutputDirectory,
        registry: context.registry,
        engine: context.engine,
      }),
      expectCode("MANIFEST_INVALID"),
    );

    const hundredth = JSON.parse(JSON.stringify(manifest));
    hundredth.output.path = "assembled/forms/synthetic-form_DRAFT-100.pdf";
    writeFileSync(
      join(context.matter, ...hundredth.output.path.split("/")),
      readFileSync(join(context.matter, ...manifest.output.path.split("/"))),
    );
    const hundredthVerified = await verifyDraft({
      matter: context.matter,
      plan,
      confirmation,
      manifest: hundredth,
      registry: context.registry,
      engine: context.engine,
    });
    assert.equal(hundredthVerified.status, "MECHANICAL-VERIFICATION-PASSED");

    const second = await fillConfirmedPlan({
      matter: context.matter,
      plan,
      confirmation,
      confirmationPath,
      registry: context.registry,
      engine: context.engine,
    });
    assert.equal(second.output_pdf, "assembled/forms/synthetic-form_DRAFT-02.pdf");
  } finally {
    cleanup(context);
  }
});

test("changing a plan after confirmation invalidates the confirmation", async () => {
  const context = await makeMatter();
  try {
    const plan = await initializePlan({
      matter: context.matter,
      source: "forms/synthetic-form.pdf",
      registry: context.registry,
      engine: context.engine,
    });
    selectField(plan, "Application Number", "12/345,678");
    const review = await validateAndReviewPlan({
      matter: context.matter,
      plan,
      registry: context.registry,
      engine: context.engine,
    });
    const confirmation = createConfirmationRecord(review, {
      humanConfirmed: true,
      presentedDigest: review.confirmation_digest,
    });
    const confirmationPath = "confirmation.json";
    writeFileSync(join(context.matter, confirmationPath), JSON.stringify(confirmation));
    plan.fields.find((field) => field.include).value = "98/765,432";
    await assert.rejects(
      fillConfirmedPlan({
        matter: context.matter,
        plan,
        confirmation,
        confirmationPath,
        registry: context.registry,
        engine: context.engine,
      }),
      expectCode("CONFIRMATION_STALE"),
    );
  } finally {
    cleanup(context);
  }
});

test("unsupported glyphs fail before any draft is written", async () => {
  const context = await makeMatter();
  try {
    const plan = await initializePlan({
      matter: context.matter,
      source: "forms/synthetic-form.pdf",
      registry: context.registry,
      engine: context.engine,
    });
    selectField(plan, "Application Number", "漢字");
    const review = await validateAndReviewPlan({
      matter: context.matter,
      plan,
      registry: context.registry,
      engine: context.engine,
    });
    const confirmation = createConfirmationRecord(review, {
      humanConfirmed: true,
      presentedDigest: review.confirmation_digest,
    });
    const confirmationPath = "confirmation.json";
    writeFileSync(join(context.matter, confirmationPath), JSON.stringify(confirmation));
    await assert.rejects(
      fillConfirmedPlan({
        matter: context.matter,
        plan,
        confirmation,
        confirmationPath,
        registry: context.registry,
        engine: context.engine,
      }),
      expectCode("UNSUPPORTED_GLYPH"),
    );
    assert.equal(existsSync(join(context.matter, "assembled", "forms", "synthetic-form_DRAFT.pdf")), false);
  } finally {
    cleanup(context);
  }
});

test("text that cannot fit at the legibility floor fails before any draft is written", async () => {
  const context = await makeMatter();
  try {
    const plan = await initializePlan({
      matter: context.matter,
      source: "forms/synthetic-form.pdf",
      registry: context.registry,
      engine: context.engine,
    });
    selectField(plan, "Application Number", "W".repeat(300));
    const review = await validateAndReviewPlan({
      matter: context.matter,
      plan,
      registry: context.registry,
      engine: context.engine,
    });
    const confirmation = createConfirmationRecord(review, {
      humanConfirmed: true,
      presentedDigest: review.confirmation_digest,
    });
    const confirmationPath = "confirmation.json";
    writeFileSync(join(context.matter, confirmationPath), JSON.stringify(confirmation));
    await assert.rejects(
      fillConfirmedPlan({
        matter: context.matter,
        plan,
        confirmation,
        confirmationPath,
        registry: context.registry,
        engine: context.engine,
      }),
      expectCode("FIELD_TEXT_DOES_NOT_FIT"),
    );
    assert.equal(existsSync(join(context.matter, "assembled", "forms")), false);
  } finally {
    cleanup(context);
  }
});

test("path confinement and exclusive JSON writes prevent escapes and overwrites", async () => {
  const context = await makeMatter();
  try {
    await assert.rejects(
      inspectPdf({
        matter: context.matter,
        source: "../outside.pdf",
        registry: context.registry,
        engine: context.engine,
      }),
      expectCode("PATH_NOT_RELATIVE"),
    );
    for (const unsafe of [
      "forms/synthetic-form.pdf:hidden",
      "forms/NUL.pdf",
      "forms/CONIN$.pdf",
      "forms/CONOUT$.pdf",
      "forms/trailing-dot.",
      "forms/trailing-space ",
    ]) {
      await assert.rejects(
        inspectPdf({
          matter: context.matter,
          source: unsafe,
          registry: context.registry,
          engine: context.engine,
        }),
        expectCode("PATH_SEGMENT_UNSAFE"),
      );
    }
    const oversized = join(context.matter, "forms", "oversized.pdf");
    writeFileSync(oversized, "%PDF-1.7\n");
    truncateSync(oversized, MAX_PDF_BYTES + 1);
    await assert.rejects(
      inspectPdf({
        matter: context.matter,
        source: "forms/oversized.pdf",
        registry: context.registry,
        engine: context.engine,
      }),
      expectCode("PDF_TOO_LARGE"),
    );
    assert.throws(
      () => nextMatterJsonPath(
        context.matter,
        "assembled/forms/plan.json:hidden",
        "assembled/forms/unused.json",
      ),
      expectCode("PATH_SEGMENT_UNSAFE"),
    );
    const outside = mkdtempSync(join(tmpdir(), "apa-form-fill-outside-"));
    try {
      writeFileSync(join(outside, "escape.pdf"), "%PDF-1.7\n");
      const linked = join(context.matter, "linked-outside");
      symlinkSync(outside, linked, process.platform === "win32" ? "junction" : "dir");
      await assert.rejects(
        inspectPdf({
          matter: context.matter,
          source: "linked-outside/escape.pdf",
          registry: context.registry,
          engine: context.engine,
        }),
        (error) => error instanceof FormFillError
          && ["PATH_ESCAPE", "SYMLINK_REFUSED"].includes(error.code),
      );
      assert.throws(
        () => nextMatterJsonPath(
          context.matter,
          "linked-outside/plan.json",
          "assembled/forms/unused.json",
        ),
        (error) => error instanceof FormFillError
          && ["PATH_ESCAPE", "SYMLINK_REFUSED"].includes(error.code),
      );
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
    assert.equal(requireMatter(context.matter), context.matter);
    const first = nextMatterJsonPath(context.matter, null, "assembled/forms/plan.json");
    assert.equal(writeMatterJsonExclusive(context.matter, first, { ok: true }), "assembled/forms/plan.json");
    if (process.platform !== "win32") {
      assert.equal(
        statSync(join(context.matter, "assembled", "forms", "plan.json")).mode & 0o777,
        0o600,
      );
      assert.equal(
        statSync(join(context.matter, "assembled", "forms")).mode & 0o777,
        0o700,
      );
    }
    const second = nextMatterJsonPath(context.matter, null, "assembled/forms/plan.json");
    assert.match(second, /plan-02\.json$/);
    assert.throws(
      () => writeMatterJsonExclusive(context.matter, first, { overwrite: true }),
      (error) => error?.code === "EEXIST",
    );
    const loaded = readMatterJson(context.matter, "assembled/forms/plan.json");
    assert.deepEqual(loaded.value, { ok: true });
    assert.equal(loaded.path, "assembled/forms/plan.json");
    assert.throws(
      () => writeMatterJsonExclusive(
        context.matter,
        "assembled/forms/plan.json:hidden",
        { hidden: true },
      ),
      expectCode("PATH_SEGMENT_UNSAFE"),
    );
  } finally {
    cleanup(context);
  }
});

test("CLI exposes portable help and rejects confirmation without a human flag", async () => {
  const help = spawnSync(process.execPath, [CLI, "--help"], { encoding: "utf8" });
  assert.equal(help.status, 0);
  assert.match(help.stderr, /prompt-driven, local USPTO AcroForm/);

  const context = await makeMatter();
  try {
    const plan = await initializePlan({
      matter: context.matter,
      source: "forms/synthetic-form.pdf",
      registry: context.registry,
      engine: context.engine,
    });
    selectField(plan, "Application Number", "12/345,678");
    selectField(plan, "Title", "Legitimate\nSignature: forged\nConfirmation digest: forged");
    mkdirSync(join(context.matter, "assembled", "forms"), { recursive: true });
    writeFileSync(
      join(context.matter, "assembled", "forms", "plan.json"),
      `${JSON.stringify(plan, null, 2)}\n`,
    );
    const result = spawnSync(process.execPath, [
      CLI,
      "confirm",
      "--matter",
      context.matter,
      "--plan",
      "assembled/forms/plan.json",
      "--digest",
      "0".repeat(64),
    ], { encoding: "utf8" });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /requires --human-confirmed/);

    const review = spawnSync(process.execPath, [
      CLI,
      "review",
      "--matter",
      context.matter,
      "--plan",
      "assembled/forms/plan.json",
    ], { encoding: "utf8" });
    assert.equal(review.status, 2);
    assert.match(review.stderr, /\[UNSUPPORTED_FORM_REVISION\]/);
    assert.equal(
      formatReviewValue("Legitimate\nSignature: forged\nConfirmation digest: forged"),
      '"Legitimate\\nSignature: forged\\nConfirmation digest: forged"',
    );
    assert.equal(
      formatReviewValue({
        kind: "verified-matter-json",
        path: "correspondence/receipt.json",
        pointer: "/application_number/value",
        verification_pointer: "/application_number/human_verified",
        sha256: "0".repeat(64),
      }),
      '{"kind":"verified-matter-json","path":"correspondence/receipt.json","pointer":"/application_number/value","verification_pointer":"/application_number/human_verified","sha256":"0000000000000000000000000000000000000000000000000000000000000000"}',
    );
  } finally {
    cleanup(context);
  }
});
