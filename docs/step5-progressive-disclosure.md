# Step 5 UI refactor — October 17, 2026

The supplied illustration and brief guide the information hierarchy. Step 5 now begins with Selected Competitions. Configure/Edit Configuration opens one competition; a successful validated save returns to the list. Status comes from the existing saved configuration readiness checks, including every required round.

## Reused implementation

- `NativeSetupWorkspace`: existing service reads, independent child identities, setup revisions, frozen-edit protection, request-generation guards, validation, unsaved-change guards, and save/update requests.
- `RoundsScoringEditor`: existing rounds, criteria, minor criteria, deductions, ordering, and round conversion.
- Shared `setupReadiness`, criterion readiness, and progression checks: required totals and configuration validity.
- Shared `Modal`, `Button`, design tokens, and `StageFooter`.
- Actual `CompetitionScoringForm` and official calculation code: local preview inputs and weighted totals.
- `ScoringMethodExample`: fictional educational data and calculation samples, without database records.

## Resulting interaction

1. Open one competition from the list.
2. Choose single or multiple rounds. Existing rounds retain their identities. Round editing and planned rosters open on demand.
3. Select a round to see its compact criterion rows, weights, ranges, and optional minor count.
4. Add/edit a criterion in a centered dialog capped at 672px, with the wide name input and narrow percentage input on the same row. Minor criteria appear only when selected. Cancel discards its local edits, including minor changes. Save validates names, ranges, major allocation, and weighted minor totals. Unfinished minor forms block criterion submission.
5. Configure ranges only in Add/Edit Criterion; choose Default (1–10), 1–100, decimal, or custom. The default option is the 1–10 preset, with no separate global configuration. New major criteria start at 1–10. Custom numeric bounds appear only when selected. Existing major/minor ranges and precision are preserved.
6. Open compact Other Settings disclosures as needed. The final round and single-round competitions render no advancement or outgoing score-handling controls.
7. Open the judge preview in a separate scrollable dialog. It starts on the selected round, uses actual configured inputs, and discards local scores and locks on close. Preview controls make no API requests.
8. Save & Return validates all configuration sections before using the existing configure endpoint and observed setup revision. A rejected request retains the editable draft.

## Existing model constraints retained

Tie rules, input/result precision, and the main result calculation method are competition-wide. The UI labels their scope. Existing round calculation overrides remain available under an advanced disclosure. Stored competition fallback-range values remain intact for compatibility; the UI configures explicit criterion/minor ranges.

Score handling uses the existing competition-wide progression model and per-round contribution percentages. With two rounds, 40/60 contributions implement the requested example. With more rounds, the UI exposes all contributions rather than pretending that the contract supports independent percentage pairs for each transition.

Deductions retain round/criterion scope. Existing competition-final deduction rules remain accessible in a separate disclosure. Disabling one round's rules preserves other rounds' rules. Existing approval/application semantics are unchanged.

No scoring-engine, shared-validator, API, authentication, database, event-creation, entry-management, judge-assignment, or tabulation changes were made by this refactor. The native setup feature gate and legacy dispatch remain in place.

## Files

- `frontend/src/components/organizer/competition/NativeSetupWorkspace.jsx`
- `frontend/src/components/organizer/competition/RoundsScoringEditor.jsx`
- `frontend/src/components/organizer/competition/RoundsScoringEditor.css`
- `frontend/src/components/organizer/competition/CalculationPreview.jsx`
- Updated workspace/editor tests and new `RoundsScoringConfiguration.test.jsx`.

## Verification

- Seven related frontend test files: 68 passing tests covering setup, review, native boundaries, the real judge form, and the native judge workspace.
- The Mr. Campus scenario creates Preliminary/Final, all specified major weights, 40/60 minor weights, a round-scoped deduction, top-10 advancement, and 40/60 round contributions. It checks independent round criteria, final-round controls, readiness, preview totals, and resetting preview inputs.
- Competition isolation, invalid-save blocking, cancelled criterion edits, rejected-save recovery, custom ranges, copying identities, and no-weight minor behavior are covered.
- Scoped ESLint and production build pass. The build retains the existing large-chunk warning.
- Headless Chrome checks at 1440, 768, and 390 pixels use the real workspace/editor/components with isolated test service fixtures and production CSS. Checks cover page/dialog bounds, collapsed settings, criterion drawer footer visibility, configured minor weights, current-round preview, empty independent Folk Dance setup, primary button styling, and zero application API requests/runtime exceptions.
- Browser screenshots and the result JSON are in `.tmp/step5-refactor-evidence/`. Browser fixture HTML/JSX are verification-only, outside the production entry.

Live backend/database save behavior was not re-exercised in this UI refactor. Save request identities, revisions, success, and rejection behavior were verified at the frontend service boundary.
