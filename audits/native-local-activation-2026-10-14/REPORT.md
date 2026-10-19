# Native competition activation in the actual localhost application

October 14, 2026. **Final status: FULLY INTEGRATED for the tested isolated local competition workflow. Production release remains NO-GO.** The application is running at http://localhost:5173/organizer/competition. Login is required using the synthetic accounts described in [LOCAL_SETUP.md](LOCAL_SETUP.md).

No agent-initiated hosted Supabase request, migration, write, deployment, production activation, Git commit or push occurred in this task. Existing production environment/deployment files and migrations 100–108 retain their earlier hashes. The parent dashboard and Create Event experience remain the existing parent-event flow; native management appears in the selected event's workspace.

## 1. Isolated database and API configuration

| Item | Verified configuration |
| --- | --- |
| PostgreSQL | Existing PostgreSQL 18 installation; new dedicated loopback cluster at `.tmp/votrix-native-dev/pgdata`, port 55440 |
| Database | `votrix_dev_1791952165826`; newly built from repository schema and synthetic data, with no production record copy |
| SQL/API roles | Local anon/authenticated/service_role and a generated local authenticator; native private-table/RPC permissions retained |
| PostgREST | Real official Windows PostgREST 16.4, port 5058; official ZIP digest verified |
| SDK-compatible prefix | Transparent loopback gateway on 5059 forwards `/rest/v1/` to real PostgREST; no mocked responses, SQL emulation or contract adapter |
| Express | Actual `src/server.js` / `createApp`, port 5000, local SDK URL only |
| Vite | Actual frontend/main/router at localhost:5173; isolated env directory and cache |
| Authentication/profile | Complete foundation, real bcrypt password login, application JWT issuance, sessions, HTTP-only cookies, CSRF, profile and role checks |
| Accounts | Five synthetic `.test` accounts: organizer, two judges, reviewer and outsider. Generated credentials remain in ignored local files |
| Storage/mail | Cloudinary and mail credentials absent; external uploads and delivery disabled as safe substitutes. No production storage/provider authentication is used |

The old Phase 1–9 sparse fixture cluster on 55439 remains stopped and untouched. Its scripts/evidence demonstrate disposable-fixture recreation, but those sparse templates do not provide a full ordinary login/application schema. This task therefore built a separate fresh complete foundation instead of copying those records into a development application.

The local launcher removes inherited provider/database/signing settings, supplies generated local keys and changes the working directory before loading dotenv/application code. The backend independently verifies database name, port, cluster directory and random identity **before** starting event synchronization, archival or listening. A mismatch/unavailable identity blocks startup. The real browser scripts also require matching local database/identity headers from the actual port-5000 backend before writing.

The previously user-started backend pointed to shared Supabase and was stopped during local replacement after its process identity was checked. Its earlier background scheduler activity is not certified read-only by this task; no hosted forensic inventory was taken. All newly started backend jobs and write-based verification here target the isolated cluster.

Generated accounts/signing/PostgREST files are Git-ignored. Actual Vite requests for the local accounts file and backend `.env` return 403. [final-evidence.json](final-evidence.json) verifies effective runtime identity and flags without storing credentials.

## 2. Migration compatibility

The fresh foundation installation applied 89 existing forward files, including 100–108, with recorded original checksums. A new additive **109_competition_full_foundation_compatibility.sql** follows them. The local database has 74 public tables, including its development migration ledger. This is a complete local foundation, not evidence of the deployed project's applied ledger.

Real full-schema execution exposed two native function collisions: `competition_freeze_native_rules` and `competition_child_scoring_choices` used a PL/pgSQL variable named `scope`, also present as an enrollment column. Migration 109 renames only those local variables to `v_round_scope`, retaining validation, authorization, snapshots, signatures and grants. It changes no calculation/scoring formula or records. Original 103–108 files are unchanged.

The historical foundation also needed explicitly recorded **fresh-local-only** execution adjustments:

