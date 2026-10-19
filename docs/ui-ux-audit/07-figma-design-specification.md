# VOTRIX — Figma Design Specification

This section proposes a coherent redesign system. Proposed tokens are not claims about the deployed runtime beyond where they intentionally reuse the verified brand palette.

## Proposed design direction

Use a professional civic/education operations interface: trustworthy indigo actions, neutral high-contrast surfaces, restrained module accents, data-dense but calm admin tables, and a focused distraction-free participant experience. Avoid changing business semantics or implying that unimplemented controls exist.

## Proposed token set

| Token | Proposed value | Use |
|---|---|---|
| `brand/primary` | `#4F46E5` | Primary actions, links, current step |
| `brand/primary-hover` | `#4338CA` | Hover/pressed |
| `brand/secondary` | `#7C3AED` | Brand gradient accent, sparingly |
| `module/election` | `#4F46E5` | Election icon/eyebrow only; do not rely on color alone |
| `module/competition` | `#0F766E` | Competition accents |
| `module/polling` | `#C2410C` | Polling accents |
| `surface/page` | `#F3F4F6` | App background |
| `surface/card` | `#FFFFFF` | Cards, dialogs, forms |
| `surface/subtle` | `#F9FAFB` | Table header, secondary panel |
| `text/primary` | `#111827` | Heading/body text |
| `text/secondary` | `#374151` | Secondary text |
| `text/muted` | `#6B7280` | Captions/help |
| `border/default` | `#E5E7EB` | Separators |
| `border/strong` | `#D1D5DB` | Inputs/interactive borders |
| `status/success` | `#047857` | Success status |
| `status/success-bg` | `#ECFDF5` | Success surface |
| `status/warning` | `#B45309` | Warning |
| `status/warning-bg` | `#FFFBEB` | Warning surface |
| `status/danger` | `#B91C1C` | Destructive/error |
| `status/danger-bg` | `#FEF2F2` | Error surface |
| `navigation/sidebar` | `#111827` | Sidebar |

### Typography and spacing

- Display/page headings: Plus Jakarta Sans or system fallback, 24px/700; section heading 20px/700; card heading 16px/600.
- Body: Inter or system fallback, 14–16px/400; labels 14px/500; helper/caption 12px/400; compact table metadata 12px.
- Numeric counts/scores: tabular numerals; optional JetBrains Mono for IDs and audit values only.
- Spacing base 4px; scale 4/8/12/16/24/32/48/64. Content sections 24–32px apart; controls 8–12px apart.
- Radii: 8px controls, 12px cards, 16px dialog/featured surfaces, pill status badges. Use subtle 1px borders; reserve shadows for floating surfaces/dialogs.

### Layout and responsive rules

- Desktop admin/organizer: fixed-width sidebar 256px, optional 72px rail; sticky header 64–72px; content max width based on data density. Keep analytics and matrix views wide.
- Tablet: sidebar drawer; content grid two columns where cards fit; table controls wrap.
- Mobile: one-column cards/forms; compact top header; navigation drawer; convert wide event/participant tables to prioritized cards or accessible horizontal scroll with pinned identifying column.
- Proposed breakpoints: 640px small-to-medium, 768px tablet, 1024px desktop-shell transition, 1280px expanded desktop. Existing source uses Tailwind breakpoints and a 1280px sidebar auto-collapse threshold; align final breakpoint mechanics with implementation.
- Participant voting and survey: full-viewport shell, safe-area-aware fixed actions, max reading width around 640px, no competing sidebar.
- Use WCAG 2.2 AA contrast targets, visible 2px focus ring, touch targets ≥44×44px, error text adjacent to fields, and icon-plus-label status communication.

## Shared Figma component library

1. **Application shell:** role-aware sidebar, collapsible rail, active/disabled nav items, grouped nav, nested tabulation menu, mobile drawer, sticky header, account chip/menu, module label, search trigger.
2. **Navigation context:** breadcrumb, event context header, module stage stepper, next/back stage footer, scoped-link disabled state.
3. **Buttons:** primary, secondary, tertiary/ghost, destructive, icon-only with accessible label; sizes; loading/disabled/focus states.
4. **Forms:** text/email/password/number/textarea/date-time/select, checkbox, radio cards, switch, searchable multi-select/chip list, file/image upload, inline helper/error, fieldset.
5. **Data display:** stat card, event card, organization card, status badge, readiness checklist, table with responsive variants, search/filter bar, pagination, empty state, skeleton.
6. **Overlays:** modal/dialog, drawer, confirmation, detail viewer, toast/alert, preview sheet. Include focus, escape, loading, error, confirmation and disabled variants.
7. **Charts/reports:** chart card, timeline/distribution chart, ranking list, participation table, report document header, export bar, print layout.
8. **Participant:** event hero/banner, role badge, event status, fullscreen progress indicator, election position/candidate card, poll question card and dynamic answer controls, judge score row, submit footer, success/closed/locked screen.
9. **Competition operations:** round/criteria editor, contestant entry and assignment list, judge roster/assignment panel, live-session state controls, tabulation matrix, calculation breakdown, published result table.
10. **Admin operations:** account pool table, user/profile modal, CSV preview/results, service health card, audit detail, email delivery status row, alert switch row, archival policy panel.

## Page-by-page redesign briefs

### Shared

