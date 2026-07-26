# VOTRIX Polling Module Enhancement Analysis

## Executive Summary

The VOTRIX Polling module is a well-architected, registry-driven polling system that supports multiple question types, respondent management, invitation workflows, real-time analytics, and report generation. The module shares a common foundation with the Election and Competition Scoring modules, using the same organization/event/voter data model, authentication, authorization, and UI component libraries.

**Overall Assessment:** The Polling module is solid and production-ready for its current scope. The Phase 7 registry-driven question type system (migration 017) was a significant architectural improvement that decoupled question types from application code. The module has strengths in:

- Clean separation of concerns (controllers → services → database)
- Strong validation pipeline (validator → service → poll-question-types engine)
- Real-time WebSocket integration for live dashboard updates
- Extensible question type registry
- Comprehensive analytics with CSV/Excel/PDF/JSON export
- Responsive design with dark mode support
- Draft autosave for respondent experience

**Key Findings:**

- **Strengths:** 18 key areas that should remain unchanged
- **Weaknesses:** 12 areas identified for improvement
- **Critical improvements:** 2 (question duplication, image support enhancement)
- **High improvements:** 5 (drag-and-drop reordering, progress indicator, completion time, accessibility, mobile preview)
- **Medium improvements:** 8 (question bank/templates, bulk operations, respondent-facing status, etc.)
- **Low improvements:** 5 (advanced question types, scheduling UX, etc.)
- **Should NOT implement:** 4 features that would overcomplicate the module

---

## Current Architecture

### Data Flow

```
Organizer (React) → API (Express) → Service Layer → Supabase/PostgreSQL
                     ↑                           ↓
                Validators              WebSocket Emitter
                     ↑                           ↓
                Polling Registry    Organizer Dashboard (real-time)
```

### Database Schema (Polling-Specific Tables)

| Table                        | Purpose                             | Key Columns                                                            |
| ---------------------------- | ----------------------------------- | ---------------------------------------------------------------------- |
| `poll_questions`             | Questions within a poll event       | id, event_id, question, type (enum), sort_order, required, type_config |
| `poll_options`               | Choices for choice-based questions  | id, question_id, label, sort_order                                     |
| `poll_submissions`           | One record per submission per voter | id, event_id, voter_id                                                 |
| `poll_answers`               | Individual answer records           | id, question_id, voter_id, submission_id, answer                       |
| `system_poll_question_types` | Built-in question type registry     | key, label, answer_format, config_schema, ui                           |
| `poll_question_types`        | Per-org overrides/custom types      | organization_id, key, label, answer_format                             |

### Shared Tables

- `events` (with polling-specific columns: polling_enabled, poll_anonymous, poll_allow_multiple_submissions, poll_expires_at)
- `event_voters` (respondent enrollment and has_voted flag)
- `invitations` (invitation tracking)
- `organizations` (polling organization owned by organizer)

### Question Types (Built-in Registry)

1. **single_choice** — Radio buttons, pick one
2. **multiple_choice** — Legacy alias for single_choice
3. **checkbox** — Multi-select
4. **yes_no** — Binary auto-option
5. **rating** — Numeric rating (default 1–5, configurable)
6. **likert_scale** — Agreement scale (3/5/7 point, configurable)
7. **open_text** — Free-form text
8. **ranking** — Ordered ranking with tie support

### Frontend Route Structure

```
/organizer/polling
  / (index)           → PollingDashboardPage
  /events             → PollingEventsPage
  /events/new         → PollingEventFormPage
  /events/:eventId/settings → PollingEventFormPage
  /events/:eventId/builder   → PollingBuilderPage
  /events/:eventId/respondents → PollingRespondentsPage
  /events/:eventId/analytics  → PollingAnalyticsPage

/voter/polling/events/:eventId → VoterPollPage
```

### Organizer Workflow

1. **Create poll** → Set title, description, anonymity, multiple submissions, expiration
2. **Build questions** → Add/edit/delete questions with type selection, config, and options
3. **Manage respondents** → Register manually, import via CSV, send invitations
4. **Open poll** → Toggle polling_enabled to allow responses
5. **View analytics** → Real-time dashboard with charts, distributions, exports
6. **Generate reports** → Full reports with CSV/Excel/PDF/JSON export

### Respondent Workflow

1. **Receive invitation** → Email with login credentials
2. **View poll** → See event details and questions
3. **Answer questions** → Type-appropriate inputs (radio, checkbox, rating, textarea, likert, ranking)
4. **Submit** → Validation, autosave recovery, confirmation screen
5. **Multiple submissions** → If enabled, can submit again

---

## Strengths

### 1. Registry-Driven Question Types (Phase 7 - Keep As-Is)

The question type registry (`system_poll_question_types` + `poll_question_types`) is an excellent architectural decision. New types can be added via a single SQL INSERT without any application code changes. The fallback chain (org override → system → built-in fallbacks) is robust.

### 2. Generic Validation Engine

`modules/poll-question-types.js` provides a single, generic validator/serializer/analytics engine that switches on `answerFormat.kind` (choice/numeric/text/ranking). This means supporting a new kind requires no code changes to the core engine.

### 3. Strong Backend Layering

Controllers handle HTTP concerns, services handle business logic, validators handle input sanitization. This clean separation makes the module maintainable and testable.

### 4. WebSocket Real-Time Updates

