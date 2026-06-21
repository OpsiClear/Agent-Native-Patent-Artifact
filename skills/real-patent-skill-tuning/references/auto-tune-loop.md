# Auto-Tune Loop

Use this loop after fresh generated reports and scorer floors exist.

## Baseline

1. Create or switch to `optimize/software-patent-skill`.
2. Create an untracked `.autotune/software-patent-results.tsv`.
3. Run the fixed JSON metric command and save output under `.autotune/`. Abort if the command is
   scoring committed fixture `runs/advisory-*` reports instead of fresh `.apa/tune/` candidates.
4. Run synthetic simulation and skill checks.
5. Record current commit, score, blocking failures, warning count, and changed files.

## Experiment

For each iteration:

1. Make one focused edit in the approved mutable surface.
2. Run `npm run gen:skill-docs`.
3. Run the fixed JSON metric command.
4. Run `npm run simulate:software-patent`.
5. Run `npm run skills:check`.
6. Check generated freshness for the target `SKILL.md`.
7. Record the result in the TSV.

## Keep

Keep the edit only when:

- average score improves, or score ties with fewer warnings;
- all dimension floors pass;
- blocking failures remain `0`;
- synthetic simulation passes;
- skill checks pass;
- generated skill docs are fresh;
- no legal-conclusion language was introduced;
- no no-legal-advice, AI-inventorship, pro-se, submit-boundary, or external-sink rule was weakened;
- no claim-family, filing-readiness, or legal-posture behavior was broadened.

## Discard

Discard the experiment when:

- score worsens;
- any blocking failure appears;
- synthetic simulation or trigger checks fail;
- generated `SKILL.md` is stale or was directly edited;
- the edit broadens legal posture, filing readiness, pro-se behavior, inventorship handling,
  external-sink behavior, or claim-family strategy.

Do not rewrite fixture oracles during the tuning loop. If the metric is saturated, add fresh
holdout/negative fixtures or stricter scorer tests before continuing.

Route any desired legal-posture or strategy broadening to a separate human-reviewed patch. Do not
allow auto-tune to keep it as a metric optimization.
