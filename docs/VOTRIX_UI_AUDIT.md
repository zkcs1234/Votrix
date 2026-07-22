# VOTRIX UI Discovery & Documentation

## Objective

You are a senior UX Architect, Product Designer, Frontend Engineer, and System Analyst. Your task is **NOT** to redesign the application. Your task is to fully understand and document the current VOTRIX application so another AI (Figma AI) can redesign it accurately.

---

# 1. Site Map

```
/
├── /login (Guest)
├── /forgot-password (Guest)
├── /reset-password (Guest)
├── /change-password (Authenticated)
│
├── /admin (Admin)
│   ├── /admin/organizers
│   ├── /admin/events
│   ├── /admin/settings
│   └── /admin/audit-logs
│
├── /organizer (Organizer)
│   ├── /organizer/election
│   │   ├── /organizer/election/events
│   │   ├── /organizer/election/events/new
│   │   ├── /organizer/election/events/:eventId/edit
│   │   ├── /organizer/election/events/:eventId/positions
│   │   ├── /organizer/election/events/:eventId/candidates
│   │   ├── /organizer/election/events/:eventId/voters
│   │   └── /organizer/election/events/:eventId/analytics
│   │
│   ├── /organizer/competition
│   │   ├── /organizer/competition/events
│   │   ├── /organizer/competition/events/new
│   │   ├── /organizer/competition/events/:eventId/edit
│   │   ├── /organizer/competition/events/:eventId/workspace
│   │   ├── /organizer/competition/events/:eventId/contestants
│   │   ├── /organizer/competition/events/:eventId/criteria
│   │   ├── /organizer/competition/events/:eventId/judges
│   │   ├── /organizer/competition/events/:eventId/rankings
│   │   └── /organizer/competition/events/:eventId/analytics
│   │
│   ├── /organizer/polling
│   │   ├── /organizer/polling/events
│   │   ├── /organizer/polling/events/new
│   │   ├── /organizer/polling/events/:eventId/settings
│   │   ├── /organizer/polling/events/:eventId/builder
│   │   ├── /organizer/polling/events/:eventId/respondents
│   │   └── /organizer/polling/events/:eventId/analytics
│   │
│   └── /organizer/reports
│       ├── /organizer/reports/election/:eventId
│       ├── /organizer/reports/competition/:eventId
│       └── /organizer/reports/polling/:eventId
│
├── /voter (Voter)
│   ├── /voter
│   ├── /voter/events/:eventId (Election voting)
│   ├── /voter/polling/events/:eventId (Poll voting)
│   └── /voter/competition/events/:eventId/score (Judge scoring)
│
└── /* (404 Not Found)
```

---

# 2. Route List

