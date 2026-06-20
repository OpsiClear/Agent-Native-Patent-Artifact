#!/usr/bin/env node
/**
 * apa-figure CLI - render a patent-figure DSL to SVG, or build a numeral legend.
 *
 * SVG is a REVIEW/drafting format; formal 37 CFR 1.84 black-and-white raster/PDF
 * conversion is a later phase. The figures themselves are black-stroke / white-fill, no color.
 *
 * Usage:
 *   node cli.mjs render <figdef.json> [--out f.svg]      render a DSL file to SVG (stdout or --out)
 *   node cli.mjs legend --matter <dir> [--json]          consolidated numeral legend + brief description
 *
 * Exit codes:
 *   0  ok / legend clean
 *   1  legend flags exist (undefined or inconsistent numerals), OR a usage/IO error
 *
 * Node >=21, ESM, zero dependencies.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

import { renderFigure } from "./render.mjs";
import { buildLegend } from "./numerals.mjs";
import { aggregateReviews, missingSvgReview, reviewFigure } from "./quality.mjs";
import { buildSvgUpgradeReport } from "./upgrade-report.mjs";

function argValue(args, name) {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
}
function argValues(args, name) {
  const values = [];
  for (let i = 0; i < args.length - 1; i++) {
    if (args[i] === name) values.push(args[i + 1]);
  }
  return values;
}
function hasFlag(args, name) {
  return args.includes(name);
}

const USAGE = [
  "usage:",
  "  node cli.mjs render <figdef.json> [--out f.svg]",
  "  node cli.mjs render-dir <drawing_src_dir> --out-dir <svg_dir>",
  "  node cli.mjs review-dir <drawing_src_dir> --svg-dir <svg_dir> [--out report.json] [--min-score N]",
  "  node cli.mjs upgrade-report --before-dir <svg_dir> --after-dir <svg_dir> [--source-dir drawing_src] --out svg_upgrade_report.json",
  "  node cli.mjs legend --matter <dir> [--json]",
].join("\n");

// Flags that consume the following token as their value (so it is NOT the positional figdef path).
const VALUE_FLAGS = new Set(["--out", "--out-dir", "--svg-dir", "--min-score", "--before-dir", "--after-dir", "--source-dir", "--source-route", "--tool-note"]);

function positional(args) {
  return args.find((a, i) => !a.startsWith("--") && !VALUE_FLAGS.has(args[i - 1]));
}

function cmdRender(args) {
  const file = positional(args);
  if (!file) {
    console.error("error: render requires a <figdef.json> path\n" + USAGE);
    return 1;
  }
  let figDef;
  try {
    figDef = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    console.error(`error: cannot read/parse ${file}: ${e.message}`);
    return 1;
  }
  let svg;
  try {
    svg = renderFigure(figDef);
  } catch (e) {
    console.error(`error: render failed: ${e.message}`);
    return 1;
  }
  const out = argValue(args, "--out");
  if (out) {
    try {
      writeFileSync(out, svg, "utf8");
    } catch (e) {
      console.error(`error: cannot write ${out}: ${e.message}`);
      return 1;
    }
    console.error(`wrote ${out} (${svg.length} bytes)`);
  } else {
    process.stdout.write(svg);
  }
  return 0;
}

function jsonFiles(dir) {
  return readdirSync(dir)
    .filter((name) => extname(name).toLowerCase() === ".json")
    .sort()
    .map((name) => join(dir, name));
}

function cmdRenderDir(args) {
  const dir = positional(args);
  const outDir = argValue(args, "--out-dir");
  if (!dir || !outDir) {
    console.error("error: render-dir requires <drawing_src_dir> --out-dir <svg_dir>\n" + USAGE);
    return 1;
  }
  let files;
  try {
    files = jsonFiles(dir);
    mkdirSync(outDir, { recursive: true });
  } catch (e) {
    console.error(`error: cannot read/create directories: ${e.message}`);
    return 1;
  }
  let count = 0;
  for (const file of files) {
    try {
      const figDef = JSON.parse(readFileSync(file, "utf8"));
      const svg = renderFigure(figDef);
      const out = join(outDir, `${basename(file, ".json")}.svg`);
      writeFileSync(out, svg, "utf8");
      count++;
    } catch (e) {
      console.error(`error: render failed for ${file}: ${e.message}`);
      return 1;
    }
  }
  console.log(`rendered ${count} figure(s) -> ${outDir}`);
  return 0;
}

function cmdReviewDir(args) {
  const dir = positional(args);
  const svgDir = argValue(args, "--svg-dir");
  const out = argValue(args, "--out");
  const minScore = Number(argValue(args, "--min-score") || 80);
  if (!dir || !svgDir) {
    console.error("error: review-dir requires <drawing_src_dir> --svg-dir <svg_dir>\n" + USAGE);
    return 1;
  }
  let reviews = [];
  try {
    reviews = jsonFiles(dir).map((file) => {
      const svgPath = join(svgDir, `${basename(file, ".json")}.svg`);
      if (!existsSync(svgPath)) {
        return missingSvgReview(basename(file, ".json"), svgPath);
      }
      const figDef = JSON.parse(readFileSync(file, "utf8"));
      const svg = readFileSync(svgPath, "utf8");
      return reviewFigure(figDef, svg, { file });
    });
  } catch (e) {
    console.error(`error: review failed: ${e.message}`);
    return 1;
  }
  const report = aggregateReviews(reviews);
  report.min_score_required = minScore;
  if (out) writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(
    `reviewed ${report.figure_count} figure(s): mean=${report.mean_score} min=${report.min_score} ` +
      `blocking=${report.blocking_count} fixes=${report.fix_before_filing_count} verdict=${report.verdict}`,
  );
  return report.blocking_count > 0 || report.min_score < minScore ? 1 : 0;
}

function cmdUpgradeReport(args) {
  const beforeDir = argValue(args, "--before-dir");
  const afterDir = argValue(args, "--after-dir");
  const sourceDir = argValue(args, "--source-dir") || "";
  const out = argValue(args, "--out");
  const sourceRoute = argValue(args, "--source-route") || "manual-svg";
  const externalToolNotes = argValues(args, "--tool-note");
  if (!beforeDir || !afterDir || !out) {
    console.error("error: upgrade-report requires --before-dir <svg_dir> --after-dir <svg_dir> --out <report.json>\n" + USAGE);
    return 1;
  }
  let report;
  try {
    report = buildSvgUpgradeReport({ beforeDir, afterDir, sourceDir, sourceRoute, externalToolNotes });
    writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  } catch (e) {
    console.error(`error: upgrade-report failed: ${e.message}`);
    return 1;
  }
  console.log(
    `wrote ${out}: files=${report.file_count} verdict=${report.verdict} ` +
      `numeral_changes=${report.numerals_added_removed.length} unsupported_visual_changes=${report.unsupported_visual_changes.length}`,
  );
  return report.ready_for_drawing_quality ? 0 : 1;
}

function cmdLegend(args) {
  const matter = argValue(args, "--matter");
  if (!matter) {
    console.error("error: legend requires --matter <dir>\n" + USAGE);
    return 1;
  }
  const asJson = hasFlag(args, "--json");
  let legend;
  try {
    legend = buildLegend(matter);
  } catch (e) {
    console.error(`error: legend failed: ${e.message}`);
    return 1;
  }

  if (asJson) {
    console.log(JSON.stringify(legend, null, 2));
  } else {
    console.log(`Reference-numeral legend  (matter: ${matter})`);
    console.log("");
    console.log("Brief Description of the Drawings");
    if (legend.briefDescription.length === 0) {
      console.log("  (no figures found under evidence/drawings/)");
    } else {
      for (const b of legend.briefDescription) console.log(`  ${b.line}`);
    }
    console.log("");
    console.log("Numeral legend");
    if (legend.entries.length === 0) {
      console.log("  (no numerals)");
    } else {
      for (const e of legend.entries) {
        console.log(`  ${e.ordinal}  ${e.numeral}  ${e.element}  [${e.defined_in || "UNDEFINED"}]`);
      }
    }
    console.log("");
    if (legend.flags.length === 0) {
      console.log("Flags: none");
    } else {
      console.log(`Flags (${legend.flags.length}):`);
      for (const f of legend.flags) console.log(`  ${f.code}: ${f.msg}`);
    }
    console.log("");
    console.log("NOTE: drafting aid - the authoritative numeral check is apa-validate. SVG figures are a review format; formal 1.84 conversion is a later phase.");
  }

  return legend.flags.length > 0 ? 1 : 0;
}

function main(argv) {
  const args = argv.slice(2);
  const cmd = args[0];
  const rest = args.slice(1);
  if (cmd === "render") return cmdRender(rest);
  if (cmd === "render-dir") return cmdRenderDir(rest);
  if (cmd === "review-dir") return cmdReviewDir(rest);
  if (cmd === "upgrade-report") return cmdUpgradeReport(rest);
  if (cmd === "legend") return cmdLegend(rest);
  console.error(USAGE);
  return 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(main(process.argv));
}

export { main };
