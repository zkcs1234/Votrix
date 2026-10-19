# Official Scoring Rules UI Redesign

**Superseded UI layout:** The subsequent [Compact Guided Scoring Rules Workflow](VOTRIX_SCORING_RULES_GUIDED_WORKFLOW.md) replaces the four-section scrolling layout below with three progressive stages and a method dropdown. Backend safeguards and the manual-advancement fix documented here remain in place. Scoring rules now shares the measured sticky footer portal with Criteria.

Implemented in the VOTRIX working tree on October 12, 2026. Structure & Scoring → Scoring rules now explains the organizer's decision before showing its settings, an educational example, and the confirmation summary.

## Interface and components

The page retains the existing `PageantLayout`, `AppShell`, `ModuleStageLayout`, sidebar, top navigation, event stepper, and workspace tabs. Its title is **Official Scoring Rules**, with the description **Choose how judges' scores will be calculated, reviewed, and used to determine winners.**

Four separate sections replace the original large form card:

1. **Choose how results are calculated:** six compact native radio cards, with Not yet decided as a smaller draft choice below them. Selection has a purple border/background, native radio state, and visible keyboard focus. Desktop uses two columns; mobile uses one.
2. **Configure the selected method:** only relevant controls and short explanations appear. Source and reviewer choices use existing saved IDs.
3. **See how it works:** fictional examples computed with the existing official calculation engine. Examples never call a score-submission API or save sample records.
4. **Review and confirm:** a compact summary of the current form values, confirmation checkbox, Save Draft, and Save Scoring Rules.

Existing `Button`, input/label tokens, Tailwind styles, purple accent, white cards, subtle borders, and muted helper text are reused. No framework, dependency, or image asset was added. Sections and the penalty editor have scroll clearance for the shell header. Example tables may scroll horizontally; the page has no nested vertical scrolling.

The workspace footer preserves **Back: Divisions** and **Continue to Contestants**. It remains in document flow on Scoring rules, after the content, with full-width mobile actions. Criteria retains its separate sticky footer behavior. There is no additional overlaid scoring footer.

## Method mappings and examples

| User-facing name | Existing backend value | Educational example |
|---|---|---|
| Average of judge scores | `weighted_average` | Judge totals 90, 86, 92 → 89.33 |
| Sum of judge scores | `sum` | 90 + 86 + 92 → 268 |
| Rank-based placement | `rank_based` | John: 1,3,2; Mark: 2,1,3; Paul: 3,2,1 → each sum 6, sharing rank 1 |
| Highest judge score | `highest_score` | 90, 86, 92 → 92 |
| Remove extreme scores | `lowest_removal` | With valid configured counts of one high and one low: 90, 86, 92 → 90 |
| Manual official results | `manual` | Fictional documented placements, independently reviewed; no numeric formula |
| Not yet decided | `undecided` | Draft explanation; no official result preview |

`ScoringMethodExample` invokes `shared/competition-calculation.js` for numeric results. For rank-based judge placements, it invokes the same engine with one fictional judge at a time. There is no second score calculation implementation.

Extreme-removal examples use the actual configured removal counts and a fictional panel small enough to be available under the current panel configuration. Invalid counts or an absent scoring panel produce an explanatory pending state. They never display missing values as zero. Examples illustrate aggregation for one scoring scope; the round-policy explanation describes how round results become the overall result.

The official calculation engine file was compared with its pre-task snapshot by SHA-256 and is **unchanged**.

## Conditional fields and wording

| Original control or concept | New presentation |
|---|---|
| Official method dropdown | Selectable method cards with concise explanations |
| Official overall result round (for independent finals) | Which round determines the winners? |
| Tie policy | What happens if contestants tie? |
| Rank and advance separately per division | Calculate winners separately for each division |
| Require independent verification | Require a second person to review the results |
| Appointed verifier | Who will review the results? / Assign reviewer later |
| Predefined deductions (disabled when empty) | Deductions and penalties / Configure Penalty Rules |
| Decimal places | Collapsed Advanced: score precision |

- Removal counts appear only for extreme-score removal.
- Numeric precision appears for numeric methods, including rank-based source judge totals. It is hidden for manual and undecided methods.
- A reviewer selector appears when a second-person review is required. Penalties also require an authorized approver; when result review is optional, the label makes the penalty-approval purpose explicit.
- Manual results show the official source/documentation procedure and mandatory independent review. They do not display an automatic score formula or numeric tie-breaker selector.
- Division ranking appears only when divisions are enabled. Actual saved names are used, including custom divisions. Existing hidden configuration values are retained rather than cleared on mount.
- Not yet decided shows its draft explanation and permits Save Draft. Confirmation/publication remains unavailable.