| Route | Method | User Role | Description |
|-------|--------|-----------|-------------|
| `/` | GET | Guest | Root - shows login for guests, redirects authenticated |
| `/login` | GET | Guest | Login page (alias for root) |
| `/forgot-password` | GET | Guest | Password reset request |
| `/reset-password` | GET | Guest | Password reset form |
| `/change-password` | GET | Any authenticated | Force password change |
| `/admin` | GET | Admin | Admin dashboard |
| `/admin/organizers` | GET | Admin | Organizer account management |
| `/admin/events` | GET | Admin | Global events overview |
| `/admin/settings` | GET | Admin | System settings |
| `/admin/audit-logs` | GET | Admin | Audit log viewer |
| `/organizer` | GET | Organizer | Organizer dashboard |
| `/organizer/election` | GET | Organizer | Election module dashboard |
| `/organizer/election/events` | GET | Organizer | Election events list |
| `/organizer/election/events/new` | GET | Organizer | Create election event |
| `/organizer/election/events/:eventId/edit` | GET | Organizer | Edit election event |
| `/organizer/election/events/:eventId/positions` | GET | Organizer | Manage positions |
| `/organizer/election/events/:eventId/candidates` | GET | Organizer | Manage candidates |
| `/organizer/election/events/:eventId/voters` | GET | Organizer | Manage voters |
| `/organizer/election/events/:eventId/analytics` | GET | Organizer | Election analytics |
| `/organizer/competition` | GET | Organizer | Competition module dashboard |
| `/organizer/competition/events` | GET | Organizer | Competition events list |
| `/organizer/competition/events/new` | GET | Organizer | Create competition |
| `/organizer/competition/events/:eventId/edit` | GET | Organizer | Edit competition |
| `/organizer/competition/events/:eventId/workspace` | GET | Organizer | Competition workspace |
| `/organizer/competition/events/:eventId/contestants` | GET | Organizer | Manage contestants |
| `/organizer/competition/events/:eventId/criteria` | GET | Organizer | Manage criteria |
| `/organizer/competition/events/:eventId/judges` | GET | Organizer | Manage judges |
| `/organizer/competition/events/:eventId/rankings` | GET | Organizer | View rankings |
| `/organizer/competition/events/:eventId/analytics` | GET | Organizer | Competition analytics |
| `/organizer/polling` | GET | Organizer | Polling module dashboard |
| `/organizer/polling/events` | GET | Organizer | Polling events list |
| `/organizer/polling/events/new` | GET | Organizer | Create poll |
| `/organizer/polling/events/:eventId/settings` | GET | Organizer | Poll settings |
| `/organizer/polling/events/:eventId/builder` | GET | Organizer | Poll question builder |
| `/organizer/polling/events/:eventId/respondents` | GET | Organizer | Manage respondents |
| `/organizer/polling/events/:eventId/analytics` | GET | Organizer | Polling analytics |
| `/organizer/reports` | GET | Organizer | Reports overview |
| `/organizer/reports/election/:eventId` | GET | Organizer | Election report |
| `/organizer/reports/competition/:eventId` | GET | Organizer | Competition report |
| `/organizer/reports/polling/:eventId` | GET | Organizer | Polling report |
| `/voter` | GET | Voter | Voter dashboard |
| `/voter/events/:eventId` | GET | Voter | Election voting page |
| `/voter/polling/events/:eventId` | GET | Voter | Poll voting page |
| `/voter/competition/events/:eventId/score` | GET | Voter (Judge) | Judge scoring page |
| `/*` | GET | Any | 404 Not Found |

---

# 3. User Roles

| Role | Dashboard | Capabilities |
|------|-----------|--------------|
| **Guest** | None | Login, forgot password, reset password |
| **Admin** | `/admin` | Manage organizers, view all events, system settings, audit logs |
| **Organizer** | `/organizer` | Manage elections, competitions, polling, view reports |
| **Voter** | `/voter` | Vote in elections, respond to polls, score competitions (as judge) |

---

# 4. User Flows

## Guest Flow
```
Landing → Login → Dashboard (role-based)
```

## Admin Flow
```
Login → Admin Dashboard
         ├─→ Organizer Management → Create/Approve/Suspend Organizer
         ├─→ Global Events → View All Events
         ├─→ System Settings → Configure Platform
         └─→ Audit Logs → View Activity Logs
```

## Organizer Flow
```
Login → Organizer Dashboard
         ├─→ Election Module
         │    ├─→ Events → Create/Edit → Positions → Candidates → Voters → Analytics
         │    └─→ Reports → Election Report
         │
         ├─→ Competition Scoring Module
         │    ├─→ Events → Create/Edit → Contestants → Criteria → Judges → Rankings → Analytics
         │    └─→ Reports → Competition Report
         │
         ├─→ Polling Module
         │    ├─→ Events → Create/Edit → Builder → Respondents → Analytics
         │    └─→ Reports → Polling Report
         │
         └─→ Reports Overview
```

## Voter Flow
```
Login → Voter Dashboard
         ├─→ Active Events (Voting/Scoring/Polls open)
         ├─→ Assigned Events (Not yet open)
         └─→ Completed Events
              ├─→ Election: Vote in /events/:eventId
              ├─→ Poll: Respond to /polling/events/:eventId
              └─→ Competition: Score /competition/events/:eventId/score
```

---

# 5. Page Inventory

## Authentication Pages

### Login Page (`/login`)
- **Purpose:** Authenticate users
- **User Role:** Guest
- **Navigation:** Root path `/`, `/login`
- **Components:**
  - Logo (VotrixLogo)
  - Title: "Sign in to VOTRIX"
  - Description text
  - Email input with icon (Mail)
  - Password input (PasswordInput)
  - "Remember me" checkbox
  - "Forgot password?" link
  - Error message display
  - Submit button with loading state
  - Animated card container (framer-motion)