The module emits real-time events (`poll:response-submitted`, `poll:polling-toggled`, `organizer:stats-updated`) that update the organizer dashboard without polling.

### 5. Comprehensive Analytics

The analytics pipeline (service → poll-question-types → frontend modules/polling) provides per-question breakdowns with distributions, averages, percentages, and text responses. Export supports CSV, Excel, PDF, and JSON formats.

### 6. Draft Autosave for Respondents

`VoterPollPage` saves answers to localStorage on every change, allowing respondents to recover from browser crashes or accidental navigation.

### 7. Registration/Invitation Separation

The module cleanly separates "register respondent" from "send invitation," giving organizers control over the respondent lifecycle.

### 8. CSV Import with Preview

The CSV import workflow includes a preview step where organizers can see parsed data before committing, reducing errors.

### 9. Consistent UI Component Usage

Reuses `Button`, `Card`, `LoadingSpinner`, `Badge`, `PageHeader`, `StatCard`, `SearchInput`, and other shared UI components. Uses design tokens from `index.css` for theme consistency.

### 10. Responsive Design

The voter-facing poll page (`VoterPollPage`) and organizer pages use responsive layouts with proper mobile breakpoints.

### 11. Dark Mode Support

All theme tokens in `index.css` support both light and dark modes. The polling module inherits this automatically.

### 12. Proper Error Handling

ApiError class with consistent error response format. Validation errors return 400 with descriptive messages. 404 for not-found resources. 409 for duplicate submissions.

### 13. Rate Limiting

Rate limiter middleware applied to email and CSV upload endpoints.

### 14. Image Upload with Cloudinary

Banner and logo uploads use Cloudinary with proper transformations (size limits, quality auto-optimization).

### 15. Accessible Progress Indicator

The voter event page uses `role="progressbar"` with proper aria attributes.

### 16. Invitation-Sent Tracking

The invitation table tracks whether invitations have been sent, supporting batch "send all pending" operations.

### 17. Separate Polling Layout

`PollingLayout` provides contextual navigation (Builder, Settings, Respondents, Analytics) that only shows when an event is selected.

### 18. Type-Safe Answer Validation

Both client-side (`pollValidation.js`) and server-side (`poll-question-types.js`) validate answers with the same logic, preventing invalid data from reaching the database.

---

## Weaknesses

### 1. No Question Duplication

The builder has no "duplicate question" feature. Organizers who need similar questions must recreate them from scratch.

### 2. No Drag-and-Drop Reordering

Questions are ordered by `sort_order` but the builder has no drag-and-drop or move-up/move-down controls. Reordering requires manual `sortOrder` updates via the API.

### 3. Limited Image Support

- No per-question images
- No per-option images (image choice)
- Banner upload is the only image support
- No image optimization pipeline beyond Cloudinary transformations
- No respondent image upload for file-upload question types

### 4. Organizer Builder UX Is Basic

The builder (`PollingBuilderPage`) uses a simple form at the top and a list below. There is no live preview, no collapsible cards for questions, and no visual distinction between question types during editing.

### 5. No Respondent-Facing Progress Indicator

While the answer count is shown ("X of Y questions answered"), there is no visual progress bar or step indicator for the respondent.

### 6. No Autosave Restoration Notification

When a draft is restored from localStorage, the respondent is not notified. They might not realize they are continuing a previously saved session.

### 7. Analytics Missing Key Metrics

- No average completion time
- No completion/drop-off rate
- No "most skipped question" analysis
- No response trends over time
- No per-question time-to-answer

### 8. No Question Search/Filter in Builder

For polls with many questions (20+), the builder has no search, filter, or pagination.

### 9. No Bulk Operations for Respondents

Organizers cannot bulk-delete, bulk-export, or bulk-reinvite respondents from the list.

### 10. Limited Mobile Experience for Builder

The builder page is functional on mobile but the inline editing form takes up significant screen space. A slide-out panel or modal would be more mobile-friendly.

### 11. No Respondent-Facing Poll Status

Respondents see "closed or expired" but have no way to know _when_ the poll will open or what the schedule is.

### 12. Accessibility Gaps

- Poll builder form lacks proper fieldset/legend grouping
- Some interactive elements lack visible focus indicators
- Rating input buttons lack aria-pressed or aria-selected attributes
- Ranking controls lack ARIA live regions for rank changes

---

## Recommended Improvements

### Critical Priority

#### C1. Question Duplication

- **Problem:** Organizers cannot duplicate existing questions
- **Reason:** Common workflow for creating similar questions (e.g., multiple rating questions with different labels)
- **Proposed solution:** Add a "Duplicate" button to each question card in the builder that calls `createQuestion` with the cloned payload
- **Expected benefits:** Reduces repetitive data entry, improves organizer efficiency
- **Potential risks:** Minimal - the question type registry already handles validation
- **Implementation difficulty:** Low
- **Estimated effort:** 0.5 day
- **Breaking change:** No

#### C2. Image Support Enhancement

- **Problem:** Only banner images are supported. No per-question or per-option images
- **Reason:** Visual polls (image choice, image-based questions) are increasingly expected
- **Proposed solution:**
  - Add `image_url` column to `poll_questions` (nullable TEXT)
  - Add `image_url` column to `poll_options` (nullable TEXT)
  - Update builder UI to allow optional image upload for questions and options
  - Update `PollQuestionField` to render images alongside question text or option labels
  - Use existing Cloudinary upload infrastructure
