# Realtime implementation and verification

Updated October13,2026. Native authorized WebSocket remains the primary invalidation transport. **No deployed multi-browser authentication or hosting test is claimed.**

## Connection contract

Exact trusted application origins are shared by HTTP/WS. Identity, current session/token/account state and event-room authorization remain server enforced. Socket capacity is per authenticated user plus bounded node total, so independent judges behind one NAT do not share a ten-connection identity. Cookie refresh is serialized and explicitly replaces the socket upgrade cookie context. Tokens remain HTTP-only.

The socket URL correctly resolves relative `/api` and absolute HTTPS API bases; Vite supplies an explicit `/ws` upgrade proxy. Requested rooms are re-subscribed after reconnect. Intentional disconnect/account switch clears old rooms and prevents old callbacks restoring the prior identity.

## Persist → notify → reconcile

| Mutation | Post-commit notification / recipient | Authoritative receiving action |
|---|---|---|
| Start/round/entry/criterion/intersection/pause/resume/correction/slot | Safe event-scoped session hint | Judge/live views fetch the current saved sheet/session; never install permissions directly from a message. |
| Lock/Submit Round | Scoped organizer progress hint; submitted-source workflow/ranking invalidation | Organizer reloads completion; tabulation/rankings read submitted versions, not typed/draft values. |
| Calculate | `competition:workflow-updated` to owner and appointed reviewer personal room | Open reviewer discovers current calculation; no ordinary judge receives worksheets. |
| Reviewer Verify/decision/amendment | Private workflow hint plus safe permission/context refresh when relevant | Organizer/reviewer reload current status; source revision protects stale approval/publication. |
| Finalize/Publish | Owner/reviewer hint, organizer rankings invalidation | Finalize/Publish enablement and official rankings update from GET. |
| Overall publication | `competition:results-published` eventId-only hint | Enrolled judges fetch the safe **published-only** endpoint; unpublished results never fill that UI. |

`useCompetitionSync` filters event identity, coalesces concurrent refresh work and fetches on reconnect, focus, online and visible-page restoration. Fallback is15s disconnected and60s connected, with hidden-page intervals skipped. Connected reconciliation also covers missed frames/process-local delivery. Current request generation and monotonic session revision prevent older Preliminary/state responses overwriting newer Final/context. Local unlocked edits are retained; authoritative locks win after confirmed save/reopen.

## Evidence

- Actual isolated socket tests: twenty independent mocked identities from one network peer accepted; configured redundant tabs rejected, closure released quota; unrelated origin and missing identity rejected. Authentication/database were mocked in this transport fixture.
- Mounted React tests: active fallback, reconnect/focus, unrelated-event filtering, inverted HTTP response order, account-switch isolation, unsaved draft preservation and authoritative lock reload.
- Handoff fixture: Calculate becomes visible to an already mounted reviewer; Verify updates an already mounted organizer; correct Finalize/Publish actions follow, with receiving GETs instead of manual page refresh.
- API refresh tests: concurrent401s share refresh; network failure preserves identity/work; authentication rejection clears session; late old-identity refresh/request/response cannot restore the old frontend identity. Actual browser Set-Cookie ordering across concurrent role switches remains an authenticated-browser release check.
- Ranked/dashboard component tests accept eventId-only invalidation and ignore another event's messages.

Exact suite outcomes are in [TEST_RESULTS.md](TEST_RESULTS.md). The original audit transport tests characterize historical defects and should not be run as repair acceptance against changed source.

## Deployment limit

The user reported deployment topology **not known**. Rooms remain in-process; no shared broker was invented or provisioned. Authoritative HTTP fallback provides eventual convergence if a notification is missed, but it is not immediate cross-instance fan-out. Verify ingress `/ws`, TLS, cookies, trusted origin values, actual instance/process count and shared-network capacity before release. If multiple instances require immediate delivery, choose and approve a shared transport separately.