- **States:** Default, Loading, Error

### Forgot Password Page (`/forgot-password`)
- **Purpose:** Request password reset
- **User Role:** Guest
- **Components:**
  - Mail icon header
  - Title: "Forgot password"
  - Description: instructions
  - Email input with icon
  - Error/success message display
  - Submit button
  - Back to login link

### Reset Password Page (`/reset-password`)
- **Purpose:** Set new password
- **User Role:** Guest
- **Components:** New password input, confirm password input, submit button

### Change Password Page (`/change-password`)
- **Purpose:** Force password change
- **User Role:** Authenticated (any role)
- **Components:** Current password, new password, confirm, submit

---

## Admin Pages

### Admin Dashboard (`/admin`)
- **Purpose:** Platform overview
- **Components:**
  - PageHeader with title and Create organizer button
  - StatCard grid (5 columns): Total organizers, Total events, Total voters, Active events, Votes cast
  - Quick action cards (links to Organizers, Events, Settings)
  - Quick actions list with links
  - Recent activity list
  - Two charts: Monthly events (AreaChart), Voter growth (AreaChart)
  - Skeleton loading states
- **Interactions:** Real-time updates via WebSocket

### Organizer Management (`/admin/organizers`)
- **Purpose:** Manage organizer accounts
- **Components:**
  - Header with title and Create organizer button
  - StatCard grid: Total, Pending, Active, Suspended
  - SearchInput (search by email/organization)
  - Filter buttons: All, Pending, Active, Suspended, Archived
  - Table with columns: Email, Status, Organizations, Created, Actions
  - Status badges (Badge component)
  - Action buttons: Approve, Suspend, Reinstate, Archive
  - CreateOrganizerModal
  - Success/error toast notifications

### Global Events (`/admin/events`)
- **Purpose:** View all platform events
- **Components:** Event table with module type, organizer, status

### System Settings (`/admin/settings`)
- **Purpose:** Platform configuration
- **Components:** Settings form

### Audit Logs (`/admin/audit-logs`)
- **Purpose:** View activity logs
- **Components:** Log table with timestamps, actions, users

---

## Organizer Pages

### Organizer Dashboard (`/organizer`)
- **Purpose:** Overview and module access
- **Components:**
  - Welcome header with user email
  - StatCard grid (4): Total events, Active events, Finished events, Assigned voters
  - Module cards (3): Election, Competition Scoring, Polling
    - Each card: Illustration image, Icon, Title, Description, CTA button
  - Analytics & Reports link card
  - Recent activity list (Card)
  - Monthly event growth chart (AreaChartView)
  - Participation by module chart (PieChartView)

### Election Module

#### Election Dashboard (`/organizer/election`)
- **Purpose:** Election overview
- **Components:** Stat cards, event list, quick actions

#### Election Events (`/organizer/election/events`)
- **Purpose:** List election events
- **Components:**
  - Header with "New event" button
  - EventCard list:
    - Event title (Link)
    - Status badge
    - Toggle voting button (Open/Close voting)
    - Edit button
  - Skeleton loading states

#### Election Event Form (`/organizer/election/events/new`, `/.../edit`)
- **Purpose:** Create/edit election
- **Components:**
  - Step indicator (Step 1: Details → Step 2: Branding)
  - Step 1: Title, Description, Start/End Date, Results visibility radio options
  - Step 2: ImageUploadField for banner
  - Back/Submit buttons
  - DateTimeInput component
  - Validation messages

#### Election Positions (`/organizer/election/events/:eventId/positions`)
- **Purpose:** Manage election positions
- **Components:** Position list, Add position form

#### Election Candidates (`/organizer/election/events/:eventId/candidates`)
- **Purpose:** Manage candidates per position
- **Components:** Candidate cards, Add candidate form

#### Election Voters (`/organizer/election/events/:eventId/voters`)
- **Purpose:** Manage voter assignments
- **Components:** Voter table, Invite voters

#### Election Analytics (`/organizer/election/events/:eventId/analytics`)
- **Purpose:** View election results
- **Components:** Charts, vote summaries

### Competition Module

#### Competition Dashboard (`/organizer/competition`)
- **Purpose:** Competition overview

