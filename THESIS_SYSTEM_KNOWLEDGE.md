# VOTRIX System Knowledge Base for Thesis and AI-Assisted Writing

This document is a working knowledge base for the VOTRIX system. It explains what the system does, how different parts interact, the business processes behind the platform, and the technical architecture that supports them. It is intended to help Claude, ChatGPT, Gemini, and similar AI tools respond accurately when helping with thesis writing, documentation, analysis, and technical explanation.

---

## 1. Project Overview

VOTRIX is an online voting, polling, and competition scoring platform designed for:

- Admins
- Organizers
- Voters, with event-specific participant types

The system has three user roles: `admin`, `organizer`, and `voter`. Election voters, polling respondents, and competition judges are all users with the `voter` role. Their event-specific function is represented by `event_participants.participant_type`: `ELECTION_VOTER`, `POLLING_RESPONDENT`, or `COMPETITION_JUDGE`.

The system has three user-facing modules and supports these persisted event-type values:

- Election
- Competition scoring (including pageant, dance, singing, talent, and similar judged events; `pageant` remains as a compatibility value)
- Polling / survey

The current active system architecture is competition-first, where a shared competition engine supports multiple competition formats through editable templates and configurable scoring. The `competition_type` value identifies the selected format or template, while the scoring engine uses the same reusable competition structures and rules. The system is built as a full-stack web application with a React frontend, an Express API backend, and a PostgreSQL database through Supabase.

### Main purpose

VOTRIX allows organizations to create events, invite participants, collect votes or responses, manage scoring, and analyze results in a secure and structured way.

### Core value proposition

The project combines:

- digital voting and ballot management
- role-based access control
- event lifecycle management
- upload of banner/logo/images
- data analytics and reporting
- secure authentication
- automated invitations and notifications

---

## 2. System Users and Roles

### Admin

Admin is the highest-level role in the system.

Responsibilities:

- manage organizations or organizers
- create organizer accounts
- monitor system-wide activity
- oversee reports and platform operations
- manage account statuses
- control global platform visibility and operations

Typical admin flow:

- login with username and password
- access admin dashboard
- create organizer accounts
- assign roles and activate accounts
- review organization activity

### Organizer

Organizer is the event owner or manager.

Responsibilities:

- create and manage events
- configure ballot or scoring structure
- upload banners and images
- define positions, contestants, candidates, or questions
- invite event participants
- open/close voting or scoring periods
- view analytics and reports

Organizer flows vary by module:

- Election organizer: manages candidates, positions, ballot setup, and turnout analytics
- Competition organizer: manages contestants, criteria, rounds, judges, scoring rules, and rankings for event types such as pageant, dance, singing, talent, and other judged formats
- Polling organizer: creates survey questions, sets poll rules, and reviews respondent analytics

### Voter

Voter is the participant role used for all three event modules. The voter receives access to an event, and the event-specific participant type determines whether the user casts an election ballot, answers a poll, or scores a competition.

Responsibilities:

- receive access to assigned events
- complete ballots or surveys
- submit a vote or response
- view assigned, active, and completed events

Depending on the event-specific participant type:

- `ELECTION_VOTER`: casts votes for candidates in positions
- `COMPETITION_JUDGE`: scores contestants or performers according to criteria
- `POLLING_RESPONDENT`: answers survey questions

These are participant types, not separate system roles. A competition judge is still a voter at the user-account level, with additional competition-specific assignment and scoring behavior.

---

## 3. Business Modules

## 3.1 Election Module

The election module supports democratic voting processes for organizations and institutions.

Typical features:

- organizer creates election events
- define positions and candidates
- upload candidate photos
- invite event participants via CSV or onboarding flow
- secure ballot submission
- prevent duplicate voting
- generate turnout and analytics

Main process:

1. Organizer creates election event
2. Organizer defines positions and candidate list
3. System stores relationships in the database
4. Voter receives access and votes in ballot page
5. Voting is validated against rules and event status
6. System records ballot submissions
7. Organizer reviews results and analytics

Important concepts:

- positions
- candidates
- ballots
- voting rules
- turnout metrics

## 3.2 Competition Module

The competition module is the primary judged-event system of the platform. It supports different competition categories and event styles using a shared architecture rather than separate hardcoded implementations for each type.

Competition types may include:

- pageant
- dance competition
- singing competition
- talent competition
- other judged-performance or scoring formats

Typical features:

- create competition event with a selected competition type
- define categories, rounds, criteria, and scoring rules
- add contestants or performers
- assign judges
- collect weighted scores
- support division-aware event structures where needed
- generate rankings and live results; optionally configure awards and award selections

Main process:

1. Organizer creates a competition event and selects a competition format or template
2. Organizer configures the relevant structure, categories, rounds, and judging criteria
3. Contestants are added and judges are assigned or invited
4. Judges score participants based on criteria and event rules
5. Weighted scoring is computed and rankings are generated
6. Live session or final results are surfaced to organizers and judges
7. Optional awards are configured and finalized using supported methods such as score, criteria, vote, or selection

