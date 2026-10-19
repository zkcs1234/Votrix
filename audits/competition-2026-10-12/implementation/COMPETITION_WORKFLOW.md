# Implemented competition workflow and verification boundaries

Updated October13,2026. **Local components, services, transport and SQL operations were verified; the full authenticated multi-browser deployment is not verified.**

| Step | Implemented behavior | Evidence |
|---|---|---|
| Administrator creates judge | Existing participant identity, password hash and global judge pool membership; informational account email remains separate. | Existing account/service tests; no real email sent. |
| Organizer creates event | Required details/dates and optional label/branding; persisted draft; stable creation request; atomic retry returns draft event once. | Wizard component tests plus actual102 PostgreSQL Create/duplicate/conflict/owner checks. |
| Structure/entries/divisions | Owned rounds/criteria/minors/entries and valid memberships; complete atomic ordering; no ordinary manual seed of protected Final. | Readiness/participation/tenant tests; actual100 direct relation/reorder checks. |
| Enroll/assign judges | Existing eligible accounts enrolled; invitations counted separately; event/round/category/division scopes; bulk failures and failed-only retry. | Existing pool/access tests and mounted assignment/retry tests. |
| Confirm/publish rules | Saved confirmed method and valid criteria/panel/weights; full setup revision must match at transaction boundary; immutable rule version. | Publication service tests plus actual omitted-field/account-change stale snapshot rejection. |
| Start/control judging | Versioned shared session; current effective roster; independent presentation, input gates and submission window. | Existing local SQL progression tests and100–102 fixture start/access operations. |
| Judge enters raw values | Frozen ranges, finite numeric bounds; draft autosave/recovery, one complete major lock, then complete Submit Round. | Input/draft/component tests and actual Draft/Lock/Submit/zero/revision/duplicate SQL operations. |
| Monitor without refresh | Scoped post-commit hints; authoritative refetch, reconnect/focus and bounded fallback; stale identity/request/session revision rejected. | Actual isolated sockets plus mounted React state/timer/race tests, not deployed browser sessions. |
| Correct | Explicit reason+confirmation, preserved old sources/lock history, invalidated submission, new relock/resubmission version. | Frontend/controller tests plus actual SQL correction/history checks. |
| Calculate | Current submitted sources and frozen rules; finalists only for championship; all applicable complete inputs; selected scope; stored source input revision. | Exact engine/manual/service tests, real SQL source-version fixture and stale INSERT rejection. |
| Review/finalize/publish | Appointed independent verification; current revision required for transitions; official immutable snapshot; publication closes scoring/submission. | React handoff fixture and actual PostgreSQL Verify→Finalize→Publish with approved penalty and stale finalized rejection. |
| Advance | Verified current calculation; approved cutoff ties/qualifiers; next effective roster; no score carry rule silently changed. | Existing no-elimination/TopN/percent/threshold/manual SQL tests and actual new stale-advancement/eliminated-lock checks. |
| Results/report/export | Owner/reviewer appropriate data; enrolled ordinary judge only safe published overall results; report division scope/ranks retained; literal CSV text. | Service/role/component/serialization tests; external downloads/viewers unverified. |

Input availability is not defined by the primary contestant alone. Selecting a presentation slot and granting selected-entry/criterion/intersection scoring remain distinct. Submit Round can submit already locked work after inputs close while the explicitly separate submission window remains open. Those existing semantics were preserved.

The numeric path is raw/minor-maximum normalization → equal normalized-minor average → weighted major contribution → rounded judge total → confirmed judge-total aggregation → approved deductions/round combination → configured division/tie ranking. A lock is not a round submission; a Calculate snapshot is not an official publication.

New100–102 must be installed and checked on the intended deployment before dependent new paths can run. Historical published snapshots remain unchanged. Old unpublished calculations without new revision metadata require a fresh calculation and verification; they are not automatically promoted or rewritten.

All twelve original scenarios have local partial coverage described in [TEST_RESULTS.md](TEST_RESULTS.md). Complete real-account browser/cookie/persistence/export acceptance must still be run in a disposable deployment; see [REMAINING_ISSUES.md](REMAINING_ISSUES.md).