#### Competition Events (`/organizer/competition/events`)
- **Purpose:** List competition events
- **Components:** EventCard list with scoring toggle

#### Competition Event Form (`/organizer/competition/events/new`, `/.../edit`)
- **Purpose:** Create/edit competition

#### Competition Workspace (`/organizer/competition/events/:eventId/workspace`)
- **Purpose:** Quick access workspace

#### Competition Contestants (`/organizer/competition/events/:eventId/contestants`)
- **Purpose:** Manage contestants

#### Competition Criteria (`/organizer/competition/events/:eventId/criteria`)
- **Purpose:** Scoring criteria management
- **Components:** Criteria list, Add criteria form (name, weight, min/max score)

#### Competition Judges (`/organizer/competition/events/:eventId/judges`)
- **Purpose:** Manage judges

#### Competition Rankings (`/organizer/competition/events/:eventId/rankings`)
- **Purpose:** View rankings
- **Components:** Ranking table, scores breakdown

#### Competition Analytics (`/organizer/competition/events/:eventId/analytics`)
- **Purpose:** View competition analytics

### Polling Module

#### Polling Dashboard (`/organizer/polling`)
- **Purpose:** Polling overview

#### Polling Events (`/organizer/polling/events`)
- **Purpose:** List poll events

#### Polling Event Form (`/organizer/polling/events/new`, `/.../settings`)
- **Purpose:** Create/edit poll settings

#### Polling Builder (`/organizer/polling/events/:eventId/builder`)
- **Purpose:** Build poll questions
- **Components:** Question builder, question types (single choice, multiple choice, text)

#### Polling Respondents (`/organizer/polling/events/:eventId/respondents`)
- **Purpose:** Manage respondents

#### Polling Analytics (`/organizer/polling/events/:eventId/analytics`)
- **Purpose:** View poll results
- **Components:** Response charts, statistics

### Reports

#### Reports Overview (`/organizer/reports`)
- **Purpose:** Access all reports
- **Components:**
  - EventList sections: Elections, Competitions, Polling
  - Each event shows: title, turnout/stats

#### Election Report (`/organizer/reports/election/:eventId`)
- **Purpose:** Detailed election report

#### Competition Report (`/organizer/reports/competition/:eventId`)
- **Purpose:** Detailed competition report

#### Polling Report (`/organizer/reports/polling/:eventId`)
- **Purpose:** Detailed polling report

---

## Voter Pages

### Voter Dashboard (`/voter`)
- **Purpose:** View assigned events
- **Components:**
  - Header with user email
  - StatCard grid (4): Assigned, Active now, Completed, Total
  - EventSection components:
    - "Active events" - voting/scoring open
    - "Assigned events" - not yet open
    - "Completed events" - finished
  - VoterEventCard for each event
  - Empty state if no events

### Voter Event Page (`/voter/events/:eventId`)
- **Purpose:** Cast election vote
- **Components:**
  - Back link
  - Event title and description
  - Progress bar
  - ElectionPositionSection for each position:
    - Position name
    - CandidateVoteControl (radio/checkbox)
    - Skip position option
  - Submit ballot button (fixed bottom on mobile)
  - BallotSubmittedScreen (after submission)
  - Results display (if permitted)

### Voter Poll Page (`/voter/polling/events/:eventId`)
- **Purpose:** Respond to poll

### Judge Scoring Page (`/voter/competition/events/:eventId/score`)
- **Purpose:** Judge scores contestants
- **Components:**
  - Back link
  - Event title
  - Scoring progress indicator
  - CompetitionScoringForm (contestants × criteria matrix)
  - ScoreInput for each cell
  - Validation (min/max per criterion)
  - Submit button
  - Confirmation screen after submission

---

## Error Pages

### Not Found (`/*`)
- **Purpose:** 404 handling
- **Components:** Simple "Page not found" message

---

# 6. Component Inventory

## Shared Components

### AppShell
- **Purpose:** Main layout wrapper with sidebar, header
- **Sub-components:**
  - Sidebar with navigation
  - Header with title, search, notifications, theme toggle, user menu
  - Mobile responsive drawer
  - Collapsible sidebar state
- **Props:** title, moduleLabel, navItems, showSidebar, showSearch, eventId

### Card
- **Purpose:** Content container
- **Variants:** padding (sm, md, lg)
- **CSS class:** `.v-card`

