// Executes migration 103 ONLY in a freshly cloned disposable workspace database.
// No .env, Supabase, HTTP application startup, production target or remote host.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { spawnSync, spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const executable = process.platform === 'win32' ? 'C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe' : 'psql'
const database = `votrix_child_${Date.now()}`
const template = 'votrix_repairs_1791835055235'
const output = path.join(root, 'audits/competition-phase2-2026-10-13')
const environment = { ...process.env, PGHOST: '127.0.0.1', PGPORT: '55439', PGUSER: 'postgres', PGOPTIONS: '', PGCONNECT_TIMEOUT: '10' }
delete environment.PGSERVICE; delete environment.PGSERVICEFILE
const args = (target, more) => ['-X', '-w', '-q', '-A', '-t', '-h', '127.0.0.1', '-p', '55439', '-U', 'postgres', '-d', target, '-v', 'ON_ERROR_STOP=1', ...more]
function execute(source, target = database) {
  assert.ok(target === database || target === 'postgres', 'Only the new disposable database or local catalog is permitted')
  const result = spawnSync(executable, args(target, []), { input: source, encoding: 'utf8', env: environment, timeout: 30000, maxBuffer: 64 * 1024 * 1024 })
  assert.equal(result.status, 0, result.stderr || result.error?.message)
  return result.stdout.trim()
}
const literal = value => `'${String(value).replaceAll("'", "''")}'`
const json = value => `${literal(JSON.stringify(value))}::jsonb`
const read = source => JSON.parse(execute(source))
const id = () => crypto.randomUUID()
const log = []
const pass = name => { log.push(name); console.log(`PASS ${name}`) }
function reject(source, expected) {
  execute(`DO $$ BEGIN BEGIN ${source}; RAISE EXCEPTION 'UNEXPECTED_TEST_SUCCESS'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE ${literal(`%${expected}%`)} THEN RAISE; END IF; END; END $$;`)
}
function parallel(source) {
  return new Promise((resolve, rejectPromise) => {
    const child = spawn(executable, args(database, []), { env: environment, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = '', stderr = ''
    const timer = setTimeout(() => { child.kill(); rejectPromise(new Error('Concurrent test timed out')) }, 30000)
    child.stdout.on('data', chunk => { stdout += chunk }); child.stderr.on('data', chunk => { stderr += chunk })
    child.on('error', error => { clearTimeout(timer); rejectPromise(error) })
    child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(JSON.parse(stdout.trim())) : rejectPromise(new Error(stderr)) })
    child.stdin.end(source)
  })
}
const directory = execute('SHOW data_directory;', 'postgres')
assert.equal(path.resolve(directory).toLowerCase(), path.resolve(root, '.tmp/competition-postgres-tests').toLowerCase(), 'Refusing to write outside the workspace test cluster')
assert.match(database, /^votrix_child_\d+$/)
const preflight = JSON.parse(readFileSync(path.join(output, 'template-preflight.json'), 'utf8'))
assert.equal(preflight.target.database, template)
assert.equal(preflight.blockers, 0)
assert.equal(preflight.comparison.unchanged, true)
assert.ok(Date.now() - Date.parse(preflight.checkedAt) < 60 * 60 * 1000, 'Refresh template catalog inventory before running integration checks')
assert.equal(Number(execute(`SELECT count(*) FROM pg_database WHERE datname=${literal(database)}`, 'postgres')), 0)
execute(`CREATE DATABASE ${database} TEMPLATE ${template};`, 'postgres')
mkdirSync(output, { recursive: true })
writeFileSync(path.join(output, 'local-target.json'), JSON.stringify({ database, template, host: '127.0.0.1', port: 55439, dataDirectory: directory, disposable: true, createdAt: new Date().toISOString() }, null, 2))

// Re-inventory the actual clone before applying anything, including definitions,
// privileges and guards. Never substitute this catalog for deployed metadata.
const catalog = readFileSync(path.join(root, 'backend/src/database/scripts/competition-preflight-catalog.sql'), 'utf8')
const cloneCatalog = JSON.parse(execute(`BEGIN TRANSACTION READ ONLY; ${catalog} ROLLBACK;`))
writeFileSync(path.join(output, 'clone-catalog-before.json'), JSON.stringify(cloneCatalog, null, 2))
assert.deepEqual(cloneCatalog, { tables: preflight.schema.tables, functions: preflight.schema.functions, metadata: preflight.metadata })
pass('isolated fresh clone verified against current Phase 1 catalog, constraints, triggers, permissions and definitions')

