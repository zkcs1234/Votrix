# Revised Frontend Migration Roadmap

I reviewed the current frontend codebase against the proposed roadmap and narrowed it to the changes that are both useful and safe for this project right now. I did not change any code.

## Implementation rule

Each phase must be implemented and verified before moving to the next phase. No phase should be considered complete until the required verification steps are completed and approved.

## What I changed

- Kept the low-risk cleanup and accessibility work that directly targets current pages and components.
- Removed or deferred the larger architectural initiatives that would add significant complexity without improving correctness right away.
- Reordered the plan so that UI stability comes first, then form modernization, and only then visual enhancements.

---

## 1) Updated task list

### Phase 1A — Low-risk cleanup batch 1

These are the smallest, safest cleanup tasks and should be handled first.

1. Shared skeleton consolidation

- Use the existing exports from [frontend/src/components/ui/Skeleton.jsx](frontend/src/components/ui/Skeleton.jsx) in [frontend/src/pages/admin/AdminDashboardPage.jsx](frontend/src/pages/admin/AdminDashboardPage.jsx) and [frontend/src/pages/organizer/OrganizerDashboardPage.jsx](frontend/src/pages/organizer/OrganizerDashboardPage.jsx).
- Risk: Low
- Why: the current pages still define their own skeletons, and the shared component already exists.

2. Remove duplicate stat card usage in voter dashboard

- Replace the local stat card in [frontend/src/pages/voter/VoterDashboardPage.jsx](frontend/src/pages/voter/VoterDashboardPage.jsx) with the shared component from [frontend/src/components/ui/StatCard.jsx](frontend/src/components/ui/StatCard.jsx).
- Risk: Low
- Why: this is a direct duplication and the shared component is already available.

### Phase 1B — Low-risk cleanup batch 2

These are still low-risk, but they affect draft persistence and visible page text.

1. Replace inline draft storage keys with shared constants

- Update [frontend/src/utils/draftStorage.js](frontend/src/utils/draftStorage.js) and the voter/judge pages that still use inline storage keys.
- Risk: Low
- Why: this reduces drift and keeps draft behavior consistent.

2. Fix encoding artifacts in voter pages

- Correct the mojibake text in [frontend/src/pages/voter/VoterPollPage.jsx](frontend/src/pages/voter/VoterPollPage.jsx) and [frontend/src/pages/voter/JudgeScoringPage.jsx](frontend/src/pages/voter/JudgeScoringPage.jsx).
- Risk: Low
- Why: the current files still contain visible encoding issues.

### Phase 1C — Low-risk cleanup batch 3

This batch is still UI-focused and should be reviewed independently.

1. Replace raw submit buttons with the shared button component

- Update the same voter pages to use the shared button pattern for loading and disabled state.
- Risk: Low
- Why: this improves consistency without changing the submit logic.

### Phase 1D — Security-sensitive cleanup

This batch should stay separate because it affects auth and CSRF behavior.

1. Remove redundant CSRF handling in change-password flow

- Simplify [frontend/src/pages/auth/ChangePasswordPage.jsx](frontend/src/pages/auth/ChangePasswordPage.jsx) so it relies on the existing service-layer CSRF handling.
- Risk: Low-Medium
- Why: the current page has its own helper even though the service already handles the same flow.

### Phase 2 — Accessibility fixes

These remain appropriate and are relatively contained.

1. Progress bar ARIA in [frontend/src/pages/voter/VoterEventPage.jsx](frontend/src/pages/voter/VoterEventPage.jsx)
2. Sort button keyboard support in [frontend/src/pages/admin/AuditLogsPage.jsx](frontend/src/pages/admin/AuditLogsPage.jsx)
3. Disabled sidebar item accessibility in [frontend/src/layouts/AppShell.jsx](frontend/src/layouts/AppShell.jsx)
4. Filter button pressed-state semantics in [frontend/src/pages/admin/OrganizerManagementPage.jsx](frontend/src/pages/admin/OrganizerManagementPage.jsx), [frontend/src/pages/admin/GlobalEventsPage.jsx](frontend/src/pages/admin/GlobalEventsPage.jsx), and [frontend/src/components/ui/NotificationsModal.jsx](frontend/src/components/ui/NotificationsModal.jsx)
5. Mobile table overflow fix in [frontend/src/pages/admin/OrganizerManagementPage.jsx](frontend/src/pages/admin/OrganizerManagementPage.jsx)
6. Double error display suppression

- Apply this only after the above, because it touches the central interceptor in [frontend/src/services/api.js](frontend/src/services/api.js).
- Risk: Medium
- Why: it is useful, but it has broader impact than the other accessibility fixes.

### Phase 3 — Form modernization

These should happen after the cleanup work is stable.

1. Migrate [frontend/src/pages/organizer/election/ElectionEventFormPage.jsx](frontend/src/pages/organizer/election/ElectionEventFormPage.jsx)
2. Migrate [frontend/src/pages/organizer/pageant/PageantEventFormPage.jsx](frontend/src/pages/organizer/pageant/PageantEventFormPage.jsx)
3. Migrate [frontend/src/pages/organizer/polling/PollingEventFormPage.jsx](frontend/src/pages/organizer/polling/PollingEventFormPage.jsx)

