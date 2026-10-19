import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { criteriaSource } from '../shared/competition-criteria-readiness.js'
const executable = 'C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe'
const database = `votrix_criteria_${Date.now()}`
function sql(args, db = database) {
  const result = spawnSync(executable, ['-X', '-h', '127.0.0.1', '-p', '55439', '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', ...args], { encoding: 'utf8', timeout: 30000 })
  assert.equal(result.status, 0, result.stderr || result.error?.message)
  return result
}
sql(['-c', `CREATE DATABASE ${database}`], 'postgres')
sql(['-f', 'backend/__tests__/fixtures/competition-workflow-schema.sql'])
for (const migration of ['087_competition_workflow', '088_competition_operations', '089_competition_verification', '090_competition_amendments', '091_competition_atomic_setup', '092_competition_input_invalidation', '093_competition_source_history', '094_competition_projection_reconciliation']) sql(['-f', `backend/src/database/migrations/${migration}.sql`])
// Original fixture intentionally has a minimal legacy minor table. Add the
// columns already supplied by migration 071 in the application schema.
sql(['-c', `ALTER TABLE competition_minor_criteria ADD COLUMN name text, ADD COLUMN score_type text DEFAULT 'range_1_100', ADD COLUMN custom_min numeric, ADD COLUMN custom_max numeric, ADD COLUMN is_active boolean DEFAULT true`])
sql(['-f', 'backend/src/database/migrations/095_competition_criteria_publication_guard.sql'])
const event = '22000000-0000-0000-0000-000000000002', parent = '55000000-0000-0000-0000-000000000002', minor = '66000000-0000-0000-0000-000000000002'
sql(['-c', `INSERT INTO events(id) VALUES('${event}'); INSERT INTO competition_criteria(id,event_id,name,percentage,min_score,max_score) VALUES('${parent}','${event}','Quality',100,1,100); INSERT INTO competition_minor_criteria(id,event_id,criteria_id,name,score_type,custom_min,custom_max,is_active) VALUES('${minor}','${event}','${parent}','Range','custom_range',0,10,false)`])
const databaseSource = JSON.parse(sql(['-At', '-c', `SELECT competition_criteria_source('${event}')`]).stdout)
assert.deepEqual(databaseSource, criteriaSource({ criteria: [{ id: parent, name: 'Quality', percentage: 100, minScore: 1, maxScore: 100, minorCriteria: [{ id: minor, name: 'Range', criteriaId: parent, scoreType: 'custom_range', customMin: 0, customMax: 10, isActive: false }] }], rounds: [] }))
console.log('PASS: JavaScript and PostgreSQL canonical sources match exactly')
const result = sql(['-f', 'backend/__tests__/fixtures/criteria-publication-assertions.sql'])
assert.match(result.stderr, /PASS: minor, weight, and membership conflicts/)
console.log('PASS: migration 095; stale minor/weight/membership sources roll back; valid publication freezes setup')
console.log(`Only isolated localhost:55439/${database} was modified.`)
