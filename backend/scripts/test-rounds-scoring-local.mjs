// Verification uses only the existing isolated synthetic localhost database.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
import assert from 'node:assert/strict'
import path from 'node:path'
const root=path.resolve(import.meta.dirname,'../..'),dir=path.join(root,'.tmp/votrix-native-dev')
const identity=JSON.parse(readFileSync(path.join(dir,'identity.json')))
assert.match(identity.database,/^votrix_dev_\d+$/)
const sql=source=>{
  const result=spawnSync('C:/Program Files/PostgreSQL/18/bin/psql.exe',['-X','-w','-q','-At','-h','127.0.0.1','-p','55440','-U','postgres','-d',identity.database,'-v','ON_ERROR_STOP=1'],{input:source,encoding:'utf8',windowsHide:true,timeout:60000})
  assert.equal(result.status,0,result.stderr);return result.stdout.trim()
}
const proof=JSON.parse(sql('SELECT votrix_local_identity()'))
assert.equal(proof.nonce,identity.nonce);assert.equal(Number(proof.port),55440)
assert.equal(path.resolve(proof.dataDirectory).toLowerCase(),path.join(dir,'pgdata').toLowerCase())
const digest=`SELECT jsonb_object_agg(name,digest) FROM (
 SELECT 'events' name,md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY id),'')) digest FROM events t
 UNION ALL SELECT 'configurations',md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY competition_id),'')) FROM competition_child_configurations t
 UNION ALL SELECT 'rules',md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY id),'')) FROM competition_child_rule_versions t
 UNION ALL SELECT 'drafts',md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY session_id,judge_id,entry_id,criterion_id),'')) FROM competition_child_score_drafts t
 UNION ALL SELECT 'submissions',md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY id),'')) FROM competition_child_submissions t
 UNION ALL SELECT 'calculations',md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY id),'')) FROM competition_child_calculations t
 UNION ALL SELECT 'publications',md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY id),'')) FROM competition_child_publications t) checks`
const before=sql(digest),migration=readFileSync(path.join(root,'backend/src/database/migrations/116_competition_scoring_input_settings.sql'),'utf8')
sql(migration);sql(migration);assert.equal(sql(digest),before)
const fixture=readFileSync(path.join(root,'backend/__tests__/fixtures/competition-creation-flow-assertions.sql'),'utf8')
let revised=fixture.replaceAll('competition_complete_creation(event_id,actor,reviewed)',"competition_complete_creation(event_id,actor,reviewed,competition_parent_review_token((SELECT e FROM events e WHERE e.id=event_id)))")
revised=revised.replace('reviewed jsonb; result jsonb;', 'reviewed jsonb; result jsonb; entry_id uuid; sheet jsonb; envelope jsonb; draft_row competition_child_score_drafts; pre uuid:=gen_random_uuid(); final uuid:=gen_random_uuid(); multi jsonb;')
revised=revised.replace(' SELECT to_jsonb(c) INTO c1 FROM competitions c WHERE id=child1;',`
 cfg:=jsonb_set(cfg,'{scoringConfig}',cfg->'scoringConfig'||jsonb_build_object('singleRoundName','Final Performance','inputDecimalPlaces',1,'defaultMinScore',1,'defaultMaxScore',10));
 cfg:=jsonb_set(cfg,'{criteria,0,minorCriteria,1,decimalPlaces}','2');
 BEGIN PERFORM competition_validate_native_configuration(event_id,child1,jsonb_set(cfg,'{criteria,0,minorCriteria,1,name}','"Technique"'),false);RAISE EXCEPTION 'DUPLICATE_ACCEPTED';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'DUPLICATE_MINOR_NAME' THEN RAISE;END IF;END;
 multi:=jsonb_set(cfg,'{structure}','"multiple"');
 multi:=jsonb_set(multi,'{rounds}',jsonb_build_array(jsonb_build_object('id',pre,'name','Preliminary','displayOrder',0,'progression','weighted','weight',20,'nextRoundId',final,'advancementType','top_n','advancementValue',1),jsonb_build_object('id',final,'name','Final','displayOrder',1,'progression','weighted','weight',80)));
 multi:=jsonb_set(multi,'{criteria}',jsonb_build_array(jsonb_set(cfg->'criteria'->0,'{roundId}',to_jsonb(pre)),jsonb_set(jsonb_set(jsonb_set(cfg->'criteria'->0,'{roundId}',to_jsonb(final)),'{id}',to_jsonb(gen_random_uuid())),'{minorCriteria}','[]')));
 PERFORM competition_validate_native_configuration(event_id,child1,multi,true);
 multi:=jsonb_set(multi,'{rounds,1,weight}','70');
 BEGIN PERFORM competition_validate_native_configuration(event_id,child1,multi,true);RAISE EXCEPTION 'INVALID_WEIGHT_ACCEPTED';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'ROUND_CONTRIBUTIONS_MUST_TOTAL_100' THEN RAISE;END IF;END;
 multi:=jsonb_set(jsonb_set(multi,'{rounds,0,progression}','"back_to_zero"'),'{rounds,1,progression}','"back_to_zero"');
 PERFORM competition_validate_native_configuration(event_id,child1,multi,true);
 SELECT to_jsonb(c) INTO c1 FROM competitions c WHERE id=child1;`)
