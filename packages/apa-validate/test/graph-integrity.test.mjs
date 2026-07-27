import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateMatter } from "../validate.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const EXAMPLE = join(HERE, "..", "..", "..", "examples", "minimal-patent-artifact");

function clone() {
  const dir = mkdtempSync(join(tmpdir(), "apa-graph-integrity-"));
  cpSync(EXAMPLE, dir, { recursive: true });
  return dir;
}

function edit(dir, rel, transform) {
  const path = join(dir, rel);
  writeFileSync(path, transform(readFileSync(path, "utf8")));
}

function errorCodes(report) {
  return report.errors.map((finding) => finding.code);
}

test("unknown provenance values fail loud instead of bypassing the ai-suggested gate", () => {
  const dir = clone();
  try {
    edit(dir, "logic/claims.md", (text) => text.replace(
      "    provenance: inventor:AINVENTOR\n    source: inventor-confirmation",
      "    provenance: ai-suggestedd\n    source: inventor-confirmation",
    ));
    const report = validateMatter(dir);
    assert.ok(errorCodes(report).includes("PROVENANCE_UNKNOWN"), JSON.stringify(report.errors));
    assert.match(
      report.errors.find((finding) => finding.code === "PROVENANCE_UNKNOWN").msg,
      /CLM01\.LIM01/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("inventor provenance must reference an inventor declared in PATENT.md", () => {
  const dir = clone();
  try {
    edit(dir, "logic/claims.md", (text) => text.replace(
      "    provenance: inventor:AINVENTOR\n    source: inventor-confirmation",
      "    provenance: inventor:NOT_DECLARED\n    source: inventor-confirmation",
    ));
    const report = validateMatter(dir);
    assert.ok(errorCodes(report).includes("PROVENANCE_BAD_INVENTOR"), JSON.stringify(report.errors));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("inventor ids participate in global duplicate-id detection", () => {
  const dir = clone();
  try {
    edit(dir, "PATENT.md", (text) => text.replaceAll("AINVENTOR", "CLM01"));
    edit(dir, "logic/claims.md", (text) => text.replaceAll("AINVENTOR", "CLM01"));
    edit(dir, "src/embodiments.md", (text) => text.replaceAll("AINVENTOR", "CLM01"));
    const report = validateMatter(dir);
    const duplicate = report.errors.find((finding) => finding.code === "DUPLICATE_ID");
    assert.ok(duplicate, JSON.stringify(report.errors));
    assert.match(duplicate.msg, /CLM01/);
    assert.match(duplicate.msg, /claim, inventor|inventor, claim/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const wrongKindCases = [
  {
    name: "supported_by requires a specification paragraph",
    edge: "supported_by",
    rel: "logic/claims.md",
    mutate: (text) => text.replace("supported_by: [SPEC0002]", "supported_by: [CLM01]"),
  },
  {
    name: "defined_by requires a defined term",
    edge: "defined_by",
    rel: "logic/claims.md",
    mutate: (text) => text.replace(
      "    supported_by: [SPEC0002]",
      "    supported_by: [SPEC0002]\n    defined_by: [SPEC0002]",
    ),
  },
  {
    name: "illustrated_by requires a reference numeral",
    edge: "illustrated_by",
    rel: "logic/claims.md",
    mutate: (text) => text.replace("illustrated_by: [FIG01#10]", "illustrated_by: [FIG01]"),
  },
  {
    name: "practiced_by requires a specification paragraph",
    edge: "practiced_by",
    rel: "logic/claims.md",
    mutate: (text) => text.replace(
      "    supported_by: [SPEC0002]",
      "    supported_by: [SPEC0002]\n    practiced_by: [PA01]",
    ),
  },
  {
    name: "distinguished_over requires a prior-art reference",
    edge: "distinguished_over",
    rel: "logic/claims.md",
    mutate: (text) => text.replace("distinguished_over: [PA01]", "distinguished_over: [SPEC0001]"),
  },
  {
    name: "depends_on requires a claim",
    edge: "depends_on",
    rel: "logic/claims.md",
    mutate: (text) => text.replace("depends_on: CLM01", "depends_on: SPEC0001"),
  },
  {
    name: "antecedent_of requires a claim limitation",
    edge: "antecedent_of",
    rel: "logic/claims.md",
    mutate: (text) => text.replace("antecedent_of: [LIM01]", "antecedent_of: [CLM01]"),
  },
  {
    name: "scope_set_at requires a prosecution node",
    edge: "scope_set_at",
    rel: "logic/claims.md",
    mutate: (text) => text.replace("scope_set_at: [PH01]", "scope_set_at: [SPEC0001]"),
  },
  {
    name: "drawing numeral practiced_by edges require a specification paragraph",
    edge: "practiced_by",
    rel: "evidence/drawings/fig01.md",
    mutate: (text) => text.replace("defined_in: SPEC0002", "defined_in: CLM01"),
  },
];

for (const fixture of wrongKindCases) {
  test(fixture.name, () => {
    const dir = clone();
    try {
      edit(dir, fixture.rel, fixture.mutate);
      const report = validateMatter(dir);
      const finding = report.errors.find(
        (candidate) => candidate.code === "EDGE_TARGET_KIND" && candidate.msg.includes(fixture.edge),
      );
      assert.ok(finding, JSON.stringify(report.errors));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

test("defined_by gives limitations a typed lexicographic TERM link without weakening SPEC support", () => {
  const dir = clone();
  try {
    edit(dir, "logic/claims.md", (text) => text.replace(
      "    supported_by: [SPEC0002]",
      "    supported_by: [SPEC0002]\n    defined_by: [TERM01]",
    ));
    const report = validateMatter(dir);
    assert.ok(!report.errors.some((finding) => (
      finding.code === "EDGE_TARGET_KIND" && finding.msg.includes("defined_by")
    )), JSON.stringify(report.errors));
    assert.ok(!report.warnings.some((finding) => finding.msg.includes("defined_by")), JSON.stringify(report.warnings));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a TERM misfiled under supported_by includes a defined_by migration hint", () => {
  const dir = clone();
  try {
    edit(dir, "logic/claims.md", (text) => text.replace("supported_by: [SPEC0002]", "supported_by: [TERM01]"));
    const finding = validateMatter(dir).errors.find((error) => (
      error.code === "EDGE_TARGET_KIND" && error.msg.includes("supported_by -> TERM01")
    ));
    assert.ok(finding);
    assert.match(finding.msg, /Use defined_by/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("apa_version 0.2 accepts two declared contributors on an adopted limitation", () => {
  const dir = clone();
  try {
    edit(dir, "PATENT.md", (text) => text
      .replace('apa_version: "0.1"', 'apa_version: "0.2"')
      .replace(
        '  - id: "AINVENTOR"\n    name: "Alex Example"',
        '  - id: "AINVENTOR"\n    name: "Alex Example"\n  - id: "COINVENTOR"\n    name: "Casey Example"',
      ));
    edit(dir, "logic/claims.md", (text) => text.replaceAll(
      "    provenance: inventor:AINVENTOR\n    source:",
      "    provenance: inventor:AINVENTOR\n    contributors: [AINVENTOR, COINVENTOR]\n    source:",
    ));
    const report = validateMatter(dir);
    assert.equal(report.meta.apa_version, "0.2");
    assert.ok(
      !report.errors.some((finding) => finding.code.startsWith("CONTRIBUTOR")),
      JSON.stringify(report.errors),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("apa_version 0.2 fails loud on missing, empty, unknown, and duplicate contributors", () => {
  const cases = [
    {
      code: "CONTRIBUTORS_MISSING",
      mutate: (text) => text,
    },
    {
      code: "CONTRIBUTORS_EMPTY",
      mutate: (text) => text.replace(
        "    provenance: inventor:AINVENTOR\n    source:",
        "    provenance: inventor:AINVENTOR\n    contributors: []\n    source:",
      ),
    },
    {
      code: "CONTRIBUTOR_UNKNOWN",
      mutate: (text) => text.replace(
        "    provenance: inventor:AINVENTOR\n    source:",
        "    provenance: inventor:AINVENTOR\n    contributors: [NOT_DECLARED]\n    source:",
      ),
    },
    {
      code: "CONTRIBUTOR_DUPLICATE",
      mutate: (text) => text.replace(
        "    provenance: inventor:AINVENTOR\n    source:",
        "    provenance: inventor:AINVENTOR\n    contributors: [AINVENTOR, AINVENTOR]\n    source:",
      ),
    },
  ];

  for (const fixture of cases) {
    const dir = clone();
    try {
      edit(dir, "PATENT.md", (text) => text.replace('apa_version: "0.1"', 'apa_version: "0.2"'));
      edit(dir, "logic/claims.md", fixture.mutate);
      const report = validateMatter(dir);
      assert.ok(errorCodes(report).includes(fixture.code), `${fixture.code}: ${JSON.stringify(report.errors)}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("unknown future apa_version fails loud", () => {
  const dir = clone();
  try {
    edit(dir, "PATENT.md", (text) => text.replace('apa_version: "0.1"', 'apa_version: "99.0"'));
    const report = validateMatter(dir);
    assert.ok(errorCodes(report).includes("APA_VERSION_UNSUPPORTED"), JSON.stringify(report.errors));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
