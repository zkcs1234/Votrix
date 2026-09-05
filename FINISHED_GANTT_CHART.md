# Finished Gantt Chart — Table 1: Gantt Chart for Software Development

**For:** HALAWIG_SAMIJON_CHAPTER_1-3.docx (Chapter III → Project Development → a. Gantt Chart)
**Purpose:** Hand this file to a chat that can edit the .docx. **Replace the existing "Table 1: Gantt Chart for Software Development" table** with the one below.

---

## What was finished (and how)

- **Kept as-is:** Section **I. Gantt Chart** and **II. Auth Development Phase** (already done). Only their **Start/End dates were filled in**, since they were blank.
- **Expanded (the requested work):**
  - **III. Admin Development Phase** — was only the dashboard; now lists **all 10 admin pages** (Frontend + Backend rows each), from `frontend/src/pages/admin`.
  - **IV. Organizer Development Phase** — was only the dashboard; now lists **all 30 organizer pages** (dashboard, onboarding, election, competition, polling, reports), from `frontend/src/pages/organizer`.
  - **V. Voter Development Phase** — now lists **all 4 voter pages** (voter dashboard, event, poll, judge scoring), from `frontend/src/pages/voter`.
  - **VI. Database Integration Phase** — was only `users`; now lists **all 34 live tables** from `DATABASE_SCHEMA_CURRENT.md` (the 30 base tables + 4 competition junction/result tables), each as a "Create <table> Table" row.
- **Dates:** filled **only for completed (100%) phases**, running **sequentially from the existing start date 01/04/26 through today 09/04/26**. Frontend & Backend rows of the same page share the same date window (built in parallel).
- **Left blank (not completed):** **X. Oral Defense** and **XI. Post Oral Defense Revisions** — these are future phases, so no dates were added.

### Assumptions (adjust if needed)
- Date format is **MM/DD/YY** (matching the existing `01/04/26 → 01/12/26` planning row).
- Assignee pattern follows the existing dashboard rows: **Frontend = Halawig, Backend = Samijon** (Auth phase keeps its original mixed assignments). DB tables alternate Halawig/Samijon.
- The Testing Phase (IX) was already marked 100%, so it received dates too (ending 09/04/26). If testing is not actually finished, clear its Start/End and its 100% marks.
- Phase numbering keeps the document's existing sequence (it jumps VI → IX; VII/VIII were not present in the original and were not invented).

---

## Table 1: Gantt Chart for Software Development

