import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  assertOfficialUsptoUrl,
  buildDeterministicZip,
  buildUsptoFormBundle,
  fetchOfficialPdf,
  readStoredZipEntries,
  verifyUsptoFormBundle,
} from "./build-uspto-form-bundle.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const PDF_A = Buffer.from("%PDF-1.7\nfixture-a\n");
const PDF_B = Buffer.from("%PDF-1.7\nfixture-b\n");

function form(id, filename, directUrl, bytes) {
  return {
    id,
    form_code: id.toUpperCase(),
    title: `Synthetic ${id}`,
    applicability: ["offline bundle test"],
    release_role: "core",
    source_page: "https://www.uspto.gov/patents/apply/forms",
    direct_url: directUrl,
    published_or_updated_label: "Synthetic offline test fixture",
    retrieved_date: "2031-02-04",
    filename,
    sha256: sha256(bytes),
    expected_bytes: bytes.length,
    media_type: "application/pdf",
    xfa: false,
    viewer_requirement: "Synthetic test viewer",
  };
}

function registry() {
  return {
    schema: "apa-uspto-form-registry-v1",
    registry_version: "2031-02-04",
    source_page: "https://www.uspto.gov/patents/apply/forms",
    retrieved_date: "2031-02-04",
    human_review_required: true,
    patent_center_submission_by_apa: false,
    forms: [
      form("form-a", "form-a.pdf", "https://www.uspto.gov/forms/form-a.pdf", PDF_A),
      form("form-b", "form-b.pdf", "https://www.uspto.gov/forms/form-b.pdf", PDF_B),
    ],
  };
}

function response(body, {
  status = 200,
  type = "application/pdf",
  headers = {},
} = {}) {
  return new Response(body, {
    status,
    headers: {
      ...(type == null ? {} : { "content-type": type }),
      ...headers,
    },
  });
}

test("official URL validation rejects schemes, credentials, ports, and non-USPTO hosts", () => {
  assert.equal(assertOfficialUsptoUrl("https://www.uspto.gov/forms/a.pdf").hostname, "www.uspto.gov");
  assert.throws(() => assertOfficialUsptoUrl("http://www.uspto.gov/forms/a.pdf"), /HTTPS/);
  assert.throws(() => assertOfficialUsptoUrl("https://example.com/a.pdf"), /not an allowed/);
  assert.throws(() => assertOfficialUsptoUrl("https://user@www.uspto.gov/a.pdf"), /credentials/);
  assert.throws(() => assertOfficialUsptoUrl("https://www.uspto.gov:444/a.pdf"), /non-default port/);
});

test("fetcher accepts a bounded official redirect and verifies media, PDF signature, size, and hash", async () => {
  const target = form("redirected", "redirected.pdf", "https://www.uspto.gov/start.pdf", PDF_A);
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (String(url).endsWith("/start.pdf")) {
      return response(null, {
        status: 302,
        type: null,
        headers: { location: "/final.pdf" },
      });
    }
    return response(PDF_A, { headers: { "content-length": String(PDF_A.length) } });
  };
  const result = await fetchOfficialPdf(target, { fetchImpl });
  assert.equal(result.final_url, "https://www.uspto.gov/final.pdf");
  assert.equal(result.redirects, 1);
  assert.equal(result.sha256, sha256(PDF_A));
  assert.equal(calls.length, 2);
});

test("fetcher fails closed on redirect host, size, media type, signature, and hash", async (t) => {
  const base = form("failure", "failure.pdf", "https://www.uspto.gov/failure.pdf", PDF_A);
  await t.test("redirect host", async () => {
    await assert.rejects(
      fetchOfficialPdf(base, {
        fetchImpl: async () => response(null, {
          status: 302,
          type: null,
          headers: { location: "https://example.com/not-official.pdf" },
        }),
      }),
      /not an allowed official USPTO host/,
    );
  });
  await t.test("declared size", async () => {
    await assert.rejects(
      fetchOfficialPdf(base, {
        fetchImpl: async () => response(PDF_A, { headers: { "content-length": "9999" } }),
        maxBytes: 100,
      }),
      /exceeds/,
    );
  });
  await t.test("streamed size", async () => {
    await assert.rejects(
      fetchOfficialPdf(base, {
        fetchImpl: async () => response(PDF_A),
        maxBytes: 6,
      }),
      /exceeds/,
    );
  });
  await t.test("media type", async () => {
    await assert.rejects(
      fetchOfficialPdf(base, { fetchImpl: async () => response(PDF_A, { type: "text/html" }) }),
      /not application\/pdf/,
    );
  });
  await t.test("PDF signature", async () => {
    const html = Buffer.from("<html>not pdf</html>");
    const altered = { ...base, expected_bytes: html.length, sha256: sha256(html) };
    await assert.rejects(
      fetchOfficialPdf(altered, { fetchImpl: async () => response(html) }),
      /does not begin/,
    );
  });
  await t.test("hash", async () => {
    const altered = { ...base, sha256: "0".repeat(64) };
    await assert.rejects(
      fetchOfficialPdf(altered, { fetchImpl: async () => response(PDF_A) }),
      /SHA-256 changed/,
    );
  });
});

test("deterministic stored ZIP has sorted, exact entries and rejects unsafe names", () => {
  const first = buildDeterministicZip([
    { name: "z.txt", bytes: Buffer.from("z") },
    { name: "a.txt", bytes: Buffer.from("a") },
  ]);
  const second = buildDeterministicZip([
    { name: "a.txt", bytes: Buffer.from("a") },
    { name: "z.txt", bytes: Buffer.from("z") },
  ]);
  assert.ok(first.equals(second));
  assert.deepEqual(readStoredZipEntries(first).map((entry) => entry.name), ["a.txt", "z.txt"]);
  assert.throws(() => buildDeterministicZip([{ name: "../escape", bytes: Buffer.alloc(0) }]), /unsafe/);
});

test("offline bundle builds reproducibly and verifies exact ZIP and checksum contents", async () => {
  const root = mkdtempSync(join(tmpdir(), "apa-uspto-bundle-test-"));
  const firstDir = join(root, "first");
  const secondDir = join(root, "second");
  const fixtures = new Map([
    ["https://www.uspto.gov/forms/form-a.pdf", PDF_A],
    ["https://www.uspto.gov/forms/form-b.pdf", PDF_B],
  ]);
  const fetchImpl = async (url) => response(fixtures.get(String(url)));
  try {
    const first = await buildUsptoFormBundle({ registry: registry(), outputDir: firstDir, fetchImpl });
    const second = await buildUsptoFormBundle({ registry: registry(), outputDir: secondDir, fetchImpl });
    assert.equal(first.zip_sha256, second.zip_sha256);
    assert.equal(verifyUsptoFormBundle(firstDir, registry()).ok, true);
    assert.equal(verifyUsptoFormBundle(secondDir, registry()).ok, true);
    assert.ok(
      readFileSync(join(firstDir, first.zip_name))
        .equals(readFileSync(join(secondDir, second.zip_name))),
    );
    const entries = readStoredZipEntries(readFileSync(join(firstDir, first.zip_name)));
    assert.deepEqual(
      entries.map((entry) => entry.name).sort(),
      ["README.md", "SHA256SUMS.txt", "form-a.pdf", "form-b.pdf", "uspto-forms-manifest.json"].sort(),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