- **Expected benefits:** Enables visual polls, competitive parity with Typeform/Google Forms
- **Potential risks:** Minimal additive change; existing data unaffected
- **Implementation difficulty:** Medium
- **Estimated effort:** 2 days
- **Breaking change:** No (additive migration)

---

### High Priority

#### H1. Drag-and-Drop Question Reordering

- **Problem:** No way to reorder questions in the builder
- **Reason:** Question order matters for respondent experience
- **Proposed solution:**
  - Add `@dnd-kit/core` and `@dnd-kit/sortable` (lightweight, tree-shakeable)
  - Convert question list to sortable container
  - Update all `sort_order` values on drag end via new batch endpoint or sequential updates
  - Backend: Add `PATCH /events/:eventId/questions/reorder` accepting `[{questionId, sortOrder}]`
- **Expected benefits:** Intuitive reordering, parity with Google Forms
- **Potential risks:** Low; DnD packages are well-tested
- **Implementation difficulty:** Medium
- **Estimated effort:** 2-3 days
- **Breaking change:** No

#### H2. Respondent-Facing Progress Indicator

- **Problem:** No visual progress indicator for respondent
- **Reason:** Long polls benefit from showing progress to reduce abandonment
- **Proposed solution:** Add a styled progress bar (reuse `ProgressBar` component or build new) that shows percentage of required questions answered
- **Expected benefits:** Improved respondent experience, higher completion rates
- **Potential risks:** Minimal
- **Implementation difficulty:** Low
- **Estimated effort:** 0.5 day
- **Breaking change:** No

#### H3. Average Completion Time Analytics

- **Problem:** No completion time metrics
- **Reason:** Understanding how long respondents take helps optimize question design
- **Proposed solution:**
  - Add `started_at` and `completed_at` timestamps to `poll_submissions`
  - Track poll start time on the client (set on first interaction)
  - Submit `started_at` alongside answers
  - Compute average, median, min, max completion times in analytics endpoint
  - Display in analytics dashboard
- **Expected benefits:** Actionable insight into poll length appropriateness
- **Potential risks:** Low; additive columns, backward-compatible
- **Implementation difficulty:** Low
- **Estimated effort:** 1 day
- **Breaking change:** No (additive migration)

#### H4. Accessibility Improvements

- **Problem:** Several accessibility gaps identified
- **Reason:** WCAG compliance is a legal and ethical requirement
- **Proposed solution:**
  - Add `fieldset`/`legend` to PollQuestionField for question groups
  - Add `aria-pressed` to rating buttons
  - Add `role="status"` and `aria-live="polite"` for ranking changes
  - Ensure all buttons have visible focus indicators (check existing focus styles)
  - Add skip-to-content link in PollingLayout
- **Expected benefits:** WCAG 2.1 AA compliance, improved screen reader experience
- **Potential risks:** Minimal
- **Implementation difficulty:** Low
- **Estimated effort:** 1-2 days
- **Breaking change:** No

#### H5. Mobile-Responsive Builder Experience

- **Problem:** Builder form takes too much space on mobile
- **Reason:** Mobile organizer usage is common
- **Proposed solution:**
  - Move the add/edit form into a slide-out panel (drawer) or modal on small screens
  - Keep the question list full-width
  - Ensure option inputs are properly sized for touch targets
- **Expected benefits:** Better mobile experience for organizers on-the-go
- **Potential risks:** Low
- **Implementation difficulty:** Medium
- **Estimated effort:** 1-2 days
- **Breaking change:** No

---

### Medium Priority

#### M1. Question Bank / Templates

- **Problem:** Organizers create similar polls repeatedly
- **Reason:** Reducing repetitive work improves adoption
- **Proposed solution:**
  - Add a `poll_templates` table (id, organization_id, name, description, questions JSONB)
  - Allow saving a poll's questions as a template
  - Allow loading templates when creating a new poll
  - No need for complex template sharing initially
- **Expected benefits:** Faster poll creation, consistency across polls
- **Potential risks:** Low; templates are stored as JSONB snapshots
- **Implementation difficulty:** Medium
- **Estimated effort:** 2-3 days
- **Breaking change:** No

#### M2. Bulk Respondent Operations

- **Problem:** Organizers can only manage respondents one at a time
- **Reason:** Large polls need batch operations
- **Proposed solution:**
  - Add checkbox selection to respondent table
  - Add "Select all" / "Deselect all" controls
  - Support bulk delete, bulk resend invitation, bulk export
- **Expected benefits:** Efficient management of large respondent lists
- **Potential risks:** Low
- **Implementation difficulty:** Medium
- **Estimated effort:** 2 days
- **Breaking change:** No

#### M3. Respondent-Facing Poll Status & Schedule

- **Problem:** Respondents don't know when a closed poll will open
- **Reason:** Transparency improves trust
- **Proposed solution:** Show start_date and end_date on the voter poll page when the poll is closed
- **Expected benefits:** Improved respondent communication
- **Potential risks:** Minimal
- **Implementation difficulty:** Low
- **Estimated effort:** 0.5 day
- **Breaking change:** No

#### M4. Review Before Submit

- **Problem:** Respondents cannot review their answers before submitting
- **Reason:** Review step reduces errors and improves confidence
- **Proposed solution:** Add a "Review" step before final submit that displays all answers in read-only mode with an "Edit" button per question
- **Expected benefits:** Professional feel, reduced support requests
- **Potential risks:** Low; additive UX improvement
- **Implementation difficulty:** Medium
- **Estimated effort:** 1-2 days
- **Breaking change:** No