| Task / Activity | Assigned To | Progress | Start | End |
|---|---|---|---|---|
| **I.  Gantt Chart** |  |  |  |  |
| Planning for Gantt Chart | Samijon | 100% | 01/04/26 | 01/12/26 |
| Gantt Chart Creation | Halawig | 100% | 01/12/26 | 01/16/26 |
| **II.  Auth Development Phase** |  |  |  |  |
| Create and Design Login Page (Frontend) | Samijon | 100% | 01/19/26 | 01/25/26 |
| Create and Design Login Page (Backend) | Halawig | 100% | 01/19/26 | 01/25/26 |
| Create and Design Forgot Password Page (Frontend) | Samijon | 100% | 01/25/26 | 01/31/26 |
| Create and Design Forgot Password Page (Backend) | Samijon | 100% | 01/25/26 | 01/31/26 |
| Create and Design Change Password Page (Frontend) | Halawig | 100% | 01/31/26 | 02/07/26 |
| Create and Design Change Password Page (Backend) | Samijon | 100% | 01/31/26 | 02/07/26 |
| Create and Design Reset Password Page (Frontend) | Halawig | 100% | 02/07/26 | 02/13/26 |
| Create and Design Reset Password Page (Backend) | Samijon | 100% | 02/07/26 | 02/13/26 |
| **III.  Admin Development Phase** |  |  |  |  |
| Create and Design Admin Dashboard Page (Frontend) | Halawig | 100% | 02/16/26 | 02/20/26 |
| Create and Design Admin Dashboard Page (Backend) | Samijon | 100% | 02/16/26 | 02/20/26 |
| Create and Design Organizer Management Page (Frontend) | Halawig | 100% | 02/20/26 | 02/24/26 |
| Create and Design Organizer Management Page (Backend) | Samijon | 100% | 02/20/26 | 02/24/26 |
| Create and Design Organizer Detail Page (Frontend) | Halawig | 100% | 02/24/26 | 02/28/26 |
| Create and Design Organizer Detail Page (Backend) | Samijon | 100% | 02/24/26 | 02/28/26 |
| Create and Design Global Events Page (Frontend) | Halawig | 100% | 02/28/26 | 03/04/26 |
| Create and Design Global Events Page (Backend) | Samijon | 100% | 02/28/26 | 03/04/26 |
| Create and Design Session Management Page (Frontend) | Halawig | 100% | 03/04/26 | 03/08/26 |
| Create and Design Session Management Page (Backend) | Samijon | 100% | 03/04/26 | 03/08/26 |
| Create and Design Audit Logs Page (Frontend) | Halawig | 100% | 03/08/26 | 03/11/26 |
| Create and Design Audit Logs Page (Backend) | Samijon | 100% | 03/08/26 | 03/11/26 |
| Create and Design System Settings Page (Frontend) | Halawig | 100% | 03/11/26 | 03/15/26 |
| Create and Design System Settings Page (Backend) | Samijon | 100% | 03/11/26 | 03/15/26 |
| Create and Design Health Dashboard Page (Frontend) | Halawig | 100% | 03/15/26 | 03/19/26 |
| Create and Design Health Dashboard Page (Backend) | Samijon | 100% | 03/15/26 | 03/19/26 |
| Create and Design Alert Config Page (Frontend) | Halawig | 100% | 03/19/26 | 03/23/26 |
| Create and Design Alert Config Page (Backend) | Samijon | 100% | 03/19/26 | 03/23/26 |
| Create and Design Archival Policy Page (Frontend) | Halawig | 100% | 03/23/26 | 03/27/26 |
| Create and Design Archival Policy Page (Backend) | Samijon | 100% | 03/23/26 | 03/27/26 |
| **IV.  Organizer Development Phase** |  |  |  |  |
| Create and Design Organizer Dashboard Page (Frontend) | Halawig | 100% | 03/30/26 | 04/02/26 |
| Create and Design Organizer Dashboard Page (Backend) | Samijon | 100% | 03/30/26 | 04/02/26 |
| Create and Design Organizer Onboarding Page (Frontend) | Halawig | 100% | 04/02/26 | 04/05/26 |
| Create and Design Organizer Onboarding Page (Backend) | Samijon | 100% | 04/02/26 | 04/05/26 |
| Create and Design Election Dashboard Page (Frontend) | Halawig | 100% | 04/05/26 | 04/09/26 |
| Create and Design Election Dashboard Page (Backend) | Samijon | 100% | 04/05/26 | 04/09/26 |
| Create and Design Election Events Page (Frontend) | Halawig | 100% | 04/09/26 | 04/12/26 |
| Create and Design Election Events Page (Backend) | Samijon | 100% | 04/09/26 | 04/12/26 |
| Create and Design Election Event Form Page (Frontend) | Halawig | 100% | 04/12/26 | 04/15/26 |
| Create and Design Election Event Form Page (Backend) | Samijon | 100% | 04/12/26 | 04/15/26 |
| Create and Design Election Positions Page (Frontend) | Halawig | 100% | 04/15/26 | 04/18/26 |
| Create and Design Election Positions Page (Backend) | Samijon | 100% | 04/15/26 | 04/18/26 |
| Create and Design Election Candidates Page (Frontend) | Halawig | 100% | 04/18/26 | 04/21/26 |
| Create and Design Election Candidates Page (Backend) | Samijon | 100% | 04/18/26 | 04/21/26 |
| Create and Design Election Voters Page (Frontend) | Halawig | 100% | 04/21/26 | 04/24/26 |
| Create and Design Election Voters Page (Backend) | Samijon | 100% | 04/21/26 | 04/24/26 |
| Create and Design Election Analytics Page (Frontend) | Halawig | 100% | 04/24/26 | 04/27/26 |
| Create and Design Election Analytics Page (Backend) | Samijon | 100% | 04/24/26 | 04/27/26 |
| Create and Design Competition Dashboard Page (Frontend) | Halawig | 100% | 04/27/26 | 05/01/26 |
| Create and Design Competition Dashboard Page (Backend) | Samijon | 100% | 04/27/26 | 05/01/26 |
| Create and Design Competition Events Page (Frontend) | Halawig | 100% | 05/01/26 | 05/04/26 |
| Create and Design Competition Events Page (Backend) | Samijon | 100% | 05/01/26 | 05/04/26 |
| Create and Design Competition Event Form Page (Frontend) | Halawig | 100% | 05/04/26 | 05/07/26 |
| Create and Design Competition Event Form Page (Backend) | Samijon | 100% | 05/04/26 | 05/07/26 |
| Create and Design Competition Workspace Page (Frontend) | Halawig | 100% | 05/07/26 | 05/10/26 |
| Create and Design Competition Workspace Page (Backend) | Samijon | 100% | 05/07/26 | 05/10/26 |
| Create and Design Competition Contestants Page (Frontend) | Halawig | 100% | 05/10/26 | 05/13/26 |
| Create and Design Competition Contestants Page (Backend) | Samijon | 100% | 05/10/26 | 05/13/26 |
| Create and Design Competition Criteria Page (Frontend) | Halawig | 100% | 05/13/26 | 05/17/26 |
| Create and Design Competition Criteria Page (Backend) | Samijon | 100% | 05/13/26 | 05/17/26 |
| Create and Design Competition Judges Page (Frontend) | Halawig | 100% | 05/17/26 | 05/20/26 |
| Create and Design Competition Judges Page (Backend) | Samijon | 100% | 05/17/26 | 05/20/26 |
| Create and Design Competition Live Control Page (Frontend) | Halawig | 100% | 05/20/26 | 05/23/26 |
| Create and Design Competition Live Control Page (Backend) | Samijon | 100% | 05/20/26 | 05/23/26 |
| Create and Design Competition Rankings Page (Frontend) | Halawig | 100% | 05/23/26 | 05/26/26 |
| Create and Design Competition Rankings Page (Backend) | Samijon | 100% | 05/23/26 | 05/26/26 |
| Create and Design Competition Awards Page (Frontend) | Halawig | 100% | 05/26/26 | 05/29/26 |
| Create and Design Competition Awards Page (Backend) | Samijon | 100% | 05/26/26 | 05/29/26 |
| Create and Design Competition Analytics Page (Frontend) | Halawig | 100% | 05/29/26 | 06/01/26 |
| Create and Design Competition Analytics Page (Backend) | Samijon | 100% | 05/29/26 | 06/01/26 |
| Create and Design Polling Dashboard Page (Frontend) | Halawig | 100% | 06/01/26 | 06/04/26 |
| Create and Design Polling Dashboard Page (Backend) | Samijon | 100% | 06/01/26 | 06/04/26 |
| Create and Design Polling Events Page (Frontend) | Halawig | 100% | 06/04/26 | 06/08/26 |
| Create and Design Polling Events Page (Backend) | Samijon | 100% | 06/04/26 | 06/08/26 |
| Create and Design Polling Event Form Page (Frontend) | Halawig | 100% | 06/08/26 | 06/11/26 |
| Create and Design Polling Event Form Page (Backend) | Samijon | 100% | 06/08/26 | 06/11/26 |
| Create and Design Polling Builder Page (Frontend) | Halawig | 100% | 06/11/26 | 06/14/26 |
| Create and Design Polling Builder Page (Backend) | Samijon | 100% | 06/11/26 | 06/14/26 |
| Create and Design Polling Respondents Page (Frontend) | Halawig | 100% | 06/14/26 | 06/17/26 |
| Create and Design Polling Respondents Page (Backend) | Samijon | 100% | 06/14/26 | 06/17/26 |
| Create and Design Polling Analytics Page (Frontend) | Halawig | 100% | 06/17/26 | 06/20/26 |
| Create and Design Polling Analytics Page (Backend) | Samijon | 100% | 06/17/26 | 06/20/26 |
| Create and Design Reports Overview Page (Frontend) | Halawig | 100% | 06/20/26 | 06/24/26 |
| Create and Design Reports Overview Page (Backend) | Samijon | 100% | 06/20/26 | 06/24/26 |
| Create and Design Election Report Page (Frontend) | Halawig | 100% | 06/24/26 | 06/27/26 |
| Create and Design Election Report Page (Backend) | Samijon | 100% | 06/24/26 | 06/27/26 |
| Create and Design Competition Report Page (Frontend) | Halawig | 100% | 06/27/26 | 06/30/26 |
| Create and Design Competition Report Page (Backend) | Samijon | 100% | 06/27/26 | 06/30/26 |
| Create and Design Polling Report Page (Frontend) | Halawig | 100% | 06/30/26 | 07/03/26 |
| Create and Design Polling Report Page (Backend) | Samijon | 100% | 06/30/26 | 07/03/26 |
| **V.  Voter Development Phase** |  |  |  |  |
| Create and Design Voter Dashboard Page (Frontend) | Halawig | 100% | 07/06/26 | 07/10/26 |
| Create and Design Voter Dashboard Page (Backend) | Samijon | 100% | 07/06/26 | 07/10/26 |
| Create and Design Voter Event Page (Frontend) | Halawig | 100% | 07/10/26 | 07/15/26 |
| Create and Design Voter Event Page (Backend) | Samijon | 100% | 07/10/26 | 07/15/26 |
| Create and Design Voter Poll Page (Frontend) | Halawig | 100% | 07/15/26 | 07/20/26 |
| Create and Design Voter Poll Page (Backend) | Samijon | 100% | 07/15/26 | 07/20/26 |
| Create and Design Judge Scoring Page (Frontend) | Halawig | 100% | 07/20/26 | 07/24/26 |
| Create and Design Judge Scoring Page (Backend) | Samijon | 100% | 07/20/26 | 07/24/26 |
| **VI.  Database Integration Phase** |  |  |  |  |
| Create users Table | Halawig | 100% | 07/27/26 | 07/28/26 |
| Create organizations Table | Samijon | 100% | 07/28/26 | 07/29/26 |
| Create events Table | Halawig | 100% | 07/28/26 | 07/29/26 |
| Create event_participants Table | Samijon | 100% | 07/29/26 | 07/30/26 |
| Create invitations Table | Halawig | 100% | 07/30/26 | 07/31/26 |
| Create positions Table | Samijon | 100% | 07/31/26 | 08/01/26 |
| Create candidates Table | Halawig | 100% | 07/31/26 | 08/01/26 |
| Create election_votes Table | Samijon | 100% | 08/01/26 | 08/02/26 |
| Create competition_contestants Table | Halawig | 100% | 08/02/26 | 08/03/26 |
| Create competition_criteria Table | Samijon | 100% | 08/03/26 | 08/04/26 |
| Create competition_categories Table | Halawig | 100% | 08/03/26 | 08/04/26 |
| Create competition_rounds Table | Samijon | 100% | 08/04/26 | 08/05/26 |
| Create competition_divisions Table | Halawig | 100% | 08/05/26 | 08/06/26 |
| Create competition_round_contestants Table | Samijon | 100% | 08/06/26 | 08/07/26 |
| Create competition_round_criteria Table | Halawig | 100% | 08/06/26 | 08/07/26 |
| Create competition_round_results Table | Samijon | 100% | 08/07/26 | 08/08/26 |
| Create competition_scores Table | Halawig | 100% | 08/08/26 | 08/09/26 |
| Create competition_judge_assignments Table | Samijon | 100% | 08/08/26 | 08/09/26 |
| Create competition_sessions Table | Halawig | 100% | 08/09/26 | 08/10/26 |
| Create competition_session_judge_scores Table | Samijon | 100% | 08/10/26 | 08/11/26 |
| Create poll_questions Table | Halawig | 100% | 08/11/26 | 08/12/26 |
| Create poll_options Table | Samijon | 100% | 08/11/26 | 08/12/26 |
| Create poll_submissions Table | Halawig | 100% | 08/12/26 | 08/13/26 |
| Create poll_answers Table | Samijon | 100% | 08/13/26 | 08/14/26 |
| Create system_poll_question_types Table | Halawig | 100% | 08/14/26 | 08/15/26 |
| Create poll_question_types Table | Samijon | 100% | 08/14/26 | 08/15/26 |
| Create image_assets Table | Halawig | 100% | 08/15/26 | 08/16/26 |
| Create image_deletion_queue Table | Samijon | 100% | 08/16/26 | 08/17/26 |
| Create event_drafts Table | Halawig | 100% | 08/17/26 | 08/18/26 |
| Create notifications Table | Samijon | 100% | 08/17/26 | 08/18/26 |
| Create user_sessions Table | Halawig | 100% | 08/18/26 | 08/19/26 |
| Create password_reset_tokens Table | Samijon | 100% | 08/19/26 | 08/20/26 |
| Create audit_logs Table | Halawig | 100% | 08/20/26 | 08/21/26 |
| Create system_settings Table | Samijon | 100% | 08/20/26 | 08/21/26 |
| **IX.  Testing Phase** |  |  |  |  |
| Create Test Plan | Halawig | 100% | 08/24/26 | 08/25/26 |
| Prepare Test Cases | Samijon | 100% | 08/25/26 | 08/26/26 |
| Setup Test Environment | Halawig | 100% | 08/26/26 | 08/27/26 |
| Unit Testing | Samijon | 100% | 08/27/26 | 08/28/26 |
| Integration Testing | Halawig | 100% | 08/28/26 | 08/29/26 |
| Functional Testing | Samijon | 100% | 08/29/26 | 08/30/26 |
| UI Testing | Halawig | 100% | 08/30/26 | 08/31/26 |
| Security Testing | Samijon | 100% | 08/30/26 | 08/31/26 |
| Performance Testing | Halawig | 100% | 08/31/26 | 09/01/26 |
| Bug Fixing | Samijon | 100% | 09/01/26 | 09/02/26 |
| User Acceptance Testing | Halawig | 100% | 09/02/26 | 09/03/26 |
| Final System Testing | Samijon | 100% | 09/03/26 | 09/04/26 |
| **X.  Oral Defense** |  |  |  |  |
| Oral Defense |  |  |  |  |
| **XI.  Post Oral Defense Revisions** |  |  |  |  |
| System Revisions |  |  |  |  |

