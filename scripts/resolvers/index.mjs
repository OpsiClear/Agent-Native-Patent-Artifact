/**
 * RESOLVERS registry: token name -> (arg, ctx) => string. gen-skill-docs replaces `{{TOKEN}}` and
 * `{{TOKEN:arg}}` in SKILL.md.tmpl files with the resolver output. Shared legal rules live here ONCE
 * so a change propagates to every dependent skill on regen (DESIGN.md §6).
 */

import { preamble } from "./preamble.mjs";
import { claimFormatGuide, analysis101102103112, idsRequirements, drawingStandards, rulesEffectiveDate } from "./legal-rules.mjs";
import { redactInvocationBlock } from "./redact-doc.mjs";
import { writingRubric, claimLadderGuide } from "./rubric.mjs";

export const RESOLVERS = {
  // preamble-tier comes from the skill frontmatter (ctx), not the token.
  PATENT_PREAMBLE: (_arg, ctx) => preamble((ctx && ctx.frontmatter && ctx.frontmatter["preamble-tier"]) || 1),
  CLAIM_FORMAT_GUIDE: () => claimFormatGuide(),
  ANALYSIS_101_102_103_112: () => analysis101102103112(),
  IDS_REQUIREMENTS: () => idsRequirements(),
  DRAWING_STANDARDS: () => drawingStandards(),
  REDACT_INVOCATION_BLOCK: (arg) => redactInvocationBlock(arg),
  WRITING_RUBRIC: () => writingRubric(),
  CLAIM_LADDER_GUIDE: () => claimLadderGuide(),
  RULES_EFFECTIVE_DATE: () => rulesEffectiveDate,
  PROTOCOL_REF: () => "the canonical protocol spec at `docs/protocol.md`",
};