#### M5. Analytics - Completion Rate & Drop-Off

- **Problem:** No completion rate or question-by-question drop-off analytics
- **Reason:** Identifying where respondents abandon helps improve polls
- **Proposed solution:**
  - Compute per-question answer counts as a ratio of total submissions
  - Display as a funnel chart in analytics
  - Highlight questions with significant drop-off
- **Expected benefits:** Actionable insight for poll optimization
- **Potential risks:** Low; uses existing data
- **Implementation difficulty:** Low
- **Estimated effort:** 1 day
- **Breaking change:** No

#### M6. Autosave Restoration Notification

- **Problem:** Respondents aren't notified when draft is restored
- **Reason:** Transparency about saved state improves trust
- **Proposed solution:** Show a subtle toast/banner: "We restored your previous answers"
- **Expected benefits:** Clearer UX
- **Potential risks:** Minimal
- **Implementation difficulty:** Low
- **Estimated effort:** 0.5 day
- **Breaking change:** No

#### M7. Rating Distribution Chart on Analytics Page

- **Problem:** Rating distributions are shown as text rather than visual bars
- **Reason:** Visual representations are more intuitive
- **Proposed solution:** Replace text-based rating distribution with horizontal bar chart (reuse existing `DistributionList` component with `chartType="bar"`)
- **Expected benefits:** Improved data comprehension
- **Potential risks:** Low
- **Implementation difficulty:** Low
- **Estimated effort:** 0.5 day
- **Breaking change:** No

#### M8. Poll Settings - Scheduling UX

- **Problem:** No start_date/end_date configuration in poll settings
- **Reason:** Organizers may want to schedule polls to open/close at specific times
- **Proposed solution:** Add start_date and end_date fields to PollingEventFormPage step 3 (Settings)
- **Expected benefits:** Poll scheduling, automatic open/close
- **Potential risks:** Low; events table already has start_date/end_date columns
- **Implementation difficulty:** Low
- **Estimated effort:** 0.5 day
- **Breaking change:** No

---

### Low Priority

#### L1. Advanced Question Types (Star Rating, Emoji Rating)

- **Problem:** Limited visual question types
- **Reason:** More engaging question types improve respondent experience
- **Proposed solution:**
  - Add `star_rating` and `emoji_rating` to system_poll_question_types
  - Create React components for star and emoji inputs
  - Both are variants of the existing `numeric` answerFormat.kind
- **Expected benefits:** More engaging polls
- **Potential risks:** Low; uses existing engine
- **Implementation difficulty:** Medium
- **Estimated effort:** 2 days
- **Breaking change:** No (additive)

#### L2. File Upload Question Type

- **Problem:** Respondents cannot upload files
- **Reason:** Some polls need document/image submissions
- **Proposed solution:**
  - Add `file_upload` to system_poll_question_types with `answerFormat.kind: 'file'`
  - Create file upload component with Supabase Storage integration
  - Add file size limits and type validation
  - Store file URLs as answer values
- **Expected benefits:** Supports document collection use cases
- **Potential risks:** Medium; storage costs, file validation complexity
- **Implementation difficulty:** Medium-High
- **Estimated effort:** 3 days
- **Breaking change:** No

#### L3. Matrix / Grid Question Type

- **Problem:** No matrix/grid question type
- **Reason:** Useful for comparing multiple items across multiple criteria
- **Proposed solution:**
  - Add new answerFormat.kind: 'matrix' with rows and columns
  - Create matrix input component
  - Requires extending the validation engine, analytics, and options schema
- **Expected benefits:** Enables complex survey structures
- **Potential risks:** Medium; significant engine changes needed
- **Implementation difficulty:** High
- **Estimated effort:** 4-5 days
- **Breaking change:** No (additive answerFormat.kind)

#### L4. Opinion Scale (Single Rating)

- **Problem:** No single-rating opinion scale
- **Reason:** Simple agreement/disagreement scale with visual slider
- **Proposed solution:** Add as a variant of `rating` with a slider UI (input type range)
- **Expected benefits:** More engaging than raw numeric buttons
- **Potential risks:** Low
- **Implementation difficulty:** Low
- **Estimated effort:** 0.5 day
- **Breaking change:** No

#### L5. Date / Time Question Types

- **Problem:** No date or time input types
- **Reason:** Useful for scheduling, event registration, etc.
- **Proposed solution:**
  - Add `date` and `time` types with `answerFormat.kind: 'date'`
  - Create date/time input components
  - Add date validation
- **Expected benefits:** Supports date-based questions
- **Potential risks:** Low
- **Implementation difficulty:** Low
- **Estimated effort:** 1 day
- **Breaking change:** No

---

## Frontend Improvements

### PollingBuilderPage

1. **Add duplicate question button** - Clone question with all options and typeConfig
2. **Add drag-and-drop reordering** - Using @dnd-kit for sortable list
3. **Replace confirm() with modal** - Use a proper confirmation dialog for delete
4. **Add live preview toggle** - Toggle between builder and preview modes
5. **Improve question card design** - Collapsible cards, better visual hierarchy
6. **Add keyboard shortcuts** - Ctrl+Enter to save, Ctrl+D to duplicate

### PollingEventFormPage