**Legend (unchanged):** Completed · In Progress · Not Started

---

## Table 2: Gantt Chart for Documentation

**What was finished:** only the blank **Start/End dates** were filled in. All existing rows, assignees, and progress were kept unchanged. Dates continue **sequentially** from the last dated row (Use Case Diagram, ending 01/25/26) through **today, 09/04/26**, and were filled **only for completed (100%) rows**. The **VI. Revisions** rows were left blank because they are not yet completed.

| Task / Activity | Assigned To | Progress | Start | End |
|---|---|---|---|---|
| **I.  Manuscript** |  |  |  |  |
| Chapter 1 | Samijon | 100% | 01/04/26 | 01/12/26 |
| Chapter 2 | Halawig | 100% | 01/13/26 | 01/20/26 |
| **II.  Methodology** |  |  |  |  |
| Database Schema | Samijon | 100% | 01/21/26 | 01/22/26 |
| Use Case Diagram | Halawig | 100% | 01/23/26 | 01/25/26 |
| Activity Diagram | Samijon | 100% | 01/26/26 | 02/11/26 |
| Sequence Diagram | Halawig | 100% | 02/12/26 | 02/28/26 |
| Requirement Analysis | Samijon | 100% | 03/01/26 | 03/17/26 |
| System Architecture | Halawig | 100% | 03/18/26 | 04/03/26 |
| Project Evaluation | Samijon | 100% | 04/04/26 | 04/20/26 |
| Data Gathering Instrument | Halawig | 100% | 04/21/26 | 05/07/26 |
| Data Analysis Procedure and Statistical Treatment | Samijon | 100% | 05/08/26 | 05/24/26 |
| **III.  Results and Discussion** |  |  |  |  |
| Result of the Evaluation of the Software Web Application | Halawig | 100% | 05/25/26 | 06/10/26 |
| **IV.  Summary, Conclusions, and Recommendations** |  |  |  |  |
| Summary | Samijon | 100% | 06/11/26 | 06/27/26 |
| Conclusions | Halawig | 100% | 06/28/26 | 07/14/26 |
| Recommendations | Samijon | 100% | 07/15/26 | 07/31/26 |
| **V.  Book References** |  |  |  |  |
| References | Halawig | 100% | 08/01/26 | 08/17/26 |
| Appendices | Samijon | 100% | 08/18/26 | 09/04/26 |
| **VI.  Revisions** |  |  |  |  |
| Thesis Adviser Consultation |  |  |  |  |
| Revisions |  |  |  |  |
| English Critique Consultation |  |  |  |  |

**Legend (unchanged):** Completed · In Progress · Not Started
