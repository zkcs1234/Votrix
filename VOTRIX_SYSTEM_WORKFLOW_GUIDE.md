# VOTRIX — System Workflow Guide

*A plain-language walkthrough of how the VOTRIX platform works, written to serve as a reference when designing a survey questionnaire for data gathering from respondents (admins, organizers, and voters/participants).*

---

## What VOTRIX Is

VOTRIX is an online, web-based platform that brings three kinds of participation activities into one secure system: **elections**, **competition scoring** (pageants, dance, singing, talent, and other judged events), and **polling/surveys**. Instead of building a separate application for each activity, VOTRIX runs them all on a shared foundation — one events engine, one enrollment system, one authentication layer — so that an organization can create a voting event today and a judged competition tomorrow using the same accounts, dashboards, and reporting tools. It is built as a full-stack web application: a React frontend that people interact with in their browser, an Express (Node.js) backend that enforces the rules and handles the data, and a PostgreSQL database (hosted through Supabase) that stores everything. The overall value it offers is a single, structured, and secure place to run participation events end to end — from creating the event, inviting the right people, and collecting votes or scores, all the way to analyzing and reporting the results.

---

## The Three Roles at a Glance

VOTRIX is organized around **three user roles**: the **Admin**, the **Organizer**, and the **Voter**. These three roles form a top-down chain of responsibility. The Admin sits at the top and governs the platform itself; the Organizer runs the actual events; and the Voter is the person who participates by casting a ballot, scoring a contestant, or answering a survey. Importantly, the "Voter" role is a single account type that flexes depending on the event — the same voter account becomes an **Election Voter**, a **Competition Judge**, or a **Polling Respondent** depending on what kind of event they are enrolled in. These are called *participant types*, not separate roles, which keeps the account system simple while still letting one person play different parts across different events.

---

## The Overall Workflow — From Admin to Organizer to Voters

### 1. The Admin Sets the Stage

Everything begins with the **Admin**, who is the highest-level authority in the system. The Admin does not usually run events personally; instead, the Admin governs the platform as a whole. After logging in with a username and password, the Admin reaches an administrative dashboard from which they **create organizer accounts**, activate or deactivate those accounts, assign roles, and monitor system-wide activity. The Admin also oversees organizations, keeps an eye on platform-wide reports and operations, manages account statuses, and controls the global visibility and behavior of the system. In short, the Admin is the gatekeeper: no organizer can begin running events until the Admin has provisioned and approved their account. This makes the Admin responsible for the trust and integrity of the whole platform.

### 2. The Organizer Builds and Runs the Event

Once an **Organizer** account exists, the Organizer becomes the true engine of day-to-day activity, because the Organizer is the *owner and manager of events*. After logging in (and, on first login, completing a required password change and profile completion), the Organizer works from an organizer dashboard where they **create a new event** and choose its type — election, competition, or polling. From there, the Organizer fills in the event details, uploads branding assets such as logos and banners, and moves into the configuration steps that are specific to the chosen event type. For an **election**, this means defining the positions to be filled and the candidates running for them (with photos, biographies, and platforms). For a **competition**, it means setting up contestants or performers, the judging criteria and their weights, categories, rounds, divisions (when needed), and assigning or inviting the judges who will score. For a **poll or survey**, it means writing the questions, choosing the question types, and setting rules such as anonymity, whether multiple submissions are allowed, and an expiration date. Once the structure is in place, the Organizer **invites participants** — often in bulk via CSV or through an onboarding flow — and then **opens the voting or scoring period**. Throughout and after the event, the Organizer monitors participation and reviews the analytics and reports the system generates.

### 3. The Voter / Participant Takes Part

The **Voter** is the participant at the receiving end of the workflow. A voter logs in and sees a personal dashboard listing the events they have been assigned to, along with which ones are active or already completed. When they open an assigned event, the system loads the correct experience for that event's participant type: an **Election Voter** is shown a ballot and casts votes for candidates in each position; a **Competition Judge** is shown a scoring screen and rates contestants against the defined criteria; and a **Polling Respondent** is shown a survey and answers the questions. When they submit, the backend checks that they are genuinely allowed to participate in that event, prevents duplicate or invalid submissions, and then records the result in the database. After results are recorded, that participation flows back upward into the analytics the Organizer (and where appropriate, the Admin) can review.