1. **Add start_date/end_date fields** - Leverage existing event columns
2. **Single-page form** - Consider merging the 3-step form into a single scrollable page

### PollingRespondentsPage

1. **Add bulk selection** - Checkbox column + batch actions
2. **Add respondent status filter** - All / Voted / Pending / Invited
3. **Add respondent export** - Export registered respondents as CSV
4. **Add pagination** - For large respondent lists (currently loads all at once)

### PollingAnalyticsPage

1. **Add completion time metrics** - Average, median, distribution
2. **Add completion funnel** - Question-by-question drop-off visualization
3. **Improve rating distribution display** - Bar chart instead of text
4. **Add trend chart** - Responses over time (timeline)

### VoterPollPage

1. **Add progress bar** - Visual progress indicator
2. **Add review step** - Summary page before final submission
3. **Add autosave notification** - Toast when draft is restored
4. **Improve accessibility** - fieldset/legend, aria attributes, focus management
5. **Add keyboard navigation** - Tab between questions, Enter to continue

### PollQuestionField Improvements

1. **Image support** - Render question.image_url and option.image_url
2. **Star rating component** - Visual star picker
3. **Slider component** - For opinion scale
4. **Better error states** - Inline validation with visual feedback

---

## Backend Improvements

### New Endpoints

- `PATCH /events/:eventId/questions/reorder` - Batch update sort_order
- `POST /events/:eventId/questions/:questionId/duplicate` - Clone question
- `GET /events/:eventId/respondents/export` - Export respondents as CSV
- `POST /events/:eventId/respondents/bulk-delete` - Batch delete respondents

### Service Enhancements

1. **polling.service.js**:
   - Add `reorderQuestions(eventId, organizerId, order[])` method
   - Add `duplicateQuestion(eventId, organizerId, questionId)` method
   - Add completion time tracking to `submitPollResponse`
   - Add pagination support to `listQuestions` for large polls

2. **polling-registry.service.js**:
   - Add caching layer (in-memory with TTL) to reduce database round-trips
   - Invalidate cache on custom type CRUD operations

3. **reports.service.js**:
   - Improve polling report export to include per-question detail rows
   - Add completion time to report output

### Validation Enhancements

1. **polling.validator.js**:
   - Add `validateReorder` for batch reorder endpoint
   - Add `validateDuplicate` for duplication endpoint
   - Improve `validatePollAnswers` message clarity with field-level errors

### Rate Limiting

1. Add specific rate limits for:
   - Submit poll endpoint (per user, per event)
   - Question CRUD operations (per organizer)

---

## Database Improvements

### Additive Migrations

```sql
-- Migration: polling_enhancements_phase1

-- 1. Image support for questions and options
ALTER TABLE poll_questions
  ADD COLUMN IF NOT EXISTS image_url TEXT;

ALTER TABLE poll_options
  ADD COLUMN IF NOT EXISTS image_url TEXT;

-- 2. Completion time tracking
ALTER TABLE poll_submissions
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- 3. Template support
CREATE TABLE IF NOT EXISTS poll_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,
  description     TEXT,
  questions       JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_poll_templates_org_id ON poll_templates (organization_id);

CREATE TRIGGER trg_poll_templates_updated_at
  BEFORE UPDATE ON poll_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 4. Add computed columns for analytics
-- Add response_count to poll_questions for faster queries
-- Note: This can be a view or materialized view for complex analytics
CREATE OR REPLACE VIEW v_poll_question_stats AS
SELECT
  pq.id AS question_id,
  pq.event_id,
  pq.question,
  pq.type,
  COUNT(pa.id) AS response_count,
  COUNT(DISTINCT pa.submission_id) AS submission_count
FROM poll_questions pq
LEFT JOIN poll_answers pa ON pa.question_id = pq.id
GROUP BY pq.id, pq.event_id, pq.question, pq.type;
```

### Indexes

```sql
-- Index for completion time queries
CREATE INDEX idx_poll_submissions_completed_at
  ON poll_submissions (event_id, completed_at);

-- Index for question image queries
CREATE INDEX idx_poll_questions_image_url
  ON poll_questions (image_url)
  WHERE image_url IS NOT NULL;
```

All changes are **additive** and backward-compatible. No existing columns, tables, or constraints are modified.

---

## Image Upload Improvements

### Current State

- Cloudinary integration exists for banners and logos
- Upload middleware supports JPEG, PNG, WebP, GIF (5MB limit)
- Cloudinary transformations handle resizing and quality optimization

### Recommended Enhancements

1. **Per-Question Images**
   - Add `image_url` column to `poll_questions` (see database section)
   - Add image upload field to PollingBuilderPage per question
   - Render image above question text in PollQuestionField
   - Use existing `uploadImageFile` with `UPLOAD_KIND.QUESTION_IMAGE` config

2. **Per-Option Images**
   - Add `image_url` column to `poll_options`
   - Add image upload per option in builder
   - Render images next to option labels in PollQuestionField
   - Image Choice becomes a natural extension of single_choice/checkbox types

3. **New Upload Kinds**

   ```javascript
   UPLOAD_KIND.QUESTION_IMAGE = 'question_image'
   UPLOAD_KIND.OPTION_IMAGE = 'option_image'

   // Config for each
   {
     folder: 'votrix/questions',
     transformation: [{ width: 800, height: 600, crop: 'limit', quality: 'auto' }]
   },
   {
     folder: 'votrix/options',
     transformation: [{ width: 200, height: 200, crop: 'fill', gravity: 'auto', quality: 'auto' }]
   }
   ```

