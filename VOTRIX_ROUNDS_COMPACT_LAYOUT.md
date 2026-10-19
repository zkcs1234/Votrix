# VOTRIX compact Rounds layout

Implemented October 12, 2026. This refinement replaces the earlier tall, single-column radio-card design. Backend services, API contracts, scoring logic and database records were not changed.

## Layout fixes

- At viewport widths of 1024px and above, creation and management appear side by side in a CSS Grid using a 42/58 split and a 20–24px gap. Neither column has a fixed height or an internal vertical scroll region.
- Below 1024px, the form and saved rounds stack in that order. Native selectors replace permanently displayed option cards. Only the selected option's short explanation appears beneath each selector. Contribution input remains conditional on combined scoring.
- The Rounds header shows one title, a concise description and the real round count. Redundant header shortcuts are omitted on Rounds; the existing sidebar, stepper and routes remain available.
- Compact cards show the round number, name, purpose, score use and criteria count. Criteria selects the correct round in the existing editor. Settings opens a drawer. The more menu contains applicable Edit, Reorder and Delete actions.
- A confirmed new round is inserted immediately, receives concise success feedback and a brief subtle highlight, and focuses its Criteria action. Nothing is shown as successfully created before the API returns its saved ID.
- Rounds Back/Continue navigation stays in document flow instead of using the shell's sticky footer portal. The empty portal stays hidden on Rounds. The later Criteria guidance update restores its sticky footer with measured content clearance; see [VOTRIX_CRITERIA_GUIDANCE.md](VOTRIX_CRITERIA_GUIDANCE.md).
- The tab strip scrolls horizontally when needed and explicitly hides its vertical overflow, eliminating the small vertical scrollbar found during full-shell rendering.

## Focused settings

The existing Modal component now supports an optional drawer layout. Desktop uses a right-side drawer; mobile uses the full viewport width. A header and Done footer remain outside one flexible scroll body. Default modal layout remains available for existing consumers.

Only the selected settings editor is mounted. Returning to Round settings restores the section list. The panel traps keyboard focus, restores its originating trigger on close, closes on Escape/backdrop when appropriate, and locks background scrolling. Closing controls are disabled during a pending save. Disabled controls inherited from a fieldset are excluded from the focus loop.

Details, advancement, progression and reordering use their existing APIs. Criteria and penalties navigate to the existing editors. Live scoring uses the existing Live Control route after setup publication. A next-round selector without a later destination is disabled with an explanation. Existing saved destinations are preserved instead of silently being cleared.

## Files changed

| File | Change |
| --- | --- |
| `frontend/src/components/organizer/competition/CompetitionRoundsTab.jsx` | Responsive two-column grid, compact record cards, confirmed round count/highlight and drawer coordination |
| `frontend/src/components/organizer/competition/CompetitionRoundForm.jsx` | Compact native selectors, labels, explanations, spacing and consistent controls |
| `frontend/src/components/organizer/competition/CompetitionRoundSettings.jsx` | Single-editor settings panel, next-round explanation and focused reorder view |
| `frontend/src/components/organizer/competition/CompetitionRoundActionsMenu.jsx` | New keyboard-friendly more menu with viewport-aware placement |
| `frontend/src/pages/organizer/competition/CompetitionWorkspacePage.jsx` | Compact Rounds header/count, tab overflow fix and navigation footer in page flow |
| `frontend/src/components/ui/Modal.jsx` | Optional drawer/footer/trigger-restoration support and focus handling for disabled controls |
| `frontend/src/components/ui/ModuleStageLayout.jsx` | Updated the comment describing the workspace-owned footer; navigation behavior unchanged |
| `frontend/src/utils/competitionRoundForm.js` | Compact friendly labels and summaries; backend enum values and validation/payload rules retained |
| `frontend/src/pages/organizer/competition/CompetitionWorkspacePage.test.jsx` | Existing data/API scenarios adapted to selectors and menus; drawer, footer and later-round tests added |

No dependency, backend endpoint, schema field or Supabase migration was added. Stored weights, memberships, purpose, progression, score policy, advancement and published-event locks continue to use the existing contracts. Name-only edits still send only changed fields.

## Verification

| Check | Result |
| --- | --- |
| Round workspace integration tests | 19 passed |
| Full frontend suite | 88 passed across 13 test files |
| Lint on changed JavaScript/JSX | Passed |
| Production build | Passed; existing large-chunk warning remains |
| Browser rendering inside actual PageantLayout/AppShell/ModuleStageLayout | Passed at 1536, 1280, 1024, 768 and 390px |
| Geometry/scroll checks | Correct 42/58 desktop columns, stacked smaller layout, no horizontal page overflow or nested vertical content scrolling, empty shell footer portal and static workspace footer |
| Browser interactions | Confirmed creation, returned-ID Criteria selection, conditional contribution, drawer bounds, one editor/scroll body, visible Done, Tab focus trap, Escape closing and trigger restoration passed |
| Backend competition service comparison | Unchanged from the start-of-refinement snapshot |

Browser checks rendered the real competition shell and components with isolated API/account fixtures. They made no real application API requests and modified no Supabase records. The supplied attachment contained the text specification; comparison used its required wireframe and screenshots captured from the rendered repository UI. Authenticated live database acceptance was not performed for this layout task.

The frontend suite used the existing `VITE_LOCK_PARTICIPANTS_ON_ACTIVE=true` policy test override without editing `.env`. The sidebar/stepper were not recreated. Horizontal navigation scrolling remains where needed; no remaining vertical clipping or footer obstruction was observed at the specified viewports.

The full-shell preview also surfaced an existing React DOM warning: the collapsed sidebar wraps the linked VotrixLogo in another link (`AppShell.jsx` / `VotrixLogo.jsx`). Those components were not changed by this refinement. This warning and the existing build chunk-size warning remain; no live database acceptance was performed.

Local screenshots: `.tmp/rounds-compact-1536.png`, `rounds-compact-1280.png`, `rounds-compact-1024.png`, `rounds-compact-768.png`, `rounds-compact-390.png`, `rounds-drawer-1280.png`, `rounds-drawer-390.png`, and `rounds-drawer-edit-390.png`. Temporary preview files were removed and the preview server was stopped after verification.
