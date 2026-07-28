import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { auditPatentReleasePrivacy } from "./audit-patent-release-privacy.mjs";

test("privacy audit accepts synthetic public artifacts and rejects notice/path/sentinel leakage", () => {
  const root = mkdtempSync(join(tmpdir(), "apa-privacy-audit-"));
  try {
    const safe = join(root, "safe");
    mkdirSync(safe);
    writeFileSync(join(safe, "fixture.txt"), "Synthetic USPTO workflow fixture with no private identifiers.");
    assert.equal(auditPatentReleasePrivacy([safe], { root }).ok, true);

    const unsafe = join(root, "unsafe");
    mkdirSync(unsafe);
    const syntheticNotice = "123456_12345678_" + "01-02-2031_" + "NTC.MISS.PRT.PDF";
    const syntheticDownloadsPath = ["C:", "Users", "example", "Downloads", syntheticNotice].join("\\");
    writeFileSync(
      join(unsafe, "leak.txt"),
      syntheticDownloadsPath,
    );
    const generic = auditPatentReleasePrivacy([unsafe], { root });
    assert.equal(generic.ok, false);
    assert.ok(generic.findings.some((finding) => finding.code === "PRIVATE_NOTICE_FILENAME_PATTERN"));
    assert.ok(generic.findings.some((finding) => finding.code === "LOCAL_DOWNLOADS_PATH"));

    writeFileSync(join(safe, "sentinel.txt"), "PRIVATE-SENTINEL-FIXTURE-9D2B");
    const sentinel = auditPatentReleasePrivacy([safe], {
      root,
      sentinels: ["PRIVATE-SENTINEL-FIXTURE-9D2B"],
    });
    assert.equal(sentinel.ok, false);
    assert.ok(sentinel.findings.some((finding) => finding.code === "PRIVATE_SENTINEL_1"));
    assert.equal(JSON.stringify(sentinel).includes("PRIVATE-SENTINEL-FIXTURE-9D2B"), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
