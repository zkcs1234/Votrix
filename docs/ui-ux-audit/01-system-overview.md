# VOTRIX — System Overview

## Scope and confidence

This is a source-based inspection of the current checkout, intended as a Figma/redesign reference. The route tree, page components, shared components, styles, frontend services, and selected API route guards were inspected. No application browser tab was shared for visual verification, so no statement below claims that a live deployment was rendered. Styles are described from source; runtime behavior is marked where feature flags, data, or external services determine the result.

No application code or configuration was changed for this audit.

## Product purpose

VOTRIX is a role-based platform for creating and operating election ballots, competition scoring events, and polls/surveys. Organizers configure events, enroll existing participant accounts, publish events, operate the event, and review analytics and reports. Participants use a unified home page to vote, respond to polls, or score competitions. Administrators manage accounts, platform settings, event oversight, and operational monitoring.

## Technology stack

| Area | Verified stack |
|---|---|
| Frontend | React 19, Vite 8, JavaScript/JSX |
| Routing and access UI | React Router 7, `ProtectedRoute`, `GuestRoute` |
| Styling | Tailwind CSS 4 via the Vite plugin, `frontend/src/index.css`, theme CSS variables, a small set of module-specific CSS files |
| State/data | TanStack React Query 5, Zustand 5, local component state |
| Forms/validation | React Hook Form, Zod, `@hookform/resolvers` |
| HTTP and real-time | Axios with cookie credentials and CSRF header; WebSocket event hooks |
| Visualization and interaction | Recharts, dnd-kit, Lucide icons, Framer Motion, date-fns |
| Backend | Node.js (>=20), Express 5 |
| Database/auth | Supabase client/PostgreSQL; JWT and bcrypt; cookie parser and CSRF middleware |
| External services | Cloudinary image uploads, Resend email, WebSocket server |

The frontend is a Vite SPA. `main.jsx` composes the router, query client, bootstrap/auth/CSRF initialization, global toast container, and error boundary. `src/routes/index.jsx` is the route source of truth. Page components call domain services under `src/services`; backend endpoints are grouped into auth, admin, organizer, participant, reporting, and module-specific routers.

## User roles

1. **Admin** — system-wide user/account administration, organizer and participant pools, event oversight, platform settings, health, alerts, archival, audit, and email-delivery history.
2. **Organizer** — organizer overview and scoped election, competition scoring, polling, and report workspaces. An organizer may have a global/all-access or scoped cohort permission profile.
3. **Participant** — shared account role for one or more participant types: election voter, competition judge, and polling respondent.
4. **Legacy `voter` role** — still accepted by frontend role helpers and legacy `/voter/*` routes redirect to `/participant/*`. Current backend participant router authorizes the `participant` role; deployment/session compatibility should be confirmed separately.

The role shown in navigation is a UI affordance, not proof of authorization. Backend admin routes apply admin authorization, organizer APIs are mounted behind organizer authorization, and participant APIs require a participant account plus event-participant checks on module routes. The specific business permission for each event operation remains enforced by its endpoint/service.

## Major modules

- **Platform administration:** dashboard, organizer/participant management, global event list, settings/taxonomy, system health, alert configuration, archival policy, audit log, and email-delivery log.
- **Organizer home:** activity/statistics overview, module entry points, organization branding, recent events, and active competition sessions.
- **Election:** event details and branding, ballot groups/sections, positions, candidates, voter cohort invitation, review/publish, analytics, report, and participant ballot.
- **Competition Scoring:** event creation/type, competition/category configuration, rounds/divisions/criteria/scoring rules, contestants/entries, judges/assignments, review/publish, live control, tabulation, rankings, analytics/report, participant judging/review, and public published results. Native workspaces are feature-flagged.
- **Polling:** event details/branding/settings, question builder and registered question types, respondent cohort invitation, review/publish, analytics/report, and participant response.
- **Shared services:** search, notifications, organizer profile, image upload, drafts/autosave, reusable cards/tables/forms, reports/export.

## Architecture and UI shell

- Auth routes use a centered `AuthLayout` card with the VOTRIX logo and a nested page.
- Admin and organizer routes render an `AppShell`: dark left navigation, sticky light header, account control, notification trigger, optional global search, scrollable main content, and a sticky stage-footer portal.
- The sidebar becomes a mobile off-canvas drawer; at widths below 1280px it auto-collapses to a rail on desktop, and selected analytics/live/ranking routes collapse it for more content width. These are source-defined breakpoints/behaviors, not live-device observations.
- Participant pages use the shared shell without a sidebar/search. Voting and poll response screens switch to a fullscreen, fixed-top-progress/scrollable-content/fixed-action layout.
- Module layouts add event-scoped navigation and a setup-stage wrapper. Sidebar links for event-scoped stages are disabled until an event is selected.
- UI component exports and route modules are JavaScript rather than TypeScript. No global breadcrumb component was found in the inspected shell.

## Important source-to-notes discrepancies

The current source takes precedence over pasted implementation notes when designing from this checkout:

- All three event forms use the shared `CalendarCard` with start/end bounds, required/error states, and shared local/ISO conversion helpers.
- Polling settings expose optional `pollExpiresAt`, validated against the event schedule and persisted through the existing backend/database support.
- The root README mentions dark/light theme support, while the inspected base stylesheet sets `color-scheme: light` and defines the default light token set; no dark theme selector/toggle was found in the inspected frontend sources.
- Competition has native/fallback workspace boundaries and environment switches. The active production flags cannot be determined from source alone; design flows should accommodate the implemented native and legacy variants until the target deployment is checked.

## Related source

- [Frontend entry point](../../frontend/src/main.jsx)
- [Route configuration](../../frontend/src/routes/index.jsx)
- [Protected route](../../frontend/src/routes/ProtectedRoute.jsx)
- [App shell](../../frontend/src/layouts/AppShell.jsx)
- [Design tokens and components](../../frontend/src/index.css)
- [Backend route mounting](../../backend/src/routes/index.js)
- [Backend admin routes](../../backend/src/routes/admin.routes.js)
