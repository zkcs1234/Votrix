# VOTRIX — Sitemap and Navigation Structure

## Global route tree

```text
/
├── /login                                  guest login alias
├── /forgot-password
├── /reset-password?token=…
├── /change-password                        authenticated/forced password change
├── /admin                                  Admin shell
│   ├── /                                  dashboard
│   ├── /users                             Organizer + participant pool tabs
│   ├── /organizers                        legacy redirect → /users
│   ├── /organizers/:id                    organizer activity detail
│   ├── /events                            global events
│   ├── /settings                          settings + taxonomy
│   ├── /audit-logs
│   ├── /email-delivery
│   ├── /health
│   ├── /alerts
│   └── /archival
├── /organizer                             Organizer shell/dashboard
│   ├── /election                          Election module
│   │   ├── /events
│   │   ├── /events/new
│   │   └── /events/:eventId
│   │       ├── /edit | /branding
│   │       ├── /positions | /candidates | /voters
│   │       ├── /review | /analytics | /report
│   ├── /competition                       Competition Scoring module
│   │   ├── /events
│   │   ├── /events/new
│   │   └── /events/:eventId
│   │       ├── /edit | /branding | /type | /categories
│   │       ├── /workspace | /contestants | /judges
│   │       ├── /review | /live
│   │       ├── /tabulation[/:section]
│   │       ├── /rankings | /analytics | /report
│   ├── /polling                           Polling module
│   │   ├── /events
│   │   ├── /events/new
│   │   └── /events/:eventId
│   │       ├── /edit | /branding | /settings
│   │       ├── /builder | /respondents | /review
│   │       └── /analytics | /report
│   └── /reports                           overview + legacy report redirects
├── /participant                           Participant shell (no sidebar)
│   ├── /events/:eventId                   election ballot
│   ├── /polling/events/:eventId           poll response
│   └── /competition/events/:eventId/score judge scoring/reviewer
├── /competition/events/:eventId/competitions/:competitionId/results
│                                           public published results
├── /voter/*                                legacy redirect → /participant/*
└── *                                       404
```

## Sidebar structure

### Admin

- Overview
- **Manage:** User Management, Global Events
- **System:** System Settings, Archival Policy
- **Monitoring:** System Health, Alerts, Audit Logs, Email Delivery

`/admin/organizers/:id` is reached from organizer rows, global-event actions or admin search; it is not a dedicated sidebar item.

### Organizer home

- Overview
- Module cards/links to Election, Competition Scoring, Polling, Reports (module cards are on dashboard, not all in the base sidebar)
- Account chip opens organizer profile; notification bell; global search.

### Election module

- Dashboard
- Events
- **Setup:** Positions, Candidates, Voters, Review & Publish
- **Results:** Analytics, Report

Event-scoped links are disabled until an event ID is selected. In practice event cards and stage navigation supply that event context.

### Competition Scoring module

- Competition Scoring Dashboard
- Competition Scoring Events
- **Setup:** Competition Type, Competitions/Categories, Rounds & Scoring, Contestants & Entries, Judges, Review & Create
- **Run:** Live Control
- **Results & Reporting:** Tabulation (Overview, Judge Submissions, Tabulation Matrix, Deductions & Adjustments, Results & Rankings, Audit Trail), Results & Analysis, Analytics, Report

### Polling module

- Dashboard
- Polls
- **Setup:** Builder, Settings, Respondents, Review & Publish
- **Results:** Analytics, Report

### Participant

No permanent sidebar. The dashboard event cards link to their action route; event headers and completion states link back to `/participant`. Participant account menu provides identity information and sign-out.

## Navigation behavior and aliases

- Guest `/` and `/login` share the login component. Authenticated visitors are redirected to their role dashboard.
- Legacy `/voter/*` preserves trailing route/query/hash while rewriting to `/participant/*`.
- Legacy `/organizer/reports/{election|competition|polling}/:eventId` redirects to the canonical module `/:eventId/report` route, where the module shell is retained.
- Competition tabulation supports both base route (default overview) and a selected section route.
- `GlobalSearch` searches route index by current role. Admin-only live results may navigate to organizer detail or Global Events; scoped results use current event ID if available.
- Notifications may deep-link through each notification’s `action_url`.
- Setup stage footer provides previous/next stage; EventStepper marks current/completed/available stages and allows navigation to completed stages.

## Access boundaries

- Admin route group is guarded for admin role. Backend admin APIs independently authorize admin and require password-change completion.
- Organizer routes are guarded for organizer role. Backend organizer router enforces organizer and active-account middleware.
- Participant pages are guarded for participant/legacy participant UI role. Backend participant router requires `participant`, active account, changed password; module APIs additionally check event enrollment/type.
- Public competition results have no frontend protected wrapper. Public access is intentional according to page purpose; snapshot availability remains backend-controlled.
- Wrong-role navigation returns to that role’s dashboard rather than rendering the requested page.

## Navigation observations

- No global breadcrumb hierarchy was found in the app shell; workflows rely on module label, sidebar, setup stepper/footer, and back-to-dashboard links.
- Setup sidebar entries without event context are intentionally disabled, but the reason (“Select an event first”) is only conveyed by title/hover in some variants. Keep this explanation visible and keyboard-accessible in a redesign.
- Organizer detail is a deep link rather than a sidebar destination.
- User management tabs and participant types are query-string state, so visual prototypes should preserve shareable URLs and back/forward state.
