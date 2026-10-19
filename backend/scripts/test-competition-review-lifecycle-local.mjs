// New isolated clone of the audit template. No hosted credentials or .env.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import path from 'node:path'
import assert from 'node:assert/strict'
const root=path.resolve(import.meta.dirname,'../..')
const identity=JSON.parse(readFileSync(path.join(root,'.tmp/votrix-native-dev/identity.json')))
const baseline=JSON.parse(readFileSync(path.join(root,'audits/migrations-001-114-2026-10-15/replay.json')))
assert.match(baseline.database,/^votrix_migration_audit_\d+$/)
assert.equal(identity.port,55440)
const database='votrix_review115_'+Date.now()
const run=(source,db=database)=>spawnSync('C:/Program Files/PostgreSQL/18/bin/psql.exe',['-X','-w','-q','-At','-h','127.0.0.1','-p','55440','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1'],{input:source,encoding:'utf8',windowsHide:true,timeout:60000,env:{PATH:process.env.PATH,SYSTEMROOT:process.env.SYSTEMROOT,PGCONNECT_TIMEOUT:'5'}})
const sql=(source,db)=>{const r=run(source,db);assert.equal(r.status,0,r.stderr);return r.stdout.trim()}
const proof=JSON.parse(sql('SELECT votrix_local_identity()',identity.database))
assert.equal(proof.nonce,identity.nonce);assert.equal(Number(proof.port),55440)
assert.equal(path.resolve(proof.dataDirectory).toLowerCase(),path.resolve(root,'.tmp/votrix-native-dev/pgdata').toLowerCase())
sql(`CREATE DATABASE ${database} TEMPLATE ${baseline.database}`,'postgres')
const file='115_competition_review_lifecycle.sql'
const migration=readFileSync(path.join(root,'backend/src/database/migrations',file),'utf8')
const checks=[]
const probe=(name,source)=>{sql(source);checks.push(name)}
const preservation=`SELECT jsonb_object_agg(t.name,t.digest) FROM (
 SELECT 'rules' name,md5(coalesce(string_agg(to_jsonb(r)::text,'' ORDER BY id),'')) digest FROM competition_child_rule_versions r
 UNION ALL SELECT 'submissions',md5(coalesce(string_agg(to_jsonb(r)::text,'' ORDER BY id),'')) FROM competition_child_submissions r
 UNION ALL SELECT 'calculations',md5(coalesce(string_agg(to_jsonb(r)::text,'' ORDER BY id),'')) FROM competition_child_calculations r
 UNION ALL SELECT 'publications',md5(coalesce(string_agg(to_jsonb(r)::text,'' ORDER BY id),'')) FROM competition_child_publications r
 UNION ALL SELECT 'events',md5(coalesce(string_agg(to_jsonb(r)::text,'' ORDER BY id),'')) FROM events r
 ) t`
const before=sql(preservation)
sql(migration);sql(migration);assert.equal(sql(preservation),before)
checks.push('migration repeat preserves all existing event/rule/submission/calculation/publication rows')
const fixture=readFileSync(path.join(root,'backend/__tests__/fixtures/competition-creation-flow-assertions.sql'),'utf8')
const token="competition_parent_review_token((SELECT e FROM events e WHERE e.id=event_id))"
const revised=fixture.replaceAll('competition_complete_creation(event_id,actor,reviewed)',`competition_complete_creation(event_id,actor,reviewed,${token})`)
probe('complete branches, incomplete rollback and idempotent retry with parent token',revised)
probe('pageant arithmetic configuration remains accepted',readFileSync(path.join(root,'backend/__tests__/fixtures/competition-pageant-creation-assertions.sql'),'utf8'))
const prefix=fixture.split(' -- Avoid variable/column ambiguity')[0]
probe('live before all-child completion rejected',prefix+`
 SELECT to_jsonb(c) INTO c1 FROM competitions c WHERE c.id=child1;
 result:=competition_freeze_native_rules(event_id,child1,actor,(c1->>'setup_revision')::bigint,(c1->>'input_revision')::bigint);
 BEGIN
  PERFORM competition_child_live_control(event_id,child1,actor,NULL,'start',jsonb_build_object('requestId',gen_random_uuid(),'rulesVersion',result->>'id','setupRevision',c1->>'setup_revision','inputRevision',c1->>'input_revision'));
  RAISE EXCEPTION 'REVIEW_BYPASS_ACCEPTED';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'EVENT_CREATION_REVIEW_REQUIRED' THEN RAISE; END IF; END;
 IF EXISTS(SELECT 1 FROM competition_child_sessions s WHERE s.competition_id=child1) THEN RAISE EXCEPTION 'SESSION_PERSISTED_BEFORE_REVIEW'; END IF;
 END $$; ROLLBACK;`)
