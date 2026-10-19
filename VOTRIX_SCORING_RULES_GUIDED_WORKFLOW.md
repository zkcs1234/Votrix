# Compact Guided Scoring Rules Workflow

Implemented in the VOTRIX working tree on October 12, 2026. This replaces the previous four-section scrolling Scoring Rules page with three progressive states. The sidebar, top navigation, event wizard, Structure & Scoring tabs, scoring engine, API, and official publication lifecycle remain in use.

## Three visible states

Only the current stage is rendered. The review summary is absent from Choose and Configure.

### Step 1 — Choose and understand

The organizer sees **How should results be calculated?**, one full-width native dropdown, a concise method explanation, and **See how it works** immediately below it.

The six supported labels retain their existing backend values:

| Label | Backend value | Fictional example |
|---|---|---|
| Average of judge scores | `weighted_average` | `(90 + 86 + 92) / 3 = 89.33` |
| Sum of judge scores | `sum` | `90 + 86 + 92 = 268` |
| Rank-based placement | `rank_based` | John: 1,2,1 → 4; Mark: 2,1,2 → 5; Paul: 3,3,3 → 9 |
| Highest judge score | `highest_score` | 90,86,92 → 92 |
| Remove extreme scores | `lowest_removal` | Illustration with one highest and one lowest removed: 90,86,92 → remaining 90 |
| Manual official results | `manual` | Sample documented placements with required authorized entry and independent approval |

The dropdown placeholder is **Select a calculation method**. **Not yet decided — Save Draft** is a small secondary choice; it selects the undecided state. The separate **Save Draft** action performs the save. Neither dropdown selection nor the undecided selection persists automatically or advances the stage.

Continue to Settings is enabled only for a supported selected method. It opens Configure without an API save. Saved unknown legacy methods remain visible as a disabled retained choice and must be explicitly replaced before new official confirmation.

Every numeric example still uses `calculateOfficial`. Individual judge placements are obtained by calling that engine with one fictional judge at a time. The rank fixture now produces the requested 4/5/9 sums. No sample object is placed in form settings or sent to the backend.

The extreme-removal introduction is an explicitly labeled illustration using three fictional judges and one removed total at each extreme. It does not change the organizer's actual removal counts or require judges to be enrolled before the method can be understood. Actual counts are configured and validated in Configure. Valid saved precision is reflected in the example; an unfinished invalid precision uses a two-place educational fallback.

### Step 2 — Configure the selected method

The heading is **Configure [Selected Method]**, with a compact **Change Method** action in the same header. Existing settings components and supported policies are reused.

- Only extreme removal shows highest/lowest removal counts and panel validation.
- Numeric methods retain precision in collapsed advanced settings.
- Score-based methods retain shared rank / highest-major comparison; rank-based results explain their fixed supported shared-rank behavior.
- Back-to-Zero Finals explain why Final alone determines placements. Weighted rounds describe combined contributions, and carry-forward retains its distinct meaning.
- Result-round selection appears only where multiple rounds or an unavailable saved choice make it relevant. A single unambiguous round uses an explanation.
- Division controls appear only for enabled divisions and use their actual names.
- **Require a second person to review results** includes **Assign reviewer later in Judges**. A missing reviewer does not prevent preparation or confirmation of the scoring configuration; it remains a publication prerequisite.
- Manual results require a documented official basis and independent review, with no automatic score formula or numeric precision control.
- The existing optional penalty editor retains explicit rule amounts, references, units, and removal behavior. Its round-to-penalty deep link opens Configure for an already selected supported method.

**Back** returns to Choose without resetting entries. **Save & Review** validates the current configuration and opens Review locally. It does not perform a backend write, finalize results, or publish the event. The page explains that final confirmation saves the prepared settings. Save Draft remains available separately.

Invalid settings keep the organizer in Configure. Messages appear beside the relevant setting. The first invalid field receives focus, and its enclosing advanced/penalty details are opened when necessary. Validation covers the existing supported method, tie policy, precision, removal constraints, result source, manual basis, and penalty configuration.

### Step 3 — Review and confirm

**Review your scoring rules** appears only after successful Save & Review. It summarizes the current method, result source, ties, division scope, review requirement, reviewer status, penalties, and relevant precision.

The organizer must acknowledge **I confirm these settings match the official competition rules.** before **Confirm Configuration** is enabled. Confirmation is tied to the exact reviewed settings. Edit Settings returns to Configure; a subsequent change invalidates the prepared review and previous acknowledgement.

Confirm Configuration calls the existing `pageantService.setScoringConfig` API with the current configuration and `confirmed=true`. It shows a loading state and reports success only after the backend response and confirmation reload. Its success text explicitly says the event is published later in Review & Publish.

Published settings can be inspected through the stages, but controls stay disabled and confirmation/save actions are unavailable. The authorized amendment process remains unchanged.

## State, saving, and navigation

The existing saved configuration is restored on entry, with a clear saved-draft or confirmed status. The initial view is Choose, so even a saved confirmed configuration does not display the Review summary prematurely.

The editor remains mounted while moving between Structure & Scoring tabs. Within the editor, entries remain in React state while moving between Choose, Configure, and Review.

