# VOTRIX System Brochure: Panel Content

**Format:** A4 landscape tri-fold (roll fold), 297 × 210 mm trim, 3 mm bleed (303 × 216 mm PDF page).
**Panel widths:** 97 mm fold-in flap + 100 mm + 100 mm.
**Fold order (Side A, left to right):** Fold-in flap | Back cover | Front cover
**Fold order (Side B, left to right):** Introducing VOTRIX | Election & Polling | Competition Scoring
**Print:** duplex, flip on the short edge. The 97 mm fold-in flap on Side A backs the 97 mm inside-right panel on Side B.

**Brand references (from the current app):** the stylized "V" mark with an apex dot (`frontend/src/components/brand/VotrixMark.jsx`, used by `VotrixLogo.jsx`), the "VOTRIX" wordmark with an accented "I", the tagline "Every Vote Counts", charcoal `#111827`, primary indigo `#4f46e5`, soft indigo `#eef2ff`, and the Inter typeface. The older ballot-box SVGs in `frontend/src/assets/logo/` are no longer used by the app.

---

## SIDE A: OUTSIDE

### Panel: Front Cover (outside right)

- V mark + **EVERY VOTE COUNTS**
- **VOTRIX**
- An Online Poll and Voting System with Integrated Competition Scoring
- **Elect. Score. Poll.**
  **One platform for every decision.**
- Module tiles: Election Management · Competition Scoring · Polling Management
- Screenshot: competition tabulation overview (Pageant, Men/Women divisions)
- Caption: *Actual VOTRIX competition tabulation screen*

### Panel: Back Cover (outside center)

**Eyebrow:** WHY VOTRIX
**Headline:** Built for organized, transparent events

- **Centralized administration** of elections, competitions, and polls.
- **Organized participant records** for students, judges, and officers.
- **Accessible web interface** that runs in a modern browser, on desktop or mobile.
- **Structured scoring** with configured criteria, weights, rounds, and divisions.
- **Faster result management** through automatic tallying and ranking.
- **Easier monitoring** with dashboards, analytics, and exportable reports.

**Who uses VOTRIX**
School Administrators · Event Organizers · Student Organization Officers · Student Voters · Competition Judges · Polling Respondents

**Get in touch**
- Website: [official URL to follow]
- Email: [contact email]
- Phone: [contact number]
- Office: [office / department]
- QR code: placeholder. Add it once the official website is live.

**Closing statement:** One platform for the votes, scores, and opinions that shape your organization.

**Footer:** VOTRIX logo
Developed by Jennifer M. Halawig & Zar Kenneth C. Samijon
BS Computer Science · Bohol Island State University – Calape Campus

### Panel: Fold-in Flap (outside left): Key Features

**Eyebrow:** KEY FEATURES
**Headline:** Everything an event needs, in one workspace

1. **Centralized Event Management:** Elections, competitions, and polls are created, published, and monitored from one organizer workspace.
2. **Role-Based Access:** Separate dashboards for administrators, organizers, and participants (students and judges), each with only the tools they need.
3. **Participant & Invitation Management:** Admins create student and judge accounts. Organizers invite students by program, pick judges from the judge pool, and can notify them by email.
4. **Guided Setup & Review:** Step-by-step setup with saved drafts walks organizers from event details to review and publishing.
5. **Results & Analytics:** Turnout, vote summaries, competition rankings, and poll charts with percentages.
6. **Reports & Export:** A central reports hub with downloadable results, including CSV and Excel exports.
7. **Account & Platform Administration:** Organizer applications and approvals, student officer access, system settings, and audit and email logs.
8. **Participant Portal:** Students and judges see their events, participation history, and published results in one place.
9. **Branding & Media:** Event banners, organization logos, and candidate or contestant photos.

---

## SIDE B: INSIDE

### Panel: Introducing VOTRIX (inside left)

**Eyebrow:** INTRODUCING VOTRIX
**Headline:** Voting, scoring, and polling, finally in one place

VOTRIX is a web-based platform that brings election management, competition scoring, and polling together in a single, centralized system. Organizers set up events, invite participants, and follow results from one workspace, while students and judges take part from any browser.

