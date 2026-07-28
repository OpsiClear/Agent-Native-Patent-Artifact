#!/usr/bin/env node

import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const GENERIC_PATTERNS = Object.freeze([
  {
    code: "PRIVATE_NOTICE_FILENAME_PATTERN",
    pattern: /\b\d{6}_\d{8}_\d{2}-\d{2}-\d{4}_NTC\.MISS\.PRT\.PDF\b/i,
  },
  {
    code: "LOCAL_DOWNLOADS_PATH",
    pattern: /[A-Za-z]:[\\/]+Users[\\/]+[^\\/\r\n]+[\\/]+Downloads[\\/]+/i,
  },
  {
    code: "LOCAL_FILE_URI",
    pattern: /\bfile:\/\/\/[A-Za-z]:\//i,
  },
]);

function isWithin(root, candidate) {
  const rel = relative(root, candidate);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function collectFiles(path, root, findings) {
  const absolute = resolve(path);
  if (!isWithin(root, absolute)) {
    findings.push({ code: "SCAN_PATH_OUTSIDE_ROOT", file: "[outside-root]" });
    return [];
  }
  const stat = lstatSync(absolute, { throwIfNoEntry: false });
  if (!stat) {
    findings.push({ code: "SCAN_PATH_MISSING", file: relative(root, absolute).replace(/\\/g, "/") });
    return [];
  }
  if (stat.isSymbolicLink()) {
    findings.push({ code: "SCAN_PATH_SYMLINK", file: relative(root, absolute).replace(/\\/g, "/") });
    return [];
  }
  if (stat.isFile()) return [absolute];
  if (!stat.isDirectory()) return [];
  const files = [];
  for (const name of readdirSync(absolute).sort()) {
    files.push(...collectFiles(resolve(absolute, name), root, findings));
  }
  return files;
}

function normalizeSentinels(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter((value) => value.length >= 6))];
}

export function auditPatentReleasePrivacy(paths, {
  root = process.cwd(),
  sentinels = [],
} = {}) {
  const scanRoot = resolve(root);
  const findings = [];
  const files = [];
  for (const path of paths) files.push(...collectFiles(path, scanRoot, findings));
  const privateSentinels = normalizeSentinels(sentinels);
  for (const file of [...new Set(files)]) {
    const bytes = readFileSync(file);
    const text = bytes.toString("latin1");
    const rel = relative(scanRoot, file).replace(/\\/g, "/");
    for (const row of GENERIC_PATTERNS) {
      if (row.pattern.test(text)) findings.push({ code: row.code, file: rel });
    }
    for (let index = 0; index < privateSentinels.length; index += 1) {
      if (text.includes(privateSentinels[index])) {
        findings.push({ code: `PRIVATE_SENTINEL_${index + 1}`, file: rel });
      }
    }
  }
  return {
    ok: findings.length === 0,
    scanned_files: new Set(files).size,
    findings,
  };
}

function optionValues(argv, name) {
  const values = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === name && index + 1 < argv.length) values.push(argv[index + 1]);
  }
  return values;
}

function main(argv) {
  const root = resolve(optionValues(argv, "--root")[0] || process.cwd());
  const paths = optionValues(argv, "--path");
  if (!paths.length) {
    throw new Error("at least one --path <file-or-directory> is required");
  }
  const envSentinels = String(process.env.APA_PRIVATE_SENTINELS || "")
    .split(/\r?\n|\|/)
    .filter(Boolean);
  const sentinelFiles = optionValues(argv, "--sentinel-file");
  const fileSentinels = sentinelFiles.flatMap((path) => {
    const absolute = resolve(path);
    if (!existsSync(absolute)) throw new Error("sentinel file is missing");
    return readFileSync(absolute, "utf8").split(/\r?\n/).filter(Boolean);
  });
  const result = auditPatentReleasePrivacy(paths.map((path) => resolve(path)), {
    root,
    sentinels: [...envSentinels, ...fileSentinels],
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result.ok ? 0 : 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`error: ${error.message}\n`);
    process.exitCode = 2;
  }
}