revised=revised.replace(" RAISE NOTICE 'PASS atomic review",`
 IF competition_child_scoring_choices(event_id,judge,false)->0->>'roundName' IS DISTINCT FROM 'Final Performance' THEN RAISE EXCEPTION 'SINGLE_ROUND_NAME_NOT_LOADED'; END IF;
 SELECT id INTO entry_id FROM competition_entries WHERE competition_id=child1;
 sheet:=competition_child_scoring_context(event_id,child1,actor,NULL,true);
 PERFORM competition_child_live_control(event_id,child1,actor,NULL,'start',sheet||jsonb_build_object('requestId',gen_random_uuid()));
 sheet:=competition_child_live_view(event_id,child1,actor,NULL,true);
 PERFORM competition_child_live_control(event_id,child1,actor,NULL,'access',sheet->'context'||jsonb_build_object('requestId',gen_random_uuid(),'kind','entry','targetId',entry_id,'open',true));
 sheet:=competition_child_live_view(event_id,child1,actor,NULL,true);
 PERFORM competition_child_live_control(event_id,child1,actor,NULL,'access',sheet->'context'||jsonb_build_object('requestId',gen_random_uuid(),'kind','criterion','targetId',criterion,'open',true));
 sheet:=competition_child_live_view(event_id,child1,judge,NULL,false);
 IF sheet->'criteria'->0->>'decimalPlaces'<>'1' OR sheet->'criteria'->0->'minors'->1->>'decimalPlaces'<>'2' THEN RAISE EXCEPTION 'FROZEN_PRECISION_NOT_PROJECTED'; END IF;
 envelope:=sheet->'context'||jsonb_build_object('requestId',gen_random_uuid(),'entryId',entry_id,'criterionId',criterion,'rowRevision',0,'scores',jsonb_build_object(minor1::text,8.55,minor2::text,8.55));
 BEGIN PERFORM competition_child_score_write(event_id,child1,judge,NULL,'draft',envelope);RAISE EXCEPTION 'INVALID_PRECISION_ACCEPTED';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'SCORE_INPUT_PRECISION_EXCEEDED' THEN RAISE;END IF;END;
 envelope:=jsonb_set(envelope,'{scores}',jsonb_build_object(minor1::text,8.5,minor2::text,8.55));
 PERFORM competition_child_score_write(event_id,child1,judge,NULL,'draft',envelope);
 SELECT * INTO draft_row FROM competition_child_score_drafts WHERE session_id=(sheet->'context'->>'sessionId')::uuid AND judge_id=judge;
 IF draft_row.locked OR draft_row.scores->>minor2::text<>'8.55' THEN RAISE EXCEPTION 'DRAFT_NOT_PRESERVED'; END IF;
 envelope:=envelope||jsonb_build_object('requestId',gen_random_uuid(),'rowRevision',draft_row.revision);
 PERFORM competition_child_score_write(event_id,child1,judge,NULL,'lock',envelope);
 BEGIN PERFORM competition_child_score_write(event_id,child1,actor,NULL,'draft',envelope||jsonb_build_object('requestId',gen_random_uuid()));RAISE EXCEPTION 'UNAUTHORIZED_SCORE_ACCEPTED';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%FORBIDDEN%' THEN RAISE;END IF;END;
 BEGIN PERFORM competition_child_score_write(event_id,child1,judge,NULL,'draft',envelope||jsonb_build_object('requestId',gen_random_uuid()));RAISE EXCEPTION 'LOCKED_EDIT_ACCEPTED';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'LOCKED_OR_ROW_REVISION_CONFLICT' THEN RAISE;END IF;END;
 PERFORM competition_child_score_write(event_id,child1,judge,NULL,'submit',sheet->'context'||jsonb_build_object('requestId',gen_random_uuid()));
 sheet:=competition_child_live_view(event_id,child1,actor,NULL,true);
 IF sheet->'progress'->0->>'submitted'<>'true' THEN RAISE EXCEPTION 'SUBMISSION_NOT_VISIBLE'; END IF;
 BEGIN PERFORM competition_save_native_configuration(event_id,child1,actor,1,cfg);RAISE EXCEPTION 'SCORED_RULES_MUTATED';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%FROZEN%' THEN RAISE;END IF;END;
 PERFORM competition_child_live_control(event_id,child1,actor,NULL,'close',sheet->'context'||jsonb_build_object('requestId',gen_random_uuid()));
 sheet:=competition_child_live_view(event_id,child1,judge,NULL,false);
 IF sheet->'criteria'->0->>'open'<>'false' OR sheet->'contestants'->0->>'open'<>'false' THEN RAISE EXCEPTION 'CLOSED_INPUTS_OPEN'; END IF;
 RAISE NOTICE 'PASS atomic review`)
sql(revised);assert.equal(sql(digest),before)
const checks=['Migration rerun preserves existing events, configurations, frozen rules, drafts, submissions, calculations and publications','Single named scope persists without artificial round identity','Independent competitions and existing atomic review remain valid','Valid weighted rounds, invalid contribution totals, and independent qualification without required weights','Duplicate minor names rejected','Frozen default precision and per-minor overrides reach the judge sheet','Excess input precision rejected in the database transaction','Draft, lock and submit preserve server semantics','Unauthorized score writes and edits to frozen scored rules rejected','Closing scoring closes judge inputs','All synthetic test changes roll back']
const out=path.join(root,'audits/rounds-scoring-2026-10-16');mkdirSync(out,{recursive:true});writeFileSync(path.join(out,'database.json'),JSON.stringify({passed:true,checks,database:identity.database,productionTouched:false},null,2))
checks.forEach(check=>console.log('PASS '+check))
