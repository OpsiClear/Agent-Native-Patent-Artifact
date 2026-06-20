# Rule Packs

APA currently enables only the USPTO rule pack. Rule packs are dated metadata for mechanical
validators, generated skills, and reports. They are not legal advice and do not replace current
USPTO/eCFR/MPEP verification.

Supported now:
- `uspto-v1` in `uspto.json`

Reserved extension points, disabled by design:
- PCT
- EPO

Non-USPTO matters must fail loud until a real rule pack, validator behavior, examples, and tests are
implemented for that jurisdiction.
