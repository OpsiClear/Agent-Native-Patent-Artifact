import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter } from "../../lib/apa-parse.mjs";
import {
  appendRunlog,
  buildRunlogEntry,
  commandRecord,
  existingFileRecords,
  externalSinkRecord,
} from "../apa-trace/runlog.mjs";

function ruleVersionOf(matterDir) {
  try {
    return parseFrontmatter(readFileSync(join(matterDir, "PATENT.md"), "utf8")).rules_effective_date || "";
  } catch {
    return "";
  }
}

export function appendEvalRunlog({
  matter,
  argv = [],
  cwd = process.cwd(),
  exitCode = 0,
  startedAt,
  endedAt = new Date().toISOString(),
  outputPaths = [],
  sinkAudits = [],
  notes = [],
} = {}) {
  if (!matter) return null;
  return appendRunlog(matter, buildRunlogEntry({
    timestamp: endedAt,
    skill: "apa-eval",
    ruleVersion: ruleVersionOf(matter),
    inputs: existingFileRecords(matter, [
      join(matter, "PATENT.md"),
      join(matter, "logic", "claims.md"),
      join(matter, "logic", "concepts.md"),
      join(matter, "logic", "prior_art.md"),
      join(matter, "src", "embodiments.md"),
    ]),
    outputs: existingFileRecords(matter, outputPaths),
    commands: [commandRecord({ argv, cwd, exitCode, startedAt, endedAt })],
    externalSinks: sinkAudits.map((s) => externalSinkRecord({
      kind: s.kind || "cloud-llm",
      bytes: s.bytes,
      scanVerdict: s.scanVerdict,
      humanApproved: Boolean(s.humanApproved),
    })),
    notes,
  }));
}
