# UI / UX

---

## Tech Stack

- React 19 + Vite 8
- Tailwind CSS 4 (utility-first, no component library)
- Framer Motion (animations)
- Lucide React (icons)
- React Hook Form + Zod (forms + validation)
- Zustand (global state)
- React Router 7 (client-side routing)

---

## Layouts

| File | Purpose |
|------|---------|
| `layouts/AppShell.jsx` | Root shell — wraps everything, handles theme class and toast placement |
| `layouts/AuthLayout.jsx` | Centered card layout for login/forgot-password/reset pages |
| `layouts/MainLayout.jsx` | Public page layout (home page) |
| `layouts/DashboardLayout.jsx` | Sidebar + topbar shell for all dashboard roles |
| `layouts/ElectionLayout.jsx` | Election module sub-layout (tabbed navigation) |
| `layouts/PageantLayout.jsx` | Competition/pageant module sub-layout |
| `layouts/PollingLayout.jsx` | Polling module sub-layout |
| `layouts/ReportsLayout.jsx` | Reports module sub-layout |

---

## Pages

### Public
| Page | Path | File |
|------|------|------|
| Home | `/` | `pages/HomePage.jsx` |
| Not Found | `*` | `pages/NotFoundPage.jsx` |

### Auth
| Page | Path | File |
|------|------|------|
| Admin Login | `/admin/login` | `pages/auth/AdminLoginPage.jsx` |
| Organizer Login | `/login` | `pages/auth/OrganizerLoginPage.jsx` |
| Voter Login | `/voter/login` | `pages/auth/VoterLoginPage.jsx` |
| Change Password | `/change-password` | `pages/auth/ChangePasswordPage.jsx` |
| Forgot Password | `/forgot-password` | `pages/auth/ForgotPasswordPage.jsx` |
| Reset Password | `/reset-password` | `pages/auth/ResetPasswordPage.jsx` |

### Admin
| Page | Path | File |
|------|------|------|
| Admin Dashboard | `/admin` | `pages/admin/AdminDashboardPage.jsx` |
| Organizer Management | `/admin/organizers` | `pages/admin/OrganizerManagementPage.jsx` |
| Global Events | `/admin/events` | `pages/admin/GlobalEventsPage.jsx` |
| System Settings | `/admin/settings` | `pages/admin/SystemSettingsPage.jsx` |
| Audit Logs | `/admin/audit-logs` | `pages/admin/AuditLogsPage.jsx` |

### Organizer
| Page | Path | File |
|------|------|------|
| Organizer Dashboard | `/organizer` | `pages/organizer/OrganizerDashboardPage.jsx` |
| Election Dashboard | `/organizer/election` | `pages/organizer/election/` |
| Pageant/Competition Dashboard | `/organizer/pageant` | `pages/organizer/pageant/` |
| Polling Dashboard | `/organizer/polling` | `pages/organizer/polling/PollingDashboardPage.jsx` |
| Reports | `/organizer/reports` | `pages/organizer/reports/` |

### Voter
| Page | Path | File |
|------|------|------|
| Voter Dashboard | `/voter` | `pages/voter/VoterDashboardPage.jsx` |
| Voter Event (Election Ballot) | `/voter/events/:eventId` | `pages/voter/VoterEventPage.jsx` |
| Voter Poll | `/voter/polling/events/:eventId` | `pages/voter/VoterPollPage.jsx` |
| Judge Scoring | `/voter/pageant/events/:eventId/score` | `pages/voter/JudgeScoringPage.jsx` |

---

## Route Guards

| Component | File | Behavior |
|-----------|------|---------|
| `ProtectedRoute` | `routes/ProtectedRoute.jsx` | Redirects unauthenticated users to login; redirects wrong-role users to their own dashboard |
| `GuestRoute` | `routes/GuestRoute.jsx` | Redirects already-authenticated users to their dashboard (prevents login page re-visit) |

---

## Shared UI Components (`components/ui/`)

| Component | Purpose |
|-----------|---------|
| `Button.jsx` | Standard button with variants (primary, secondary, danger, ghost) |
| `Input.jsx` | Text input with label + error state |
| `PasswordInput.jsx` | Input with toggle show/hide |
| `PercentageInput.jsx` | Numeric input constrained 0–100 |
| `ScoreInput.jsx` | Numeric input for judge scoring |
| `DateTimeInput.jsx` | Date/time picker input |
| `SearchInput.jsx` | Search bar with icon |
| `Badge.jsx` | Status/label badge with color variants |
| `Card.jsx` | Container card with optional header |
| `StatCard.jsx` | Stat display with label and value |
| `Table.jsx` | Sortable/paginated data table |
| `EmptyState.jsx` | Empty list state with icon and message |
| `LoadingSpinner.jsx` | Inline spinner |
| `PageLoader.jsx` | Full-page loading overlay |
| `Skeleton.jsx` | Content skeleton placeholder |
| `ProgressBar.jsx` | Progress bar for turnout/completion |
| `PageHeader.jsx` | Page title + breadcrumb |
| `ThemeToggle.jsx` | Dark/light mode toggle button |
| `ToastContainer.jsx` | Toast notification container |
| `NotificationsModal.jsx` | In-app notification panel |