4. **Respondent Image Upload (for file_upload type)**
   - Use Supabase Storage (already available in the ecosystem)
   - Public read, authenticated write policies
   - File size limit: 10MB
   - Accepted types: JPEG, PNG, WebP, PDF

5. **Image Optimization Pipeline**
   - Already handled by Cloudinary transformations
   - Consider adding lazy loading (`loading="lazy"`) for question images
   - Add image preview modal for clicking on images

---

## UI / UX Improvements

### Design Language Consistency

The polling module already follows the VOTRIX design system (v-card, v-input, v-badge, v-page-title, etc.). Improvements should maintain this consistency.

### Specific UI Improvements

1. **Question Cards in Builder**
   - Add visual icons for question types (radio, checkbox, star, text, etc.)
   - Show mini-preview of the question input inside the card
   - Add color coding by question type

2. **Empty States**
   - Improve empty state for poll builder ("Add your first question" → show illustration + example)
   - Improve empty state for respondents page (illustration + guide)

3. **Loading States**
   - Already good with Skeleton components and delayed loading
   - Add skeleton for analytics page charts

4. **Error States**
   - Add inline field validation with visual indicators
   - Show toast notifications for background operations (save, delete, send)

5. **Navigation**
   - Add breadcrumb navigation to PollingLayout
   - Add "Back to events" link on event-specific pages

6. **Confirmation Dialogs**
   - Replace `confirm()` with reusable `ConfirmDialog` component
   - Use for: delete question, delete respondent, close poll, open poll

### Desktop vs Mobile Considerations

| Page                  | Desktop                  | Mobile                               |
| --------------------- | ------------------------ | ------------------------------------ |
| Builder               | Side-by-side form + list | Drawer/modal for editing             |
| Respondent management | Full table with bulk ops | Card-based list with swipe actions   |
| Analytics             | Multi-column grid        | Single-column stack                  |
| Voter poll            | Centered max-w-2xl       | Full-width with larger touch targets |

---

## Analytics Improvements

### Current Analytics Output

- Total submissions
- Per-question breakdown:
  - Choice: option counts and percentages
  - Numeric: distribution and average
  - Ranking: average rank per option
  - Text: individual responses
- Participation rate (responded users / assigned users)
- Anonymous mode indicator

### Recommended Enhancements

1. **Completion Rate**

   ```javascript
   completionRate = submissionsWithAllQuestionsAnswered / totalSubmissions;
   ```

2. **Average Completion Time**

   ```javascript
   avgCompletionTime = avg(completed_at - started_at) across all submissions
   ```

3. **Drop-Off Per Question**

   ```javascript
   dropOff = 1 - answersForQuestion / totalSubmissions;
   ```

4. **Response Trends Over Time**
   - Group submissions by day/hour
   - Show cumulative response growth chart

5. **Response Filters**
   - Date range filter
   - Partial vs complete submissions filter
   - Specific question answer filter

6. **Export Enhancements**
   - Include completion time in CSV export
   - Add per-respondent answer matrix export (respondent × question)

### Analytics Dashboard Layout (Improved)

```
┌──────────────────────────────────────────────┐
│  Poll Analytics           [Export] [Refresh]  │
├──────────────────────────────────────────────┤
│  Total      Responses    Rate      Avg Time  │
│  Subscribers Submitted   (68%)    2m 34s     │
├──────────────────────────────────────────────┤
│  Responses Over Time        [bar chart]      │
├──────────────────────────────────────────────┤
│  Completion Funnel          [funnel chart]   │
│  Q1: 100% ───────────────────────────────── │
│  Q2:  95% ───────────────────────────       │
│  Q3:  82% ─────────────────────             │
│  Q4:  78% ──────────────────                │
├──────────────────────────────────────────────┤
│  Per-Question Breakdown                      │
│  ┌─────────────────────────────────────────┐│
│  │ Q1: How satisfied...?   Rating 4.2/5    ││
│  │ [bar chart distribution]                ││
│  ├─────────────────────────────────────────┤│
│  │ Q2: Choose options     Choice           ││
│  │ [pie chart distribution]                ││
│  └─────────────────────────────────────────┘│
└──────────────────────────────────────────────┘
```

---

## Security Improvements

### Current Security Status

- Rate limiting on email/CSV endpoints
- Image upload MIME type validation
- Cloudinary SSRF protection (Buffer check)
- Authorization via `assertOrganizerOwnsEvent` and `assertVoterCanRespond`
- CSRF middleware
- Input sanitization with validators

### Recommended Enhancements

1. **Answer Injection Prevention**
   - Add content security policy for answer text (strip HTML tags)
   - Validate answer JSONB structure against expected schema

2. **File Upload Hardening**
   - Add file signature validation (magic bytes) beyond MIME type
   - Add virus scanning consideration for file upload question type

3. **Rate Limiting Expansion**
   - Add rate limiting to question CRUD (prevent mass deletion)
   - Add rate limiting to submit poll endpoint (prevent spam submissions)
   - Add rate limiting to analytics endpoint

4. **Audit Logging Enhancement**
   - Log all question modifications (create/update/delete) with before/after snapshots
   - Log respondent registration and invitation events
   - Log poll open/close toggles