`useScoringRulesRecovery` also preserves unfinished settings under the existing competition draft storage namespace, scoped to the organizer and event. It reuses existing logout cleanup. After leaving and returning, unsaved settings are restored with acknowledgement cleared. A former Review state restores to Configure and must pass Save & Review again. A changed saved baseline produces a conflict warning rather than silently merging or saving stale choices.

Local recovery is not a backend save, official confirmation, or publication. Authentication tokens are not stored by this hook. Browser unload warns when unsaved changes exist; navigation away can recover the local settings. Explicit Save Draft uses the existing backend persistence.

Save errors preserve the current values. A failed refresh after a successful write is recovered with a read-only reload rather than another write. External saved changes cannot silently overwrite local edits. Published configurations do not restore an editable local draft.

The existing wizard navigation policy is retained: a successfully saved draft may continue to Contestants with an explicit incomplete-step message. Unsaved changes and saving/error states block that footer action. Confirmed rules with a deferred reviewer identify the pending Judges requirement. Final Review & Publish continues to require complete confirmed rules, criteria, contestants, judge/round setup, and any required reviewer; existing backend checks remain authoritative.

## Layout and footer

The content uses one comfortable `max-w-3xl` column, normal field sizes, the existing purple accent, white cards, and VOTRIX input/Button components. The large radio-card grid and permanently stacked example/configuration/review panels are gone.

Choose has a compact inline example. Configure shows only its settings. Review shows only its summary and acknowledgement/actions. Example tables can scroll horizontally; the page has no nested vertical scrolling.

The outer workspace footer remains separate from the three inner stages. Scoring rules now uses the existing sticky footer portal, alongside Criteria. ResizeObserver measures footer height and reserves page clearance. Both mobile footer actions fill the available width. Rounds and Divisions retain their footer in document flow. `ModuleStageLayout` still prevents duplicate workspace footers.

## Files changed

| File | Change |
|---|---|
| `frontend/src/components/organizer/competition/CompetitionRulesEditor.jsx` | Three-stage flow, native dropdown, local review staging, acknowledgement binding, focused/localized validation |
| `frontend/src/components/organizer/competition/ScoringMethodExample.jsx` | Compact method explanations/formulas, requested rank example, independent fictional removal illustration |
| `frontend/src/hooks/useScoringRulesRecovery.js` | Organizer/event-scoped local recovery using the existing competition draft namespace and unload handling |
| `frontend/src/pages/organizer/competition/CompetitionWorkspacePage.jsx` | Sticky Scoring footer with measured clearance and full-width mobile continuation |
| `frontend/src/components/ui/ModuleStageLayout.jsx` | Updated footer ownership comment |
| `frontend/src/components/organizer/competition/CompetitionRulesEditor.test.jsx` | Guided stages, examples, validation focus, review/confirmation, drafts, saved data, recovery and stale-source tests |
| `frontend/src/pages/organizer/competition/CompetitionWorkspacePage.test.jsx` | Dropdown-based interaction and local-storage isolation in existing workspace tests |
| This report and `VOTRIX_SCORING_RULES_REDESIGN.md` | Current workflow report and a note identifying the previous design as superseded |

Reused components/services include `Button`, VOTRIX input/label classes, `ScoringPenaltyRules`, `ScoringMethodExample`, `pageantService.setScoringConfig`, existing workspace tabs/navigation, and the existing shared configuration validator.

## API, schema, and scoring behavior

There are **no API, route, schema, migration, backend, or scoring-formula changes in this compact-workflow task**. The existing PATCH scoring-config contract is used for Save Draft and Confirm Configuration. Save & Review performs no persistence.

SHA-256 comparisons with the pre-task snapshot confirmed that `shared/competition-calculation.js`, `shared/competition-rule-configuration.js`, and `backend/src/services/competition-workflow.service.js` are unchanged.

The interface exposes existing tie procedures only. Mandatory official tie deliberation and exact-N cutoff resolution from the illustrative wireframe are not supported backend policies, so they are not offered as working choices. Shared cutoff ties still advance together under the published rules and the existing explicit qualifier-review procedure.

## Verification

- Full frontend suite: **137 passed** across 16 test files.
- Focused editor/workspace checks: **49 passed**; final editor/workspace/Review & Publish checks after layout polish: **54 passed**.
- Production build passes; the existing warning about chunks above 500 kB remains.
- Focused ESLint and whitespace checks pass.
- Actual rendered `PageantLayout` / `AppShell` / `ModuleStageLayout` was inspected with headless Chrome at **1536, 1280, 1024, 768, and 390px**. All three stages were tested at each width. Checks cover a single visible stage, requested 4/5/9 rank sums, dropdown keyboard input, no write during staging, explicit confirmed save, deferred reviewer, localized mobile validation/focus, sticky-footer clearance, no page horizontal overflow, and no nested vertical scrollbars.
- Screenshots were inspected and are stored under `.tmp/rules-guided-*.png`.
- Browser testing used local fixtures with mocked API methods. Application API requests were blocked; none occurred. No runtime exceptions occurred. The pre-existing collapsed-sidebar nested-link warning remains outside this task.
- No backend server, connected Supabase operation, real judge submission, email, or deployment was executed. Temporary preview pages were removed, and the preview server/browser were stopped after testing.

Remaining boundaries are the existing unsupported tie-deliberation/exact-N policies, the existing build-size warning, and the existing sidebar link warning. No new official scoring procedure is implied by this UI change.