Important concepts:

- competition format or template label
- criteria and categories
- judges and assignments
- contestants and division grouping
- rounds and advancement logic
- live ranking and optional award generation or selection

This is a major system update from the older pageant-only interpretation: the platform now uses a generic competition engine that can handle multiple event styles without rewriting the business logic for each one.

## 3.3 Polling Module

The polling module supports surveys, opinion gathering, and feedback collection.

Typical features:

- create question sets
- support different question types
- anonymous or non-anonymous responses
- multiple submissions configuration
- expiration date for polls
- analytics and charts

Supported question type patterns include:

- single choice
- multiple choice
- yes/no
- rating
- Likert scale
- open text
- ranking

Main process:

1. Organizer creates polling event
2. Organizer adds questions and configures settings
3. Voters with the `POLLING_RESPONDENT` participant type access the poll
4. Responses are stored by question type
5. Results are aggregated and visualized
6. Organizer reviews analytics and reports

---

## 4. Technical Architecture

## 4.1 Frontend

Technology stack:

- React
- Vite
- Tailwind CSS
- Zustand for state management
- React Router
- Axios for HTTP communication
- React Hook Form + Zod for forms and validation
- Framer Motion for UI transitions

Frontend responsibilities:

- render user interfaces for admin, organizer, and voter dashboards
- manage module pages and forms
- communicate with backend API
- handle auth session flow
- maintain route guards for user roles and permissions
- display reports, charts, and voting experiences

Typical frontend structure:

- app/
- routes/
- layouts/
- components/
- hooks/
- store/
- services/
- pages/
- modules/

## 4.2 Backend

Technology stack:

- Node.js
- Express
- PostgreSQL via Supabase
- JWT
- bcrypt
- cookie-based auth
- Cloudinary for uploads
- Resend for email delivery

Backend responsibilities:

- expose REST API routes
- enforce authentication and authorization
- validate input data
- process event creation and updates
- manage submissions and outcomes
- interact with database
- send emails and notifications
- handle file uploads

Important code organization:

- config/
- controllers/
- middleware/
- routes/
- services/
- utils/
- modules/
- database/

The live codebase is organized around the actual route patterns used in production:

- organizer routes: /api/organizer/election, /api/organizer/competition, /api/organizer/polling
- voter routes: /api/voter/election, /api/voter/competition, /api/voter/polling
- legacy pageant naming still exists in compatibility layers and legacy service wrappers, but the active architecture is competition-first

## 4.3 Database Layer

The database is PostgreSQL hosted via Supabase.

Important characteristics:

- UUID primary keys are used throughout the schema
- relational model connects users, events, participants, votes, scoring, and responses
- migrations control schema evolution
- database logic supports complex relationships and event-specific records

This project uses SQL migrations to manage schema changes, including tables for:

- users
- organizations
- events
- event participants and participant assignments
- ballots and votes
- polls and questions
- competition contestants, judges, criteria, rounds, and scores
- optional competition awards and award selections

Reports and analytics are computed by backend services from event, participant, vote, response, and scoring tables rather than stored in dedicated report tables.

The competition model is especially important because it supports a flexible, shared schema for multiple judged formats, such as pageants, dance, singing, and other performance-based competitions.

---

## 5. Authentication and Security Model

The platform uses secure token-based authentication, with HTTP-only cookies for session management.

### Authentication process

1. User submits login credentials
2. Backend verifies password using bcrypt
3. Backend creates JWT access and refresh tokens
4. Tokens are stored in secure HTTP-only cookies
5. CSRF protection is also used for sensitive requests
6. Middleware authenticates each request by reading the cookie token
7. The system attaches user context to the request

### Role enforcement

The backend uses middleware to enforce access control:

- authenticate: ensures the user is logged in
- authorize(...roles): checks user role
- requirePasswordChanged: blocks use until first login password change is completed
- requireProfileComplete: ensures organizer profile is complete
- requireEventParticipant: ensures a user belongs to a specific event context

### Security protections included in the project

- bcrypt password hashing
- JWT access and refresh tokens
- HTTP-only cookies
- CSRF validation
- role-based route protection
- account status checks
- rate limiting
- input validation and sanitization
- duplicate-vote prevention logic

This is a significant part of the project’s practical and academic value: the system is not only a voting app, but a secure digital governance and event management platform.

---

## 6. Request and Workflow Lifecycle

## 6.1 Login Flow

1. Frontend sends login request to auth API
2. Backend validates login data
3. Backend generates access token and refresh token
4. Backend sets cookies on the response
5. Frontend stores non-sensitive session metadata (such as user or CSRF data as needed)
6. Backend authenticates future API requests using cookies

## 6.2 Organizer Event Creation Flow

1. Organizer logs in
2. Organizer visits organizer dashboard
3. Organizer selects event type: election, competition, or polling
4. Organizer fills in event details
5. Organizer uploads branding assets, if any
6. System validates required fields and date constraints
7. Backend creates the event record in the database
8. Organizer goes to the relevant configuration steps
9. Organizer adds positions, candidates, contestants, criteria, rounds, or questions
10. Event becomes active or open depending on settings