5. **Supabase RLS Policies**
   - Add Row Level Security for polling tables if using Supabase direct access
   - Create policies: `user_id = auth.uid()` for voter operations

6. **Input Validation Hardening**
   - Add max length to all text fields (question text: 1000 chars, option label: 255 chars)
   - Add max option count (50 options per question)
   - Add max question count (100 questions per poll)

---

## Performance Improvements

### Current Performance Considerations

- `listQuestions` loads all questions and options for an event in two queries
- Analytics loads all answers at once (no pagination)
- Dashboard aggregates stats across all polls
- No caching layer

### Recommended Improvements

1. **Database Indexes**

   ```sql
   -- Add composite index for analytics queries
   CREATE INDEX idx_poll_answers_question_submission
     ON poll_answers (question_id, submission_id);

   -- Add index for event_id + created_at ordering on submissions
   CREATE INDEX idx_poll_submissions_event_created
     ON poll_submissions (event_id, created_at DESC);
   ```

2. **Question Caching**
   - Cache `loadQuestionTypeRegistry` with TTL (e.g., 5 minutes)
   - Invalidate on custom type changes
   - Reduces database round-trips on every question operation

3. **Lazy Loading for Responses**
   - Paginate text responses in analytics (fetch first 50, load more on demand)
   - Paginate respondent list (backend already supports page/limit, but frontend doesn't use it)

4. **Optimize Analytics Queries**
   - Use database aggregations instead of client-side computation
   - Consider materialized view for complex analytics:

   ```sql
   CREATE MATERIALIZED VIEW mv_poll_daily_stats AS
   SELECT
     event_id,
     DATE(created_at) as day,
     COUNT(*) as submissions
   FROM poll_submissions
   GROUP BY event_id, DATE(created_at);
   ```

5. **React Component Optimization**
   - Memoize PollQuestionField with `React.memo`
   - Use `useMemo` for sorted/hydrated question data
   - Lazy load analytics charts (already using lazy imports for pages)

6. **Large Poll Handling**
   - For polls with 50+ questions: implement virtual scrolling
   - For polls with 1000+ respondents: server-side pagination

---

## Accessibility Improvements

### Current State

- Basic ARIA attributes on some elements
- Semantic HTML where feasible (form, table, button)
- Color contrast follows design tokens
- Reduced motion support via `prefers-reduced-motion`

### WCAG 2.1 AA Compliance Recommendations

1. **Perceivable**
   - Add `alt` text to all images (banner, question images, option images)
   - Ensure color is not the only indicator (e.g., for selected options, add checkmark icon)
   - Add descriptive labels to all form fields (already using `v-label`)

2. **Operable**
   - Add keyboard navigation for:
     - Rating buttons (arrow keys to change)
     - Ranking items (arrow keys to reorder)
     - Builder question cards (Tab to focus, Enter to edit)
   - Add skip-to-content link at the top of PollingLayout
   - Ensure all interactive elements have visible focus indicators

3. **Understandable**
   - Add `aria-describedby` for helper text on form fields
   - Add `aria-required` to required question fields
   - Use `fieldset` and `legend` for question option groups
   - Add error announcements for screen readers (`role="alert"`)

4. **Robust**
   - Ensure all ARIA attributes are valid and properly used
   - Add `lang` attribute (already set in index.html)
   - Test with screen readers (NVDA, VoiceOver)

### Specific HTML Structure for PollQuestionField

```html
<fieldset>
  <legend>
    <h2>{index + 1}. {question} *</h2>
  </legend>
  <div role="radiogroup" aria-label="Options for {question}">
    {options.map(o => (
    <label>
      <input type="radio" aria-checked="{selected}" />
      {o.label}
    </label>
    ))}
  </div>
</fieldset>
```

---

## Mobile Experience

### Current Mobile Status

- Responsive layouts using Tailwind breakpoints
- Fixed bottom submit button on voter poll page
- Touch-friendly button sizes (min 44px)
- But could be improved

### Recommended Mobile Improvements

1. **Builder (Organizer)**
   - Slide-up panel for question editing instead of top form
   - Swipe-to-delete on question cards
   - Collapsible question cards by default

2. **Respondent Management**
   - Card-based layout instead of table on mobile
   - Swipe actions (delete, resend invitation)
   - Floating action button for "Add respondent"

3. **Voter Poll Page**
   - Sticky progress bar at top
   - Larger touch targets for rating buttons (min 48px)
   - Full-width option buttons
   - Bottom sheet for question type selector

4. **Analytics**
   - Horizontal scroll for wide charts
   - Collapsible per-question sections
   - Simplified stat cards (2-column grid on mobile)

5. **Navigation**
   - Bottom tab bar for PollingLayout on mobile (Dashboard, Events, Analytics)
   - Hamburger menu for secondary pages

---

## Suggested Implementation Roadmap

### Phase 1: Quick Wins (Week 1)

| Item                                | Priority | Est. Effort |
| ----------------------------------- | -------- | ----------- |
| C1 - Question duplication           | Critical | 0.5 day     |
| H2 - Progress indicator             | High     | 0.5 day     |
| H3 - Completion time analytics      | High     | 1 day       |
| M3 - Poll status display            | Medium   | 0.5 day     |
| M6 - Autosave notification          | Medium   | 0.5 day     |
| M7 - Rating chart visualization     | Medium   | 0.5 day     |
| H4 - Accessibility (fieldset, aria) | High     | 1 day       |
| M8 - Scheduling UX                  | Medium   | 0.5 day     |
| **Total**                           |          | **5 days**  |

### Phase 2: UX Improvements (Week 2-3)

| Item                           | Priority | Est. Effort   |
| ------------------------------ | -------- | ------------- |
| C2 - Image support enhancement | Critical | 2 days        |
| H1 - Drag-and-drop reordering  | High     | 2-3 days      |
| H5 - Mobile builder experience | High     | 1-2 days      |
| M4 - Review before submit      | Medium   | 1-2 days      |
| M1 - Question bank/templates   | Medium   | 2-3 days      |
| ConfirmDialog replacement      | Medium   | 0.5 day       |
| Breadcrumb navigation          | Low      | 0.5 day       |
| **Total**                      |          | **9-13 days** |

### Phase 3: Performance & Scale (Week 4)

| Item                            | Priority | Est. Effort  |
| ------------------------------- | -------- | ------------ |
| M2 - Bulk respondent operations | Medium   | 2 days       |
| Database indexes                | High     | 0.5 day      |
| Registry caching                | High     | 1 day        |
| Lazy loading analytics          | Medium   | 1 day        |
| MongoDB-style pagination        | Medium   | 1 day        |
| **Total**                       |          | **5.5 days** |

### Phase 4: Advanced Features (Week 5-6)

| Item                             | Priority | Est. Effort |
| -------------------------------- | -------- | ----------- |
| M5 - Completion funnel analytics | Medium   | 1 day       |
| L1 - Star/Emoji rating types     | Low      | 2 days      |
| L4 - Opinion scale (slider)      | Low      | 0.5 day     |
| L5 - Date/Time types             | Low      | 1 day       |
| Respondent export                | Medium   | 0.5 day     |
| Auditing enhancements            | Medium   | 1 day       |
| **Total**                        |          | **6 days**  |

### Phase 5: Future (Not Yet Scheduled)

| Item                           | Priority | Est. Effort   |
| ------------------------------ | -------- | ------------- |
| L2 - File upload question type | Low      | 3 days        |
| L3 - Matrix/grid question type | Low      | 4-5 days      |
| RLS policies                   | Medium   | 1 day         |
| Advanced response filters      | Low      | 1 day         |
| **Total**                      |          | **9-10 days** |

---

## Final Recommendation

### Definitely Implement

| Item                                    | Reason                                            |
| --------------------------------------- | ------------------------------------------------- |
| **C1 - Question duplication**           | High value, low effort, no breaking changes       |
| **C2 - Image support**                  | Essential for visual polls, additive changes only |
| **H1 - Drag-and-drop reordering**       | Expected UX pattern, moderate effort              |
| **H2 - Progress indicator**             | Improves completion rates, trivial effort         |
| **H3 - Completion time analytics**      | Actionable insight, minimal effort                |
| **H4 - Accessibility improvements**     | Legal/ethical requirement, low effort             |
| **H5 - Mobile builder**                 | Real-world use case, moderate effort              |
| **M4 - Review before submit**           | Professional UX, moderate effort                  |
| **M5 - Completion funnel**              | Actionable analytics, low effort                  |
| **Database indexes + registry caching** | Performance wins, low effort                      |

### Optional (Implement If Time Allows)

| Item                     | Reason                       |
| ------------------------ | ---------------------------- |
| M1 - Question templates  | Useful but not critical      |
| M2 - Bulk respondent ops | Nice-to-have for large polls |
| M7 - Rating chart        | Visual improvement only      |
| M8 - Scheduling UX       | Useful but low impact        |
| L1 - Star/Emoji rating   | Engagement boost, low effort |
| L4 - Opinion scale       | Novelty improvement          |
| L5 - Date/Time types     | Specialized use case         |

### Do NOT Implement (Overcomplication)

| Item                                          | Reason                                                                                                                                                     |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Full page redesign**                        | Current design is functional and consistent with VOTRIX. A full redesign would break familiarity and require massive QA effort.                            |
| **Real-time collaborative editing**           | Polls are created by a single organizer. Real-time collab (Google Docs-style) adds enormous complexity for minimal benefit.                                |
| **Complex branching/skip logic**              | Would fundamentally change the data model, validation engine, and analytics. Would break existing polls. Consider only if there is strong user demand.     |
| **Social login for respondents**              | The current email-based auth works well for the invitation workflow. Social login would require significant auth infrastructure changes.                   |
| **Webhook/API for external submission**       | Would open security concerns and add maintenance burden. Not aligned with VOTRIX's self-contained architecture.                                            |
| **AI-powered question suggestions**           | Novelty feature with high complexity. Would require ML infrastructure.                                                                                     |
| **Full Typeform-like one-question-at-a-time** | Would require rebuilding the entire voter experience. Current scrollable form is simple and works well. Consider as a toggle if strong user demand exists. |

### Architecture Principle Summary

The most important architectural decision is to **continue leveraging the Phase 7 question type registry** for all new question types. The `answerFormat.kind` abstraction (choice/numeric/text/ranking) should be extended with new kinds (file/date/matrix) only when there is clear user demand. For visual variants (star rating, emoji), use existing `answerFormat.kind: 'numeric'` with different `ui.input` values.

All database changes must be **additive** (new columns, new tables, new indexes). No destructive migrations. This ensures existing polls continue to work without modification, and the module can be deployed incrementally.
