# apa-trace

Append-only audit helpers for APA matters.

`runlog.mjs` writes and validates `<matter>/trace/runlog.jsonl`. A runlog entry records:

- the skill/tool that ran;
- input and output file SHA-256 hashes;
- command argv/cwd/exit code/timestamps;
- external sink byte hashes and scan status;
- human checkpoints that remain required or satisfied.

The runlog is not a legal conclusion and does not mark a filing act complete. It exists so a reviewer
can reconstruct what ran, what bytes left the machine, which artifacts changed, and which human checks
remain open.

Current integrations:

- `apa-search --write` logs prior-art query sink hash, generated prior-art outputs, the search dossier,
  and the closest-art human checkpoint.
- `apa-assemble --write` logs generated assembly outputs and the human filing checkpoints APA refuses
  to perform.

Validation:

```sh
node --test packages/apa-trace/test/*.test.mjs
```
