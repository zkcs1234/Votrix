# Phase 8 local policy and operational requirements

Production recommendation remains **NO-GO**. No environment file, paid service or deployed setting was changed.

## Competition rate policy

`COMPETITION_NATIVE_RATE_POLICY_ENABLED=true` opts the competition/pageant API namespaces into a bounded policy. Other namespaces keep their existing global behavior. Cookie parsing precedes quota selection; the quota subject must come from a verified access-token signature/type/UUID. This does not authorize access: the usual account, token/session revocation, role, profile, event, assignment and SQL checks still run. Bearer headers and client-selected actor IDs do not select a quota.

| Budget | Bound | Rationale / limitation |
| --- | --- | --- |
| Competition network safety | 12,000/IP/minute | Bounded pre-verification safety; campus IPs can represent many accounts. Requires hosted traffic sizing. |
| Verified-token identity | 600/minute | Five tabs at 1.5-second draft cadence plus authoritative reads remain bounded with headroom. Actual Phase 7 five-child traffic was 848 requests across identities, not one shared user. |
| Competition mutations | 300/identity/minute | Five continuously edited tabs can generate ~200 draft attempts/minute, leaving room for locks/controls. No unlimited authenticated bypass. |
| Invalid/missing cookie | 60/IP/minute | Unauthenticated attempts remain bounded and cannot claim an identity budget. |
| Public result burst/window | 300/IP/minute and 4,000/IP/15 minutes | Approximately 50 viewers at 15-second polling use 200/minute and 3,000/15 minutes, leaving limited focus/recovery headroom. Larger shared networks require measured sizing. |

Native judge writes avoid the older 30/minute limiter only after the trusted request-policy marker has been set. Legacy competition write paths retain their existing dedicated limiter. Election/polling routes retain their prior budgets. All stores remain process-local: distributed quota enforcement is **not verified** and must be addressed for the approved topology.

Native frontend requests honor `Retry-After`, isolate backoff by authenticated identity, preserve exact pending score request bodies, and avoid a retry storm. No POST is silently replayed by the generic interceptor. Score queues retry after the deadline under the normal current-context/CAS checks; 400/403/409 remain explicit review failures. A Lock requested while autosave is in flight is queued rather than discarded.

## Optional compatible hint relay

The application uses `ws`. The new standalone `backend/scripts/competition-hint-broker.mjs` and `competition-hint-transport.js` implement an internal WebSocket relay using the installed `ws` dependency. API processes configure **both** `COMPETITION_HINT_BROKER_URL` and `COMPETITION_HINT_BROKER_SECRET`. Defaults leave the relay disabled. The broker binds loopback by default; production remote transport requires WSS and approved network/TLS/service configuration. Generate a strong random secret (at least 32 characters); do not expose it to browsers or logs.

Peers authenticate a UUID instance/nonce/timestamp handshake with HMAC; stale/replayed handshakes and unsigned peers are denied. Frames contain only UUID recipients and allowlisted event/child/NULL-or-real-round/session/dependent-round identities. Scores, placements, input snapshots and arbitrary fields are rejected before local publication and at the broker. API-origin frames are not re-emitted to their source process. Bounded queues coalesce scope hints, and bounded frame caches suppress duplicates. Slow peer buffers are disconnected; dropped/evicted hints remain recoverable through authoritative HTTP reconciliation.

Reconnect uses bounded backoff. After broker recovery, local authenticated user rooms receive a score-free reconciliation signal. Notifications are hints, never permissions or source values. Existing WebSocket cookie/account/session/room authorization remains unchanged. New API instances still refetch authorized server state.

Local tests cover two **room-registry/publisher processes**, HMAC rejection, duplicate suppression, score-field rejection, broker restart, queued-hint delivery and reconciliation. Real browser tests separately exercise the existing signed-cookie WebSocket authorization on one API process. These are not a representative deployed multi-instance acceptance test.

Operations must confirm deployed instance/rolling-restart topology, provision or identify an approved internal relay with TLS/network isolation/secret rotation, define availability and monitoring, and test real authenticated users on different API instances, delayed/missed/out-of-order frames, token revocation, restart and bus outage. The relay is best-effort, not a durable event log; immutable database sources remain authoritative. No Socket.IO adapter was installed and no external infrastructure was provisioned.

## Capacity admission and exports

Native setup admits at most 100 entrants, five rounds, ten judges per round, ten majors per round and five equally averaged minors per major, with a combined ceiling of 12,000 raw targets per round. Configuration saves validate structural limits; freeze checks the current roster/panel projection and SQL still checks both revisions transactionally. These are explicit conservative admission limits, not changes to formulas. Legacy calculation/configuration paths are unchanged.

Native CSV requests revalidate current source/privacy first, reject over-limit target sets, apply a conservative 10 MiB serialization estimate before creating CSV text, and check actual output bytes afterward. No partial/truncated export is returned. The source RPC and row projection still materialize data in memory; the guard is not a measured peak-memory guarantee or streaming implementation. Production bounds, historical-decision volume, long labels, process memory and realistic concurrent HTTP exports still require representative tests.

The measured local 50-entrant/five-judge/four-major/three-minor profile contains 3,000 raw targets. Twenty concurrent actual draft RPCs are measured; remaining bulk fixture rows are seeded by guarded local SQL before actual submission and engine checks. This does not establish full-roster HTTP autosave capacity.
