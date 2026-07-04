# Project Structure

---

## Root

```
Votrix/
├── backend/           # Express API server
├── frontend/          # React SPA
├── docs/              # Project documentation
│   └── ai/            # AI agent documentation (this folder)
├── .github/           # GitHub Actions CI workflows, PR template
├── .gitignore
├── .nvmrc             # Node.js version pin (>=20)
├── package.json       # Root-level (workspace tooling only)
├── render.yaml        # Render deployment config for backend
├── CLAUDE.md          # AI/agent working notes (implementation plans)
└── README.md          # Human-readable project overview
```

---

## Backend (`backend/src/`)

```
backend/src/
├── app.js             # Express app factory (createApp) — middleware + routes
├── server.js          # HTTP server entry point — binds port, attaches WebSocket
│
├── config/
│   ├── env.js         # All env var loading and validation. Source of truth for config.
│   ├── database.js    # Supabase client singleton (getSupabase, checkDatabaseConnection)
│   ├── cloudinary.js  # Cloudinary SDK config
│   ├── resend.js      # Resend email client singleton
│   ├── security.js    # Production security assertions (assertProductionSecurity)
│   └── cookieOptions.js # getCookieOptions, getAuthCookieOptions, getCsrfCookieOptions
│
├── controllers/       # HTTP request handlers. Thin — delegate to services.
│   ├── admin.controller.js
│   ├── auth.controller.js
│   ├── competition.controller.js        # Competition Phase 4–6 (categories, rounds, judges)
│   ├── election-organizer.controller.js
│   ├── election-voter.controller.js
│   ├── health.controller.js
│   ├── notifications.controller.js
│   ├── organizer.controller.js          # General organizer (overview, dashboard, notify)
│   ├── pageant-judge.controller.js      # Judge scoring sheet + submit
│   ├── pageant-organizer.controller.js  # Competition/pageant organizer CRUD
│   ├── polling-organizer.controller.js
│   ├── polling-voter.controller.js
│   ├── reports-organizer.controller.js
│   └── voter.controller.js              # Voter overview + login redirect
│
├── middleware/
│   ├── auth.js         # authenticate, authorize, requirePasswordChanged, requireActiveAccount
│   ├── csrf.js         # CSRF double-submit cookie validation middleware
│   ├── errorHandler.js # notFoundHandler + global errorHandler
│   ├── queryParser.js  # Parses and normalizes query string params
│   ├── rateLimiter.js  # All rate limiter instances (global, auth, vote, score, etc.)
│   └── upload.js       # multer config for image/file uploads
│
├── routes/
│   ├── index.js                        # Root router — mounts all sub-routers under /api
│   ├── auth.routes.js
│   ├── admin.routes.js
│   ├── organizer.routes.js             # Parent — applies auth middleware, mounts sub-routers
│   ├── election-organizer.routes.js
│   ├── election-voter.routes.js
│   ├── pageant-organizer.routes.js     # Mounts competition sub-routes
│   ├── pageant-judge.routes.js
│   ├── competition-organizer.routes.js # Phase 4–6 competition routes (mergeParams)
│   ├── polling-organizer.routes.js
│   ├── polling-voter.routes.js
│   ├── voter.routes.js                 # Parent voter router
│   ├── notifications.routes.js
│   ├── reports-organizer.routes.js
│   └── health.routes.js
│
├── services/           # Business logic. All DB queries live here.
│   ├── admin.service.js
│   ├── auth.service.js
│   ├── competition.service.js
│   ├── csv-import.service.js           # CSV parsing + voter/judge bulk import
│   ├── dashboard.service.js            # Cross-module dashboard aggregations
│   ├── election.service.js
│   ├── email.service.js                # Email template rendering + send via Resend
│   ├── event.service.js                # Shared event CRUD helpers
│   ├── invitation.service.js           # Create invitations + send emails
│   ├── mailer.service.js               # Low-level Resend API wrapper
│   ├── notification.service.js         # Create + query in-app notifications
│   ├── organization.service.js         # Organization CRUD
│   ├── pageant-csv.service.js          # Judge CSV import
│   ├── pageant.service.js              # Competition/pageant logic + rankings
│   ├── password-reset.service.js       # Token gen, validation, password update
│   ├── polling-registry.service.js     # Question type registry queries
│   ├── polling.service.js              # Poll CRUD + submission logic
│   ├── reports.service.js              # Analytics + report data aggregation
│   ├── token.service.js                # JWT sign + cookie set helpers
│   ├── upload.service.js               # Cloudinary upload wrapper
│   ├── user.service.js                 # findUserById, user account management
│   └── voter.service.js                # Voter overview + event assignments
│
├── validators/         # Input validation (called from controllers before service)
│   ├── auth.validator.js
│   ├── competition.validator.js
│   ├── election.validator.js
│   ├── email.validator.js
│   ├── pageant.validator.js
│   └── polling.validator.js
│
├── utils/
│   ├── ApiError.js       # Custom error class with statusCode + message
│   ├── asyncHandler.js   # Wraps async controllers to pass errors to Express error handler
│   ├── constants.js      # USER_ROLES and other shared constants
│   ├── cookies.js        # Set/clear auth cookies helper
│   ├── crypto.js         # Secure random token generation
│   ├── csrf.js           # CSRF token issue/verify
│   ├── eventSchedule.js  # Date/schedule utilities for events
│   ├── jwt.js            # signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken
│   ├── password.js       # hashPassword, comparePassword (bcrypt wrappers)
│   ├── sanitize.js       # Input sanitization helpers
│   ├── urls.js           # URL construction helpers (e.g. password reset links)
│   └── userMapper.js     # Maps DB user row to safe response shape
│
├── modules/
│   ├── index.js                # Module registry
│   ├── scoring-engine.js       # Weighted average scoring calculation logic
│   └── poll-question-types.js  # Question type resolution helpers
│
├── foundation/         # Generic base layer for DB access patterns
│   ├── index.js
│   ├── db.js           # Low-level Supabase query wrapper
│   ├── repository.js   # Base CRUD repository (findById, findAll, create, update, delete)
│   ├── controller.js   # Base controller helpers
│   ├── errors.js       # Error factory helpers
│   ├── filtering.js    # Query filter builder
│   ├── pagination.js   # Pagination logic + response shape
│   ├── mapper.js       # Row → DTO mapping utilities
│   ├── activity.js     # Activity/audit log helpers
│   └── audit.js        # Audit log write helpers
│
├── templates/
│   └── email/          # HTML email templates (Resend)
│
├── websocket/
│   ├── ws-server.js    # WebSocket server setup + auth + room join on connect
│   ├── ws-rooms.js     # In-memory room Map + broadcast utility
│   └── ws-emitter.js   # Named emit functions called from services
│
└── database/
    ├── README.md        # Manual admin setup instructions
    ├── migrations/      # 19 SQL migration files (run in order)
    ├── scripts/         # hash-password.js utility
    └── seeds/           # Seed data scripts
```