- **Auth screens:** keep single focused card; consistent field sizing, password visibility, busy/error states, accessible recovery path. Use concise role-neutral copy because login is shared.
- **Admin shell:** emphasize system-wide scope and safe management actions; keep monitoring visible as a separate group.
- **Organizer shell:** preserve module grouping (Setup / Run / Results); show selected event name/status consistently above event-scoped setup.
- **Participant shell:** prioritize event/task, identity/privacy messaging, progress, and one primary action. Explicitly distinguish autosaved draft from submitted response.

### Admin

- **Dashboard:** five primary platform metrics; recent activity and trends; rapid create entry points. Avoid overcrowding with redundant charts.
- **User management:** account-level tabs and participant-type subnavigation; search/status filters; clear create/import/export group; row actions in overflow menu; account status confirmation.
- **Organizer detail:** identity/context header, activity filters, paginated timeline/table, structured detail drawer/modal.
- **Global events:** summary metrics, compact persistent filters, table with action menu; date range and status clear; restore confirmation for archived items.
- **Settings:** editable setting rows/cards grouped by system function; taxonomy distinct from generic settings; clear save state and validation.
- **Health/alerts/archival:** status dashboard cards, labeled switches/thresholds, last-checked/last-run timestamps, confirmations and clear automation effects.
- **Audit/email logs:** server-filter panel with date range, applied-filter chips, results count, table and details drawer; preserve paging/sorting/export.

### Organizer: common and election

- **Organizer home:** organization identity card, primary module launcher, live session attention area, recent events and high-value summary. Keep charts below immediate actions.
- **Reports overview:** three clearly labeled module groups and report-specific summaries; link directly to canonical report.
- **Election dashboard/list:** turnout metrics/table; event list with clear status, preview, manage, continue setup actions.
- **Election form:** one stepper, 2-column dates on wide screens/stacked on mobile; results visibility as explanatory radio cards; banner upload preview; draft/saving state.
- **Positions/candidates:** keep section context persistent; create/edit workspace paired with list; eligibility as explicit “all vs selected programs”; candidate card photo/party/bio/platform, filter by position.
- **Voters:** cohort selector, live estimate, notify option, invite action, enrolled list; visibly locked state after event opens.
- **Election review/analytics/report:** readiness checklist and distinct draft/scheduled/active states; charts/participation data; report export actions with print-friendly layout.

### Organizer: competition scoring

- **Dashboard/events:** event and score completion overview; card/table linking to setup/run/results.
- **Type/categories:** hierarchy of event → competitions/categories → divisions; confirm destructive type changes with consequences.
- **Structure & scoring:** nested editor workspace with round context, criteria completeness, score method and save/recovery status; accessible tabs and responsive sticky footer.
- **Contestants/judges:** distinguish master entry pool from round assignments; show division and assignment state; expose judge scope and notification outcome.
- **Review/publish:** checklist and explicit freeze/schedule effect; do not imply session starts at publish.
- **Live control:** operational console with prominent session state, next action and judge progress; separate irreversible round finalization from routine controls.
- **Tabulation/results:** label preview vs official; show source/version/tie method; matrix and audit as dedicated views; preserve broad table width.
- **Analytics/report:** summary then round/category/judge details, with export and source status.

### Organizer: polling

- **Dashboard/events:** participation and response count; preview the exact respondent question flow.
- **Form/settings:** details/date, optional banner, anonymous/multiple-response switches, and optional poll expiration constrained to the event schedule.
- **Builder:** one question card per item, reorder handle, type-specific configuration, required/image/options; clear distinction between delete and duplicate.
- **Respondents/review:** cohort invite estimate, roster, schedule readiness based on question count, clear locked state.
- **Analytics/report:** identify anonymous/identified reporting, present response rate and question-specific distributions; protect text response readability.

### Participant and public

- **Dashboard:** event cards grouped by urgency (active/assigned/completed), role badges and due/open state; results visibility as separate content.
- **Election ballot:** full-screen stepper/progress, position cards and large candidate controls; review/submit confirmation, local-draft message and success state.
- **Poll response:** dynamic question blocks with clear question type and required status; preserve progress and fixed submit CTA.
- **Judge scoring:** configure dynamically from round/criteria/scale, visibly show autosave/queue/offline state, score-submit boundaries and reviewer alternatives.
- **Public results:** standalone brand header and publication status, event/competition/round context, responsive standings table, withdrawn/unavailable state.

## Required Figma variants

For every interactive component, design default, hover, keyboard focus, pressed, disabled, loading, validation error, empty, success, and permission/read-only variants where applicable. For complete pages, include desktop and mobile; add tablet where side navigation/table behavior changes. For workflows include state transitions and prototype links, especially publish/unpublish, invitation, ballot review/submit, judging session, and archival restore.

## Screen generation order

1. Tokens, typography, icon rules and shared component library.
2. Auth shell and app shell (admin, organizer, participant).
3. Participant dashboard and event card; organizer home; admin dashboard.
4. Election event list and setup flow; ballot section; results.
5. Poll event list, question builder and respondent answer flow.
6. Competition structure/scoring, contestants, judges, review and live control.
7. Tabulation, analytics, reports and public results.
8. Admin user/account management, event oversight, settings and monitoring.
9. Empty/loading/error/locked/confirmation states, mobile/tablet and print/export variants.