// Complete fixture establishes both branches before trying concurrent parent changes.
probe('title and banner edits invalidate reviewed parent and roll back freezes',revised.replace(` result:=competition_complete_creation(event_id,actor,reviewed,${token});`, `
 c3:=competition_creation_parent_review(event_id,actor);
 IF c3->'event'->>'title'<>'Creation transaction test' THEN RAISE EXCEPTION 'REVIEW_SNAPSHOT_MISMATCH'; END IF;
 UPDATE events SET title='Changed after review' WHERE id=event_id;
 BEGIN PERFORM competition_complete_creation(event_id,actor,reviewed,c3->>'parentReviewToken'); RAISE EXCEPTION 'STALE_PARENT_ACCEPTED';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'PARENT_REVISION_CONFLICT' THEN RAISE; END IF; END;
 IF EXISTS(SELECT 1 FROM competitions c WHERE c.id IN(child1,child2) AND c.official_child_rules_id IS NOT NULL) THEN RAISE EXCEPTION 'PARTIAL_STALE_PARENT_FREEZE'; END IF;
 c3:=competition_creation_parent_review(event_id,actor);
 UPDATE events SET banner='https://example.test/changed-banner.png' WHERE id=event_id;
 BEGIN PERFORM competition_complete_creation(event_id,actor,reviewed,c3->>'parentReviewToken'); RAISE EXCEPTION 'STALE_BANNER_ACCEPTED';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'PARENT_REVISION_CONFLICT' THEN RAISE; END IF; END;
 result:=competition_complete_creation(event_id,actor,reviewed,${token});
 result:=competition_child_scoring_context(event_id,child1,actor,NULL,true);
 IF result->>'competitionId' IS DISTINCT FROM child1::text THEN RAISE EXCEPTION 'COMPLETED_CONTEXT_UNAVAILABLE'; END IF;
 result:=jsonb_build_object('created',true);`))
probe('old completion signature fails closed',revised.replace(` result:=competition_complete_creation(event_id,actor,reviewed,${token});`, `
 BEGIN PERFORM competition_complete_creation(event_id,actor,reviewed); RAISE EXCEPTION 'TOKENLESS_COMPLETION_ACCEPTED';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'PARENT_REVIEW_TOKEN_REQUIRED' THEN RAISE; END IF; END;
 result:=competition_complete_creation(event_id,actor,reviewed,${token});`))
assert.equal(sql(`SELECT has_function_privilege('service_role','competition_complete_creation(uuid,uuid,jsonb,text)','EXECUTE') AND NOT has_function_privilege('anon','competition_complete_creation(uuid,uuid,jsonb,text)','EXECUTE') AND NOT has_function_privilege('authenticated','competition_creation_parent_review(uuid,uuid)','EXECUTE') AND NOT has_function_privilege('service_role','competition_complete_creation_v110(uuid,uuid,jsonb)','EXECUTE') AND NOT has_function_privilege('service_role','competition_child_scoring_context_v105(uuid,uuid,uuid,uuid,boolean)','EXECUTE') AND NOT has_function_privilege('service_role','competition_complete_creation(uuid,uuid,jsonb)','EXECUTE')`),'t')
checks.push('private helpers and old signature blocked; new mutation restricted to backend')
const out=path.join(root,'audits/competition-review-correction-2026-10-15');mkdirSync(out,{recursive:true})
writeFileSync(path.join(out,'local-verification.json'),JSON.stringify({passed:true,database,file,sha256:createHash('sha256').update(migration).digest('hex'),checks,productionTouched:false,originalApplicationDatabaseTouched:false},null,2))
console.log(JSON.stringify({passed:true,database,checks:checks.length,productionTouched:false}))
