import { test } from "node:test";
import assert from "node:assert/strict";
import { loadYaml, extractBindingBlocks, iterEntitySections } from "./apa-parse.mjs";

// F6: a `__proto__` map key must NOT pollute the prototype or turn its sub-tree into an invisible
// inherited ghost (which would silently drop a supported_by edge / consent flag - a safety hole).
test("F6 __proto__ block-map key is a normal own property, not prototype pollution", () => {
  const r = loadYaml("__proto__:\n  supported_by: [SPEC0002]\ntype: claim");
  assert.equal(Object.getPrototypeOf(r), Object.prototype, "prototype must be unchanged");
  assert.deepEqual(Object.keys(r).sort(), ["__proto__", "type"], "__proto__ must be an OWN enumerable key");
  const desc = Object.getOwnPropertyDescriptor(r, "__proto__");
  assert.ok(desc && desc.enumerable && desc.writable, "own data property");
  assert.deepEqual(desc.value, { supported_by: ["SPEC0002"] }, "sub-tree retained, not dropped");
  assert.equal(r.supported_by, undefined, "no inherited ghost on the parent");
});

test("F6 __proto__ inline flow-map key is also safe", () => {
  const r = loadYaml("x: { __proto__: 1, a: 2 }");
  assert.equal(Object.getPrototypeOf(r.x), Object.prototype);
  assert.deepEqual(Object.keys(r.x).sort(), ["__proto__", "a"]);
});

// F7: adversarial deep nesting must fail LOUD with a descriptive error, not a bare stack-overflow.
test("F7 deeply nested input throws a descriptive 'nesting too deep' error, not RangeError", () => {
  let deep = "";
  for (let i = 0; i < 250; i++) deep += "  ".repeat(i) + "a:\n";
  deep += "  ".repeat(250) + "x: 1\n";
  assert.throws(() => loadYaml(deep), /nesting too deep/);
});

test("F7 ordinary (shallow) nesting still parses fine", () => {
  const r = loadYaml("a:\n  b:\n    c: 1");
  assert.equal(r.a.b.c, 1);
});

// F8: a quoted map key containing a colon must not be split at the in-key colon.
test("F8 quoted key with an embedded colon is parsed whole", () => {
  assert.deepEqual(loadYaml('"a:b": 1'), { "a:b": 1 });
});

test("F8 a normal colon-bearing value is unaffected (no regression)", () => {
  assert.deepEqual(loadYaml("url: http://example.com"), { url: "http://example.com" });
});

// F5: extractBindingBlocks only honors a binding fence at COLUMN 0, so untrusted embedded text cannot
// smuggle a fake (space-prefixed or mid-line) binding block.
test("F5 only a column-0 ```binding fence is extracted", () => {
  assert.equal(extractBindingBlocks("```binding\nrole: x\n```\n").length, 1, "legit col-0 block");
  assert.equal(extractBindingBlocks(" ```binding\nrole: injected\n```\n").length, 0, "space-prefixed is ignored");
  assert.equal(extractBindingBlocks("text ```binding\nrole: injected\n```\n").length, 0, "mid-line is ignored");
});

// R2-1: an UNBALANCED quote (a stray apostrophe) before the key colon must not make findKeyColon return
// -1 and silently drop the line AND the rest of the block map.
test("R2-1 a stray apostrophe does not silently drop a map line (F8 regression)", () => {
  const r = loadYaml("a: 1\nThe inventor's note: see below\nb: 2");
  assert.equal(r.a, 1);
  assert.equal(r.b, 2, "the line after an apostrophe-bearing line must still parse");
  assert.ok("The inventor's note" in r, "the apostrophe-bearing key is retained");
});

// R2-6: a fence/heading after a bare CR / U+2028 / U+2029 is still seen as a line boundary (JS `^...gm`
// treats all four as boundaries) - the basis for the apa-search sanitizer to neutralize untrusted content
// (see search-fixes for the end-to-end injection test).
test("R2-6 bare CR / U+2028 / U+2029 act as line boundaries for the fence/heading scan", () => {
  for (const t of ["\r", "\u2028", "\u2029"]) {
    assert.equal(extractBindingBlocks("intro" + t + "```binding\nrole: x\n```\n").length, 1, "fence after " + JSON.stringify(t));
    assert.equal(iterEntitySections("intro" + t + "### PA01 hi").map((s) => s.id).join(), "PA01", "heading after " + JSON.stringify(t));
  }
});