const oldTables = Object.keys(preflight.inventory)
const oldEvents = read('SELECT coalesce(jsonb_agg(id),\'[]\') FROM events')
const oldRounds = read('SELECT coalesce(jsonb_agg(id),\'[]\') FROM competition_rounds')
const oldEntries = read('SELECT coalesce(jsonb_agg(id),\'[]\') FROM competition_contestants')
const oldScores = read('SELECT coalesce(jsonb_agg(id),\'[]\') FROM competition_session_judge_scores')
const membership = values => `ARRAY[${values.map(v => `${literal(v)}::uuid`).join(',')}]::uuid[]`
function historicalFingerprint() {
  const terms = oldTables.map(table => {
    assert.match(table, /^[a-z_]+$/)
    const columns = cloneCatalog.tables[table].columns
    let condition = columns.includes('event_id') ? `event_id=ANY(${membership(oldEvents)})`
      : table === 'events' ? `id=ANY(${membership(oldEvents)})`
      : columns.includes('round_id') ? `round_id=ANY(${membership(oldRounds)})`
      : columns.includes('contestant_id') ? `contestant_id=ANY(${membership(oldEntries)})`
      : columns.includes('score_row_id') ? `score_row_id=ANY(${membership(oldScores)})` : 'true'
    // Assignments have participant_id but no event_id; their old participants
    // are restricted to original events rather than including synthetic tests.
    if (table === 'competition_judge_assignments') condition = `participant_id IN(SELECT id FROM event_participants WHERE event_id=ANY(${membership(oldEvents)}))`
    return `SELECT ${literal(table)} AS table_name,count(*) AS count,md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),'')) AS digest FROM public.${table} t WHERE ${condition}`
  })
  return read(`SELECT jsonb_agg(to_jsonb(x) ORDER BY table_name) FROM (${terms.join(' UNION ALL ')}) x`)
}
const historyBefore = historicalFingerprint()
const migration = readFileSync(path.join(root, 'backend/src/database/migrations/103_competition_child_identity.sql'), 'utf8')
execute(migration)
assert.deepEqual(historicalFingerprint(), historyBefore)
pass('migration 103 changes no historical scores, locks, submissions, rules, deductions or finalized/published payloads')

execute(`SELECT competition_map_legacy_event(e.id,o.organizer_id) FROM events e JOIN organizations o ON o.id=e.organization_id WHERE e.event_type::text IN('pageant','competition_scoring');`)
assert.equal(Number(execute('SELECT count(*) FROM competition_legacy_contexts')), oldEvents.length)
assert.equal(Number(execute('SELECT count(*) FROM competition_entries')), oldEntries.length)
assert.deepEqual(historicalFingerprint(), historyBefore)
pass('explicit legacy mapping reuses every master entry without changing event/contestant/judge or history records')
const mappingBefore = read("SELECT jsonb_build_object('children',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM competitions t),'mapping',(SELECT jsonb_agg(to_jsonb(t) ORDER BY event_id) FROM competition_legacy_contexts t),'entries',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM competition_entries t))")
execute(migration)
execute(`SELECT competition_map_legacy_event(e.id,o.organizer_id) FROM events e JOIN organizations o ON o.id=e.organization_id WHERE e.event_type::text IN('pageant','competition_scoring');`)
assert.deepEqual(read("SELECT jsonb_build_object('children',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM competitions t),'mapping',(SELECT jsonb_agg(to_jsonb(t) ORDER BY event_id) FROM competition_legacy_contexts t),'entries',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM competition_entries t))"), mappingBefore)
pass('migration rerun and mapping rerun retain stable child and participation IDs')

