// Audit raw historical SQL only in a new database in the verified local cluster.
// No dotenv, application client, hosted credentials, or historical-file edits.
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import path from 'node:path'
import assert from 'node:assert/strict'
const root = path.resolve(import.meta.dirname, '../..')
const local = JSON.parse(readFileSync(path.join(root, '.tmp/votrix-native-dev/identity.json')))
assert.equal(local.port, 55440)
const database = 'votrix_migration_audit_' + Date.now()
assert.match(database, /^votrix_migration_audit_\d+$/)
const out = path.join(root, 'audits/migrations-001-114-2026-10-15')
mkdirSync(out, { recursive: true })
const run = (source, db = database) => spawnSync('C:/Program Files/PostgreSQL/18/bin/psql.exe', ['-X', '-w', '-q', '-At', '-h', '127.0.0.1', '-p', '55440', '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1'], { input: source, encoding: 'utf8', windowsHide: true, timeout: 60000, maxBuffer: 32 * 1024 * 1024, env: { PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT, PGCONNECT_TIMEOUT: '5' } })
const sql = (source, db) => { const r = run(source, db); assert.equal(r.status, 0, r.stderr || String(r.error)); return r.stdout.trim() }
const proof = JSON.parse(sql('SELECT votrix_local_identity()', local.database))
assert.equal(proof.nonce, local.nonce)
assert.equal(Number(proof.port), 55440)
assert.equal(path.resolve(proof.dataDirectory).toLowerCase(), path.resolve(root, '.tmp/votrix-native-dev/pgdata').toLowerCase())
sql('CREATE DATABASE ' + database, 'postgres')
const directory = path.join(root, 'backend/src/database/migrations')
const files = readdirSync(directory).filter(f => /^\d+_.*\.sql$/.test(f) && Number(f.slice(0, 3)) <= 114).sort()
const inventory = files.map(file => {
 const source = readFileSync(path.join(directory, file), 'utf8')
 return { file, number: Number(file.slice(0, 3)), direction: /(?:^|_)down(?:_|\.)/i.test(file) ? 'rollback' : 'forward', bytes: Buffer.byteLength(source), sha256: createHash('sha256').update(source).digest('hex'), tables: [...source.matchAll(/CREATE TABLE(?: IF NOT EXISTS)?\s+(?:public\.)?(\w+)/gi)].map(m => m[1]), functions: [...source.matchAll(/CREATE(?: OR REPLACE)? FUNCTION\s+(?:public\.)?(\w+)/gi)].map(m => m[1]), hasExplicitTransaction: /\bBEGIN\s*;/i.test(source) && /\bCOMMIT\s*;/i.test(source), destructiveStatements: source.split(/\r?\n/).flatMap((line, i) => /^\s*(DROP TABLE|TRUNCATE|DELETE FROM|ALTER TABLE.*DROP COLUMN)/i.test(line) ? [{ line: i + 1, sql: line.trim() }] : []) }
})
const attempts = [], fixes = [], completed = new Set(), processProbes = []
for (const item of inventory.filter(x => x.direction === 'forward')) {
 if (completed.has(item.file)) continue
 const original = readFileSync(path.join(directory, item.file), 'utf8')
 if (item.file === '028_single_organization_per_organizer.sql') {
  sql(`INSERT INTO users(id,email,password,role,account_status) VALUES('00000000-0000-4000-8000-000000000001','organizer@migration-audit.test','disabled-audit-account','organizer','active');
   INSERT INTO organizations(id,organizer_id,organization_name,organization_type,created_at) VALUES
   ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001','Earliest org','election','2020-01-01'),
   ('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000001','Second org','polling','2020-01-02');
   INSERT INTO events(organization_id,title,event_type) VALUES('00000000-0000-4000-8000-000000000012','Synthetic event under duplicate org','polling');`)
 }
 const r = run(original)
 attempts.push({ file: item.file, rawPassed: r.status === 0, error: r.status ? r.stderr.trim() : undefined })
 if (r.status !== 0) {
  console.log('RAW FAILED ' + item.file + ': ' + r.stderr.trim().split('\n').slice(-3).join(' '))
  let repaired = original
  if (item.file === '011_rename_pageant_to_competition_scoring.sql') repaired = original.replace(/ALTER TRIGGER IF EXISTS (\w+) ON (\w+)\s+RENAME TO (\w+);/g, (_m, old, table, next) => `ALTER TRIGGER ${old} ON ${table} RENAME TO ${next};`)
  else if (item.file === '030_event_information_form_schema.sql') repaired = original.replace(/^\s*<\/[^\r\n]*tool_calls>\s*$/m, '')
  else if (item.file === '038_competition_divisions.sql') {
   const dependency = '038_fix_competition_tables_event_id.sql'
   sql(readFileSync(path.join(directory, dependency), 'utf8')); completed.add(dependency)
   fixes.push({ file: dependency, repair: 'Applied dependency before retrying division migration' })
  } else if (item.file === '039_per_division_contestant_number.sql') repaired = original.replace('DROP INDEX IF EXISTS public.competition_contestants_number_unique;', 'ALTER TABLE competition_contestants DROP CONSTRAINT IF EXISTS competition_contestants_number_unique;\nDROP INDEX IF EXISTS public.competition_contestants_number_unique;')
  else { writeFileSync(path.join(out, 'replay.json'), JSON.stringify({ database, inventory, attempts, fixes, stoppedAt: item.file, productionTouched: false }, null, 2)); throw new Error('Unexpected raw migration failure: ' + item.file) }
  sql(repaired)
  fixes.push({ file: item.file, repair: 'Scratch database only; original migration source unchanged', executedSha256: createHash('sha256').update(repaired).digest('hex') })
 }
 completed.add(item.file)
 if (item.file === '028_single_organization_per_organizer.sql') {
  assert.equal(sql("SELECT count(*) FROM events WHERE title='Synthetic event under duplicate org'"), '0')
  processProbes.push({ id: '028-cascade-data-loss', reproduced: true, observed: 'Migration deleted the duplicate organization and its synthetic event through ON DELETE CASCADE' })
 }
}
const catalog = JSON.parse(sql(`SELECT jsonb_build_object(
 'tables',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'rls',c.relrowsecurity,'anonSelect',has_table_privilege('anon',c.oid,'SELECT'),'authenticatedSelect',has_table_privilege('authenticated',c.oid,'SELECT')) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'),
 'views',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'options',c.reloptions,'definition',pg_get_viewdef(c.oid),'anonSelect',has_table_privilege('anon',c.oid,'SELECT')) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='v'),
 'functions',(SELECT jsonb_agg(jsonb_build_object('name',p.proname,'identity',pg_get_function_identity_arguments(p.oid),'securityDefiner',p.prosecdef,'config',p.proconfig,'anonExecute',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticatedExecute',has_function_privilege('authenticated',p.oid,'EXECUTE')) ORDER BY p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'),
 'unvalidatedConstraints',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',conname,'table',conrelid::regclass::text)),'[]') FROM pg_constraint WHERE connamespace='public'::regnamespace AND NOT convalidated)
 )`))