### Button
- **Variants:**
  - `primary` - solid primary color
  - `brand` - gradient with shadow
  - `secondary` - outlined
  - `ghost` - text only
  - `danger` - red for destructive actions
- **Sizes:** sm, md, lg
- **States:** default, hover, disabled, loading

### Input / TextInput
- **Purpose:** Text input field
- **CSS class:** `.v-input`
- **States:** default, focused, error

### PasswordInput
- **Purpose:** Password field with show/hide toggle

### DateTimeInput
- **Purpose:** Date and time picker

### PercentageInput
- **Purpose:** Percentage value input

### ScoreInput
- **Purpose:** Numeric score input

### SearchInput
- **Purpose:** Search with icon

### Badge
- **Purpose:** Status indicator
- **Tones:** default, success, warning, danger

### StatCard
- **Purpose:** Metric display
- **Props:** label, value, icon, valueClassName

### Table / DataTable
- **Purpose:** Tabular data display
- **CSS class:** `.v-table`, `.v-table-wrap`

### EmptyState
- **Purpose:** No data placeholder

### LoadingSpinner
- **Purpose:** Loading indicator

### PageLoader
- **Purpose:** Full page loading

### PageHeader
- **Purpose:** Page title section
- **Props:** title, description, actions

### ProgressBar
- **Purpose:** Progress indicator

### ToastContainer
- **Purpose:** Notification display

### ThemeToggle
- **Purpose:** Light/dark mode switch

### GlobalSearch
- **Purpose:** Global search functionality

### NotificationsModal
- **Purpose:** Notification center

### ImageUploadField
- **Purpose:** Image upload with preview
- **Variants:** avatar, banner

### VotrixLogo
- **Purpose:** Application logo
- **Sizes:** sm, md, lg
- **Props:** showTagline

### AuthFormField
- **Purpose:** Form field with label and error
- **Props:** label, id, error

### SubmitButton
- **Purpose:** Form submit with loading

---

## Module-Specific Components

### VoterEventCard
- **Purpose:** Display event for voter
- **Shows:** Event type icon, title, status badge, action button

### ElectionPositionSection
- **Purpose:** Display position and candidates on ballot
- **Components:** Position name, candidate list, skip option

### CandidateVoteControl
- **Purpose:** Vote selection (radio/checkbox)

### CompetitionScoringForm
- **Purpose:** Judge scoring matrix (contestants × criteria)

### AnalyticsLayout
- **Purpose:** Analytics page wrapper

### AnalyticsStatsGrid
- **Purpose:** Statistics display

### AnalyticsStatCard
- **Purpose:** Individual stat display

### AnalyticsSection
- **Purpose:** Chart section

### RankingList
- **Purpose:** Competition rankings

### ReportActionsBar
- **Purpose:** Report export options

### ReportDocument
- **Purpose:** Report display

### CreateOrganizerModal
- **Purpose:** Create organizer form modal

---

# 7. Form Inventory

### Login Form
- **Fields:**
  - Email (email, required)
  - Password (password, required)
  - Remember me (checkbox)
- **Actions:** Sign in, Forgot password

### Forgot Password Form
- **Fields:**
  - Email (email, required)
- **Actions:** Send reset link

### Reset Password Form
- **Fields:**
  - New password (password, required)
  - Confirm password (password, required)

### Change Password Form
- **Fields:**
  - Current password (password, required)
  - New password (password, required)
  - Confirm password (password, required)

### Create Organizer Form (Modal)
- **Fields:**
  - Email (email, required)
  - Send invite (checkbox)

### Election Event Form
- **Step 1 - Details:**
  - Title (text, required)
  - Description (textarea, optional)
  - Start Date (datetime, optional)
  - End Date (datetime, optional)
  - Results Visibility (radio: real_time, hidden, public)
- **Step 2 - Branding:**
  - Event banner (image upload)

### Election Position Form
- **Fields:**
  - Name (text, required)
  - Allow skip (checkbox)
  - Min vote (number)
  - Max vote (number)

### Election Candidate Form
- **Fields:**
  - Name (text, required)
  - Photo (image, optional)

### Poll Builder Form
- **Fields:**
  - Question text (text)
  - Question type (select: single, multiple, text)
  - Options (dynamic list)