## 6.3 Voter Submission Flow

1. Voter logs in and sees dashboard
2. Voter selects assigned event
3. System loads event-specific ballot or survey page
4. Voter submits vote or response
5. Backend validates that the voter is allowed to participate
6. Backend prevents duplicate or invalid submissions
7. Database stores the record
8. Organizer can access analytics after results are recorded

## 6.4 Reporting and Analytics Flow

1. Event data is stored in database tables
2. Organizer requests analytics or reports
3. Backend aggregates the relevant event metrics
4. System calculates turnout, distributions, rankings, scores, and completion status
5. Frontend displays charts, summaries, and report panels

---

## 7. Data Model and Relationships

At a conceptual level, the system revolves around a few essential entities:

- Users
- Organizations
- Events
- Event participants
- Ballots and submissions
- Questions and answers
- Contestants or candidates
- Criteria and scores
- Reports and analytics

The platform is strongly relational: a single event can have many participants, many questions, many submissions, and many computed results.

This makes the project relevant for thesis topics involving:

- relational database design
- role-based access control
- secure transaction processing
- system integrity and auditability
- analytics computation from event data

---

## 8. Notable Functional Features

### Event lifecycle management

Events can be created, updated, configured, opened, and monitored. Different modules require different steps, but the overall design follows a consistent event-driven model.

### Dynamic question registry

In the polling module, question types are managed as a registry, making the system flexible and extensible for various survey scenarios.

### File uploads

The system supports uploading:

- organization logos
- event banners
- candidate photos
- contestant photos

This is integrated with Cloudinary for media storage.

### Email and notification system

The project has an automated email layer using Resend. This supports:

- organizer invitation
- participant invitation
- password reset
- event notifications

### Multi-role dashboard experience

Each user role gets a different experience: admin dashboard, organizer dashboard, voter dashboard, and specialized participant screens.

---

## 9. Why This System Is Important for Research and Thesis Writing

This project is a strong topic for academic investigation because it combines several important domains:

- software engineering
- database design
- cybersecurity and access control
- digital governance and elections
- online survey systems
- competition scoring and ranking systems
- live judging and real-time event workflows
- analytics and reporting
- user experience design
- system architecture and scalability

Possible thesis angles:

- secure online voting systems and trust models
- role-based access control in event management platforms
- flexible competition event architectures for multiple judging formats
- live scoring systems for pageant, dance, and singing competitions
- analytics and decision support in digital judging systems
- survey collection and response quality in online systems
- trade-offs between usability, security, and reliability in election and judging platforms

---

## 10. Key Thesis-Friendly Descriptions

A concise academic description of the system:

"VOTRIX is a multi-module digital platform for managing elections, surveys, and competition events, with the competition module designed to support multiple judging formats such as pageant, dance, singing, and other performance-based events. It integrates a React frontend, Express backend, and Supabase-based PostgreSQL database to support secure role-based access, event lifecycle management, user-specific voting or scoring flows, and analytics reporting. The system is designed around secure authentication, structured event workflows, and role-driven participation, making it suitable for research in digital governance, online voting systems, flexible competition scoring, and secure software architecture."

---

## 11. Suggested Thesis Research Questions

The following questions are useful starting points for academic exploration:

1. How can a digital voting system balance security, usability, and trust?
2. What role-based access controls are necessary for secure multi-user event management?
3. How do online contest and survey systems affect transparency and participant confidence?
4. What are the design considerations for preventing duplicate submissions and enforcing event rules?
5. How can event analytics improve decision-making for organizers and administrators?
6. What are the trade-offs between cookie-based authentication and local-storage token usage in web applications?

---

## 12. Practical Notes for AI Assistance

When asking AI tools to help with writing the thesis, include the following context:

- This project is a web-based platform for online elections, polls, and competition scoring
- It has three system roles: admin, organizer, and voter. The voter role has event-specific participant types: election voter, competition judge, and polling respondent.
- It uses React + Express + Supabase
- It supports secure cookies, JWTs, and role-based access
- The active codebase uses three main user-facing modules: election, competition, and polling
- The competition module supports different judged formats such as pageant, dance, singing, and talent
- Legacy pageant naming remains in some compatibility layers, but the primary architecture is competition-first
- It includes analytics, reporting, uploads, and email automation
- It is designed for research in secure digital participation systems

This knowledge base should help AI models answer with more accurate domain context and less generic explanation.

---

## 13. Final Summary

VOTRIX is not just a voting app. It is a multi-role digital event platform for secure participation, analytics, and judged competition management. It brings together elections, polling, and competition scoring into a unified system, with the competition engine capable of supporting different formats such as pageant, dance, and singing. Its architecture and workflow make it a suitable foundation for academic work in software engineering, cybersecurity, digital governance, flexible competition systems, and event-driven software design.

This file should be treated as a project memory document that future AI tools can use when helping write the thesis, concept papers, technical narrative, or discussion sections, especially when the focus is on the newer competition-first architecture of the system.
