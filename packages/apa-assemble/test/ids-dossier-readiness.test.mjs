import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { assembleIds } from "../ids.mjs";
import { buildSearchDossier, idsVerificationStatus } from "../../apa-search/writers.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const EXAMPLE = join(HERE, "..", "..", "..", "examples", "minimal-patent-artifact");

function cloneMatter() {
  const matter = mkdtempSync(join(tmpdir(), "apa-ids-dossier-"));
  cpSync(EXAMPLE, matter, { recursive: true });
  return matter;
}

function writeDossier(matter, name, { generatedAt, idsReady }) {
  const dir = join(matter, "evidence", "prior_art");
  mkdirSync(dir, { recursive: true });
  const dossier = buildSearchDossier({
    query: { keywords: ["fixture"], cpc: [] },
    result: {
      verdict: { text: "fixture", high: [], medium: [] },
      ranked: [],
      rawRecords: [],
      deduped: [],
      perSource: [],
    },
    assigned: [{ paId: "PA01", docNumber: "US1", title: "Fixture" }],
    generatedAt,
  });
  dossier.assigned_references[0].verification = idsVerificationStatus({
    human_verified: idsReady,
    title: idsReady,
    venue: idsReady,
    canonical_link: idsReady,
    relied_on_passage: idsReady,
    verified_at: idsReady ? generatedAt : "",
  });
  writeFileSync(join(dir, name), JSON.stringify(dossier));
}

test("IDS fails closed without a dossier even when prior_art.md has legacy verified=true", () => {
  const matter = cloneMatter();
  try {
    const ids = assembleIds(matter);
    assert.equal(ids.count, 1);
    assert.equal(ids.unverified, 1);
    assert.equal(ids.dossierCount, 0);
    assert.equal(ids.readinessSource, "search-dossier-assigned-reference");
    assert.match(ids.markdown, /No search dossier was found/);
    assert.match(ids.markdown, /PA01.*UNVERIFIED/);
  } finally {
    rmSync(matter, { recursive: true, force: true });
  }
});

test("assigned-reference verification.ids_ready is the sole positive IDS signal", () => {
  const matter = cloneMatter();
  try {
    writeDossier(matter, "search-dossier-ready.json", {
      generatedAt: "2026-07-26T12:00:00.000Z",
      idsReady: true,
    });
    const ids = assembleIds(matter);
    assert.equal(ids.unverified, 0);
    assert.equal(ids.dossierCount, 1);
    assert.doesNotMatch(ids.markdown, /PA01.*UNVERIFIED/);
  } finally {
    rmSync(matter, { recursive: true, force: true });
  }
});

test("a bare dossier ids_ready boolean cannot bypass the required human checks", () => {
  const matter = cloneMatter();
  try {
    const dir = join(matter, "evidence", "prior_art");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "search-dossier-bare-boolean.json"), JSON.stringify({
      schema: "apa-search-dossier-v1",
      generated_at: "2026-07-26T12:00:00.000Z",
      assigned_references: [{ pa_id: "PA01", verification: { ids_ready: true } }],
    }));

    const ids = assembleIds(matter);
    assert.equal(ids.unverified, 1);
    assert.match(ids.markdown, /PA01.*UNVERIFIED/);
  } finally {
    rmSync(matter, { recursive: true, force: true });
  }
});

test("the newest valid dossier wins and malformed dossier JSON cannot confer readiness", () => {
  const matter = cloneMatter();
  try {
    writeDossier(matter, "search-dossier-old.json", {
      generatedAt: "2026-07-25T12:00:00.000Z",
      idsReady: true,
    });
    writeDossier(matter, "search-dossier-new.json", {
      generatedAt: "2026-07-26T12:00:00.000Z",
      idsReady: false,
    });
    writeFileSync(
      join(matter, "evidence", "prior_art", "search-dossier-malformed.json"),
      '{"assigned_references":[{"pa_id":"PA01","verification":{"ids_ready":true}}]',
    );

    const ids = assembleIds(matter);
    assert.equal(ids.dossierCount, 2);
    assert.equal(ids.unverified, 1);
    assert.match(ids.markdown, /PA01.*UNVERIFIED/);
  } finally {
    rmSync(matter, { recursive: true, force: true });
  }
});