- 011: guarded trigger rename syntax and precommitted enum additions instead of unsupported `ALTER TRIGGER IF EXISTS` / same-transaction enum consumption.
- 030: removal of trailing non-SQL tool markup after COMMIT.
- 038: existing event-ID companion executed before dependent division indexes.
- 039: renamed constraint removed before its owned index, retaining the intended replacement uniqueness on an empty table.
- A local-only `event_status.archived` enum member supplies the label already used by existing application event-list filters. No record was changed to archived.

Original historical SQL files were not edited. [foundation.json](foundation.json), [forward-manifest.json](forward-manifest.json) and [local-compatibility.json](local-compatibility.json) record execution scope/checksums. Foundation execution refuses unapplied migrations once users exist; account seeding refuses overwriting its credential file. These local adjustments are not an approved production migration procedure.

Actual catalog preflight after populated browser testing reports **47 tracked tables, zero structural/permission blockers and zero review items**. Reapplying final 109/local compatibility preserves all tracked inventories: [preflight-populated-after.json](preflight-populated-after.json). `migrationApproved:false` remains intentional. No legacy score/result data was imported; legacy historical-result counts in this new database are zero.

## 3. Active native flags

Enabled **only in the isolated launcher processes**:

| Backend | Frontend |
| --- | --- |
| `COMPETITION_CHILD_CONTEXTS_ENABLED=true` | `VITE_COMPETITION_NATIVE_SETUP_ENABLED=true` |
| `COMPETITION_NATIVE_SETUP_ENABLED=true` | `VITE_COMPETITION_NATIVE_SCORING_ENABLED=true` |
| `COMPETITION_NATIVE_SCORING_ENABLED=true` | `VITE_COMPETITION_NATIVE_TABULATION_ENABLED=true` |
| `COMPETITION_NATIVE_TABULATION_ENABLED=true` | `VITE_COMPETITION_NATIVE_RESULTS_ENABLED=true` |
| `COMPETITION_NATIVE_RESULTS_ENABLED=true` | |
| `COMPETITION_NATIVE_RATE_POLICY_ENABLED=true` | |

Served Vite injection confirms all four frontend values. Successful gated setup/scoring/tabulation/results operations and the verified launcher establish backend activation. No `.env`, Render, Vercel or GitHub workflow configuration was changed. Local hints use the existing single API process and real authenticated WebSockets; no shared broker or cross-host delivery is claimed.

## 4. Actual localhost routes

| Route | Actual behavior |
| --- | --- |
| `/organizer/competition` | Existing CompetitionDashboardPage; Manage competitions and Create Event are real navigation links |
| `/organizer/competition/events` | Owned parent selection; actual acceptance parent link opens workspace |
| `/organizer/competition/events/new` | Existing details/branding/draft creation persists a parent and navigates to its workspace |
| `/organizer/competition/events/E/workspace` | Existing native setup boundary: explicit children, participation, criteria/rounds, panel grants and rule freeze |
| `/organizer/competition/events/E/contestants`, `/judges`, `/review` | Existing shared native setup dispatchers; no parallel implementation |
| `/organizer/competition/events/E/live` | Child/round Live Control, access gates and completion |
| `/participant/competition/events/E/score` | Authorized existing judge table or appointed independent reviewer workspace |
| `/organizer/competition/events/E/tabulation` | Current-source worksheets, calculations, independent review/finalization and qualification |
| `/organizer/competition/events/E/rankings` | Native official results, versions, publication and CSV |
| Existing Analytics/Report routes | Existing native results/export dispatchers; regression coverage retained |
| `/competition/events/E/competitions/C/results` | Actual anonymous public page for approved editions |

The actual routed components use explicit event/child/NULL-or-real-round identities and real `/api/.../competitions/...` endpoints. Parent creation is not child creation. There is no root-mounted child setup without an event identity.

## 5. Working native workflows and real browser evidence

These are actual Chromium checks of the normal main/router/UI, real password login, actual Express middleware/controllers/services, real PostgREST and PostgreSQL. No synthetic JWT endpoint, alternate React entry, mocked API or SDK contract fixture is used.

