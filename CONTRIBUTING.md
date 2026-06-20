# Contributing

APA accepts contributions under the repository license in [LICENSE](LICENSE).

## Inbound Rights

By submitting a contribution, contributors represent that they have the right to
contribute it under the repository license and that, to the best of their knowledge,
the contribution does not knowingly infringe third-party intellectual property rights.

Do not submit confidential client data, unfiled invention disclosures, unpublished
patent matter, private search results, real inventor personally identifying
information, API keys, or privileged attorney work product.

## Patent-Domain Guardrails

APA is assistive software, not a law firm or registered patent practitioner. Contributions
must preserve that posture:

- Do not add code or copy that signs, files, certifies, or submits a patent document.
- Do not name an AI system as an inventor.
- Do not assert micro-entity status or legal conclusions automatically.
- Do not weaken scan-at-sink confidentiality checks or human-review gates.
- Treat section 101/102/103/112 outputs as flags for a practitioner, not clearance.

## Third-Party Provenance

If a contribution copies, ports, or closely adapts third-party material, update
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) in the same change. Include the
source, license, original path when known, and a short adaptation summary.

Reference repos under `third_party/` retain their own licenses. U.S. government
reference material under `third_party/uspto-references/` is treated as public domain
under 17 U.S.C. 105, but its legal currency still must be verified.

## Development Checks

Run these before submitting a change:

```bash
node scripts/gen-skill-docs.mjs --check
npm test
node packages/apa-validate/validate.mjs examples/minimal-patent-artifact
node packages/apa-validate/validate.mjs examples/full-lifecycle-artifact
```

Use Node 22 for parity with CI. The current repository contract is Node >=21,
plain ESM, and zero runtime dependencies.