## Round and tie semantics

The UI describes the existing engine's round policy without changing any round configuration:

- **Back to Zero:** the actual resolved Final is visibly selected when applicable, and the page explains that Final alone determines placements. A saved automatic `finalRoundId=null` stays null until the organizer explicitly changes its selection.
- **Combined results:** existing round contributions are explained. The UI does not force an individual winner-determining round. An optional change-source action remains available where meaningful.
- **Carry-forward:** the page explains that earlier applicable round results are added through the selected final round, without applying round contribution weights in that branch.
- **One round:** an informational explanation replaces an unnecessary result selector.
- **Independent awards:** their saved names and separate standings are explained; they are excluded from new ordinary main-source choices. An existing explicitly saved award source remains visible rather than silently being reset.

Only implemented tie procedures are offered:

- **Share the same rank** preserves standard competition ranks.
- **Compare the highest major average** describes the existing numeric tie-breaker precisely.
- Rank-based placement explains both tied individual judge placements and tied combined rank sums, with its supported shared-rank rule.
- Cutoff advancement is explained separately: all contestants still tied at a Top N or percentage cutoff advance, so the count can exceed the planned count.

**Exact-N qualification and mandatory authorized tie deliberation are not implemented policies in the existing backend.** They were not added as working options. The existing qualifier review/override procedure remains separate. The interface does not promise an exact Top N count or a new automatic tie-resolution workflow.

## Draft, confirmation, and publication

Method selection changes local form values only. It does not persist automatically.

An unconfirmed saved method is now preserved instead of being reset to undecided. Existing unknown legacy methods remain visible as retained saved configuration and must be explicitly replaced with a supported method before confirming new official rules.

Changing a rule clears its confirmation and marks the form unsaved. The scoring editor remains mounted while switching workspace tabs, so ordinary tab navigation preserves unsaved choices. A concurrent foundation refresh cannot silently replace local edits; the organizer is offered an explicit **Use latest saved settings** action.

Save behavior is distinct:

- **Save Draft:** stores the selected or undecided method and unfinished reviewer/penalty setup with `confirmed=false`. Basic numeric and record-shape validation still applies. Missing reviewer enrollment does not block a draft save.
- **Save Scoring Rules:** requires a supported selected method, valid method-specific configuration, and confirmation of the current form values. Reviewer assignment may still be deferred because Judges is later in the wizard.
- **Publication readiness:** additionally requires the active authorized reviewer, relevant panel validation, criteria, contestants, scoring judges, assignments, round prerequisites, and the existing backend publication checks.

Success is shown only after the save API confirms the stored configuration. Navigation stays blocked for unsaved changes, pending writes, failed saves, source conflicts, or a failed post-save refresh. A failed refresh is recovered with a read-only reload, not another write.

After a successful saved draft, Continue to Contestants is permitted with an explicit **step remains incomplete** message. Confirmed settings with a deferred reviewer show the pending Judges requirement. Review & Publish blocks undecided, unconfirmed, invalid, or reviewer-incomplete configurations, and the backend independently enforces those checks.

## Backend safeguards and correctness fix

`shared/competition-rule-configuration.js` contains shared configuration checks and descriptions. It does not calculate scores. It covers supported methods, precision/removal settings, valid result-round references, legitimate penalty units/references, and eligible reviewer assignment. Manual results retain the existing SQL rule that independent approval is mandatory, even if a historical optional flag was stored as false.

Backend changes:

- Save validation rejects malformed confirmation flags, unsupported tie policies, invalid identifier types, invalid penalty record lists, duplicate rule IDs, and unsupported penalty units.
- Partial configuration updates clear an old confirmation unless the current values are explicitly reconfirmed. Undecided is always unconfirmed.
- Confirmed saves validate method-specific configuration while allowing deferred reviewer enrollment. Official publication rejects missing or inactive reviewers and invalid configuration.
- Judge foundation data now includes account status, so only active enrolled score reviewers distinct from the preparing organizer are offered.
- Configuration saves reject an existing official rule version, and the database UPDATE additionally requires draft status and a null official rule ID. Publication racing the save therefore cannot mutate a newly published event's configuration.
- Historical rule versions, scores, round configuration, and result snapshots are not rewritten.