| Acceptance | Result |
| --- | --- |
| Organizer login and exact root dashboard | PASSED; no access token in localStorage |
| Normal parent Create Event and workspace | PASSED; persisted parent `8c50d3f0-8f59-4eaa-b802-4390eed02f58` |
| Six independently configured children | PASSED; two shared masters with distinct child participations, explicit active panels and frozen rules |
| All six methods | PASSED through scoring/review/finalization/publication; stored expected totals additionally checked: average 85/65, sum 170/130, rank aggregate 2/4, highest 90/70, remove-lowest 90/70, manual NULL numeric totals with ranks 1/2 |
| Existing judge table, autosave, locks, Submit Round | PASSED; table source/CSS unchanged |
| Automatic completion/privacy updates | PASSED; owner incomplete sheets hide submitted worksheets, then reconcile after both current heads exist |
| Independent reviewer and explicit finalization | PASSED for each method; publication remains separate |
| Multi-round qualification | PASSED: Final initially blocked; tied Top-N=1 includes both entrants; explicit confirmation then separate Final start/scoring/review/finalization |
| Publish/replace/withdraw | PASSED through real organizer controls |
| Audited correction/current-head privacy | PASSED: existing historical sources/results cannot complete the cleared head; browser worksheets remain masked |
| Corrected resubmission/new official version | PASSED after explicit resume, new submission, calculation, independent verification and finalization; old history retained |
| Unauthorized real account requests | PASSED: unassigned participant scoring read and scoring judge organizer-result read return 403 |
| CSV | PASSED: all four owner downloads saved by Chromium, parsed from disk, scope/columns/raw 65/55, maximum 100, final 65/55 and hashes verified |
| Anonymous public UI | PASSED: actual public route shows approved 85/65 standings without worksheets |
| Real dashboard navigation | PASSED: organizer Manage competitions → parent list → workspace; judge dashboard card → authorized submitted child sheet |

[real-browser.json](real-browser.json): five groups including six-method journeys. [real-browser-extended.json](real-browser-extended.json): five groups including correction resubmission and negative authorization. [real-public-browser.json](real-public-browser.json): public page, organizer selection and judge deep link. Screenshots: `real-workspace.png`, `real-correction.png`, `real-public.png`. Saved CSVs and hashes are listed in [final-evidence.json](final-evidence.json).

Downloads represent the authorized source snapshot **at download time**, before the later correction. They are not claimed to stay current after that correction. Finalization after resubmission restores current private results; the tested withdrawn public edition remains withdrawn until an explicit new publication.

## 6. Repairs and remaining legacy workflows

Confirmed repairs:

1. Ordinary StrictMode bootstrap made independent refreshes; a late response could clear restored authentication. Bootstrap now shares the existing identity-bound refresh and finishes only its current effect. It does not expose tokens or bypass authorization.
2. The two native SQL variable/column collisions are corrected by additive 109.
3. An open reviewer page retained old context choices after later appointments. Its existing boundary now reconciles permission-scoped context discovery on invalidations, reconnect/focus/periodic recovery, with request-generation and actor checks. New choices become available without manual refresh; failures remain closed.
4. Local runtime activation is connected to the existing application through guarded launchers and `dev:native` scripts. Default production configuration is untouched.

The parent dashboard, parent Create Event form, parent event list/preview and explicit mapped legacy compatibility remain existing implementations. Default-disabled builds retain legacy page bodies. No event was automatically converted. Legacy calculation engines, judge table, CSV serializer and election/polling sources remain unchanged. Legacy behavior is supported by regressions and source preservation; no browser run against real historical production events is claimed.

## 7. Files changed

Modified during this task:

- `.gitignore`: ignore isolated database/secrets/binaries/profiles.
- `backend/package.json`, `frontend/package.json`: add `dev:native`, retaining existing commands.
- `backend/src/server.js`: verified local startup, loopback binding and local-only runtime identity headers.
- `frontend/src/hooks/useAuthBootstrap.js`: identity-bound shared refresh.
- `frontend/src/components/voter/competition/NativeCompetitionWorkspace.jsx`: reconcile authorized boundary choices.
- `frontend/src/components/organizer/competition/NativeCompetitionBoundaries.test.jsx`: new appointment-recovery regression.