const fixtureResults = []
sql(`INSERT INTO users(id,email,password,role,account_status) VALUES
 ('00000000-0000-4000-8000-000000000001','organizer@migration-audit.test','disabled-audit-account','organizer','active'),
 ('00000000-0000-4000-8000-000000000002','judge@migration-audit.test','disabled-audit-account','participant','active') ON CONFLICT(id) DO NOTHING;
 INSERT INTO organizations(organizer_id,organization_name,organization_type) VALUES('00000000-0000-4000-8000-000000000001','Migration audit synthetic organization','competition_scoring') ON CONFLICT(organizer_id) DO NOTHING;`)
for (const fixture of ['competition-creation-flow-assertions.sql', 'competition-pageant-creation-assertions.sql']) { sql(readFileSync(path.join(root, 'backend/__tests__/fixtures', fixture), 'utf8')); fixtureResults.push({ fixture, passed: true, rollbackOnly: true }) }
const creationFixture = readFileSync(path.join(root, 'backend/__tests__/fixtures/competition-creation-flow-assertions.sql'), 'utf8')
const probe = (id, source, observed) => {
 writeFileSync(path.join(out, id + '.sql'), source)
 sql(source)
 processProbes.push({ id, reproduced: true, rollbackOnly: true, observed })
}
probe('live-before-review', creationFixture.split(' -- Avoid variable/column ambiguity')[0] + `
 SELECT to_jsonb(c) INTO c1 FROM competitions c WHERE c.id=child1;
 result:=competition_freeze_native_rules(event_id,child1,actor,(c1->>'setup_revision')::bigint,(c1->>'input_revision')::bigint);
 result:=competition_child_live_control(event_id,child1,actor,NULL,'start',jsonb_build_object('requestId',gen_random_uuid(),'rulesVersion',result->>'id','setupRevision',c1->>'setup_revision','inputRevision',c1->>'input_revision'));
 IF result->>'status'<>'active' OR (SELECT e.competition_created_at IS NOT NULL FROM events e WHERE e.id=event_id) OR (SELECT c.official_child_rules_id IS NOT NULL FROM competitions c WHERE c.id=child2) THEN RAISE EXCEPTION 'PROBE_NOT_REPRODUCED'; END IF;
 END $$; ROLLBACK;`, 'An individually frozen child starts live while parent creation is incomplete and another child remains unconfigured')
