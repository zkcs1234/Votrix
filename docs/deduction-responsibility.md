# Deduction responsibility and connected workflows

## Configuration contract

New native competition drafts support three choices: **No Deductions**, **Organizer Applies Deductions**, and **Judges Apply Deductions**. `scoringConfig.deductionMode` is the competition default; a round's optional `deductionMode` overrides it. Removing the override restores inheritance. Preliminary can therefore inherit organizer responsibility while Final overrides it to judge responsibility.

Each rule has one explicit `appliedBy` owner. A criterion rule inherits its round's owner; it cannot introduce a conflicting responsibility setting. Rules specify their fixed amount, units, applicable round/criterion, and whether separate violations are allowed, with a maximum of 1–100 occurrences. A competition-wide rule applies at the final result scope. Duplicate identifiers, overlapping offense definitions, invalid scopes, and conflicting owners fail setup validation in both JavaScript and PostgreSQL.

Changing a draft's responsibility explicitly converts or removes affected rules after confirmation. Frozen rules cannot be edited through setup. Historical configurations without the new fields retain the organizer proposal and independent deduction-approval workflow.

## Connection audit

| Area | Behavior and authoritative connection |
| --- | --- |
| Setup and review | The shared resolver and readiness validation are used by Rounds & Scoring, the competition review, the backend configuration validator, and migration 126's database validator. Ownership and rules are frozen together. |
| Judge assignments | Existing event enrollment, active-account checks, explicit competition/round assignments, and scoring roles still control access. A score reviewer cannot submit judge deductions. |
| Judge scoring | Only applicable frozen judge rules appear. Judges record a reason and violation reference; they cannot choose an amount, units, owner, or calculation stage. Original criterion inputs remain unchanged. |
| Draft recovery | Deduction records use the same event/judge/competition/round/rule-version identity, row revision, local queue, save/retry, and server reconciliation as scores. Switching competitions retains scoped unsaved work without sending it to a sibling competition. |
| Lock and submit | Criterion records lock with the criterion. Entry-wide records lock when any criterion is locked. Incomplete local records prevent locking. The database independently checks scope, limits, identifiers, uniqueness, and revisions. Submitted records become part of the immutable score snapshot. |
| Live Control | The selected round shows its deduction responsibility. Existing access gates, pause/close, submission counts, and correction actions govern the score and its deduction records together. Corrections invalidate the affected submission and require resubmission. Closing a category does not finalize or publish results. |
| Organizer tabulation | Explicit new organizer rules apply directly, with a fixed configured value, reason, reference, actor, and audit record. An audited reversal preserves the original decision. Historical rules retain independent approval. Judge deductions appear as read-only submitted evidence. |
| Calculation | The backend derives all records from current immutable sources and frozen rules. Client-supplied totals cannot replace official arithmetic. None mode rejects judge records and exposes no organizer entry controls. Incomplete or reopened sources prevent calculation. |
| Ranking and ties | Judge score points affect adjusted numeric totals before judge ranking. Judge placement penalties affect that judge's placement after ranking. Organizer aggregate placement penalties affect the panel placement total. Criterion tie-breaks use adjusted criterion values when a criterion penalty applies. |
| Independent review | Calculation can happen before appointing a reviewer. Independent verification remains required for finalization. Removing independent deduction approval from new organizer rules does not remove final-result verification. |
| Reviewer navigation | Discovery separates review contexts from scoring contexts. An appointed reviewer opens the independent Tabulation workspace instead of requesting an unauthorized judge score sheet. This connection was corrected during the real browser check. |
| Advancement | Qualifier proposals read the finalized official calculation's ranks and adjusted scores. Existing calculation-ID/source-digest confirmation and qualification guards remain in force; the browser preview cannot advance entrants. |
| Carry and weighted rounds | Applicable rules and submissions include contributing rounds. Earlier penalties follow their round's contribution. Numeric rank carry keeps numeric deductions separate from ordinal placement penalties; competition-final judge points in numeric rank carry apply after numeric carry. |
| Organizer results | Results use the finalized saved calculation. Judge deductions are already reflected in scores. Organizer aggregate penalties are shown separately when enabled; criterion penalties are already reflected in judge contributions. |
| Public results | Publication remains an explicit versioned action. The public projection exposes final standings and responsibility booleans, without private judge scores, reasons, violations, or worksheets. None and judge-only modes hide the organizer penalty column. |
| Corrections and publication | Source changes make a calculation stale. Recalculation, independent verification, finalization, and explicit publication replacement follow the existing guards. Historical submitted and published versions are not rewritten. |
| CSV, Excel, PDF | Organizer tabulation formats share the same saved-source report enrichment. Each entry's originals, criterion traces, deductions, and result stay together. Backend CSV exports retain exact raw SQL decimal text and separate audit records; published combined exports group records by entry. Disabled deduction fields are omitted. Spreadsheet escaping remains shared. |
| Categories and Pageant | These choices operate on the native competition and round, regardless of competition category. Migration 125 separately limits Pageant creation review/freeze to the canonical Pageant competition. It does not merge legacy division-child scores, transfer judge assignments, or rewrite results. |

