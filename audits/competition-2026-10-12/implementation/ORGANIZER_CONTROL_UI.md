# Organizer competition control UI

Implemented October 13, 2026. This change is limited to frontend organizer control presentation and orchestration of existing authorized service calls. Backend, migrations, API contracts, authentication, judge assignments, event structure, calculation formulas and the judge score sheet were not changed for this task.

## Workflow

1. A published competition without a session opens **Stage Lineup & Scoring Access**. Choose a configured round, arrange its eligible contestants using drag or up/down controls, optionally group performers, and plan entry and major-criterion access. Weights come from saved criteria. Every eligible entry must occupy exactly one slot before saving; a draft slot removal does not remove participation.
2. **Save Stage Lineup & Continue to Live Session** persists the actual lineup through `workflowService.action(eventId, 'lineup-save', ...)`. Successful confirmation enables Live Session. Failed saving retains preparation and does not start judging. Local planned choices are keyed by owner, event and published rules; recovery requires a matching authoritative saved lineup.
3. As approved by the user, access choices are **planned before startup and applied after startup**. Existing operations execute Start → Pause → select prepared round → activate saved lineup → apply entry and criterion gates → Resume. These are separate requests, not an atomic transaction. Initial startup retains the backend's existing behavior until Pause succeeds. Configuration failure attempts to pause, refetches actual state and reports partial completion without automatically resuming. No guarantee of successful pause is made when the pause request itself fails.
4. Live Session shows saved status, round, start time, presentation slot, previous/next presentation controls, pause/resume/end actions, configured criteria weights and individual access gates. Division filters/search only alter display and preserve the complete open-entry set when toggling a visible contestant. A zero-entry/criterion selection uses the existing explicit `none` gate.
5. Existing advanced tools remain available for submission windows, intersection access, alternative lineup options, authorized correction and reopening. The existing judge progress matrix remains on the live step. Tabulation is linked separately from performance closure and submission.

## Files

- `frontend/src/components/organizer/competition/CompetitionControlSteps.jsx`: guided preparation and live controls.
- `frontend/src/components/organizer/competition/CompetitionLiveWorkflowPanel.css`: scoped responsive layout and subtle configured gender/division coloring.
- `frontend/src/components/organizer/competition/CompetitionLiveWorkflowPanel.jsx`: original tools retained as `ExistingLiveWorkflowTools` for advanced operations.
- `frontend/src/pages/organizer/competition/CompetitionLiveControlPage.jsx`: mounts the new control steps for versioned sessions and published setup; preserves legacy controls and common monitoring.
- `frontend/src/components/organizer/competition/CompetitionControlSteps.test.jsx`: ten focused component/service-boundary regressions.
- `frontend/src/pages/organizer/competition/CompetitionLiveControlPage.repair.test.jsx`: existing parent tests point to the new child component mock.

## Verification and limits

- Full frontend suite: **259 passed, 38 files**. Run with process-only `VITE_LOCK_PARTICIPANTS_ON_ACTIVE=true`, preserving the existing environment files.
- Focused preparation/startup/filtering/recovery/presentation and parent correction/retry tests: **13 passed** (included in the full-suite count).
- Frontend lint: **zero errors, three existing `useDelayedLoading.js` warnings**.
- Frontend production build: passed; existing large-chunk warning remains.
- Isolated headless Chrome fixture exercised actual components with local recording services at **1280px and 390px**. Both steps showed six individual rows, configured 40/30/20/10 weights, distinct male/female tints and no horizontal page overflow. Screenshots are in `.tmp/organizer-step-{1,2}-{1280,390}.png`; fixture files were removed and Chrome/Vite stopped.

These are local frontend and mocked-service checks. No production database mutation, migration, email, backend startup or authenticated multi-user deployed competition was performed. Real organizer/judge propagation continues to depend on the existing authorized backend and synchronization layer and must be verified in an isolated full-system environment.
