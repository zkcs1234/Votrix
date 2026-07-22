# AI Changelog

> Append-only. Never overwrite previous entries. Add newest entries at the top.

---

## [1.0.1] — 2026-07-04

### Documentation

- Refreshed the known-issues tracker to remove resolved auth migration items and retain only implementation-backed issues.
- Updated the AI context summary to point to the current issue tracker and reflect the latest documentation revision.

---

## [1.0.0] — 2026-07-04

### Added

- Initial AI documentation system created under `docs/ai/`
- `README.md` — entry point and update workflow for AI agents
- `AI_CONTEXT.md` — master project summary
- `SYSTEM_ARCHITECTURE.md` — architecture, auth flow, request lifecycle
- `FEATURES.md` — all 14 features documented with status, files, endpoints
- `DATABASE.md` — complete schema: 25+ tables, all enums, indexes, migrations
- `API.md` — all API endpoints documented with auth, request, response
- `REALTIME.md` — WebSocket server, rooms, emitter, frontend client
- `BUSINESS_RULES.md` — auth, role, election, competition, polling, security rules
- `UI_UX.md` — all pages, layouts, components, states
- `PROJECT_STRUCTURE.md` — complete folder responsibility map
- `DEPENDENCIES.md` — all packages with purpose and usage
- `CHANGELOG_AI.md` — this file
- `KNOWN_ISSUES.md` — current known issues and tech debt
- `TODO_AI.md` — prioritized task list

### Project State at Documentation Creation

- All 14 development phases complete
- Backend: Express 5, Node.js 20+, Supabase, JWT HTTP-only cookies (CLAUDE.md plan implemented)
- Frontend: React 19, Vite 8, Tailwind 4, Zustand 5
- WebSocket: Custom `ws` library server with room-based broadcast
- Auth: Cookie-only transport (no Authorization header, no localStorage token)
- 19 database migrations applied

---

<!-- Add new entries above this line -->
