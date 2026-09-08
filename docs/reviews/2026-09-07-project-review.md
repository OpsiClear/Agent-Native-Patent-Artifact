# Project review — 2026-09-07

Post-review cleanup: the CI workflow now installs locked dependencies with `npm ci`, and coverage includes the application tests. The findings below retain the reviewed baseline; broader test-discovery unification and other recommendations remain open.

Cleanup validation: the full build passed all 621 tests, distribution isolation, and smoke checks. Updated coverage passed with 135/138 files loaded (97.8%) and 2336/2586 functions covered among loaded files (90.3%). A lockfile installation dry run also passed.

Requested scope: project review and improvement suggestions, including every first-party skill and supporting file. The companion [skill review](2026-09-07-skill-review.md) contains the Astra/max skill audit and coverage inventory. This report covers the runtime, automation, and verification findings independently inspected by the coordinating reviewer.

Implementation files were not edited. The nine pre-existing modified files in search, filing assembly, and their tests/instructions were included as current working-tree state and preserved. Vendored third-party projects were not independently audited. This is an engineering review of the toolkit, not an evaluation of a particular patent matter.

## Assessment

The project has substantial deterministic validation, sensible package boundaries, content-addressed records, and useful end-to-end tests. The most valuable next work is making the newer harness transactionally reliable and aligning skill instructions and CI with that harness. Adding more skills should follow those repairs.

## Confirmed findings

### P1 — Browser review answers are not bound to the reviewed file fingerprint

Evidence: `skills/apa-review-form/assets/review-form-template.html:780` keys local storage using only matter ID/title. Lines 798–824 load raw answers and merge them into current form data without checking the target fingerprint. The import handler at line 1606 checks matter identity, not the reviewed file fingerprint. `exportJson` at line 1443 combines the current `DATA` with those answers.

Consequently, regenerating a form after changing the same matter can restore earlier review answers and package them with new form metadata. This is a confirmed missing freshness check in UI persistence; this review does not claim to have demonstrated downstream preflight acceptance of such an export.

Recommendation: persist a versioned answer envelope containing matter identity, target fingerprint, and review contract version. Reject or quarantine stale imports/local storage, visibly require renewed review, and avoid overwriting the original reviewed fingerprint with the current one. Add a browser regression that approves a synthetic claim, changes that claim, regenerates the form, and verifies that approval no longer counts.

### P1 — Rejected adoption can leave persistent records and prevent a corrected retry

Evidence: `packages/apa-workflow/commands.mjs:284` writes a decision, line 292 writes an adopted artifact revision, and line 323 only then appends the workflow event. Event validation in `packages/apa-workflow/ledger.mjs:43` checks the idempotency key. `apps/cli/cli.mjs:119` only requires a nonempty mutation key. The immutable decision identity in `packages/apa-core/store.mjs:245` excludes the decision timestamp while the persisted record includes it.

Reproduced in a fresh temporary matter using the real exported commands:

1. Initialize a matter and create a valid specification proposal.
2. Call `decideProposal` with a valid reviewer and expected head, but `idempotencyKey: "short"`.
3. The command throws `idempotencyKey must contain at least 8 characters`, yet a decision file remains.
4. Retry the same adoption with a valid key and a later timestamp.
5. Retry throws `immutable record already exists with different content` for that decision.

The failed operation does not appear as a current adopted artifact, so this is not evidence that an unapproved proposal became current. It does leave inconsistent persistent state that prevents normal retry. Invalid proposal input also left an unreferenced draft object in a separate reproduction.

Recommendation: validate the entire command/event before the first write. Then introduce a recoverable commit protocol for records plus ledger, since prevalidation alone cannot handle process interruption or disk errors. Derive stable transaction metadata once, distinguish staged from committed records, and make interrupted retries deterministic. Add failure-injection tests at each persistence boundary.

### P1 — Verification misses records without corresponding ledger events

Evidence: `packages/apa-workflow/commands.mjs:540` verifies some event-to-record links. `packages/apa-core/store.mjs:342` checks record schemas and content but does not establish that each decision/revision is represented by an appropriate committed workflow event.

After the failed adoption above, `verifyHarness(matter)` returned exactly `{"ok":true,"errors":[]}` despite the orphan decision and failed corrected retry.

Recommendation: reconcile records and ledger in both directions. Every source, proposal, decision, and adopted revision should have its matching event and matching digest. Report incomplete transactions separately from malformed content and provide a recovery path. Verify source-ingestion and review-decision digests as explicitly as proposal and artifact digests.

### P1 — Fresh CI checkout does not install required dependencies

Evidence: `.github/workflows/gate.yml:27` explicitly says “zero deps, so no install step.” The workflow reaches `npm test` without `npm ci`. However, `packages/apa-core/contracts.mjs:5` imports `ajv`, and the MCP application imports its SDK/schema dependencies. They are declared in workspace manifests and `package-lock.json`.

Reproduction: copying the core package into a clean temporary directory and importing `contracts.mjs` fails with `ERR_MODULE_NOT_FOUND: Cannot find package 'ajv'`. Local tests passed because this workspace already has its dependencies installed. No remote CI run was inspected.

Recommendation: add a lockfile-based `npm ci` step before checks that import runtime packages. Reconcile the GitHub workflow with the canonical npm build gate; it also does not explicitly run the same architecture/skill commands as `npm run build`. Keep offline test execution distinct from dependency installation. Replace the stale zero-dependency comments.

### P2 — Coverage and test commands discover different suites