### 4. Results Flow Back Up as Analytics

The final stage of the workflow closes the loop. As votes, scores, and responses accumulate in the database, the backend aggregates them on demand into meaningful metrics — voter turnout, vote distributions, competition rankings and weighted scores, and survey response summaries. The Organizer requests these analytics and sees them rendered as charts, summaries, and report panels, while the Admin retains a system-wide view of activity across all organizations and events. This means the same data a participant submits at the bottom of the chain becomes the decision-support information delivered back to the people managing the event at the top.

---

## What Each Module Actually Does

**Election module.** This module runs democratic voting for organizations and institutions. The Organizer creates an election, defines the positions and the candidates for each, uploads candidate photos, and invites voters. Voters then cast secure ballots, with the system enforcing voting rules and preventing anyone from voting twice. The result is a validated tally plus turnout and distribution analytics.

**Competition module.** This is the platform's most elaborate module, built to handle many kinds of judged events — pageants, dance, singing, talent, and similar performance competitions — using one flexible engine rather than separate hardcoded systems. The Organizer defines criteria (each carrying a percentage weight), categories, rounds, and optionally divisions, then adds contestants and assigns judges. Judges score contestants against the criteria, the system computes weighted totals and produces rankings, and a live session view can surface real-time results as judging happens. Organizers can also configure awards, decided by methods such as score, criteria, vote, or direct selection.

**Polling / survey module.** This module supports surveys, opinion gathering, and feedback collection. The Organizer builds a set of questions using a flexible registry of question types — single choice, multiple choice, yes/no, rating, Likert scale, open text, and ranking — and configures whether responses are anonymous, whether multiple submissions are allowed, and when the poll expires. Respondents answer, and the system aggregates and visualizes the results for the Organizer.

---

## Supporting Features That Shape the Experience

Several cross-cutting features affect how every role experiences the system and are worth keeping in mind when writing survey questions. **Authentication and security** are handled with hashed passwords, JWT access and refresh tokens stored in secure HTTP-only cookies, CSRF protection, role-based route guards, account-status checks, rate limiting, and duplicate-submission prevention — so questions about trust, safety, and confidence are grounded in real mechanisms. **File uploads** let organizers attach organization logos, event banners, and candidate or contestant photos (stored via Cloudinary), which shapes the visual quality of events. An **automated email and notification layer** (via Resend) sends organizer and participant invitations, password resets, and event notifications, so the invitation and onboarding experience is a real part of the workflow. Finally, each role gets a **distinct dashboard** — admin, organizer, and voter each see an interface tailored to what they need to do — and the **event lifecycle** (create, configure, open, monitor, close) follows a consistent pattern across all three modules.

---

## Using This Guide to Build Your Survey Questionnaire

Because the system is organized by role and by module, your questionnaire can be structured the same way. Here are angles the workflow naturally suggests:

- **By role.** Ask Admins about account provisioning, oversight, and platform monitoring; ask Organizers about event creation, configuration, inviting participants, and reviewing analytics; ask Voters/Participants about receiving access, understanding the ballot or survey, and submitting with confidence.

- **By module.** For election participants, focus on ballot clarity and trust in the count; for competition judges, focus on the scoring interface, criteria clarity, and fairness of rankings; for polling respondents, focus on question clarity, anonymity, and ease of completion.

- **By experience quality.** Ease of use, clarity of instructions, speed and reliability, visual design, and mobile/browser experience apply to every role.

- **By trust and security.** Confidence that votes are counted correctly, that duplicates are prevented, that data is secure, and that results are accurate and fair.

- **By workflow stage.** Onboarding and invitation experience, the setup or voting/scoring experience itself, and the usefulness of the analytics and reports afterward.

- **By outcome and value.** Whether the system saved time versus manual methods, whether results were trusted and accepted, and whether respondents would use or recommend it again.

Grounding each survey item in the concrete steps above — who does what, in what order, and with what tools — will keep your questionnaire aligned with how VOTRIX actually works, which in turn makes the data you gather from respondents easier to interpret and defend.