### Competition Criteria Form
- **Fields:**
  - Name (text, required)
  - Weight (number)
  - Min score (number)
  - Max score (number)

---

# 8. Table Inventory

### Organizer Table
- **Columns:** Email, Status, Organizations, Created, Actions
- **Features:** Search, filter by status, sort, pagination, row actions

### Event Table (Various)
- **Columns:** Title, Status, Dates, Actions
- **Features:** Filtering, sorting

### Voter Table
- **Columns:** Name, Email, Status, Actions
- **Features:** Search, invite, remove

### Respondent Table
- **Columns:** Name, Email, Response status, Date
- **Features:** Export

### Audit Log Table
- **Columns:** Timestamp, User, Action, Details
- **Features:** Filtering, export

---

# 9. Modal Inventory

### CreateOrganizerModal
- **Trigger:** "Create organizer" button
- **Content:** Email input, send invite checkbox
- **Actions:** Create, Cancel

### NotificationsModal
- **Trigger:** Bell icon in header
- **Content:** Notification list
- **Actions:** Mark as read, close

### Confirm Dialog (Various)
- **Trigger:** Delete/destructive actions
- **Content:** Title, message, confirm/cancel buttons

---

# 10. Notification Inventory

### Toast Notifications
- **Types:** Success (green), Error (red), Warning (amber), Info (blue)
- **Display:** Bottom-right, slide-in animation

### Inline Alerts
- **Usage:** Form validation errors, success messages
- **Styles:** Border + background color match severity

### Badge Notifications
- **Usage:** Unread notification count on bell icon

### Status Badges
- **Variants:** Success (green), Warning (amber), Danger (red), Default (gray)

---

# 11. Design System Audit

## Color Palette

### Light Theme
| Token | Value | Usage |
|-------|-------|-------|
| `--v-bg` | #f3f4f6 | Page background |
| `--v-surface` | #ffffff | Cards, inputs |
| `--v-surface-elevated` | #f9fafb | Elevated surfaces |
| `--v-border` | #e5e7eb | Borders |
| `--v-border-strong` | #d1d5db | Strong borders |
| `--v-text` | #111827 | Primary text |
| `--v-text-muted` | #374151 | Secondary text |
| `--v-text-subtle` | #6b7280 | Tertiary text |
| `--v-sidebar` | #111827 | Sidebar background |
| `--v-sidebar-text` | #d1d5db | Sidebar text |
| `--v-sidebar-active` | #ffffff | Active sidebar item |
| `--v-primary` | #4f46e5 | Primary actions (Indigo) |
| `--v-primary-hover` | #4338ca | Primary hover |
| `--v-primary-soft` | #eef2ff | Primary soft background |
| `--v-brand-accent` | #7c3aed | Gradient end (Violet) |
| `--v-success` | #059669 | Success states |
| `--v-success-bg` | #ecfdf5 | Success background |
| `--v-danger` | #b91c1c | Danger/error |
| `--v-danger-bg` | #fef2f2 | Danger background |
| `--v-warning` | #b45309 | Warning states |
| `--v-warning-bg` | #fffbeb | Warning background |

### Dark Theme
| Token | Value | Usage |
|-------|-------|-------|
| `--v-bg` | #0b0f14 | Page background |
| `--v-surface` | #111827 | Cards, inputs |
| `--v-surface-elevated` | #1f2937 | Elevated surfaces |
| `--v-border` | #374151 | Borders |
| `--v-border-strong` | #4b5563 | Strong borders |
| `--v-text` | #f9fafb | Primary text |
| `--v-text-muted` | #d1d5db | Secondary text |
| `--v-text-subtle` | #9ca3af | Tertiary text |
| `--v-sidebar` | #0a0d12 | Sidebar |
| `--v-sidebar-text` | #d1d5db | Sidebar text |
| `--v-sidebar-active` | #ffffff | Active sidebar |
| `--v-primary` | #818cf8 | Primary (lighter indigo) |
| `--v-primary-hover` | #a5b4fc | Primary hover |
| `--v-brand-accent` | #c4b5fd | Accent (lighter violet) |
| `--v-success` | #34d399 | Success |
| `--v-danger` | #f87171 | Danger |
| `--v-warning` | #fbbf24 | Warning |

