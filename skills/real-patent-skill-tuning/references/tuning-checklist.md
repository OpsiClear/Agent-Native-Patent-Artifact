# Real Patent Skill Tuning Checklist

Use this checklist when tuning an APA skill against public patent fixtures.

## Preconditions

- Work on an optimization branch such as `optimize/software-patent-skill`, not directly on `main`.
- Freeze scorer and fixture oracle files before tuning.
- Treat committed advisory reports as regression fixtures only.
- Start auto-tune only after fresh generated candidate reports can be scored.
- Abort auto-tune if the metric command cannot prove it is reading fresh `.apa/tune/` candidates.
- Keep real-public-patent scoring advisory until deterministic extraction, fresh generation, and
  holdout fixtures exist.

## Fresh-Run Gate

- Generate candidate reports from current skill instructions.
- Write reports under `.apa/tune/<skill>/<run-id>/<case-id>/`.
- Score generated reports, not only committed `runs/advisory-*` reports.
- Keep candidate reports outside `benchmarks/fixtures/**/runs` so committed advisory reports cannot
  be mistaken for fresh outputs.
- Compare generated score to committed baseline.
- Keep `legal_posture: flags-not-conclusions` in every report.

## Mutable Surface

For `/apa-software-patent`, auto-tune may edit only:

- `skills/software-patent-review/SKILL.md.tmpl`
- `skills/software-patent-review/references/software-patent-review.md`
- `skills/software-patent-review/trigger-tests.json`

Do not edit generated `skills/software-patent-review/SKILL.md` directly. Regenerate it with
`npm run gen:skill-docs`.

## Required Gates

- `npm run tune:software-patent -- --json` or the current fresh-report scoring command.
- `npm run simulate:software-patent`.
- `npm run skills:check`.
- `git diff --exit-code -- skills/software-patent-review/SKILL.md` after generation.
- Final: `npm run build`, `npm run coverage`, and `git diff --check`.

## Acceptance

- Average score improves, or warning count drops with no score loss.
- Source integrity is `1.0`.
- Legal-overclaim avoidance is `1.0`.
- Source-span discipline is at least `0.9`.
- Technical mechanism coverage is at least `0.85`.
- Blocking failures remain `0`.
- Holdout fixture score does not regress.
- No legal-posture, eligibility-risk, claim-family, inventorship, pro-se, submit-boundary, or
  external-sink rule is broadened by auto-tune.
- Human review is required for any separately proposed legal-posture, eligibility-risk, or
  claim-family rule change.