const owner = id(), outsider = id(), organization = id()
execute(`INSERT INTO users(id,role) VALUES('${owner}','organizer'),('${outsider}','organizer'); INSERT INTO organizations(id,organizer_id) VALUES('${organization}','${owner}');`)
function event(type = 'competition_scoring') {
  const e = id(); execute(`INSERT INTO events(id,organization_id,title,event_type) VALUES('${e}','${organization}','Disposable phase2 fixture','${type}');`); return e
}
function master(e, number = 1, division = null) {
  const m = id(); execute(`INSERT INTO competition_contestants(id,event_id,name,contestant_number,division_id) VALUES('${m}','${e}','Synthetic entry',${number},${division ? literal(division) : 'NULL'});`); return m
}
const childSQL = (e, c, name, actor = owner) => `SELECT competition_create_child('${e}','${actor}','${c}',${literal(name)},'Dance')`
const entrySQL = (e, c, m, number = null) => `SELECT competition_add_entry('${e}','${owner}','${c}','${m}',${number ?? 'NULL'})`
const e = event(), competitions = ['Contemporary Dance', 'Hip-Hop', 'Street Dance', 'Folk Dance', 'Indigenous Dance'].map(name => ({ id: id(), name }))
const reviewedRevision = Number(execute(`SELECT competition_setup_revision FROM events WHERE id='${e}'`))
const first = read(childSQL(e, competitions[0].id, competitions[0].name))
assert.equal(first.id, competitions[0].id)
assert.deepEqual(read(childSQL(e, first.id, first.name)), first)
pass('one event/one native competition creation is stable under request retry')
assert.equal(Number(execute(`SELECT competition_setup_revision FROM events WHERE id='${e}'`)), reviewedRevision + 1)
reject(`SELECT competition_publish_rules('${e}','${owner}','${id()}',${json({ setupRevision: reviewedRevision })})`, 'FULL_SETUP_CHANGED_REFRESH')
pass('new draft identity invalidates a concurrently reviewed legacy publication through existing revision checks')
for (const c of competitions.slice(1)) read(childSQL(e, c.id, c.name))
assert.equal(Number(execute(`SELECT count(*) FROM competitions WHERE event_id='${e}'`)), 5)
assert.equal(Number(execute(`SELECT count(*) FROM competition_entries WHERE event_id='${e}'`)), 0)
pass('five independent identities exist without implicit enrollment')
const shared = master(e)
const a = read(entrySQL(e, first.id, shared, 1)), b = read(entrySQL(e, competitions[1].id, shared, 5))
assert.notEqual(a.id, b.id); assert.equal(a.contestant_id, b.contestant_id)
assert.equal(a.entry_number, 1); assert.equal(b.entry_number, 5)
assert.equal(Number(execute(`SELECT count(*) FROM competition_contestants WHERE id='${shared}'`)), 1)
pass('same master entry has distinct participation identity and numbering in two competitions')
assert.deepEqual(read(entrySQL(e, first.id, shared)), a)
reject(entrySQL(e, first.id, shared, 9), 'PARTICIPATION_REQUEST_CONFLICT')
reject(`INSERT INTO competition_entries(event_id,competition_id,contestant_id,entry_number) VALUES('${e}','${first.id}','${shared}',2)`, 'competition_entries_one_membership')
const another = master(e, 2)
reject(entrySQL(e, first.id, another, 1), 'competition_entries_number')
pass('idempotent membership retry and duplicate membership/number constraints verified')
const foreignEvent = event(), foreign = master(foreignEvent)
reject(entrySQL(e, first.id, foreign), 'CROSS_EVENT_PARTICIPATION_FORBIDDEN')
reject(`INSERT INTO competition_entries(event_id,competition_id,contestant_id,entry_number) VALUES('${e}','${first.id}','${foreign}',6)`, 'CROSS_EVENT_PARTICIPATION_FORBIDDEN')
reject(`INSERT INTO competition_entries(event_id,competition_id,contestant_id,entry_number) VALUES('${foreignEvent}','${first.id}','${foreign}',6)`, 'competition_entries_context')
reject(`UPDATE competition_entries SET contestant_id='${another}' WHERE id='${a.id}'`, 'CHILD_IDENTITY_IMMUTABLE')
reject(`INSERT INTO competition_entries(event_id,competition_id,contestant_id,entry_number) VALUES('${e}','${first.id}','${id()}',6)`, 'CROSS_EVENT_PARTICIPATION_FORBIDDEN')
pass('foreign keys, immutable association identity and cross-event checks reject direct and RPC writes')
reject(childSQL(e, id(), ' hip-hop '), 'competitions_event_name')
reject(childSQL(e, id(), 'No authority', outsider), 'ORGANIZER_FORBIDDEN')
reject(childSQL(e, first.id, 'Changed retry'), 'CHILD_REQUEST_CONFLICT')
pass('child names, authenticated ownership and retry payload conflicts are enforced')
const racing = master(e, 3)
const same = await Promise.all([parallel(entrySQL(e, competitions[2].id, racing)), parallel(entrySQL(e, competitions[2].id, racing))])
assert.equal(same[0].id, same[1].id)
const next = master(e, 4), next2 = master(e, 5)
const simultaneous = await Promise.all([parallel(entrySQL(e, competitions[2].id, next)), parallel(entrySQL(e, competitions[2].id, next2))])
assert.notEqual(simultaneous[0].entry_number, simultaneous[1].entry_number)
assert.equal(Number(execute(`SELECT count(*) FROM competition_entries WHERE competition_id='${competitions[2].id}'`)), 3)
pass('actual concurrent PostgreSQL requests create one same-entry membership and distinct automatic numbers')
const legacyEvent = event(), d1 = id(), d2 = id()
execute(`UPDATE events SET divisions_enabled=true WHERE id='${legacyEvent}'`)
execute(`INSERT INTO competition_divisions(id,event_id) VALUES('${d1}','${legacyEvent}'),('${d2}','${legacyEvent}')`)
const m1 = master(legacyEvent, 1, d1), m2 = master(legacyEvent, 1, d2)
const legacy = read(`SELECT competition_map_legacy_event('${legacyEvent}','${owner}')`)
assert.equal(Number(execute(`SELECT count(*) FROM competition_entries WHERE competition_id='${legacy.id}' AND legacy_contestant_number=1`)), 2)
assert.equal(Number(execute(`SELECT count(DISTINCT entry_number) FROM competition_entries WHERE competition_id='${legacy.id}'`)), 2)
assert.equal(Number(execute(`SELECT count(*) FROM competition_contestants WHERE id IN('${m1}','${m2}') AND contestant_number=1`)), 2)
pass('legacy per-division duplicate display numbers preserved while participation numbers are independent')
reject(`SELECT competition_map_legacy_event('${e}','${owner}')`, 'LEGACY_MAPPING_REQUIRES_EMPTY_CONTEXT_SET')
reject(`INSERT INTO competition_legacy_contexts(event_id,competition_id,mapped_by) VALUES('${e}','${first.id}','${owner}')`, 'EXPLICIT_LEGACY_CONTEXT_REQUIRED')
pass('legacy mapping is explicit and never assigns an existing native child arbitrarily')
const removable = master(legacyEvent, 2, d1)
read(entrySQL(legacyEvent, legacy.id, removable))
execute(`DELETE FROM competition_contestants WHERE id='${removable}'`)
assert.equal(Number(execute(`SELECT count(*) FROM competition_entries WHERE contestant_id='${removable}'`)), 0)
assert.equal(Number(execute(`SELECT count(*) FROM competition_entries WHERE competition_id='${legacy.id}'`)), 2)
pass('existing authorized draft master removal cascades only its participation and leaves other members intact')
for (const type of ['election', 'polling']) {
  const other = event(type)
  reject(childSQL(other, id(), 'Forbidden'), 'COMPETITION_EVENT_REQUIRED')
  reject(`SELECT competition_map_legacy_event('${other}','${owner}')`, 'COMPETITION_EVENT_REQUIRED')
  reject(`INSERT INTO competitions(event_id,name) VALUES('${other}','Direct forbidden')`, 'COMPETITION_EVENT_REQUIRED')
}
pass('election and polling cannot receive child competitions or legacy mappings')
execute(`UPDATE events SET status='scheduled' WHERE id='${e}'`)
reject(childSQL(e, id(), 'After publish'), 'CHILD_SETUP_FROZEN')
reject(entrySQL(e, first.id, another), 'CHILD_SETUP_FROZEN')
pass('child setup mutations freeze with the existing parent lifecycle')
for (const table of ['competitions', 'competition_entries', 'competition_legacy_contexts']) for (const role of ['anon', 'authenticated']) reject(`SET LOCAL ROLE ${role}; SELECT 1 FROM ${table}`, 'permission denied')
reject(`SET LOCAL ROLE anon; SELECT competition_create_child('${legacyEvent}','${owner}','${id()}','Forbidden',NULL)`, 'permission denied')
pass('new tables and mutating RPCs deny direct anonymous/authenticated database access')
const reverted = id()
execute(`BEGIN; SELECT competition_create_child('${legacyEvent}','${owner}','${reverted}','Transaction rollback',NULL); ROLLBACK;`)
assert.equal(Number(execute(`SELECT count(*) FROM competitions WHERE id='${reverted}'`)), 0)
assert.deepEqual(historicalFingerprint(), historyBefore)
pass('transaction rollback and end-to-end old-data fingerprints preserve finalized results, rules, scores, locks and separate submissions')

const metadata = JSON.parse(execute(`BEGIN TRANSACTION READ ONLY; ${catalog} ROLLBACK;`))
writeFileSync(path.join(output, 'clone-catalog-after.json'), JSON.stringify(metadata, null, 2))
writeFileSync(path.join(output, 'postgres-integration.json'), JSON.stringify({ database, isolated: true, migration: '103_competition_child_identity.sql', migrationRerunPassed: true, explicitLegacyMappingExecutedLocally: true, historicalBefore: historyBefore, historicalAfter: historicalFingerprint(), historicalUnchanged: true, scenariosPassed: log.length, scenarios: log, supabaseMutations: 0 }, null, 2))
console.log(`Completed ${log.length} PostgreSQL scenarios in disposable ${database}. Supabase was not contacted.`)
