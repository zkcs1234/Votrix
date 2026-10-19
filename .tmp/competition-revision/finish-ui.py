from pathlib import Path
p=Path('frontend/src/components/organizer/competition/NativeSetupWorkspace.jsx');s=p.read_text(encoding='utf-8')
s=s.replace("const [snapshot,setSnapshot]", "const [summaries,setSummaries]=useState({})\n const [snapshot,setSnapshot]")
s=s.replace("   if(current.current!==expected||generation.current!==request)return\n   if(selected", "   const summaryPairs=stage==='workspace'?await Promise.all((list.data.competitions??[]).filter(c=>c.origin==='native').map(async c=>{const result=c.id===selected?foundation:await service.foundation(eventId,c.id);return [c.id,result.data.criteriaReadiness?.allReady===true]})):[]\n   if(current.current!==expected||generation.current!==request)return\n   setSummaries(Object.fromEntries(summaryPairs))\n   if(selected")
s=s.replace(' },[eventId,selected,identity])',' },[eventId,selected,identity,stage])')
s=s.replace('  <label>Competition<select', '''  {stage==='workspace'&&<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children.filter(c=>c.origin==='native').map(c=><button type="button" key={c.id} disabled={busy} onClick={()=>choose(c.id)} aria-pressed={c.id===selected} className={`v-card p-4 text-left space-y-2 ${c.id===selected?'ring-2 ring-v-primary':''}`}><span className="block font-semibold">{c.name}</span><span className={summaries[c.id]?'text-v-success':'text-v-text-subtle'}>{summaries[c.id]?'Criteria configured':'Not configured'}</span></button>)}</div>}
  <label>Competition<select''')
# Registering from the entries step explicitly creates membership in the selected
# branch. Shared records remain available for intentional reuse elsewhere.
a=s.index("   {visible('contestants')&&<form onSubmit");b=s.index('<fieldset',a)
s=s[:a]+'''   {visible('contestants')&&<form onSubmit={e=>{e.preventDefault();void run(async()=>{const result=await pageantService.createContestant(eventId,{name:masterName.trim(),contestantNumber:Number(masterNumber),entryType:view?.competition.participation_format??'individual'});if(stage==='contestants'&&selected)await service.addEntry(eventId,selected,{contestantId:result.data.contestant.id});setMasterName('');setMasterNumber(n=>Number(n)+1)},'Event entrant created')}}>'''+s[b:]
s=s.replace("disabled={!participant||!view.configuration}","disabled={!participant||!view.configuration||!entries.length}")
s=s.replace("{view&&<>\n", "{view&&<>\n   {stage==='judges'&&!entries.length&&<p role=\"status\">Register entries in Step 6 before assigning judges to this competition.</p>}\n")
p.write_text(s,encoding='utf-8')
p=Path('frontend/src/pages/organizer/competition/CompetitionEventFormPage.jsx');s=p.read_text(encoding='utf-8')
s=s.replace("Boolean(officialRulesId))", "Boolean(officialRulesId))")
s=s.replace("setOfficialRulesId(data.event.officialRulesId ?? data.event.official_rules_id ?? null)", "setOfficialRulesId(data.event.competitionCreatedAt || data.event.officialRulesId || data.event.official_rules_id || null)")
s=s.replace('slice(0, 100)','slice(0, 32)')
p.write_text(s,encoding='utf-8')
p=Path('frontend/src/components/ui/ModuleStageLayout.jsx');s=p.read_text(encoding='utf-8')
s=s.replace('const [nativeCompetition,setNativeCompetition]=useState(false)', 'const [nativeCompetition,setNativeCompetition]=useState(false)\n  const [creationComplete,setCreationComplete]=useState(false)')
s=s.replace('    setNativeCompetition(false)', '    setNativeCompetition(false);setCreationComplete(false)')
s=s.replace('    nativeCompetitionService.list(eventId).then', "    pageantService.getEvent(eventId).then(({data})=>{if(alive)setCreationComplete(!!data.event.competitionCreatedAt)}).catch(()=>{})\n    nativeCompetitionService.list(eventId).then")
s=s.replace('completedKeys={completedKeys}', "completedKeys={creationComplete?[...new Set([...completedKeys,'details','branding','type','categories','workspace','contestants','judges','review'])]:completedKeys}")
p.write_text(s,encoding='utf-8')
