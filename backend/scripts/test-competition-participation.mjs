// Integration checks use a newly created database on localhost only.
// Start PostgreSQL locally first; never point fixtures at a deployed database.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {readFileSync} from 'node:fs'
import {checkRoundProgression} from './check-round-progression.mjs'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..')
const executable=process.env.PSQL_PATH ?? (process.platform==='win32'?'C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe':'psql')
const database=`votrix_participation_${Date.now()}`
function sql(args, db=database) {
  const result=spawnSync(executable,['-X','-h','127.0.0.1','-p',process.env.PGPORT ?? '55439','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1',...args],{cwd:root,encoding:'utf8',timeout:30000})
  assert.equal(result.status,0,result.stderr || result.error?.message);return result
}
sql(['-c',`CREATE DATABASE ${database}`],'postgres')
sql(['-f','backend/__tests__/fixtures/competition-workflow-schema.sql'])
sql(['-c',`ALTER TABLE events ADD COLUMN divisions_enabled boolean DEFAULT false;
ALTER TABLE competition_divisions ADD COLUMN is_active boolean DEFAULT true;
ALTER TABLE competition_rounds ADD COLUMN division_id uuid, ADD COLUMN advancement_type text DEFAULT 'none', ADD COLUMN advancement_value numeric;
ALTER TABLE competition_minor_criteria ADD COLUMN name text, ADD COLUMN score_type text DEFAULT 'range_1_100', ADD COLUMN custom_min numeric, ADD COLUMN custom_max numeric, ADD COLUMN is_active boolean DEFAULT true`])
for(const migration of ['087_competition_workflow','088_competition_operations','089_competition_verification','090_competition_amendments','091_competition_atomic_setup','092_competition_input_invalidation','093_competition_source_history','094_competition_projection_reconciliation','095_competition_criteria_publication_guard'])sql(['-f',`backend/src/database/migrations/${migration}.sql`])
sql(['-f','backend/__tests__/fixtures/competition-participation-seed.sql'])
sql(['-f','backend/src/database/migrations/096_competition_participation_guards.sql'])
const result=sql(['-f','backend/__tests__/fixtures/competition-participation-assertions.sql'])
console.log(result.stderr.trim());console.log(sql(['-f','backend/__tests__/fixtures/competition-participation-manual-divisions.sql']).stderr.trim());console.log(`PASS: migration 096 and participation checks; only isolated localhost/${database} was modified.`)
sql(['-f','backend/__tests__/fixtures/competition-no-elimination-seed.sql'])
sql(['-f','backend/src/database/migrations/097_competition_round_progression.sql'])
console.log('PASS: migration 097 installs after 096 with existing scores, decisions and planned memberships.')
sql(['-f','backend/src/database/migrations/098_repair_event_participants_event_fk.sql'])
const historical=sql(['-At','-c',`SELECT jsonb_build_object('rules',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM competition_rule_versions r),'scores',(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM competition_session_judge_scores s),'decisions',(SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM competition_advancement_decisions d),'results',(SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM competition_result_calculations c))`]).stdout
// Reproduce the earlier private scoring/operational implementations. Upgrade
// must repair their frozen-roster behavior without modifying historical rows.
const earlierScoring=readFileSync(path.join(root,'backend/src/database/migrations/087_competition_workflow.sql'),'utf8')
const earlierOperation=readFileSync(path.join(root,'backend/src/database/migrations/088_competition_operations.sql'),'utf8')
sql(['-c',earlierScoring.slice(earlierScoring.indexOf('CREATE FUNCTION competition_scoring_write('),earlierScoring.indexOf('REVOKE ALL ON FUNCTION competition_scoring_write')).replace('CREATE FUNCTION competition_scoring_write(','CREATE OR REPLACE FUNCTION competition_scoring_write_v095(')])
sql(['-c',earlierOperation.slice(earlierOperation.indexOf('CREATE FUNCTION competition_operational_action('),earlierOperation.indexOf('CREATE FUNCTION competition_result_transition(')).replace('CREATE FUNCTION competition_operational_action(','CREATE OR REPLACE FUNCTION competition_operational_action(')])
sql(['-f','backend/src/database/migrations/099_competition_round_progression_upgrade.sql'])
const afterUpgrade=sql(['-At','-c',`SELECT jsonb_build_object('rules',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM competition_rule_versions r),'scores',(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM competition_session_judge_scores s),'decisions',(SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM competition_advancement_decisions d),'results',(SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM competition_result_calculations c))`]).stdout
assert.equal(afterUpgrade,historical,'Upgrade changed existing scoring/qualification history')
console.log('PASS: forward upgrade 099 after 097/098; existing rule/source/decision records retained.')
checkRoundProgression(sql)