// R3 regression: a bare CR / U+2028 / U+2029 INSIDE a scalar value must NOT truncate the value or make
// parseMap silently drop the following keys (a supported_by / provenance / consent field). The parser
// does not mutate value bytes; line boundaries are LF (or CRLF). Confidentiality of UNTRUSTED embedded
// content is enforced at the sink in apa-search/lib/refs.mjs, not by the value-parser.
test("R3 in-value CR / U+2028 / U+2029 does not truncate a block scalar or drop sibling keys", () => {
  for (const t of ["\r", "\u2028", "\u2029"]) {
    const r = loadYaml("abstract: >\n  A device that does" + t + "things\n  across domains.\nentity_status: micro\ninventors:\n  - id: A");
    assert.equal(r.entity_status, "micro", "sibling key survives in-value " + JSON.stringify(t));
    assert.ok(Array.isArray(r.inventors) && r.inventors.length === 1, "inventors survive for " + JSON.stringify(t));
  }
});

test("R3 a bare CR inside a quoted binding value does not drop supported_by / provenance", () => {
  const b = extractBindingBlocks('```binding\ntype: x\nnote: "see para\rtwo"\nsupported_by: [SPEC0002]\nprovenance: human\n```\n')[0];
  assert.deepEqual(Object.keys(b).sort(), ["note", "provenance", "supported_by", "type"]);
});

// R6: a block list written at the SAME indent as its key is the key's value (the idiomatic YAML style),
// NOT null. The old parser silently dropped it -> limitations vanished and the ai-suggested / supported_by
// guards (and the preflight inventorship gate) were defeated.
test("R6 a same-indent block list under a key is the value, not null", () => {
  assert.deepEqual(loadYaml("a:\n- 1\n- 2"), { a: [1, 2] });
  assert.deepEqual(loadYaml("limitations:\n- id: LIM01\n  introduces: w\nprovenance: x"),
    { limitations: [{ id: "LIM01", introduces: "w" }], provenance: "x" });
  // indented style is unchanged; an explicit empty value (no list follows) is still null
  assert.deepEqual(loadYaml("a:\n  - 1\n  - 2"), { a: [1, 2] });
  assert.deepEqual(loadYaml("a:\nb: 2"), { a: null, b: 2 });
});

// R7: the same-indent list branch must NOT bypass the MAX_NESTING_DEPTH guard. The guard now lives at the
// top of parseBlock/parseMap/parseList, so a deep same-indent list chain fails LOUD with the descriptive
// error, never a raw stack-overflow RangeError. (The F7 test above only exercises pure map nesting.)
test("R7 a deep same-indent LIST chain fails loud with 'nesting too deep', not a raw RangeError", () => {
  let s = "", ind = 0;
  for (let i = 0; i < 400; i++) { s += " ".repeat(ind) + "k:\n" + " ".repeat(ind) + "- a:\n"; ind += 2; }
  s += " ".repeat(ind) + "leaf: 1\n";
  assert.throws(() => loadYaml(s), /nesting too deep/);
});

// R8: parseScalar (nested inline flow [..]/{..}) is the 4th recursive path and must ALSO be depth-guarded -
// else a value like `[[[[...]]]]` overflows the stack with a raw RangeError instead of failing loud.
test("R8 a deeply nested inline FLOW value fails loud (parseScalar is depth-guarded too)", () => {
  const n = 8000;
  assert.throws(() => loadYaml("k: " + "[".repeat(n) + "1" + "]".repeat(n)), /nesting too deep/);
  let mp = "x"; for (let i = 0; i < n; i++) mp = "{a: " + mp + "}";
  assert.throws(() => loadYaml("k: " + mp), /nesting too deep/);
  // normal nested flow values are unaffected (the .map index is NOT passed as depth)
  assert.deepEqual(loadYaml("a: [[1, 2], [3, 4]]"), { a: [[1, 2], [3, 4]] });
});
