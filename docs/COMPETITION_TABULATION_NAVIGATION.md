# Continuous Results & Reporting pages

## Final sidebar

```text
Results & Reporting
  Tabulation
    Overview
  Scoring
  Results
  Round Advancement
  Audit Trail
```

Scoring, Results, Round Advancement and Audit Trail are siblings of Tabulation.
Only Overview belongs inside Tabulation. The other existing publication, analytics
and report destinations remain available.

## One continuous page per workspace

Scoring renders Judge Submissions, Tabulation Matrix, and Deductions & Adjustments
together, in that order. Results renders Validation, Results & Rankings, and
Finalization together. The section shortcuts scroll/focus an area of the same
page; they do not switch out its content. All three areas remain mounted.

Each native page uses one existing tabulation workspace instance, competition /
round selector, authoritative snapshot and mutation handlers. The existing section
renderer is reused for each area. The legacy workspace likewise reuses one
workflow snapshot and latest calculation across its three sections. Modals and
export controls stay outside the repeated section rendering and appear once.

An unavailable area shows its existing prerequisites without hiding the other
areas. Source invalidation and context changes still clear the authoritative data.
Section navigation itself does not calculate, deduct, verify, finalize, publish
or advance entries. Loading an eligible native tabulation workspace may retry a
missed or failed automatic calculation as described below.

## Routes and backward compatibility

All routes are under `/organizer/competition/events/:eventId/`.

| Destination | Canonical page | Existing links retained as aliases |
| --- | --- | --- |
| Overview | `tabulation/overview` | `tabulation` |
| Scoring | `scoring` | `tabulation/submissions`, `tabulation/matrix`, `tabulation/deductions` |
| Results | `results` | `tabulation/validation`, `tabulation/results`, `tabulation/finalization` |
| Round Advancement | `advancement` | `tabulation/advancement` |
| Audit Trail | `audit` | `tabulation/audit` |

Old section links redirect to their canonical page with a `#tabulation-<section>`
anchor and retain their search parameters. For example,
`tabulation/matrix?competitionId=...&roundId=...` opens
`scoring?competitionId=...&roundId=...#tabulation-matrix`.

Sidebar navigation preserves the selected competition and round between Live
Control and these pages. Query normalization and selector changes preserve the
section anchor. Section anchors also receive keyboard focus after async content
loads. Memoized authorized context choices prevent section jumps from causing
extra tabulation loads or clearing selected judge sheets.

## Finalization and progression

Scoring links to Results. The normal handoff for a multi-round category is:

1. Close scoring for the current round in Live Control after all judge sheets
   are complete.
2. Open Tabulation. Numeric scoring is calculated automatically when the round
   is complete, closed, and any configured organizer deductions are resolved.
   If an earlier automatic attempt was missed or failed, opening the native
   tabulation workspace retries it through the same audited, source-digest
   checked calculation path. Manual-placement rounds are not auto-calculated;
   an authorized organizer records those placements and a reason.
3. In Results, review the current standings and finalize the calculation with a
   decision reason. Independent reviewer assignment and verification are not
   required. Finalization does not publish results.
4. In Round Advancement, click **Review Advancement** to load the proposed
   qualifier list. The app calculates the automatic selection from finalized
   standings and the configured advancement rule (for example, top N or a
   percentage); manual advancement starts with no automatic selections and the
   organizer chooses the entries. Review the displayed standings and selection,
   then confirm the roster
   with a reason. The next-round action remains disabled until the current
   calculation is finalized and the current qualifier roster is confirmed.
5. Proceed to the named next round. The workspace rechecks the authorized
   destination snapshot and confirmed qualification state before routing to
   that round in Live Control. Starting judging remains a separate action.

The advancement page lists each prerequisite and provides a direct action for
the first unmet step (for example, checking submissions, closing scoring,
resolving deductions, opening Finalization, or opening Live Control). An
automatic calculation failure is logged and leaves the calculation status at
"Needs Review"; it does not change saved scoring sources or allow advancement.

For a terminal or single round, View Final Results opens the existing reporting
page with the selected competition/round. The results boundary validates that
context against its authorized choices before fetching it. Publication and export
rules remain in the existing result workspace; finalization does not publish.

Audit Trail retains its recorded activity and source versions on a separate page.
The former Independent review panel and its mandatory finalization gate are
removed from this organizer flow. Any optional verification history does not
block organizer finalization.

## Implementation files

- `frontend/src/layouts/PageantLayout.jsx`: sibling sidebar destinations.
- `frontend/src/routes/index.jsx`: canonical routes; legacy routes retained.
- `frontend/src/pages/organizer/competition/CompetitionTabulationPage.jsx`: aliases,
  section anchors and existing boundary wrapper.
- `frontend/src/utils/tabulationNavigation.js`: section metadata and destinations.
- `frontend/src/utils/competitionNavigation.js`: context-preserving sidebar links.
- `frontend/src/hooks/useCompetitionContext.js`: preserve anchors while selecting
  or normalizing a competition/round.
- `frontend/src/components/organizer/competition/TabulationSection.jsx`: shared
  accessible section container.
- `frontend/src/components/organizer/competition/TabulationWorkspaceNavigation.jsx`
  and `.css`: same-page shortcuts, progression context and responsive navy styling.
- `frontend/src/components/organizer/competition/NativeTabulationWorkspace.jsx`:
  render ordered areas from one existing workspace and guarded progression.
- `backend/src/services/competition-native-tabulation.service.js`:
  retry eligible missed or failed automatic calculations when the native
  tabulation workspace reloads.
- `backend/src/database/migrations/133_competition_organizer_finalization.sql`:
  make independent verification optional and expose current calculations even
  when reviewer assignment is absent or inactive.
- `frontend/src/components/organizer/competition/CompetitionTabulationWorkspace.jsx`:
  continuous legacy views using the existing data and actions.
- `frontend/src/components/organizer/competition/NativeResultsWorkspace.jsx`:
  authorized context for the terminal-results handoff.
- Related tests: NativeTabulationWorkspace, CompetitionTabulationWorkspace,
  NativeResultsWorkspace, PageantLayout.navigation and useCompetitionContext.

No database files, migrations, API service contracts, scoring formulas,
calculation rules, validation rules, permissions or authentication were
changed. No application mock data was introduced.

## Verification

- 143 focused frontend tests passed across native and legacy tabulation,
  navigation, context selection, boundaries, result publication and Live
  Control. An additional 27 focused backend tests passed for calculation,
  recovery, review and advancement guards.
- Coverage includes simultaneous section rendering, one shared snapshot, old URL
  aliases, retained context, finalization gating, confirmed next-round handoff,
  terminal results and standalone audit navigation.
- Production build passed with the existing large-chunk advisory. Focused
  frontend ESLint was run during the navigation work.
- A navigation-only Chrome inspection passed at 1440, 1024, 390 and 320 pixels.
  All three sections stayed present when using shortcuts; Audit Trail stayed
  outside Tabulation; no horizontal page overflow was detected.
- Browser inspection used the real navigation/section components without loading
  event or score data. Signed-in live database end-to-end behavior was not tested.
  Existing mocked-service component tests exercised the real scoring and result
  sections and action guards.
- Local screenshots and browser report:
  `.tmp/votrix-native-dev/continuous-reporting/`. Temporary preview source files
  were removed after inspection.
