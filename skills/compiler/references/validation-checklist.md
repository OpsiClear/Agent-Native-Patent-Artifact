# Validation checklist (compiler reference)

The bounded fix loop runs until Level-1 validation is clean. Level 1 is **mechanical only** - it never
decides §112 sufficiency or 101/102/103 merits (those are flags for a human). Run:

```
node packages/apa-validate/validate.mjs <matter>
```

## Level-1 mechanical checks (must pass - exit 0/1, never 2)
- [ ] `application_type` present and supported (provisional | utility | design); else fail loud.
- [ ] Mandatory-core files present for the type (provisional does not require `claims.md`).
- [ ] >= 1 inventor, none AI-named.
- [ ] Every dependent claim `depends_on` an existing claim; no dependency cycle.
- [ ] Antecedent basis: every `the/said X` resolves to an earlier `a/an X` (via `antecedent_of`) in the
      same or an ancestor claim.
- [ ] Every figure numeral's `defined_in` SPEC exists; one representative figure.
- [ ] `inventorship_matrix` references only existing claims and listed inventors.

## Warnings to triage (exit 1 - resolve or justify)
- [ ] Unresolved `supported_by` (the §112 support-edge / "unsupported-edge" warning) - add the SPEC
      paragraph or flag the gap; never silently drop it.
- [ ] Any claim limitation left `ai-suggested` (assembly blocker - a human must adopt it).
- [ ] An independent claim with no `inventorship_matrix` entry (conception not attested).
- [ ] A defined term of degree without an objective bound (112(b) risk).

## Coverage (compiler-specific)
- [ ] Every claim in the source is present, **verbatim**.
- [ ] Every reference numeral in the source figures is transcribed and mapped to a SPEC paragraph.
- [ ] Every prior-art citation in the source is captured with its role and flagged for human verification.
- [ ] Gaps written literally as "Not present in source" - never invented.