- Risk: Medium
- Why: these forms currently use local state and step-based flows; the migration should preserve payload shapes, navigation, and upload behavior.

### Phase 4 — Visual enhancement work

These are worthwhile, but later.

1. Recharts-based chart wrapper

- Replace the current custom implementation in [frontend/src/components/reports/BarChart.jsx](frontend/src/components/reports/BarChart.jsx) with a Recharts-based version.
- Risk: Medium

2. Add richer charts to analytics/report pages

- Start with the pages already using distribution lists, such as [frontend/src/pages/organizer/reports/ElectionReportPage.jsx](frontend/src/pages/organizer/reports/ElectionReportPage.jsx), [frontend/src/pages/organizer/polling/PollingAnalyticsPage.jsx](frontend/src/pages/organizer/polling/PollingAnalyticsPage.jsx), and [frontend/src/pages/organizer/pageant/CompetitionAnalyticsPage.jsx](frontend/src/pages/organizer/pageant/CompetitionAnalyticsPage.jsx).
- Risk: Medium

---

## 2) Tasks removed or revised

### Removed from the initial roadmap

- Radix UI modal migration
  - I would not include this in the first migration wave. The current custom modals are functional, and replacing them adds UI risk without solving a correctness problem.
- TanStack Query migration across dashboards and module pages
  - This is a larger architectural refactor and would change data-fetching behavior across the app. It is better treated as a separate follow-up initiative.
- Broad utility abstraction work such as AlertBanner and a large class-name helper pass
  - These are reasonable ideas, but they are not necessary to preserve current behavior. I would only introduce them if they are directly reused by the pages being touched.

### Revised from “must-do” to “optional later”

- clsx + tailwind-merge usage
  - The current UI components are simple and do not yet show a strong need for this. It is reasonable as a later consistency pass, not a core migration step.

---

## 3) New findings from the current codebase

These are important and changed my recommendation:

- [frontend/package.json](frontend/package.json) already includes React Hook Form, Zod, and their resolver package, so the form-migration work is viable without adding those dependencies.
- [frontend/src/components/ui/Skeleton.jsx](frontend/src/components/ui/Skeleton.jsx) already provides reusable skeleton components, so the consolidation task is straightforward and low-risk.
- [frontend/src/utils/draftStorage.js](frontend/src/utils/draftStorage.js) still uses hard-coded prefixes, so the constant extraction task is still useful.
- [frontend/src/services/api.js](frontend/src/services/api.js) is the key central point for error handling and CSRF behavior, which is why the toast-suppression task should be delayed until later.
- The current voter pages still contain visible mojibake text, which makes the encoding cleanup a genuine, immediate fix.

---

## 4) Updated implementation order

1. Phase 1A — cleanup batch 1
2. Phase 1B — cleanup batch 2
3. Phase 1C — cleanup batch 3
4. Phase 1D — security-sensitive cleanup
5. Phase 2 — accessibility fixes
6. Phase 3 — form modernization
7. Phase 4 — charts and richer reporting visuals
8. Optional architectural refactors such as Radix UI or TanStack Query

This order is safer because it avoids touching the central request layer and broad data-fetching architecture until the existing pages are already stable.

### Phase completion gate

Before proceeding to the next phase, require the AI to stop and verify the current phase is complete.

Before moving on, confirm:

- Every planned task for the current phase is complete.
- Every modified file is listed.
- The exact changes made are explained.
- The changes are safe and do not introduce new behavior.
- No API behavior changed.
- No authentication or authorization behavior changed.
- WebSocket functionality remains unchanged.
- Loading, error, and empty states still work.
- No regressions were found.
- Verification evidence is collected and reviewed.
- Approval is received before starting the next phase.

---

## 5) Updated risk ratings

| Area                              | Risk       |
| --------------------------------- | ---------- |
| Skeleton consolidation            | Low        |
| StatCard deduplication            | Low        |
| CSRF cleanup                      | Low-Medium |
| Draft key constants               | Low        |
| Encoding fixes                    | Low        |
| Button replacement                | Low        |
| Accessibility fixes               | Low        |
| API interceptor error suppression | Medium     |
| Form migration                    | Medium     |
| Recharts migration                | Medium     |

---

## 6) Updated rollback strategy

- Keep each change scoped to a single page or a very small set of related files.
- Prefer one-page PRs or one-feature PRs rather than bundling unrelated UI work.
- For central changes in [frontend/src/services/api.js](frontend/src/services/api.js), keep the old behavior as the default and only enable the new behavior through an explicit opt-in flag.
- For chart work, preserve the existing layout as a fallback until the new chart implementation is verified in the browser.

---

## 7) Updated testing requirements

For each phase, verify:

- Existing routes still load correctly.
- API payloads and auth guards remain unchanged.
- Loading, error, and empty states still behave the same.
- Form submissions still navigate to the correct next screen.
- Draft persistence still works for voter and judge flows.
- CSRF requests still succeed after refresh and retry behavior.

No implementation work should begin until this revised roadmap is approved.
