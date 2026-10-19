from pathlib import Path
p=Path('frontend/src/components/organizer/competition/NativeSetupWorkspace.jsx');s=p.read_text(encoding='utf-8')
s=s.replace("import {INPUT_CLASS}", "import {competitionScoringReady} from '../../../../../shared/competition-creation-flow.js'\nimport {INPUT_CLASS}")
s=s.replace('const [summaries,setSummaries]=useState({})', 'const [summaries,setSummaries]=useState({}),[stepReadiness,setStepReadiness]=useState({})')
a=s.index("   const summaryPairs=stage==='workspace'?");b=s.index("   if(current.current!==expected",a)
s=s[:a]+'''   const branchStates=stage?await Promise.all((list.data.competitions??[]).filter(c=>c.origin==='native').map(async c=>{
    if(stage==='contestants'){const result=c.id===selected?participation:await service.entries(eventId,c.id);return [c.id,{scoring:false,ready:!!result.data.entries?.length}]}
    const result=c.id===selected?foundation:await service.foundation(eventId,c.id),saved=result.data,scoring=competitionScoringReady(saved)
    const panel=saved.assignments.filter(a=>enrolled.data.judges.some(j=>j.id===a.participant_id&&j.isActive&&j.accountStatus==='active'&&['judge','head_judge'].includes(j.role)))
    const scopes=saved.configuration?.structure==='multiple'?saved.configuration.rounds:[{id:null}]
    const covered=!!saved.configuration&&scopes.every(r=>panel.some(a=>a.round_id==null||a.round_id===r.id))&&panel.length===saved.assignments.length
    return [c.id,{scoring,ready:stage==='workspace'?scoring:covered}]
   })):[]
'''+s[b:]
s=s.replace('   setSummaries(Object.fromEntries(summaryPairs))', '   setSummaries(Object.fromEntries(branchStates.map(([id,state])=>[id,state.scoring])));setStepReadiness(Object.fromEntries(branchStates.map(([id,state])=>[id,state.ready])))')
s=s.replace('nextDisabled={loading||dirty||!!error||!children.length}', "nextDisabled={loading||dirty||!!error||!children.length||!event?.competitionCreatedAt&&children.filter(c=>c.origin==='native').some(c=>!stepReadiness[c.id])}")
s=s.replace('  {stage&&<StageFooter', "  {stage&&!event?.competitionCreatedAt&&children.some(c=>c.origin==='native'&&!stepReadiness[c.id])&&<p role=\"status\">Complete this step for every selected competition before continuing.</p>}\n  {stage&&<StageFooter")
p.write_text(s,encoding='utf-8')
