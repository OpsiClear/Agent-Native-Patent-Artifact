# apa-safe

Guarded external sink wrappers for APA workflows. These commands are deterministic guardrails, not
legal advice and not a confidentiality guarantee.

## Commands

```bash
apa-safe-send [--from-file PATH] [--yes] [--matter DIR] [--kind KIND] [--json]
apa-safe-fetch <url> [--yes] [--matter DIR] [--json|--out PATH]
apa-safe-npx <package@version> -- [args...] [--dry-run] [--matter DIR]
```

The root `apa-safe` command also accepts subcommands:

```bash
apa-safe send --from-file payload.txt --matter examples/minimal-patent-artifact
apa-safe fetch https://example.com/reference.txt --out fetched.md
apa-safe npx @shibayama/pdgkit@0.1.0 --dry-run -- --help
```

## Contract

- Scan exact egress bytes with `apa-redact` before sending.
- Exit `3` on HIGH findings and do not send.
- Exit `2` on MEDIUM findings unless `--yes` records explicit approval.
- Append `trace/runlog.jsonl` sink hashes when `--matter <dir>` is supplied.
- Wrap fetched content in the APA untrusted-content envelope with a canary.
- Refuse unpinned `npx` package specs by default. Use `package@version`; an unpinned override requires
  `--allow-unpinned --yes` and is logged.

## Notes

`apa-safe-send` is a generic guard for payloads another tool will transmit. Without `--json`, it echoes
the original payload to stdout only after the scan passes or a MEDIUM finding is explicitly approved.

`apa-safe-fetch` guards the outbound URL, fetches bounded response bytes, and outputs wrapped
untrusted content. A model-facing workflow should consume the wrapped output, not the raw response.

`apa-safe-npx` executes `npx --yes <package@version> ...` after command bytes are scanned. Use
`--dry-run` in automation tests or when only recording/auditing the planned command.
