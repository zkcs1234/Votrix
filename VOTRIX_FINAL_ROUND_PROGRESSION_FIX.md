# VOTRIX Final Round Participation and Backend Connection

Implemented October 12, 2026. The source round's advancement rule now determines the next round's eligible field consistently in the interface, backend reads, PostgreSQL operations, and judge submissions. Scoring formulas remain unchanged.

## How the first round feeds Final

For **Preliminary → Top 5 → Final**, the organizer saves Top N = 5 on Preliminary and chooses Final as its destination, or uses the next main round in the saved order.

```text
Initial Preliminary membership
  → Judges lock criteria and Submit Round in the shared session
  → Calculate Preliminary tabulation from submitted source snapshots
  → Verify the calculation under the published approval procedure
  → Confirm advancement
  → Store qualifiers, calculation source, rules version, approver and audit
  → Populate Final's membership with those approved IDs
  → Organizer activates Final in Live Control
  → Eligible finalists score Final's criteria and Submit Round
```

The Final roster comes from the approved source decision. Registering an entry or saving an unrelated planned Final membership does not qualify it. The backend rejects ordinary destination assignments that bypass progression, unapproved qualification, and score writes for entries outside the eligible roster.

Use the **same session and rules version** when moving between rounds. Activating Final changes the scoring context; it does not start another competition or copy Preliminary's scores into Final.

For **Preliminary → Final with No Elimination**, all eligible assigned Preliminary entries are planned participants in Final. No Top N decision, numerical submission quorum, or verified qualification snapshot is required merely to establish that continuing field. The organizer activates Final separately in Live Control. This activation synchronizes its membership with the eligible source roster and records the previous membership and resulting field in the audit log.

No implemented setting enforcing earlier-round completion was found. Current authorization comes from the published configuration, organizer round activation, active session, contestant/criterion gates, enrollment, and judge assignment scope. Closed or paused scoring is shown separately from eligibility.

## Eligibility and scores are separate

| Source advancement rule | Destination field |
|---|---|
| None / All Eligible Continue | Eligible source-round membership, filtered by applicable exclusions and destination division |
| Top N | Approved contestants at the published rank cutoff |
| Top Percentage | Approved cutoff based on `ceil(source field × percentage / 100)` |
| Minimum Score | Approved contestants meeting the source calculation's numeric threshold |
| Authorized Manual Selection | Reasoned organizer selection from verified eligible results under the published manual rule |

The destination's **criteria and score progression** govern its scoring. Preliminary's cutoff rule applies to who enters Final; it does not replace Final's criterion definitions.

| Final score progression | Existing score behavior |
|---|---|
| Back to Zero | Final's result alone determines the selected final result |
| Weighted Combination | Included round results combine using the configured contributions |
| Carry Forward | Applicable earlier round results are added according to the existing engine |

All Continue and Top N both work with Back to Zero and Weighted Combination. The exact engine file, `shared/competition-calculation.js`, has the same SHA-256 hash as before this task.

## Cutoff ties and manual results

Existing shared cutoff ties remain inclusive. Ranks `1, 2, 3, 4, 5, 5, 7` produce six qualifiers for Top 5. A configured highest-major tie breaker can first resolve a numeric tie; unresolved shared cutoff ranks continue together.

The repository has no separate published “exactly five despite shared cutoff ties” policy. This change does not silently discard a tied entry or invent such a policy. Automatic selections remain read-only. Explicit manual selection requires the published manual advancement rule, eligible verified results, a recorded reason, and organizer approval. Manual official placements retain their existing independent verification requirement.

Numeric threshold advancement cannot use rank-based or manual placement results. Publication rejects these incompatible configurations, invalid Top N/percentage values, ambiguous source links, and destinations pointing to independent special-award rounds. Special awards keep their own explicit memberships.

## Navigation and display

The broken relative workspace link was replaced with the existing `stagePath` helper and the current event ID. The resulting route is:

```text
/organizer/competition/events/:eventId/workspace
  ?tab=rounds&section=advancement&roundId=:sourceRoundId
```

It opens the source round's Advancement & Elimination drawer, preserves the event context, works after direct navigation or refresh, focuses the settings, and respects published read-only restrictions. No Elimination uses **View Round Progression**.

Round Participation now distinguishes planned all-continue entries from confirmed qualifiers and actual scoring authorization. It displays saved backend states for no registered entries, no source field, awaiting source progression/results, awaiting calculation, awaiting verification, awaiting advancement approval, confirmed qualification, an approved empty qualifier set, exclusions, closed scoring, and failed participation reads.

Approved records can be expanded to inspect the decision, calculation source, rules reference, confirmation and reason. View Qualified Entries filters to the approved set. Tabulation shows continuing rounds without qualification buttons and exposes preview/approval only for elimination/manual source rules. Successful confirmation prevents a repeated approved write; failed requests retain the review with an error.

## Backend and database