## Arithmetic

For judge responsibility, a 2-point deduction on one of three judge totals of 90, 85, and 95 produces adjusted totals of 88, 85, and 95. Their average is **89.33** and their sum is **268**. Under organizer aggregate responsibility, the same 2-point penalty after averaging produces **88**.

Criterion points adjust the criterion's weighted contribution before judge totals are combined. An organizer criterion penalty affects each judge's contribution, so Sum includes that penalty once per judge. Original scores and unadjusted contributions remain available for audit.

Rank-based scoring supports both numeric points before ranking and placement penalties after ranking. They remain separate in calculation traces and reports.

## Supported boundaries

- The three new choices are implemented for the native round workflow. The historical scoring-configuration endpoint rejects new ownership fields and continues supporting its historical rule contract.
- Manual placements do not support automatic deductions.
- For ordinary numeric competitions combining several rounds, judge deductions must have a round or criterion scope. Competition-final judge deductions are supported for an independent final round and numeric rank carry. The unsupported combined numeric/global combination is rejected with an explanation rather than assigned an ambiguous stage.
- Migration 125 retains old Pageant division-child rows. Any need to consolidate their already-existing scoring history requires a separate data migration and reconciliation review.

## Database and deployment

`126_competition_deduction_responsibility.sql` requires the existing native scoring/results functions plus migrations 123 and 124. It adds deduction records to draft score rows, wraps configuration/scoring/deduction RPCs, extends immutable-source comparison, and adds safe responsibility flags to new public projections. Original implementations are retained as private delegates. Direct authenticated writes and delegate execution remain prohibited; authorized application RPCs are restricted to `service_role`.

Deploy the matching backend, frontend, shared code, and reviewed migration together. Applying SQL alone does not update judge controls or tabulation reports. Migration 125 addresses canonical Pageant creation review independently of deduction ownership. No production Supabase migration was run during this work.

## Verification

- Backend regression coverage includes average, sum, highest score, removal of extremes, points basis, rank points/placements, criterion penalties and ties, weighted rank carry, forged records, duplicates, repeat limits, round inheritance, legacy behavior, exports, source identity, and public privacy.
- Frontend coverage includes setup defaults/overrides, frozen settings, judge save/lock/submit and context switching, organizer/judge tabulation, calculation traces, disabled fields, vertical reports, and organizer/public results.
- `node backend/scripts/test-competition-deduction-modes-local.mjs` verifies a nonce, database name, loopback port, and PostgreSQL data directory before testing real migrations and permissions. It applies migration 126 twice inside a rollback transaction and verifies all three modes plus historical finalization compatibility.
- `node backend/scripts/test-deduction-responsibility-browser.mjs` runs the normal router/login, real Express API, real PostgREST, and verified disposable local PostgreSQL. It creates synthetic fixtures and tests scoring, Live Control, calculation, review, finalization, publication, and CSV export. It deliberately persists fixtures and migration changes only in that verified local test database; it never loads hosted credentials.

Completed validation: 164 backend tests across the focused and legacy suites, 160 frontend tests, scoped ESLint, and production builds with native flags enabled and disabled. The real PostgreSQL rollback assertions passed, including migration rerun and RPC permissions. The browser run passed the complete workflow for all three modes; its evidence is in `audits/deduction-responsibility/browser.json`. Production Supabase was untouched.
