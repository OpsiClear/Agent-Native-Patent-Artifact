# Oracle Isolation

Oracle isolation keeps skill tuning from becoming benchmark memorization.

## Allowed Inputs For Candidate Generation

The generator may read:

- public `source.md` fixture text;
- current target skill instructions and allowed references;
- neutral repository commands needed to generate reports.

The generator must not read:

- `expected.json`;
- fixture `checks`;
- scorer source code;
- `benchmark_report.json`;
- committed advisory reports for the same case;
- prior expected answers or known missing terms.

Only the scorer may read oracle files.

## Anti-Leak Checks

- For auto-tune, run generated-report creation in a staged path that contains only public source input
  and target skill instructions.
- Write generated candidate reports under `.apa/tune/`, never under committed fixture `runs/`.
- Do not paste expected terms into prompts.
- Do not add full public patent fixture text to `SKILL.md`.
- Keep benchmark fixtures in `benchmarks/`, not in skill prompt context.
- Add mutation tests proving misplaced keywords and keyword stuffing do not fully pass.

## Evidence Spans

Every candidate report should cite `source.md` line spans. The scorer should verify:

- the cited span exists;
- the span is in `source.md`;
- the span contains at least one relevant mechanism term when the finding is a mechanism claim;
- missing spans lower the source-span score or block acceptance when required.
