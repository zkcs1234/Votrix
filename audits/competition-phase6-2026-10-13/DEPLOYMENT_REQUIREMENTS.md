# Phase 6 deployment requirements — unresolved

Local PostgreSQL, unit, frontend and build tests do not satisfy these requirements. Production deployment is **blocked**.

| Requirement | Status | Evidence needed before deployment |
| --- | --- | --- |
| Deployed SQL catalog/constraints/triggers/function definitions/permissions | Not verified | Read-only deployed catalog comparison against reviewed 103–107 and an applied-migration ledger. |
| Recoverable database backup | Not confirmed | Backup identity, protected storage and recovery ownership. |
| Restore procedure | Not tested | Successful restore into an isolated environment and preserved historical/scoring inventories. |
| Hosted authenticated acceptance | Not run | Organizer, assigned judge, independent reviewer, different-event user and public-user browser checks against the hosted candidate. Include correction, export denial, publication replacement/withdrawal and cookie/CSRF boundaries. |
| Multi-instance invalidation delivery | Not implemented or verified | Confirm deployment topology. If multiple API instances serve traffic, use and test shared transport/outbox delivery, reconnect recovery and no private payloads. Local user rooms and frontend test buses are not distributed evidence. |

The current transport remains process-local. Publication mutations commit before local authorized invalidations; public HTTP polling and authenticated reconciliation cover missed notifications with bounded delay. This is not a claim of immediate delivery across API instances.

The hosted acceptance candidate must use recoverable, explicitly approved deployment data. This phase did not change configured Supabase, enable .env gates or run hosted browser acceptance.

Do not mark these rows complete merely because local tests pass. Each requires its own reviewed evidence and approval. Do not begin Phase 7 without the user's approval.
