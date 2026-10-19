from pathlib import Path
p=Path('frontend/src/components/organizer/competition/NativeSetupWorkspace.jsx');s=p.read_text(encoding='utf-8')
s=s.replace("entryType:view?.competition.participation_format==='group'?'team':view?.competition.participation_format==='duo'?'pair':'individual'", "entryType:view?.competition.participation_format??'individual'")
s=s.replace("event?.status==='draft'&&!loading", "event?.status==='draft'&&!event?.competitionCreatedAt&&!loading")
s=s.replace("event?.status!=='draft'", "(event?.status!=='draft'||!!event?.competitionCreatedAt)")
s=s.replace(" const round=(index,fields)", " const removeRound=index=>{\n  if(!window.confirm('Remove this round, its criteria, and its round-specific judge assignments when saving? Other competitions are retained.'))return\n  const id=value.rounds[index].id,rounds=value.rounds.filter(r=>r.id!==id).map((r,i,all)=>{const next={...r,displayOrder:i};delete next.nextRoundId;if(i<all.length-1){next.nextRoundId=all[i+1].id;next.advancementType??='none'}else{delete next.advancementType;delete next.advancementValue}return next})\n  patch({rounds,criteria:value.criteria.filter(c=>c.roundId!==id)})\n }\n const round=(index,fields)")
s=s.replace('   <Button disabled={i===0}', '   <Button variant="secondary" onClick={()=>removeRound(i)}>Remove {r.name}</Button>\n   <Button disabled={i===0}')
s=s.replace('  <label>Calculation method', "  {value.structure==='multiple'&&value.rounds.length<2&&<p role=\"status\">Add at least two named rounds, or use a Single Scoring Phase.</p>}\n  <label>Calculation method")
s=s.replace('    {(c.minorCriteria??[]).map', '''    {!!c.minorCriteria?.length&&<label>Minor criterion weighting<select className={INPUT_CLASS} aria-label={`Criterion ${index+1} minor weighting`} value={c.minorCriteria.some(m=>m.percentage!==undefined)?'weighted':'equal'} onChange={e=>criterion(index,{minorCriteria:c.minorCriteria.map(m=>{const next={...m};if(e.target.value==='weighted')next.percentage=100/c.minorCriteria.length;else delete next.percentage;return next})})}><option value="equal">No weights — average normalized ratings</option><option value="weighted">Use weights — total 100%</option></select></label>}
    {(c.minorCriteria??[]).map''')
s=s.replace("{['minScore','maxScore'].map(key=>", "{m.percentage!==undefined&&<Field label={`Criterion ${index+1} minor ${k+1} percentage`} type=\"number\" min=\"0\" max=\"100\" step=\"any\" value={m.percentage} onChange={percentage=>criterion(index,{minorCriteria:c.minorCriteria.map((x,j)=>j===k?{...x,percentage}:x)})}/>} {['minScore','maxScore'].map(key=>")
s=s.replace("{id:crypto.randomUUID(),name:'Minor criterion',minScore:0,maxScore:100}", "{id:crypto.randomUUID(),name:'Minor criterion',minScore:c.minScore,maxScore:c.maxScore,...(c.minorCriteria?.some(m=>m.percentage!==undefined)?{percentage:1}:{})}")
s=s.replace('>Add equally averaged minor</Button>', '>Add minor criterion</Button>')
p.write_text(s,encoding='utf-8')
# Forward migration keeps the original SQL validator's identity and range checks,
# adding weighted minor support instead of stripping new fields before validation.
source=Path('backend/src/database/migrations/104_competition_scoped_rules.sql').read_text(encoding='utf-8')
a=source.index('CREATE OR REPLACE FUNCTION competition_validate_native_configuration(');b=source.index('\nCREATE OR REPLACE FUNCTION competition_save_native_configuration',a)
sql=source[a:b]
sql=sql.replace("k NOT IN('id','name','minScore','maxScore')", "k NOT IN('id','name','minScore','maxScore','percentage')")
sql=sql.replace(" OR minor ? 'percentage'", "")
sql=sql.replace("   END LOOP;\n END LOOP;\n SELECT array_agg", """   END LOOP;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(criterion->'minorCriteria','[]')) m WHERE m ? 'percentage') THEN
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(criterion->'minorCriteria') m WHERE jsonb_typeof(m->'percentage') IS DISTINCT FROM 'number' OR (m->>'percentage')::numeric NOT BETWEEN 0.000001 AND 100) OR
    abs((SELECT sum((m->>'percentage')::numeric) FROM jsonb_array_elements(criterion->'minorCriteria') m)-100)>0.001 THEN RAISE EXCEPTION 'MINOR_WEIGHTS_MUST_TOTAL_100'; END IF;
   END IF;
 END LOOP;
 SELECT array_agg""")
savea=source.index('CREATE OR REPLACE FUNCTION competition_save_native_configuration(');saveb=source.index('\nCREATE OR REPLACE FUNCTION',savea+30)
save=source[savea:saveb]
save=save.replace(' DELETE FROM competition_child_minors WHERE', " DELETE FROM competition_child_judge_assignments WHERE competition_id=c.id AND round_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_config->'rounds') rd WHERE rd->>'id'=competition_child_judge_assignments.round_id::text);\n DELETE FROM competition_child_minors WHERE",1)
Path('backend/src/database/migrations/111_competition_weighted_minors.sql').write_text('-- Weighted minor arithmetic and confirmed draft round removal. No historical score rewrite.\nBEGIN;\n'+sql+'\n'+save+"\nNOTIFY pgrst,'reload schema';\nCOMMIT;\n",encoding='utf-8')
