# Remaining issues, decisions and release gates

Updated October13,2026. The implementation tracker accounts for all F-01–F-23. Concrete code repairs have local evidence, but **production readiness is not verified**.

## Database deployment

The configured Supabase database was not changed.100–102 are additive local-tested migrations; they must be reviewed against the actual project's schema, historical link preflight, privileges and applied migration state before a controlled rollout.100 is needed by new full rule freezing/calculation approval and division order;102 is needed by the retry-safe create wizard. Existing087–099 must not be blindly rerun.

101 restrictions are proven on inspected local grants, not the deployed project. Obtain the original test plan's read-only permissions/policies/constraints/function metadata and verify direct REST denial, service-role operation, role inheritance and private views before applying. Any historical cross-event mismatch should be explicitly reviewed;100 fails rather than deleting/moving records. Old unpublished calculations lacking input revision require fresh calculation/reverification. Historical published payloads remain unchanged.

## Authenticated multi-browser acceptance

Use separate Organizer/Judge/Reviewer browser profiles and disposable accounts/database. Complete all twelve scenarios in the parent07 plan, including actual account creation/login/CSRF cookies, persisted wizard/setup reload, assignment IDOR, no-refresh gates/rounds, input/lock/Submit, outage/reconnect/account switch, concurrency, verified advancement/correction/publication and safe published judge visibility. Record sanitized IDs/revisions/frames/statuses, not secrets.

Local tests exercise actual transport with mocked identity, mounted React fixtures and real PostgreSQL RPCs. They do not connect authentic browsers to Supabase/PostgREST or prove hosted cookie/WS delivery. SMTP/media providers were not exercised. Browser downloads/print and external Excel/LibreOffice literal rendering/formula recalculation remain untested.

## Deployment topology and configuration — F-21

The user answered **deployment setup not known**. Verify actual process/instance count and `/ws` upgrade routing/TLS/cookies. The current room registry is per process. Bounded HTTP reconciliation provides eventual recovery for missed hints; immediate cross-instance fan-out needs a separately selected/approved shared mechanism if multiple workers are used.

Configure exact legitimate origins; provider-wide Vercel wildcard is no longer accepted. Set actual primary/additional/preview application URLs and confirm production secure cookies. Validate configurable user/node socket caps with the expected venue panel/tab count. Never publish service-role/JWT/email secrets into frontend configuration or logs.

## Policy boundaries — F-13/F-22

- **Approved and implemented:** enrolled ordinary judges may see published final results only. No unpublished combined standings, other judges' raw totals, worksheets or evidence are released.
- **Preserved:** primary contestant is presentation, explicit input gates are separate; input closure and submission window are separate; cutoff ties advance together; current normalization/weighting/aggregation/rounding/division/progression formulas remain.
- **Not guessed:** public spectator results, contestant accounts/self-registration/import, dedicated recusal/no-show scoring policies, additional special rules, and arbitrary structural editing of frozen acknowledged setup. Current supported scoring amendments require reason/independent approval and rejudging. Broader structural revision needs an approved process.

## Other known limits

Existing large-build-chunk and three lint warnings remain; unrelated code was not refactored. Backend's three disabled integration assertions remain skipped because they are not the requested full browser workflow and must not target `.env`. Production data volume/performance and accessibility/browser-device acceptance still need a representative run.

Completion of local implementation is not permission to mutate the existing production project, send real account email or score real competitions as fixtures. See [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) and [TEST_RESULTS.md](TEST_RESULTS.md) for verified scope and evidence.