Added:

- `backend/src/config/local-native-safety.js` and `backend/__tests__/modules/local-native-safety.test.js`.
- `backend/src/database/migrations/109_competition_full_foundation_compatibility.sql`.
- `frontend/src/hooks/useAuthBootstrap.test.jsx`.
- `backend/scripts/local-native-foundation.mjs`, `local-native-api.mjs`, `local-native-dev.mjs`, `local-native-seed.mjs`, `local-native-compatibility.mjs`, `local-native-browser-inspect.mjs`.
- `backend/scripts/test-native-real-app.mjs`, `test-native-real-app-extended.mjs`, `test-native-public-browser.mjs`, `verify-native-local-evidence.mjs`.
- This audit, setup guide and local evidence. Generated database/configuration/credential files remain ignored.

The earlier dashboard navigation repair predates this task and is retained. [final-evidence.json](final-evidence.json) compares 75 protected paths, migrations 100–108 and actual environment/deployment configuration with prior recorded hashes: all unchanged. Earlier user edits/reports/templates were retained; the workspace was not reset.

## 8. Tests passed, failures and limits

| Check | Final result |
| --- | --- |
| Backend regression | **89 files / 670 tests passed**; one existing integration file / three assertions skipped, not passed |
| Frontend regression | **47 files / 319 tests passed**; process-only roster-lock override, no environment file edits |
| Browser acceptance | Main, extended and public/navigation checks passed as detailed above |
| Real catalog and populated final-rerun comparison | 47 tracked tables, zero blockers/review items; inventories unchanged |
| Saved CSV and six-method expected results | Passed |
| Native/default builds | Both passed; existing large-chunk warning retained |
| Targeted ESLint | Passed without warnings after generation-counter cleanup adjustment |
| Syntax / diff | Checked; no calculation-engine changes |
| Protection | 75 protected source/test paths and original 100–108 migrations unchanged; environment/deployment hashes unchanged |

Early failures were corrected rather than counted as passed: historical SQL bootstrap defects, native scope ambiguity, StrictMode session loss, stale reviewer choices, transient browser DOM/disabled-state/serialization assumptions and duplicate synthetic child name rejection. Repeated suites exceeded normal login/shared-IP notification budgets; isolated backend quotas were reset between completed runs. No shared/global/election/polling rate policy or test expectation was weakened. Regression runs initially inherited opt-in browser flags and the wrong roster override; the runner now uses default-off baselines and the existing correct process-only override.

Stored failure JSONs remain as earlier-attempt evidence. Final passing reports supersede them. Tests use small two-entry/two-judge panels; this task does not establish production capacity or exhaustive policy variations.

## 9. Remaining blockers and handoff

Local native acceptance requested here passes. Safe substitutes mean real upload/mail/provider authentication remain untested. Repeated automated suites can reach normal quotas on one IP; representative campus traffic/distributed quota acceptance remains a release requirement. Unsupported weighted minors, per-round method variations, new normalization, frozen-rule amendments, used-roster changes and reviewer replacement were not introduced.

Production remains **NO-GO**: direct deployed catalog/ledger, recoverable complete backup/restore, approved hosted authenticated acceptance, actual Vercel/Render topology/shared transport, distributed rate enforcement and representative capacity are still unverified/blocked. Local passing evidence closes none of those production gates. Migration 109 also requires separate target review before any future authorized deployment.

The isolated PostgreSQL/API/backend/frontend are deliberately left running so the user can use the application. Test Chrome/debug listeners are closed. The old cluster stays stopped. Use [LOCAL_SETUP.md](LOCAL_SETUP.md) for login, start/stop, reproduction and safe commands. Ordinary backend `npm run dev` still uses its unchanged shared-project configuration; use `dev:native` for this isolated work.

**STOP: local integration work is complete. No further phase, commit, push or deployment is authorized or performed.**