**The challenge**
Many organizations still run these activities by hand or across separate tools, which can lead to:
- Manual election processes that take time to prepare and count
- Scattered score sheets that make competition tabulation harder
- Time-consuming paper surveys and polls
- Delays in consolidating and reporting results
- Event administration spread across many files and tools

**The VOTRIX approach**
- Elections: positions, candidates, ballots
- Competitions: judges, criteria, rankings
- Polls: questions, responses, charts

**Three user roles**
- **Admin:** manages accounts, organizer approvals, and settings
- **Organizer:** creates, runs, and reports on events
- **Participant:** students vote and answer polls; judges score competitions

### Panel: Election & Polling (inside center)

**Eyebrow:** CORE MODULES
**Headline:** Election & Polling

**Election Management**
- Set event details, schedule, and banner
- Configure positions and election groups
- Add candidates with photo, partylist, and platform
- Invite students by program and set group eligibility
- One ballot per voter, with turnout and results in analytics and reports

Screenshot: **PLACEHOLDER.** Insert an actual VOTRIX election screen (for example, the Candidates or Analytics page).

**Polling Management**
- Build polls and surveys with a question builder
- Single choice, checkbox, yes/no, rating, Likert scale, open text, and ranking questions
- Optional anonymous responses and multiple submissions
- Invite students by program and view responses as charts and percentages

Screenshot: **PLACEHOLDER.** Insert an actual VOTRIX polling builder or poll analytics screen.

### Panel: Competition Scoring (inside right)

**Eyebrow:** INTEGRATED COMPETITION SCORING
**Headline:** From judges' sheets to final rankings

Pageants, contests, and other judged events are configured and tabulated inside VOTRIX, so scores go from each judge straight to computed rankings.

1. Start from a template or a blank setup
2. Register contestants, entries, and divisions
3. Pick judges from the pool and assign them
4. Set rounds, criteria, and weights
5. Run the live session as judges score online
6. Validate, finalize, and publish results

Screenshot: Tabulation overview. Caption: *Tabulation overview: submission progress, validation, and weighted scores*

**Scoring features:** Pageant, dance, singing & talent templates · Average, total, or rank-based scoring · Weighted criteria · Rounds & advancement · Divisions · Organizer deductions · Live control · Validation

**Why it matters:** Weights are applied and totals computed automatically, so organizers spend less time on manual tabulation. Every score stays tied to its judge, criterion, and round for review.

---

## Source verification notes (checked against the current code, last commit 2026-11-17)

- **Logo:** the app renders `VotrixMark.jsx`, a V with a dot. The brochure uses that mark.
- **Roles:** admin, organizer, and participant. Participant eligibility types are `STUDENT` (votes and responds to polls) and `JUDGE` (`backend/src/utils/constants.js`). Student officers can open their organization's workspace (Account Manager, `/organizer/officers`).
- **Participant onboarding:** organizers no longer register voters or import them from CSV. Admins create student and judge accounts. Organizers invite students by program (`CohortInviteManager`, cohortType `program`) and pick judges from the pool (`CompetitionJudgesPage`).
- **Organizer onboarding:** admins send an invitation link (`/organizer/apply/:token`), and admins approve or decline the resulting application.
- **Participant portal:** My events, History, and Results (`/participant/*`).
- **Poll question types** (seeded in migration 017, loaded by the builder from `/organizer/polling/question-types`): single choice, checkbox, yes/no, rating, Likert scale, open text, and ranking.
- **Poll settings:** anonymous responses and multiple submissions. Poll expiry follows the event end date, so it is not advertised as a separate setting.
- **Competition scoring options** (`shared/competition-rule-configuration.js`): Average Score, Total Score, Rank-Based Placement, and Manual Official Results.
- **Competition templates:** Pageant, Dance, Singing, Talent, and Simple/Blank.
- **Admin areas:** Organizers, Participants, Events, System Settings (with Health, Alerts, and Archival tabs), and Audit Logs (with an email view).
- **Exports:** CSV and Excel. A PDF export appears only once, so it is not advertised.
- **Screenshots:** the cover and competition screenshots come from the current tabulation UI (all labels are still in the code). They show test data only. The old election screenshot used a test page that no longer exists in the code, so it was replaced with a placeholder.
- **Website:** no verified production domain was found, so it is left as a placeholder.
