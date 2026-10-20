# VOTRIX — UI/UX Audit

## Basis

Findings below are derived from inspected source and styles, not a live browser usability session. They distinguish existing UI facts from redesign recommendations. Priorities indicate expected user impact, not security severity.

## Prioritized findings

| Priority | Page/component | Observed issue | Why it matters | Specific recommendation |
|---|---|---|---|---|
| **Addressed** | Election, competition and polling date fields | All three forms use the shared custom `CalendarCard`, required/error states, start/end bounds, and local/ISO conversion helpers. Schema validation remains authoritative for exact date/time ordering. | The three event modules now share a consistent cross-browser date/time control and validation behavior. | Verify visually and interactively at desktop, tablet, and mobile widths; confirm timezone display expectations with product if needed. |
| **Addressed** | Polling setup expiration | Optional `pollExpiresAt` is available in settings, validated inclusively against the event schedule, and persisted through the existing `poll_expires_at` database column and schedule behavior. | Organizers can configure the existing polling expiry capability end-to-end. | Verify create/edit, clearing expiry, and participant poll-closing behavior with the deployed backend and migration 006. |
| **High** | Competition setup/live control/tabulation | Several pages are native/legacy boundary wrappers; rendering is controlled by deployment flags not available in this source audit. | A designer could generate the wrong workflow or omit a mode used in production. | Confirm which flags are enabled in the target environment. Choose the active design as primary; keep any live legacy route as a compatibility variant until retired. |
| **Medium** | Navigation across modules | There is no global breadcrumb; event-scoped sidebar items can be disabled without a persistent inline explanation. Long module menus contain multiple nested levels. | Users may lose context and find it unclear why controls cannot be opened before selecting an event. | Add a compact breadcrumb/event context row; show disabled-link explanation on focus as well as hover; keep group names and current event visible on deep screens. |
| **Medium** | Admin and organizer lists | Some tables have horizontal overflow, client-side filters over a loaded list, dense action columns, and different pagination behavior (for example Global Events has no page controls while audit/email do). | Large datasets become difficult to scan; responsive layouts can hide columns or force horizontal scrolling. | Define table variants: essential columns first, compact row action menu, mobile card/list fallback, clear result counts, consistent server-side pagination/filter persistence where available. Do not promise server filtering on pages that currently filter locally. |
| **Medium** | Loading/error feedback | Patterns vary: some pages use delayed skeleton, some spinner, some return `null` briefly; selected data failures are logged or swallowed and some reports return no content instead of an actionable error. | Users may see blank states or lack a retry path when a request fails. | Standardize skeleton/empty/error/retry components and polite live-region announcements; preserve which APIs are optional/non-fatal, but make failure status visible where it blocks a task. |
| **Medium** | Theme claims | README mentions dark/light theme, but the inspected base stylesheet sets light color-scheme and the frontend search found no dark mode selector/toggle. | Designing a dark system mode without deployed implementation may create unsupported screens; current docs mislead expectations. | Treat light as the verified current theme. If dark mode is a future goal, specify tokens and contrast pairs as a separately labeled proposed enhancement. |
| **Medium** | Confirmations and destructive actions | Some flows use accessible shared modals, but other flows use native `window.confirm`/`window.prompt` for restore, rename/delete, and competition type changes. | Browser-native dialogs are inconsistent and difficult to style; impact/undo details differ between modules. | Replace with shared, focus-managed confirmation and edit dialogs; include object name, consequences, cancel, and clear primary/destructive actions. This is a visual interaction recommendation; preserve confirmation semantics. |
| **Medium** | Dense competition workflows | Rounds, criteria, contestants, judging, live control, tabulation, and reviewer flows expose many domain concepts; some panels are complex, data-heavy, and use separate custom CSS. | A generic dashboard redesign could obscure status, event context, or official vs preview data. | Use event-context header, setup/run/results navigation groups, clear readiness checklist, and persistent distinction between draft/live preview/official results. Design table/matrix horizontal scrolling deliberately. |
| **Low** | Global search | Ctrl/Cmd+K and a modal search exist; static route results are role-filtered, while admin live results begin at 2 chars and are debounced. | Keyboard discoverability and distinction between routes and records may be weak without visual affordance. | Show shortcut in search trigger, group “Pages” vs “Records,” explain event-scoped destinations, and provide loading/no-result/error states. |
| **Low** | Vote/poll completion | Fullscreen forms make good use of progress and fixed actions; local drafts restore silently/message briefly. | Voters should understand what is saved locally vs submitted/locked, especially on mobile or interrupted connection. | Keep progress and one primary action visible; explicitly communicate draft restore, successful submission, and locked finality. Respect safe-area insets and reduced-motion preferences. |
| **Low** | Admin User Management | Organizer and participant management share a route but participant subtype tabs and query-state mappings are not obvious from route name. | Users may not realize voter/judge/respondent accounts are one participant role with multiple memberships. | Use a clear account-vs-participant-type hierarchy and persistent filters; distinguish shared user account from module pool membership. |

## Accessibility notes

**Positive implementation evidence:** semantic labels/fieldset in key forms; `aria-current`, `aria-expanded`, `aria-selected`, and progressbar labels in shared components; keyboard tab navigation in competition workspace; reduced-motion CSS; modal role/aria-modal and Escape handling in some pages; `prefers-reduced-motion` support.

**Needs verification/improvement:** not every modal is confirmed to trap/restore focus; some close controls and table interactions need keyboard walkthrough; hover tooltips should have focus equivalents; custom switches need visible focus and descriptive labels; native browser confirmations are not controllable by the app; dynamic error/notification announcements are not uniform. Do not infer WCAG conformance from source alone—contrast and keyboard behavior need rendered testing.

## Strengths to retain

- Shared, token-based color and component vocabulary with responsive layouts.
- Reusable dashboard cards, table wrappers, badges, alerts, loading skeletons, module analytics/report components.
- Explicit event lifecycle readiness and read-only states.
- Draft/autosave and unsaved-changes safeguards on event forms.
- Event-specific enrollment rather than mixed account creation at organizer layer.
- Role-aware route handling, participant event grouping, dynamic poll question registry, and real-time updates.
- Focused fullscreen participant interaction with progress and fixed submit action.

## Recommended validation before redesign sign-off

1. Confirm deployed native competition flags and whether fallback pages remain user-facing.
2. Confirm whether the product requires poll expiration; current frontend/API form contract inspected here does not show it.
3. Confirm date widget choice and timezone wording, then align the implementation contract before designing detailed picker interactions.
4. Render role accounts and empty/loading/error fixtures at mobile, tablet and desktop widths.
5. Keyboard-test login, tabs, search dialog, dropdowns, tables, confirmation overlays, ballot review, and judge scoring.
