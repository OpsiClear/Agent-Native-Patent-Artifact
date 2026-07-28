import { test } from "node:test";
import assert from "node:assert/strict";

import { ALL_HOSTS as rootHosts } from "../../../hosts/index.mjs";
import { ALL_HOSTS as packageHosts } from "../src/hosts.mjs";

function portableHostRecord(host) {
  return {
    id: host.id,
    skillRoot: host.skillRoot,
    configRoot: host.configRoot || null,
    legacySkillRoots: [...(host.legacySkillRoots || [])],
  };
}

test("standalone package host roots stay in parity with the repository registry", () => {
  assert.deepEqual(
    packageHosts.map(portableHostRecord),
    rootHosts.map(portableHostRecord),
  );
});
