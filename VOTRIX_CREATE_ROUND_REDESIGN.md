# VOTRIX Create Round redesign

This report describes the earlier version. The current compact layout is documented in [VOTRIX_ROUNDS_COMPACT_LAYOUT.md](VOTRIX_ROUNDS_COMPACT_LAYOUT.md).

Implemented on October 12, 2026. The Rounds tab now follows the requested hierarchy: Competition Rounds introduction, a single-column Create a Round form, Your Rounds cards, and progressive settings. The shared sidebar, event stepper, event routes, workspace tabs, and existing scoring engine remain in use.

## Existing implementation inspected

The prior `RoundsTab` used a compressed grid containing purpose/scoring dropdowns, name, an always-visible percentage, optional category/division selectors, and the create action. It also showed a global setup checklist and a round-weight total warning before contestants, judges, or criteria were configured. Its criteria links did not select a specific round.

The existing create/update round endpoints already accept `purpose`, `progression`, `weight`, category/division, advancement settings, score policy, and next-round ID. Purpose/progression are stored in `competition_rounds.workflow`, introduced by migration 087. The backend mapper and validators expose these fields, and the official calculation engine supports a single independent round without a contribution weight.

## Files changed

Paths are relative to the repository root.

| File | Change |
| --- | --- |
| `frontend/src/pages/organizer/competition/CompetitionWorkspacePage.jsx` | Replaced the old round form/settings implementation; removed the global checklist; made tab/round navigation URL-aware; added scrolling/keyboard workspace tabs, reliable reloads and wrapping footer controls |
| `frontend/src/components/organizer/competition/CompetitionRoundsTab.jsx` | New round list, confirmed creation feedback, next-step actions, edit/delete/reorder controls and saved-record handling |
| `frontend/src/components/organizer/competition/CompetitionRoundForm.jsx` | New single-column create/edit form with native radio cards, conditional contribution input, optional existing scopes and inline validation |
| `frontend/src/components/organizer/competition/CompetitionRoundSettings.jsx` | New progressive details, advancement and next-round/Back-to-Zero editors; links to existing criteria, penalty and live-control interfaces |
| `frontend/src/utils/competitionRoundForm.js` | Friendly labels, contribution grouping, create defaults and partial edit payloads |
| `frontend/src/components/organizer/competition/CriteriaManager.jsx` | Accepts and synchronizes a selected round ID while retaining the existing major/minor criterion editing and assignment operations |
| `frontend/src/components/organizer/competition/CompetitionRulesEditor.jsx` | Opens the existing deduction editor when reached from a round's Configure penalties action |
| `frontend/src/index.css` | Scoped primary-button text contrast for the round interface and its workspace footer |
| `frontend/src/pages/organizer/competition/CompetitionWorkspacePage.test.jsx` | Sixteen integration tests for persistence, navigation, validation, settings, existing data and published-event protection |

## Layout and interaction

The round name comes first. Purpose and score use are separate, explained radio groups. New rounds default to Score contestants or entries and Count separately. The contribution input appears for Combine with other rounds. Existing categories/divisions appear only when available.

A round card appears only after a successful create response supplies the actual saved ID. The success message names the persisted round. Configure Scoring Criteria switches the existing workspace to Criteria with `?tab=criteria&roundId=<saved ID>`. The same ID is restored when opening a deep link; the existing editor loads the round's assigned criteria without a duplicate editor.

Create Another Round returns focus to the name field. More Settings stays within the workspace. Details, advancement and progression editors open immediately below their corresponding action, with focus on the first field. Penalty configuration opens Scoring rules and expands its existing deduction editor. Live judging configuration links to the existing `/live` route after setup publication; its prerequisites are shown before then.

The interface reuses Button, the VOTRIX input/label classes, design tokens, icons, ReadOnlyEventBanner, CriteriaManager, CompetitionRulesEditor and the existing stage navigation. Native radios support keyboard selection. Workspace tabs support arrow/Home/End navigation and horizontal scrolling at narrow widths; footer actions wrap.

## API/schema compatibility and validation

No backend, API, database or scoring-engine changes were made for this redesign. No additional Supabase migration is required beyond the existing competition workflow schema.

| Friendly UI choice | Existing backend value |
| --- | --- |
| Score contestants or entries | `purpose: regular` |
| Select qualifiers | `purpose: qualification` |
| Determine final winners | `purpose: final` |
| Count separately | `progression: back_to_zero` |
| Combine with other rounds | `progression: weighted` |
| Add earlier rounds' scores in advanced settings | `progression: carry_forward` |

New independent rounds send weight zero and do not require combined weights. Combined contributions are finite, positive and within the available category/event-wide contribution group. Editing excludes the current round from its own group's total. Publication retains the backend's existing final-total checks.

Name-only edits send only the changed name, preserving stored contributions, purpose, progression, advancement, score policy, scopes and memberships. Existing special awards retain their saved fields and are summarized as separate award scoring. Changing an existing final to Back to Zero requires an explicit Save progression action and does not rewrite its hidden stored weight. Published/finalized round mutations remain disabled.

Advancement inputs validate positive whole counts, percentages up to 100 and finite nonnegative score thresholds. Failed requests keep entered values and show inline errors. Confirmed records remain visible if refreshing the list fails. No-op edits do not send an empty PATCH.

## Verification

| Check | Result |
| --- | --- |
| Round workspace integration scenarios | 16 passed |
| Full frontend test suite | 85 passed across 13 files |
| Existing official calculation and round-validator regression suites | 28 passed |
| ESLint on all changed JavaScript/JSX files | Passed |
| Production frontend build | Passed; existing large-chunk warning remains |
| Browser checks at 1280, 768, 390 and 320px widths | Passed; no horizontal overflow in create/combined forms or mobile settings/edit forms |
| Browser interaction checks | Confirmed creation, returned-ID Criteria navigation, progressive settings and native keyboard radio selection passed without runtime errors |
| Existing backend competition service | Byte-for-byte unchanged from the start-of-task snapshot |

Frontend tests used `VITE_LOCK_PARTICIPANTS_ON_ACTIVE=true` for the existing policy regression expectation; the application environment file was not changed. Browser checks used isolated API fixtures with the real workspace/components, and confirmed that no real application API requests were sent. No competition, account, score, email or Supabase record was created/changed by these checks. Authenticated live backend/database acceptance was not performed for this UI task.

Screenshots and temporary test files under `.tmp/` are local verification artifacts, not release files. Temporary frontend preview files were removed and the preview server was stopped after verification.