Evidence: `scripts/coverage-summary.mjs:14` omits `apps/**/*.test.mjs`; root `package.json` includes that glob in `test` and `build`. The ordinary test run discovered 621 tests, whereas the coverage run discovered 618. Those app tests exercise the CLI and MCP surfaces. A successful coverage rerun explicitly listed both applications and `apa-application/service.mjs` as unloaded, while still passing the global floors.

Recommendation: define first-party test discovery once and reuse it in test, build, coverage, and documentation. Add meaningful branch/failure coverage for adoption/recovery boundaries; the present metric counts function execution among loaded files, which does not establish transactional behavior. Rename the CI “advisory” coverage step because the script enforces blocking thresholds.

### P1 — Distributed review-form scripts cannot load their runtime dependency

The Astra skill review reproduced `ERR_MODULE_NOT_FOUND` with `node dist/codex/apa-review-form/scripts/generate_review_form.mjs --help` and the Cursor questionnaire equivalent. `skills/apa-review-form/scripts/review_fingerprint.mjs:2` statically re-exports `../../../packages/apa-review/review-fingerprint.mjs`. Host generation copies this support file unchanged (`scripts/gen-skill-docs.mjs:249`), so it resolves to missing `dist/packages/...` rather than the repository runtime. An `--apa-kit` argument cannot fix an import that fails before argument parsing.

Recommendation: bundle the required runtime into the installed skill, or provide a deliberately resolved installed application boundary. Add offline smoke execution of every installed script entrypoint in each host layout. `scripts/check-package-isolation.mjs:159` currently tests installer listing and host metadata, not these script entrypoints, so its passing status does not establish that the installed review skill runs.

### P2 — Trigger tests do not establish real skill discoverability

Evidence: `scripts/check-skills.mjs:87` scores fixture-owned commands and keywords from `trigger-tests.json`; it does not route from the published skill description. This is explicitly documented as an offline heuristic and is useful within that scope. Passing 148 fixture prompts therefore does not show that a host will select the right skill from its description.

Recommendation: retain this cheap structural test, but add a separate behavioral routing evaluation using the installed host descriptions. Include natural requests without invocation names, ambiguous neighboring skills, and out-of-scope prompts. Version the model/host and test corpus, keep held-out prompts, and report false activations and missed activations separately. Do not treat simulator or keyword scores as evidence of drafting quality.

### P2 — Public metadata date verification invents missing date precision

Evidence: `skills/apa-review-form/scripts/verify_dates.mjs:154` defaults absent Crossref month and day components to 1. `verifyDoi` then emits these values as `verifiedDates` at line 178. Year-only metadata becomes January 1, and year/month metadata becomes the first day of that month, without preserving the original precision. The Astra audit reproduced the pure conversion without network calls.

Recommendation: retain the original components and an explicit precision value (`year`, `month`, `day`). Represent incomplete dates as partial dates or bounded intervals and require additional evidence for an exact-day comparison. Do not label a fabricated day as verified. Add fixtures for each precision and distinguish metadata creation from publication dates in downstream use.

## Observed intermittent test failure

The first coverage run failed at `test/review-form-agent-bridge.test.mjs:64`, reporting `concurrent workers did not claim each queued request exactly once` from `skills/apa-review-form/scripts/test_agent_bridge_e2e.mjs:266`. Its focused rerun and one full coverage rerun passed. This establishes an intermittent failure in this environment, not its root cause or a proven duplicate-claim defect.

Recommendation: preserve worker stdout/stderr, request IDs and final states on failure, with synthetic test inputs. Reproduce under coverage instrumentation and concurrent process startup before changing locking behavior. The existing assertion checks final answered states; it does not by itself prove exactly-once execution.

## Suggested implementation order

1. Repair rejected-command side effects, add interruption recovery, and make verification detect incomplete transactions.
2. Make a clean checkout pass the same checks locally and in CI; unify test discovery.
3. Resolve the companion audit's cross-skill workflow and form-filling contradictions, particularly canonical writes versus proposal adoption and post-filing status changes.
4. Reduce repeated instructions and improve natural-language discovery, preserving mandatory human decision boundaries.
5. Add behavioral evaluations and failure diagnostics before expanding the skill catalog.

The companion skill audit also identifies a drafting-guidance correction for practitioner review: `scripts/resolvers/rubric.mjs:31` instructs agents to “push breadth into dependent claims.” Dependent claims inherit the independent claim's limitations; that wording cannot recover breadth removed from the independent claim. Correct the shared resolver to describe narrower dependent fallbacks, and regenerate its consumers. The office-action handoff also needs a distinct response-draft state instead of advancing to `responded` on draft delivery alone.

## Verification record

- `npm test`: 621 passed, zero failed/skipped.
- `node scripts/gen-skill-docs.mjs --check`: all checked generated skills/references fresh.
- `node scripts/check-skills.mjs`: 23 skills and 148 trigger prompts passed.
- `node scripts/check-architecture.mjs`: 26 packages, 2 apps, 66 dependency edges; passed.
- `node packages/apa-skillgraph/cli.mjs check`: 23 skills, 3 domain packs; passed.
- First `npm run coverage`: 617/618 passed; agent-bridge concurrency assertion failed, so no successful coverage measurement from that run.
- Focused `node --test test/review-form-agent-bridge.test.mjs`: passed.
- One full coverage rerun: 618/618 passed; 132/138 files loaded (95.7%), 2305/2536 functions covered among loaded files (90.9%); both floors passed.
- Temporary-fixture reproductions confirmed partial-adoption persistence, verifier false success for that state, and missing dependency behavior without installation.

No paid API calls, patent filings, signatures, external messages, or implementation changes were performed.
