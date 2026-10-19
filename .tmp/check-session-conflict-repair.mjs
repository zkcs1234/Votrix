import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import path from 'node:path'

const root=path.resolve(import.meta.dirname,'..')
const executable='C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe'
const database='votrix_session_conflict_20261011'
function sql(args,db=database,success=true) {
  const result=spawnSync(executable,['-X','-h','127.0.0.1','-p','55439','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1',...args],{cwd:root,encoding:'utf8',timeout:30000})
  if(success) assert.equal(result.status,0,result.stderr||result.error?.message)
  return result
}
sql(['-c',`CREATE DATABASE ${database}`],'postgres')
sql(['-f','backend/__tests__/fixtures/competition-workflow-schema.sql'])
const event='3beb7871-cee3-42cf-8436-02c4d9af4bbd'
const current='ac71900f-8ef0-4c19-8954-9f2c8db1b0f0'
const old='6220504e-d773-46c7-950a-60855d9ee86a'
sql(['-c',`INSERT INTO events(id) VALUES('${event}'); INSERT INTO competition_sessions(id,event_id,status) VALUES('${current}','${event}','active'),('${old}','${event}','paused')`])
const migration='backend/src/database/migrations/087_competition_workflow.sql'
const blocked=sql(['-f',migration],database,false)
assert.notEqual(blocked.status,0)
assert.match(blocked.stderr,/COMPETITION_DUPLICATE_LIVE_SESSIONS/)
assert.match(blocked.stderr,new RegExp(event))
assert.equal(sql(['-At','-c',"SELECT to_regclass('public.competition_rule_versions') IS NULL"]).stdout.trim(),'t')
assert.equal(sql(['-At','-c',"SELECT count(*) FROM competition_sessions WHERE status IN('active','paused')"]).stdout.trim(),'2')
console.log('PASS: migration detects duplicate live sessions before changing schema or session data')

const repair='backend/src/database/scripts/resolve_legacy_live_session_conflict.sql'
sql(['-c',`INSERT INTO competition_session_judge_scores(session_id,event_id) VALUES('${old}','${event}')`])
const protectedRepair=sql(['-f',repair],database,false)
assert.notEqual(protectedRepair.status,0)
assert.match(protectedRepair.stderr,/Paused session now has score or result records/)
assert.equal(sql(['-At','-c',`SELECT status FROM competition_sessions WHERE id='${old}'`]).stdout.trim(),'paused')
sql(['-c',`DELETE FROM competition_session_judge_scores WHERE session_id='${old}'`])
console.log('PASS: targeted repair refuses a session that acquired score records')

sql(['-f',repair])
assert.equal(sql(['-At','-c',`SELECT status FROM competition_sessions WHERE id='${current}'`]).stdout.trim(),'active')
assert.equal(sql(['-At','-c',`SELECT status FROM competition_sessions WHERE id='${old}'`]).stdout.trim(),'completed')
assert.equal(sql(['-At','-c','SELECT count(*) FROM competition_sessions']).stdout.trim(),'2')
const repeated=sql(['-f',repair],database,false)
assert.notEqual(repeated.status,0)
assert.match(repeated.stderr,/Expected obsolete paused session has changed/)
console.log('PASS: targeted repair keeps current active session and retains both records; repeated repair aborts')

const files=[
  migration,
  'backend/src/database/migrations/088_competition_operations.sql',
  'backend/src/database/migrations/089_competition_verification.sql',
  'backend/src/database/migrations/090_competition_amendments.sql',
  'backend/src/database/migrations/091_competition_atomic_setup.sql',
  'backend/src/database/migrations/092_competition_input_invalidation.sql',
  'backend/src/database/migrations/093_competition_source_history.sql',
  'backend/src/database/migrations/094_competition_projection_reconciliation.sql',
  'backend/__tests__/fixtures/competition-workflow-assertions.sql',
  'backend/__tests__/fixtures/competition-verification-assertions.sql',
]
const final=sql(files.flatMap(file=>['-f',file]))
assert.match(final.stderr,/PASS: context rejection/)
assert.match(final.stderr,/PASS: independent verification/)
assert.equal(sql(['-At','-c',"SELECT data_type FROM information_schema.columns WHERE table_name='competition_result_calculations' AND column_name='status'"]).stdout.trim(),'text')
console.log('PASS: migrations 087-094 and both workflow/verification SQL suites after conflict repair')
console.log('Only isolated localhost:55439 test database was modified.')