### Module Gradients
| Module | Light Gradient | Dark Gradient |
|--------|---------------|---------------|
| Election | #e0e7ff → #c7d2fe | #312e81 → #3730a3 |
| Competition | #fef3c7 → #fde68a | #451a03 → #78350f |
| Polling | #d1fae5 → #a7f3d0 | #064e3b → #065f46 |

## Typography

### Font Families
- **Sans (Body):** 'Inter', system-ui, -apple-system, sans-serif
- **Display:** 'Plus Jakarta Sans', 'Inter', system-ui, sans-serif
- **Mono (Stats):** 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace

### Font Sizes
| Class | Size | Usage |
|-------|------|-------|
| `.v-page-title` | 1.5rem (24px) | Page titles |
| `.v-section-title` | 1.25rem (20px) | Section titles |
| `.v-display` | clamp(2rem, 4vw, 3rem) | Hero displays |
| `.v-stat-number` | varies | Statistics |
| `.v-body-text` | 0.875rem (14px) | Body text |
| `.v-caption` | 0.75rem (12px) | Captions, labels |
| `.v-label` | 0.875rem (14px) | Form labels |

### Font Weights
- Regular: 400
- Medium: 500
- Semibold: 600
- Bold: 700
- Extra Bold: 800

## Spacing Scale

| Token | Value |
|-------|-------|
| `--spacing-1` | 4px |
| `--spacing-2` | 8px |
| `--spacing-3` | 12px |
| `--spacing-4` | 16px |
| `--spacing-6` | 24px |
| `--spacing-8` | 32px |
| `--spacing-12` | 48px |

## Border Radius

| Class | Value |
|-------|-------|
| Buttons, Inputs | 0.5rem (8px) |
| Cards | 0.75rem (12px) |
| Badges | 9999px (full) |

## Shadows

| Token | Value |
|-------|-------|
| `--v-shadow-sm` | 0 1px 2px 0 rgb(0 0 0 / 0.04) |
| `--v-shadow` | 0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.06) |
| `--v-shadow-md` | 0 4px 6px -1px rgb(0 0 0 / 0.08), 0 2px 4px -2px rgb(0 0 0 / 0.06) |
| `--v-shadow-lg` | 0 10px 15px -3px rgb(0 0 0 / 0.08), 0 4px 6px -4px rgb(0 0 0 / 0.05) |
| `--v-shadow-xl` | 0 20px 25px -5px rgb(0 0 0 / 0.10), 0 8px 10px -6px rgb(0 0 0 / 0.06) |

## Animation

### Durations
- `--duration-fast`: 150ms
- `--duration-normal`: 250ms
- `--duration-slow`: 400ms

### Easing
- `--ease-out`: cubic-bezier(0.16, 1, 0.3, 1)
- `--ease-in-out`: cubic-bezier(0.4, 0, 0.2, 1)

### Animations
- **Page enter:** Fade up (8px) over 250ms
- **Toast enter:** Slide from right over 250ms
- **Button press:** Scale 0.97 over 150ms
- **Skeleton shimmer:** 1.4s linear infinite

---

# 12. Accessibility Audit

### Current Status
- ✅ Focus indicators on interactive elements
- ✅ Semantic HTML (nav, main, header, etc.)
- ✅ Form labels associated with inputs
- ✅ ARIA labels on icon buttons
- ✅ Keyboard navigation support
- ✅ Reduced motion support via `prefers-reduced-motion`
- ⚠️ Some missing aria-expanded on dropdowns
- ⚠️ Some missing aria-describedby for error messages

### Recommendations
1. Add `aria-describedby` to link form errors with inputs
2. Add `aria-live` to toast containers
3. Ensure all images have alt text
4. Add skip to content link
5. Improve color contrast ratios for some subtle text

---

# 13. Responsive Audit

### Breakpoints
- Mobile: < 640px
- Tablet: 640px - 1024px
- Desktop: > 1024px

### Layout Behavior

| Component | Desktop | Tablet | Mobile |
|-----------|---------|--------|--------|
| Sidebar | Fixed, 256px (72px collapsed) | Hidden, drawer | Hidden, drawer |
| Cards | Full width | Full width | Full width |
| Tables | Horizontal scroll | Horizontal scroll | Horizontal scroll |
| Buttons | Inline | Stack on mobile | Full width |
| Header | Full | Compact | Compact |
| Fixed bottom bar | Static | Fixed | Fixed |

