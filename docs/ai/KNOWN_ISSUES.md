# KNOWN ISSUES

## Critical

- No critical issues were verified from the current implementation.

## High Priority

- No high-priority issues were verified from the current implementation.

## Medium Priority

- Title: Auth login now handles database-unavailable errors gracefully
  - Description: The shared database wrapper now converts connectivity failures into a consistent 503 service-unavailable response instead of surfacing a generic 500 during login and related auth operations.
  - Affected module(s): Backend auth flows, shared database foundation layer
  - Severity: Medium
  - Current status: Resolved
  - Recommended solution: Keep the current error mapping and preserve regression coverage around database-unavailable scenarios.

- Title: Vercel preview origins are no longer allowed by default
  - Description: The backend CORS policy now defaults to denying Vercel preview origins unless explicitly enabled through configuration.
  - Affected module(s): Backend app CORS configuration
  - Severity: Medium
  - Current status: Resolved
  - Recommended solution: Keep the default disabled and opt in only for trusted preview environments.

- Title: Mixed competition judge model
  - Description: The competition module still supports both legacy judge paths and the newer first-class judge model. Some services and controllers continue to read the legacy `event_voters.is_judge`/`has_scored` fields alongside `competition_judges`.
  - Affected module(s): Backend competition/pageant services and controllers
  - Severity: Medium
  - Current status: Open
  - Recommended solution: Consolidate all judge handling on the first-class competition judge model and retire the legacy fallback paths.
  - Notes: This is a compatibility and maintainability concern rather than a user-facing blocker.

- Title: Test coverage and regression verification are not fully documented
  - Description: The backend has a Vitest-based suite and test scripts, but coverage reporting and end-to-end verification are not clearly documented or consistently validated. The frontend currently has no dedicated test harness.
  - Affected module(s): Backend test suite, frontend test setup
  - Severity: Medium
  - Current status: Open
  - Recommended solution: Add documented coverage targets, CI verification, and a frontend testing stack for component and integration tests.

## Low Priority

- Title: Legacy Jest dependency removed from backend dev dependencies
  - Description: Jest is no longer listed in the backend dependency manifest because Vitest is the active test runner.
  - Affected module(s): Backend package manifest
  - Severity: Low
  - Current status: Resolved
  - Recommended solution: Continue using Vitest for backend tests and keep the dependency list minimal.

## Technical Debt

- Title: WebSocket rooms are stored in memory
  - Description: Room membership is maintained in a Node.js `Map`, so all socket room state is lost on restart and is not shared across multiple server instances.
  - Affected module(s): Backend WebSocket room registry
  - Severity: Medium
  - Current status: Open
  - Recommended solution: Introduce a shared adapter such as Redis for WebSocket room state in multi-instance deployments.

- Title: Rate limiters use in-memory stores
  - Description: The current rate-limiter implementation uses the default in-memory store, which does not scale across multiple application instances.
  - Affected module(s): Backend rate-limiter middleware
  - Severity: Medium
  - Current status: Open
  - Recommended solution: Replace the in-memory store with a distributed store when the application is deployed behind multiple backend instances.

## Performance Opportunities

- Title: Database connection-pool tuning is not explicit
  - Description: The backend uses the Supabase client directly without any documented connection-pool or query-optimization tuning. This may become relevant under higher concurrency.
  - Affected module(s): Backend database access layer
  - Severity: Medium
  - Current status: Open
  - Recommended solution: Review query patterns and Supabase client usage under load, and tune pooling or access patterns if throughput becomes a bottleneck.

- Title: Reporting queries may need further optimization validation
  - Description: The reporting services aggregate data across several tables and modules. The index work in migration 019 improves this path, but the actual plan and runtime behavior should be validated under realistic data volumes.
  - Affected module(s): Backend reporting services and database indexes
  - Severity: Medium
  - Current status: Open
  - Recommended solution: Profile the slowest reports, inspect query plans, and add targeted indexes or query rewrites as needed.

## Security Improvements

- Title: Refresh-token rotation is not implemented
  - Description: The refresh flow issues a new token pair, but it does not persist or rotate refresh tokens by identifier. This leaves the refresh workflow less resilient to replay and token reuse scenarios.
  - Affected module(s): Backend auth controller, auth service, and token service
  - Severity: Medium
  - Current status: Open
  - Recommended solution: Store refresh-token identifiers or hashes, rotate them on every use, and invalidate previous values on logout or password change.

- Title: Vercel preview origins are allowed by default
  - Description: The backend defaults `ALLOW_VERCEL_PREVIEWS` to `true`, which allows preview deployments to make credentialed requests unless explicitly disabled.
  - Affected module(s): Backend app configuration
  - Severity: Medium
  - Current status: Open
  - Recommended solution: Default this to `false` in production and allow only explicitly trusted preview origins.

## Future Refactoring

- Consolidate all competition judge handling on the first-class judge model and retire legacy `event_voters.is_judge` paths.
- Add distributed adapters for WebSocket rooms and rate limiting when the deployment is scaled horizontally.
- Introduce a frontend test harness with component and integration coverage.
- Review temporary operational scripts and remove any artifacts that should not remain in the repository.
- Consider scheduled event-status transitions based on event dates when workflow automation is required.

---

Last Updated: 2026-07-04
Documentation Version: 1.0.2
Related Documentation: docs/ai/AI_CONTEXT.md, docs/ai/CHANGELOG_AI.md, docs/ai/TODO_AI.md