`rulesFor` resolves each round's effective roster from its immutable rule snapshot, current-version decisions, and applicable eligibility records. Foundation returns a read-only participation summary using the owner-checked `competition_participation_context` RPC. Missing or failed context reads fail explicitly rather than masquerading as zero qualifiers.

PostgreSQL uses the corresponding roster resolver when activating rounds, saving judge drafts, locking scores, and collecting Submit Round sources. Membership triggers protect both qualifying and continuing destinations. Continuing membership synchronization is limited to the authorized Live Control operation. Existing correction restrictions preserve approved advancement and historical sources.

**You confirmed that migration 097 has already run in Supabase. Apply [099_competition_round_progression_upgrade.sql](backend/src/database/migrations/099_competition_round_progression_upgrade.sql) once as the forward update.** It replaces function implementations and permissions without changing existing contestant, membership, score, rule-version, decision, or result rows. Keep the successful earlier migration runs in place. Migration 098 remains the separate event-participant foreign-key repair and was not edited by this task.

Fresh installations can apply forward migrations in order through 099. Existing installations that already ran 097 use 099 to receive the final corrections. After the SQL succeeds, restart the backend and refresh the frontend. No connected Supabase operation was executed during this work.

## Files changed in this task

Application and shared code:

- `shared/competition-participation.js`
- `shared/competition-participation-state.js` — new
- `shared/competition-progression-validation.js` — new
- `shared/competition-rule-configuration.js`
- `backend/src/services/competition-workflow.service.js`
- `backend/src/services/competition.service.js`
- `backend/src/validators/competition.validator.js`
- `frontend/src/pages/organizer/competition/CompetitionContestantsPage.jsx`
- `frontend/src/components/organizer/competition/CompetitionRoundParticipation.jsx` — new
- `frontend/src/components/organizer/competition/CompetitionRoundsTab.jsx`
- `frontend/src/components/organizer/competition/CompetitionRoundSettings.jsx`
- `frontend/src/components/organizer/competition/CompetitionTabulationWorkspace.jsx`
- `frontend/src/components/organizer/competition/CompetitionAdvancementPanel.jsx` — new

Database and verification:

- `backend/src/database/migrations/097_competition_round_progression.sql` — base progression migration
- `backend/src/database/migrations/099_competition_round_progression_upgrade.sql` — forward correction for already-applied 097
- `backend/scripts/test-competition-participation.mjs`
- `backend/scripts/check-round-progression.mjs` — new
- `backend/__tests__/fixtures/competition-workflow-schema.sql` — adds the existing application calculation timestamp to the isolated fixture
- `backend/__tests__/fixtures/competition-no-elimination-seed.sql` — new isolated fixture
- `backend/__tests__/modules/round-progression.test.js` — new
- `backend/__tests__/modules/progression-validation.test.js` — new
- `backend/__tests__/services/criteria-publication.test.js`
- `backend/__tests__/services/criteria-foundation.test.js`
- `backend/__tests__/services/round-rules-roster.test.js` — new
- `frontend/src/pages/organizer/competition/CompetitionContestantsPage.test.jsx`
- `frontend/src/pages/organizer/competition/CompetitionParticipationNavigation.test.jsx` — new
- `frontend/src/pages/organizer/competition/CompetitionWorkspacePage.test.jsx`
- `frontend/src/components/organizer/competition/CompetitionTabulationWorkspace.test.jsx`
- `frontend/src/components/organizer/competition/CompetitionAdvancementPanel.test.jsx` — new

Public API paths and router definitions remain the existing ones. No election or polling implementation was changed. Existing unrelated working-tree changes were preserved.

## Verification

- Backend suite: **469 passed, 3 skipped** with four workers. One earlier concurrent run hit an unrelated import-hook timeout; the limited-worker run passed.
- Frontend suite: **181 passed**. Its existing lifecycle tests ran with the roster-lock flag enabled for that process; saved environment files were unchanged.
- Production build and lint passed. Existing bundle-size and unused-disable warnings remain.
- Local PostgreSQL integration applied 087–099 to an isolated database. It restored earlier scoring/operational function bodies, applied 099, checked that existing rule, score, decision and result JSON remained identical, then exercised the corrected flows.
- Persisted source scores and actual Submit Round snapshots were processed by the existing calculation engine. No Elimination, Top N, percentage, numeric threshold, and manual qualification continued into actual Final locks and Submit Round. Back to Zero and weighted outcomes matched the existing formulas. Independent verification, cutoff ties, invalid source values, special-award isolation, membership restrictions, and closed scoring checks passed.
- Browser checks used the real organizer layout and production-style sibling routes at 1536, 1280, 1024, 768, and 390 pixels. Five participation phases, refreshed read-only source settings, source exclusions, authorized open scoring, qualifier filtering, and failed-read recovery passed. No live API requests or runtime exceptions occurred. The pre-existing collapsed-sidebar nested-link warning remains.

The standalone SQL check is `node backend/scripts/test-competition-participation.mjs` from the repository root. It uses localhost only and requires a local PostgreSQL instance. Its fixtures are test data and must not be pasted into Supabase.