---

## Forms

- All forms use **React Hook Form** with **Zod** resolver for validation.
- Schemas live in `frontend/src/schemas/auth.schemas.js` and inline in page components.
- Form fields display inline error messages below inputs on validation failure.
- Submit buttons show a loading spinner during async submission.
- `AuthFormField.jsx` is the reusable field wrapper for auth forms.

---

## Tables

- `Table.jsx` supports column definitions, row data, and action slots.
- Pagination is handled via URL query params or local state.
- Search and filter controls sit above the table.

---

## Search & Filters

- `SearchInput.jsx` debounces input and triggers re-fetch.
- Filter dropdowns use native `<select>` elements styled with Tailwind.

---

## Pagination

- Server-side pagination via `page` and `limit` query params.
- Foundation layer (`backend/src/foundation/pagination.js`) standardizes pagination responses.

---

## Responsive Behavior

- Tailwind responsive prefixes (`sm:`, `md:`, `lg:`) are used throughout.
- Sidebar collapses on mobile.
- Tables scroll horizontally on small screens.
- Cards stack vertically on mobile.

---

## Empty States

- `EmptyState.jsx` component used on all list views when no data exists.
- Includes an icon, title, description, and optional CTA button.

---

## Loading States

- `PageLoader.jsx` shown during initial route data fetching.
- `Skeleton.jsx` used for in-place content loading placeholders.
- `LoadingSpinner.jsx` used inside buttons and inline loading indicators.

---

## Error States

- Form validation errors displayed inline below fields.
- API errors toasted via `useToast` hook / `toast.store.js`.
- 401 errors trigger auto-refresh; persistent 401 clears session and redirects to login.
- 403 `MUST_CHANGE_PASSWORD` redirects to change-password page.
- Network/500 errors show a toast with a generic message (rate-throttled to avoid spam).

---

## Notifications

- `NotificationsModal.jsx` opens from the topbar bell icon.
- Shows list of in-app notifications with unread badge count.
- Mark single or all as read via API calls.

---

## Theme

- Dark/light mode toggle via `ThemeToggle.jsx`.
- Theme preference persisted in `localStorage` via `theme.store.js` + `utils/theme.js`.
- Applied via a `dark` class on the `<html>` element (Tailwind dark mode).

---

## Animations

- `framer-motion` used for page transitions and modal/panel animations.
- Entry/exit animations on modals, toasts, and dropdown menus.

---

## Zustand Stores

| Store | File | State |
|-------|------|-------|
| Auth | `store/auth.store.js` | `user`, `isAuthenticated`, `isBootstrapping` |
| Theme | `store/theme.store.js` | `theme` (`light` / `dark`) |
| Toast | `store/toast.store.js` | Toast queue with `success`, `error`, `info` helpers |

---

## Upload Components

| Component | File | Purpose |
|-----------|------|---------|
| `ImageUploadField.jsx` | `components/upload/` | Generic image upload with preview |
| `OrganizationLogoUpload.jsx` | `components/upload/` | Specialized logo upload for organization settings |

---

## Analytics Components (`components/analytics/`)

| Component | Purpose |
|-----------|---------|
| `AnalyticsLayout.jsx` | Wrapper layout for analytics sections |
| `AnalyticsSection.jsx` | Section container with title |
| `AnalyticsStatCard.jsx` | Stat card for analytics dashboard |
| `AnalyticsStatsGrid.jsx` | Responsive grid of stat cards |
| `DistributionList.jsx` | Shows percentage distribution of results |
| `RankingList.jsx` | Ordered ranking list for competition |
| `TrendList.jsx` | Trend data list |
| `EmptyAnalyticsState.jsx` | Empty state for analytics when no data |
| `ReportActionsBar.jsx` | Export/share actions for report page |
| `ReportDocument.jsx` | Printable report document component |

---

## Brand Components

| Component | Purpose |
|-----------|---------|
| `VotrixLogo.jsx` | Full Votrix logo with wordmark |
| `VotrixMark.jsx` | Icon-only mark |

---

**Last Updated:** 2026-07-04
**Documentation Version:** 1.0.0
**Related Files:** `frontend/src/pages/`, `frontend/src/components/`, `frontend/src/layouts/`, `frontend/src/store/`
**Related Documentation:** `docs/ai/PROJECT_STRUCTURE.md`, `docs/ai/FEATURES.md`