probe('stale-parent-review', creationFixture.replace(' result:=competition_complete_creation(event_id,actor,reviewed);', `
 UPDATE events SET title='Changed after review was loaded' WHERE id=event_id;
 result:=competition_complete_creation(event_id,actor,reviewed);
 IF NOT EXISTS(SELECT 1 FROM events e WHERE e.id=event_id AND e.title='Changed after review was loaded' AND e.competition_created_at IS NOT NULL) THEN RAISE EXCEPTION 'PROBE_NOT_REPRODUCED'; END IF;`), 'Completion accepts unchanged child revision tokens even when the parent title changes after review')
probe('frozen-account-recovery', creationFixture.replace(" RAISE NOTICE 'PASS atomic review", `
 UPDATE users SET account_status='suspended' WHERE id=judge;
 UPDATE users SET account_status='active' WHERE id=judge;
 BEGIN PERFORM competition_child_scoring_context(event_id,child1,actor,NULL,true); RAISE EXCEPTION 'PROBE_NOT_REPRODUCED';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'CURRENT_FROZEN_RULES_REQUIRED' THEN RAISE; END IF; END;
 SELECT to_jsonb(c) INTO c1 FROM competitions c WHERE c.id=child1;
 BEGIN PERFORM competition_freeze_native_rules(event_id,child1,actor,(c1->>'setup_revision')::bigint,(c1->>'input_revision')::bigint); RAISE EXCEPTION 'PROBE_NOT_REPRODUCED';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'CHILD_RULES_FROZEN' THEN RAISE; END IF; END;
 RAISE NOTICE 'PASS atomic review`), 'Deactivating and reactivating an assigned judge leaves frozen rules stale; normal freeze RPC cannot recover them')
probe('polling-database-boundaries', readFileSync(path.join(root, 'backend/__tests__/fixtures/migration-audit-polling-boundaries.sql'), 'utf8'), 'Polling RPC accepts foreign-event questions, caller-supplied multiple policy, and draft events; explicit participant ID can reference another event')
probe('legacy-view-grant-boundary', creationFixture.split(' -- Avoid variable/column ambiguity')[0] + `
 INSERT INTO competition_criteria(event_id,name,percentage,min_score,max_score) VALUES(event_id,'Audit legacy rubric',100,0,100) RETURNING id INTO criterion;
 INSERT INTO competition_scores(judge_id,contestant_id,criteria_id,score) VALUES(judge,master,criterion,70);
 END $$;
 GRANT USAGE ON SCHEMA public TO anon;
 GRANT SELECT ON judge_scores TO anon;
 SET LOCAL ROLE anon;
 DO $$ BEGIN IF (SELECT count(*) FROM judge_scores)<>1 THEN RAISE EXCEPTION 'VIEW_GRANT_PROBE_NOT_REPRODUCED'; END IF; END $$;
 RESET ROLE;
 ROLLBACK;`, 'With an existing anon grant on the legacy judge_scores view, private competition scores remain readable despite migration 101 protecting the base table; grant simulation rolls back')
writeFileSync(path.join(out, 'replay.json'), JSON.stringify({ capturedAt: new Date().toISOString(), database, postgresVersion: sql('SHOW server_version'), scope: 'Empty verified isolated localhost database, raw filename order first; scratch-only repairs allow remaining files to execute', inventory, attempts, fixes, completed: [...completed], catalog, fixtureResults, processProbes, productionTouched: false, originalMigrationsChanged: false }, null, 2))
console.log(JSON.stringify({ database, totalFiles: inventory.length, forward: completed.size, rollback: inventory.filter(x => x.direction === 'rollback').length, rawFailures: attempts.filter(x => !x.rawPassed).map(x => x.file), fixturesPassed: fixtureResults.length, productionTouched: false }))
