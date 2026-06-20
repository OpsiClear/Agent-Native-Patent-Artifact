import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { validateMatter } from "../validate.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const EXAMPLE = join(HERE, "..", "..", "..", "examples", "minimal-patent-artifact");

function clone() {
  const dir = mkdtempSync(join(tmpdir(), "apa-fixture-"));
  cpSync(EXAMPLE, dir, { recursive: true });
  return dir;
}
function edit(dir, rel, fn) {
  const p = join(dir, rel);
  writeFileSync(p, fn(readFileSync(p, "utf8")));
}
const codes = (list) => list.map((x) => x.code);

test("clean example: no errors, no warnings", () => {
  const r = validateMatter(EXAMPLE);
  assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
  assert.equal(r.warnings.length, 0, JSON.stringify(r.warnings));
  assert.equal(r.meta.jurisdiction, "USPTO");
  assert.equal(r.meta.rule_pack.id, "uspto-v1");
  assert.equal(r.meta.rule_pack.effective_date, "2026-06-15");
});

test("dangling supported_by -> UNSUPPORTED_EDGE warning, not an error", () => {
  const d = clone();
  try {
    edit(d, "logic/claims.md", (t) => t.replace("supported_by: [SPEC0004]", "supported_by: [SPEC9999]"));
    const r = validateMatter(d);
    assert.ok(codes(r.warnings).includes("UNSUPPORTED_EDGE"), JSON.stringify(r.warnings));
    assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("missing depends_on target -> DEP_UNRESOLVED error", () => {
  const d = clone();
  try {
    edit(d, "logic/claims.md", (t) => t.replace("depends_on: CLM01", "depends_on: CLM99"));
    const r = validateMatter(d);
    assert.ok(codes(r.errors).includes("DEP_UNRESOLVED"), JSON.stringify(r.errors));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("unintroduced reference phrase -> ANTECEDENT_BROKEN error", () => {
  const d = clone();
  try {
    edit(d, "logic/claims.md", (t) => t.replaceAll('references: ["reservoir"]', 'references: ["gizmo"]'));
    const r = validateMatter(d);
    assert.ok(codes(r.errors).includes("ANTECEDENT_BROKEN"), JSON.stringify(r.errors));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("AI-named inventor -> AI_INVENTOR error", () => {
  const d = clone();
  try {
    edit(d, "PATENT.md", (t) => t.replace("Alex Example", "GPT-4 Model"));
    const r = validateMatter(d);
    assert.ok(codes(r.errors).includes("AI_INVENTOR"), JSON.stringify(r.errors));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("provisional does NOT require claims.md (type-aware core)", () => {
  const d = clone();
  try {
    edit(d, "PATENT.md", (t) => t.replace("application_type: \"utility\"", "application_type: \"provisional\""));
    rmSync(join(d, "logic", "claims.md"), { force: true });
    edit(d, "PATENT.md", (t) => t.replace(/inventorship_matrix:[\s\S]*?(?=\nclaims_summary:)/, "inventorship_matrix: {}\n"));
    const r = validateMatter(d);
    const coreMissingClaims = r.errors.filter((e) => e.code === "CORE_MISSING" && /claims\.md/.test(e.msg));
    assert.equal(coreMissingClaims.length, 0, "provisional should not flag missing claims.md: " + JSON.stringify(r.errors));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("design application with >1 claim -> DESIGN_CLAIMS error", () => {
  const d = clone();
  try {
    edit(d, "PATENT.md", (t) => t.replace("application_type: \"utility\"", "application_type: \"design\""));
    const r = validateMatter(d);
    assert.ok(codes(r.errors).includes("DESIGN_CLAIMS"), JSON.stringify(r.errors));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("figure numeral pointing at a missing SPEC -> NUMERAL_NO_SPEC error", () => {
  const d = clone();
  try {
    edit(d, "evidence/drawings/fig01.md", (t) => t.replace("defined_in: SPEC0004", "defined_in: SPEC9999"));
    const r = validateMatter(d);
    assert.ok(codes(r.errors).includes("NUMERAL_NO_SPEC"), JSON.stringify(r.errors));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("unsupported application_type fails loud", () => {
  const d = clone();
  try {
    edit(d, "PATENT.md", (t) => t.replace("application_type: \"utility\"", "application_type: \"pct\""));
    const r = validateMatter(d);
    assert.ok(codes(r.errors).includes("TYPE_UNSUPPORTED"), JSON.stringify(r.errors));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("unknown user_role fails loud", () => {
  const d = clone();
  try {
    edit(d, "PATENT.md", (t) => t.replace("user_role: \"unknown\"", "user_role: \"robot_patent_agent\""));
    const r = validateMatter(d);
    assert.ok(codes(r.errors).includes("USER_ROLE_UNKNOWN"), JSON.stringify(r.errors));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("non-USPTO jurisdiction fails loud instead of validating under USPTO rules", () => {
  const d = clone();
  try {
    edit(d, "PATENT.md", (t) => t.replace('jurisdiction: "USPTO"', 'jurisdiction: "EPO"'));
    const r = validateMatter(d);
    assert.ok(codes(r.errors).includes("JURISDICTION_UNSUPPORTED"), JSON.stringify(r.errors));
    assert.equal(r.meta.rule_pack.id, "uspto-v1");
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("missing or stale rules_effective_date warns with active rule-pack metadata", () => {
  const d = clone();
  try {
    edit(d, "PATENT.md", (t) => t.replace('rules_effective_date: "2026-06-15"', 'rules_effective_date: "2025-01-01"'));
    let r = validateMatter(d);
    assert.ok(codes(r.warnings).includes("RULE_PACK_DATE_MISMATCH"), JSON.stringify(r.warnings));
    assert.equal(r.meta.rule_pack.effective_date, "2026-06-15");

    edit(d, "PATENT.md", (t) => t.replace('rules_effective_date: "2025-01-01"\n', ""));
    r = validateMatter(d);
    assert.ok(codes(r.warnings).includes("RULES_EFFECTIVE_DATE_MISSING"), JSON.stringify(r.warnings));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("ai-suggested claim limitation -> assembly-blocker warning", () => {
  const d = clone();
  try {
    edit(d, "logic/claims.md", (t) => t.replace("text: \"a reservoir configured to hold water\"\n    introduces: \"reservoir\"\n    supported_by: [SPEC0002]\n    illustrated_by: [FIG01#10]\n    provenance: inventor:AINVENTOR",
      "text: \"a reservoir configured to hold water\"\n    introduces: \"reservoir\"\n    supported_by: [SPEC0002]\n    illustrated_by: [FIG01#10]\n    provenance: ai-suggested"));
    const r = validateMatter(d);
    assert.ok(codes(r.warnings).includes("AI_SUGGESTED_LIMITATION"), JSON.stringify(r.warnings));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("adopted claim limitation missing source-span metadata -> warning", () => {
  const d = clone();
  try {
    edit(d, "logic/claims.md", (t) => t.replace('    source_span: "demo-minimal:claims:LIM01"\n', ""));
    const r = validateMatter(d);
    assert.ok(codes(r.warnings).includes("SOURCE_SPAN_MISSING"), JSON.stringify(r.warnings));
    assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("adopted spec paragraph missing source-span metadata -> warning", () => {
  const d = clone();
  try {
    edit(d, "src/embodiments.md", (t) => t.replace('source_span: "demo-minimal:spec:SPEC0002"\n', ""));
    const r = validateMatter(d);
    assert.ok(codes(r.warnings).includes("SOURCE_SPAN_MISSING"), JSON.stringify(r.warnings));
    assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("unknown source-span source -> warning", () => {
  const d = clone();
  try {
    edit(d, "logic/claims.md", (t) => t.replace("    source: inventor-confirmation", "    source: hearsay"));
    const r = validateMatter(d);
    assert.ok(codes(r.warnings).includes("SOURCE_SPAN_INVALID"), JSON.stringify(r.warnings));
    assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("source_span_policy relaxed suppresses missing source-span warnings but not invalid fields", () => {
  const d = clone();
  try {
    edit(d, "PATENT.md", (t) => t.replace('user_role: "unknown"', 'user_role: "unknown"\nsource_span_policy: "relaxed"'));
    edit(d, "logic/claims.md", (t) => t.replace('    source_span: "demo-minimal:claims:LIM01"\n', ""));
    let r = validateMatter(d);
    assert.ok(!codes(r.warnings).includes("SOURCE_SPAN_MISSING"), JSON.stringify(r.warnings));

    edit(d, "logic/claims.md", (t) => t.replace("    source: inventor-confirmation", "    source: hearsay"));
    r = validateMatter(d);
    assert.ok(codes(r.warnings).includes("SOURCE_SPAN_INVALID"), JSON.stringify(r.warnings));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("not-recoverable source is allowed without source span or hash", () => {
  const d = clone();
  try {
    edit(d, "logic/claims.md", (t) => t
      .replace("    source: inventor-confirmation\n    source_span: \"demo-minimal:claims:LIM01\"\n    source_sha256: \"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef\"", "    source: not-recoverable"));
    const r = validateMatter(d);
    assert.ok(!codes(r.warnings).includes("SOURCE_SPAN_MISSING"), JSON.stringify(r.warnings));
    assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("unknown source_span_policy fails loud", () => {
  const d = clone();
  try {
    edit(d, "PATENT.md", (t) => t.replace('user_role: "unknown"', 'user_role: "unknown"\nsource_span_policy: "strict"'));
    const r = validateMatter(d);
    assert.ok(codes(r.errors).includes("SOURCE_SPAN_POLICY_UNKNOWN"), JSON.stringify(r.errors));
  } finally { rmSync(d, { recursive: true, force: true }); }
});
