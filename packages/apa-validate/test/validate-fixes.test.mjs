import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateMatter } from "../validate.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const EXAMPLE = join(HERE, "..", "..", "..", "examples", "minimal-patent-artifact");
function clone() { const d = mkdtempSync(join(tmpdir(), "vfix-")); cpSync(EXAMPLE, d, { recursive: true }); return d; }
function editP(d, fn) { const p = join(d, "PATENT.md"); writeFileSync(p, fn(readFileSync(p, "utf8"))); }
function editC(d, fn) { const p = join(d, "logic", "claims.md"); writeFileSync(p, fn(readFileSync(p, "utf8"))); }
function editPros(d, fn) { const p = join(d, "trace", "prosecution.yaml"); writeFileSync(p, fn(readFileSync(p, "utf8"))); }
const codes = (r) => r.errors.map((e) => e.code);
const wcodes = (r) => r.warnings.map((w) => w.code);

test("#6 inventors as a scalar string -> INVENTORS_MALFORMED, not a crash", () => {
  const d = clone();
  try {
    editP(d, (t) => t.replace(/inventors:\n  - id: "AINVENTOR"\n    name: "Alex Example"/, 'inventors: "Alex Example"'));
    let r; assert.doesNotThrow(() => { r = validateMatter(d); });
    assert.ok(codes(r).includes("INVENTORS_MALFORMED"), JSON.stringify(codes(r)));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("#7 a null limitation entry (a stray '-') does not crash the validator", () => {
  const d = clone();
  try {
    editC(d, (t) => t.replace("limitations:\n  - id: LIM01", "limitations:\n  -\n  - id: LIM01"));
    let r; assert.doesNotThrow(() => { r = validateMatter(d); });
    assert.ok(r && Array.isArray(r.errors));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("#5 a sequence recited in claims.md trips the ST.26 gate (was only scanning problem/embodiments)", () => {
  const d = clone();
  try {
    editC(d, (t) => t + "\nSEQ ID NO: 1 ACGTACGTACGTACGTACGTACGTACGTACGT\n");
    assert.ok(codes(validateMatter(d)).includes("SEQ_LISTING"));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("#17 human inventor names are NOT AI-blocked; an AI marker is", () => {
  for (const name of ["Claude Monet", "Ai Tanaka", "Neural Wang"]) {
    const d = clone();
    try {
      editP(d, (t) => t.replace("Alex Example", name));
      assert.ok(!codes(validateMatter(d)).includes("AI_INVENTOR"), `${name} should clear`);
    } finally { rmSync(d, { recursive: true, force: true }); }
  }
  for (const name of ["DABUS", "GPT-4", "an artificial intelligence"]) {
    const d = clone();
    try {
      editP(d, (t) => t.replace("Alex Example", name));
      assert.ok(codes(validateMatter(d)).includes("AI_INVENTOR"), `${name} should block`);
    } finally { rmSync(d, { recursive: true, force: true }); }
  }
});

test("#26 a duplicate entity id -> DUPLICATE_ID error", () => {
  const d = clone();
  try {
    editC(d, (t) => t.replace("### CLM02 ", "### CLM01 "));
    assert.ok(codes(validateMatter(d)).includes("DUPLICATE_ID"));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("#8 a claim limitation with NO provenance is the protocol default ai-suggested (assembly blocker warning)", () => {
  const d = clone();
  try {
    editC(d, (t) => t.replace(
      "introduces: \"reservoir\"\n    supported_by: [SPEC0002]\n    illustrated_by: [FIG01#10]\n    provenance: inventor:AINVENTOR",
      "introduces: \"reservoir\"\n    supported_by: [SPEC0002]\n    illustrated_by: [FIG01#10]"));
    assert.ok(wcodes(validateMatter(d)).includes("AI_SUGGESTED_LIMITATION"));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("#F1 a malformed inventorship_matrix value (scalar) -> MATRIX_MALFORMED, not a crash", () => {
  const d = clone();
  try {
    editP(d, (t) => t.replace('CLM01: ["AINVENTOR"]', "CLM01: 5"));
    let r; assert.doesNotThrow(() => { r = validateMatter(d); });
    assert.ok(codes(r).includes("MATRIX_MALFORMED"), JSON.stringify(codes(r)));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("#F2 a stray null prosecution node does not crash validateMatter", () => {
  const d = clone();
  try {
    editPros(d, (t) => t.replace("nodes:\n  - id: PH01", "nodes:\n  -\n  - id: PH01"));
    let r; assert.doesNotThrow(() => { r = validateMatter(d); });
    assert.ok(r && Array.isArray(r.errors));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("#F3 a dotted A.I. inventor name is AI-blocked (the dead A.I. alternative is fixed)", () => {
  const d = clone();
  try {
    editP(d, (t) => t.replace("Alex Example", "A.I."));
    assert.ok(codes(validateMatter(d)).includes("AI_INVENTOR"));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("#R2-2 a non-array binding list field (supported_by: 5) -> BINDING_FIELD_MALFORMED, not a crash", () => {
  const d = clone();
  try {
    editC(d, (t) => t.replace("supported_by: [SPEC0002]", "supported_by: 5"));
    let r; assert.doesNotThrow(() => { r = validateMatter(d); });
    assert.ok(codes(r).includes("BINDING_FIELD_MALFORMED"), JSON.stringify(codes(r)));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("#R3 a parser-level malformation (tab indentation) -> PARSE_ERROR, not an uncaught throw", () => {
  const d = clone();
  try {
    editC(d, (t) => t.replace("supported_by: [SPEC0002]", "\tsupported_by: [SPEC0002]"));
    let r; assert.doesNotThrow(() => { r = validateMatter(d); });
    assert.ok(codes(r).includes("PARSE_ERROR"), JSON.stringify(codes(r)));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("#R4 a prototype-chain depends_on key (toString) does not crash and fires DEP_UNRESOLVED", () => {
  for (const key of ["toString", "constructor", "__proto__", "hasOwnProperty"]) {
    const d = clone();
    try {
      editC(d, (t) => t.replace("depends_on: CLM01", `depends_on: ${key}`));
      let r; assert.doesNotThrow(() => { r = validateMatter(d); }, `key ${key} must not crash`);
      assert.ok(codes(r).includes("DEP_UNRESOLVED"), `${key}: ${JSON.stringify(codes(r))}`);
    } finally { rmSync(d, { recursive: true, force: true }); }
  }
});

test("#R4 an inventorship_matrix keyed on a prototype-chain claim name fires MATRIX_BAD_CLAIM", () => {
  const d = clone();
  try {
    editP(d, (t) => t.replace('CLM02: ["AINVENTOR"]', 'toString: ["AINVENTOR"]'));
    let r; assert.doesNotThrow(() => { r = validateMatter(d); });
    assert.ok(codes(r).includes("MATRIX_BAD_CLAIM"), JSON.stringify(codes(r)));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("#R5 a prototype-name provenance keeps the PROVENANCE_LIMITATIONS count an integer (no proto pollution)", () => {
  const d = clone();
  try {
    editC(d, (t) => t.split("provenance: inventor:AINVENTOR").join("provenance: constructor"));
    let r; assert.doesNotThrow(() => { r = validateMatter(d); });
    const inf = r.info.find((i) => i.code === "PROVENANCE_LIMITATIONS");
    const obj = JSON.parse(inf.msg.replace("claim-limitation provenance counts: ", ""));
    assert.ok(Object.values(obj).every((v) => Number.isInteger(v)), inf.msg);
  } finally { rmSync(d, { recursive: true, force: true }); }
});