The previous analysis identified a manual-results advancement defect: live manual tabulation had no numeric results and `ready=false`, so advancement rejected even a verified manual calculation. `advancementData` now reads the existing manual result snapshot for the selected round. It requires positive entered placements, a verified eligible calculation status, current source digest, and no pending decisions. The existing qualifier helper and authorized SQL advancement operation then use those saved ranks. Unverified and stale snapshots are rejected. No new placement formula is introduced.

## Actual files changed

| File | Change |
|---|---|
| `frontend/src/components/organizer/competition/CompetitionRulesEditor.jsx` | Four-section editor, method cards, progressive settings, draft/confirmation handling and review summary |
| `frontend/src/components/organizer/competition/ScoringMethodExample.jsx` | Fictional examples through the existing official engine |
| `frontend/src/components/organizer/competition/ScoringPenaltyRules.jsx` | Optional penalty editor, explicit amounts/units, guarded removal and deep-link support |
| `frontend/src/pages/organizer/competition/CompetitionWorkspacePage.jsx` | Page title, retained scoring draft across tabs, saved-state footer navigation |
| `frontend/src/pages/organizer/competition/CompetitionReviewPage.jsx` | Required rule/reviewer readiness before publication |
| `shared/competition-rule-configuration.js` | Shared method labels, source explanations, reviewer/panel eligibility and configuration readiness |
| `backend/src/validators/competition.validator.js` | Strict scoring-config shapes and supported policy validation |
| `backend/src/services/competition.service.js` | Confirmation invalidation, confirmed-save checks, publication-race guard and account-status metadata |
| `backend/src/services/competition-workflow.service.js` | Shared publication checks and verified manual advancement snapshot source |
| `backend/src/services/competition-session.service.js` | Manual-aware advancement preview |
| `frontend/src/components/organizer/competition/CompetitionRulesEditor.test.jsx` | All method examples, controls, saving, reviewer deferral, existing data and immutable rules |
| `frontend/src/pages/organizer/competition/CompetitionWorkspacePage.test.jsx` | Penalty wording/deep link, draft retention and footer blocking/continuation |
| `frontend/src/pages/organizer/competition/CompetitionReviewPage.test.jsx` | Complete saved configurations, deferred reviewer and undecided publication blocking |
| `backend/__tests__/modules/scoring-rule-configuration.test.js` | Shared readiness, round policies, reviewer/panel eligibility and penalty units |
| `backend/__tests__/services/scoring-config-save.test.js` | Save confirmation, deferred review, preserved settings and immutable/racing publication |
| `backend/__tests__/services/manual-advancement.test.js` | Verified manual standings, cutoff ties, unverified/stale rejection |
| `backend/__tests__/services/criteria-publication.test.js` | Missing/inactive required reviewer rejected at publication |
| `backend/__tests__/validators/competition.validator.test.js` | Strict field types and incomplete but well-formed penalty drafts |
| This implementation report and the scoring analysis report | Implementation record and historical-analysis note |

## Verification and remaining boundaries

- Full frontend suite: **133 passed**. The updated editor suite subsequently passed **26 tests**, including one additional blank-number regression; **134 unique frontend tests** have passed across these checks.
- Full backend suite: **423 passed, 3 existing skips**. An initial concurrent frontend-build/backend-test run timed out in a backend import hook; that suite passed independently and the entire backend suite passed on the subsequent run. Required targeted configuration/save/manual-advancement checks also passed after the final validation adjustment.
- Production build passes. The existing warning about chunks above 500 kB remains.
- Focused ESLint and whitespace checks pass.
- Headless Chrome rendered the real `PageantLayout` / `AppShell` / `ModuleStageLayout` with local fixtures at **1536, 1280, 1024, 768, and 390px**. Method card columns/stacking, four-section content, native keyboard selection, actual-engine results, draft save/continuation, mobile removal inputs, no page horizontal overflow, no nested vertical scrolling, and footer clearance passed. The screenshots were inspected.
- Screenshots are in `.tmp/rules-redesign-*.png`. The browser fixture used fictional data and mocked API methods; application API requests were blocked and none occurred. No runtime exceptions occurred. The existing collapsed-sidebar nested-link warning remains outside this change.
- Temporary frontend preview files were removed; the preview server and headless browser were stopped.

No scoring-engine rebuild, new formula, new dependency, route replacement, SQL migration, deployment, or connected Supabase data change was performed for this redesign. Existing workflow migrations, including the earlier publication guard migration 095, remain prerequisites for their respective backend operations.