---

## Frontend (`frontend/src/`)

```
frontend/src/
├── main.jsx           # React DOM render entry point
├── index.css          # Global styles + Tailwind base imports
│
├── app/
│   ├── App.jsx         # Root component — wraps router + theme
│   ├── Bootstrap.jsx   # Auth hydration on app start (GET /auth/me)
│   ├── router.jsx      # React Router route tree definition
│   └── routerSuspense.js # Lazy-loaded route wrapper config
│
├── routes/
│   ├── index.jsx       # All route definitions assembled
│   ├── ProtectedRoute.jsx  # Auth + role guard (redirects if not authed or wrong role)
│   └── GuestRoute.jsx      # Redirect authenticated users away from login pages
│
├── layouts/            # Page shell wrappers (no data-fetching, only structure)
│   ├── AppShell.jsx
│   ├── AuthLayout.jsx
│   ├── MainLayout.jsx
│   ├── DashboardLayout.jsx
│   ├── ElectionLayout.jsx
│   ├── PageantLayout.jsx
│   ├── PollingLayout.jsx
│   └── ReportsLayout.jsx
│
├── pages/              # Routed page components. Grouped by role.
│   ├── HomePage.jsx
│   ├── NotFoundPage.jsx
│   ├── auth/           # Login, ChangePassword, ForgotPassword, ResetPassword
│   ├── admin/          # Dashboard, OrganizerManagement, GlobalEvents, Settings, AuditLogs
│   ├── organizer/
│   │   ├── OrganizerDashboardPage.jsx
│   │   ├── election/   # Election-specific organizer pages
│   │   ├── pageant/    # Competition/pageant organizer pages
│   │   ├── polling/    # Polling organizer pages
│   │   └── reports/    # Reports pages
│   └── voter/          # VoterDashboard, VoterEventPage, VoterPollPage, JudgeScoringPage
│
├── components/         # Reusable presentation components
│   ├── ui/             # Generic design system (Button, Input, Table, Badge, etc.)
│   ├── analytics/      # Analytics-specific display components
│   ├── auth/           # AuthFormField, LoginForm, SubmitButton
│   ├── brand/          # VotrixLogo, VotrixMark
│   ├── reports/        # BarChart, TurnoutReport, ReportHeader, StatCard
│   ├── upload/         # ImageUploadField, OrganizationLogoUpload
│   └── voter/          # VoterEventCard, VoterStatusBadge, and module sub-components
│
├── hooks/              # Custom React hooks
│   ├── useAuth.js         # Access auth store (user, isAuthenticated)
│   ├── useAuthBootstrap.js # Bootstrap auth state on mount
│   ├── useCsrfBootstrap.js # Fetch CSRF token on mount
│   ├── useDelayedLoading.js # Debounced loading state (avoid flicker)
│   ├── useLogin.js        # Login form submission logic
│   ├── useOptimistic.js   # Optimistic UI update helper
│   ├── useSocketEvent.js  # Subscribe to WebSocket event type
│   └── useToast.js        # Show toast notifications
│
├── store/              # Zustand global state
│   ├── auth.store.js   # user, isAuthenticated, isBootstrapping, setSession, clearSession
│   ├── theme.store.js  # theme (light/dark), toggle
│   └── toast.store.js  # Toast queue, add/remove, success/error/info helpers
│
├── services/           # Axios API clients — one per domain
│   ├── api.js              # Axios instance + CSRF/refresh interceptors
│   ├── auth.service.js
│   ├── admin.service.js
│   ├── organizer.service.js
│   ├── election.service.js
│   ├── pageant.service.js
│   ├── polling.service.js
│   ├── voter.service.js
│   ├── reports.service.js
│   ├── notifications.service.js
│   └── socket.service.js   # WebSocket connect/disconnect/subscribe/subscribeRoom
│
├── schemas/
│   └── auth.schemas.js  # Zod schemas for auth forms
│
├── modules/            # Feature module exports (barrel files + module-specific logic)
│   ├── admin/
│   ├── analytics/      # Analytics hooks, services, utils
│   ├── competition/    # Competition views
│   ├── election/       # Election views
│   ├── pageant/
│   ├── polling/        # Polling views
│   ├── reports/
│   ├── shared/
│   ├── ui/
│   ├── upload/
│   └── voter/
│
├── utils/
│   ├── auth.js         # Role-based redirect helpers
│   ├── constants.js    # API_BASE_URL, STORAGE_KEYS, etc.
│   ├── csrf.js         # CSRF_HEADER, getCsrfToken, setCsrfToken, clearCsrfToken
│   ├── draftStorage.js # Draft form persistence helpers
│   ├── exportReport.js # Export analytics to PDF/CSV
│   ├── pollValidation.js # Poll answer validation utilities
│   ├── storage.js      # localStorage read/write wrappers
│   ├── theme.js        # Theme detection + apply
│   └── uiClasses.js    # Shared Tailwind class string helpers
│
└── assets/
    ├── hero.png
    └── logo/           # votrix-logo.jpg, votrix-logo.svg, votrix-mark.svg
```

---

**Last Updated:** 2026-07-04
**Documentation Version:** 1.0.0
**Related Files:** All source files
**Related Documentation:** `docs/ai/AI_CONTEXT.md`, `docs/ai/SYSTEM_ARCHITECTURE.md`