### Mobile Considerations
- Sidebar becomes off-canvas drawer
- Tables horizontal scroll
- Buttons stack full-width
- Toast notifications full width
- Bottom navigation for voting pages

---

# 14. UX Problems

## Visual Inconsistencies
- ❌ Different card padding sizes across pages (sm: 1rem, md: 1.5rem, lg: 2rem)
- ❌ Inconsistent use of icons (some pages use stroke 1.5, others stroke 2)
- ❌ Varying button sizes in similar contexts

## Typography Issues
- ⚠️ Font sizes slightly inconsistent between headers
- ⚠️ Some pages use `.v-page-title`, others use inline styles

## Navigation Confusion
- ⚠️ Event-scoped routes require selecting event first (shown as disabled)
- ⚠️ Back button behavior inconsistent
- ⚠️ No breadcrumb navigation on deeply nested pages

## Form Issues
- ⚠️ Multi-step forms (election event) could benefit from progress indicator
- ⚠️ Validation errors sometimes not clearly associated with fields

## Missing Feedback
- ⚠️ Some actions lack loading states
- ⚠️ Optimistic updates not shown in all places
- ⚠️ Empty states could be more helpful

## Responsiveness
- ⚠️ Tables difficult on mobile despite horizontal scroll
- ⚠️ Cards with many actions get cramped
- ⚠️ Modal content can overflow on small screens

## Design Patterns
- ⚠️ Some old Tailwind patterns mixed with new design system
- ⚠️ Dark mode toggle location differs from convention (header vs sidebar)

---

# 15. Recommendations

## High Priority
1. **Standardize card padding** - use consistent padding (recommend md: 1.5rem)
2. **Add breadcrumb navigation** - especially for deeply nested routes
3. **Improve mobile tables** - consider card view on mobile
4. **Unify button hierarchy** - consistent sizing across similar contexts
5. **Complete dark mode** - ensure all components properly themed

## Medium Priority
1. **Add progress to multi-step forms** - clear step indicators
2. **Improve empty states** - more actionable empty states
3. **Consistent icon sizing** - standardize stroke widths
4. **Better error association** - aria-describedby for all form errors

## Low Priority
1. **Animation polish** - smooth page transitions
2. **Skeleton improvements** - more representative loading states
3. **Tooltip consistency** - unify tooltip implementation
4. **Accessibility audit** - fix remaining aria attributes

---

# 16. Complete Design Specification for Figma AI

## Application Overview
- **Name:** VOTRIX
- **Type:** Voting, polling, and competition scoring platform
- **Target Users:** Administrators, event organizers, voters, and judges

## Core Modules

### 1. Authentication Module
- Clean, centered login card
- Two-step password reset
- Force password change for security

### 2. Dashboard Module
- Role-based dashboards (Admin, Organizer, Voter)
- Stat cards with icons
- Quick action cards
- Charts and graphs
- Activity feeds

### 3. Election Module
- Event management (CRUD)
- Position and candidate management
- Voter assignment
- Voting interface (ballot)
- Results visibility options

### 4. Competition Scoring Module
- Event management
- Contestant management
- Criteria definition (weighted scoring)
- Judge management
- Scoring matrix (judge view)
- Rankings display

### 5. Polling Module
- Event management
- Question builder
- Multiple question types
- Respondent management
- Response analytics

### 6. Reports Module
- Unified reports overview
- Exportable reports
- Visual charts

## Layout Patterns

### Main Application Shell
- Dark sidebar (desktop) / off-canvas (mobile)
- Sticky header
- Main content area with padding

### Card-Based Content
- Consistent border radius (12px)
- Subtle shadows
- Light borders

### Form Layouts
- Vertical stacking
- Clear label-input associations
- Inline validation

## Interaction Patterns
- Optimistic UI updates
- Real-time updates via WebSocket
- Toast notifications
- Modal dialogs
- Skeleton loading

## Theme
- Light and dark mode
- Primary: Indigo (#4f46e5)
- Accent: Violet (#7c3aed)
- Semantic colors for states

---

*End of VOTRIX UI Documentation*