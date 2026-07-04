# TODO (AI Task List)

> Use Markdown checkboxes. Move completed items to the Completed section.  
> Add new tasks under the appropriate priority.

---

## High Priority

- [ ] **Verify auth RBAC fix end-to-end** — re-test organizer → admin/voter login switch without logout; confirm `ProtectedRoute` uses fresh role; confirm backend still returns 403 on unauthorized endpoints (`docs/TODO.md`)
- [ ] **Verify `useLogin.js` eslint/compile issues** — ensure the hook compiles cleanly after auth store changes
- [ ] **Confirm no token in localStorage** — verify no `accessToken` stored in localStorage after login in any role
- [ ] **Verify refresh token rotation** — check `token.service.js` and `auth.controller.js` to confirm refresh tokens are rotated on use (prevents replay attacks)

---

## Medium Priority

- [ ] **Consolidate dual judge system** — migrate `event_voters.is_judge` code paths to use `competition_judges` table exclusively; retire `v_legacy_competition_judges` view
- [ ] **Remove `jest` from backend devDependencies** — only Vitest is needed; `jest` inflates install size
- [ ] **Add Redis adapter for WebSocket rooms + rate limiters** — required before horizontal scaling
- [ ] **Write backend unit tests** — verify core services (auth, election voting, competition scoring, polling) have test coverage
- [ ] **Event status auto-transition** — add a scheduled job or cron to promote events from `scheduled` → `active` based on `start_date`, and `active` → `completed` based on `end_date`
- [ ] **Audit `ALLOW_VERCEL_PREVIEWS`** — evaluate whether `*.vercel.app` wildcard CORS should be narrowed in production
- [ ] **Pagination on audit logs** — verify `GET /api/admin/audit-logs` fully supports pagination, date range filtering, and action filtering

---

## Low Priority

- [ ] **Clean up `tmp_hash_admin.mjs`** from project root — add to `.gitignore` or delete
- [ ] **Archive/clear `CLAUDE.md`** — completed implementation plans should be moved to `CHANGELOG_AI.md`; keep `CLAUDE.md` lean
- [ ] **Add frontend test suite** — set up Vitest + React Testing Library for component and integration tests
- [ ] **Export report to PDF** — verify `utils/exportReport.js` is fully wired to the reports UI
- [ ] **Real-time election results via WebSocket** — emit live vote counts to organizer dashboard
- [ ] **Ranked-choice voting support** — extend election module for ranked-choice ballots
- [ ] **Multi-language ballot** — internationalization for election ballots
- [ ] **Poll branching/conditional questions** — extend polling module for skip logic
- [ ] **Bulk organizer import** — admin CSV import for creating multiple organizer accounts
- [ ] **Advanced audit log export** — CSV/Excel export of audit logs from admin UI
- [ ] **Session management UI** — allow users to see and revoke active sessions
- [ ] **2FA/MFA** — second-factor authentication for organizer and admin accounts

---

## Completed

- [x] Identify RBAC bleed-through root cause (cached localStorage role state)
- [x] Update `auth.store.js` to stop bootstrapping `user`/`role` from localStorage
- [x] Update login flow to clear client auth state before setting new session
- [x] Migrate auth to HTTP-only cookies only (remove token from JSON response + localStorage)
- [x] Remove `Authorization: Bearer` header from frontend API interceptor
- [x] Implement all 14 development phases (project setup through deployment)
- [x] Election module (positions, candidates, voting, CSV import, analytics)
- [x] Competition/pageant module (contestants, criteria, judges, scoring, rankings)
- [x] Polling module (question type registry, submissions, analytics)
- [x] WebSocket realtime server
- [x] Cloudinary file uploads
- [x] Resend transactional emails
- [x] In-app notifications system
- [x] Admin dashboard (organizer management, audit logs, system settings)
- [x] CSRF protection
- [x] Rate limiting
- [x] Invite registered voter feature (no new account creation)
- [x] Move documentation files to `docs/` folder
- [x] Generate AI documentation system (`docs/ai/`)

---

**Last Updated:** 2026-07-04
**Documentation Version:** 1.0.0
**Related Documentation:** `docs/ai/KNOWN_ISSUES.md`, `docs/ai/CHANGELOG_AI.md`
