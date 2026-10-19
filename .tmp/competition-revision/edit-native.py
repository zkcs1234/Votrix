from pathlib import Path
p=Path('frontend/src/components/organizer/competition/NativeSetupWorkspace.jsx');s=p.read_text(encoding='utf-8')
s=s.replace("import {Link,useParams}","import {Link,useParams,useLocation,useSearchParams}")
s=s.replace("import Button from", "import CompetitionCreationReview from './CompetitionCreationReview'\nimport StageFooter from '@/components/ui/StageFooter'\nimport CalculationPreview from './CalculationPreview'\nimport Button from")
s=s.replace(' const {eventId}=useParams(),[state', " const {eventId}=useParams(),location=useLocation(),[state")
s=s.replace(' return <><NativeSetupWorkspace key={eventId} eventId={eventId} initialChildren={children}/>', " if(location.pathname.endsWith('/review'))return <CompetitionCreationReview key={eventId} eventId={eventId}/>\n const stage=location.pathname.endsWith('/contestants')?'contestants':location.pathname.endsWith('/judges')?'judges':'workspace'\n return <><NativeSetupWorkspace key={`${eventId}:${stage}`} stage={stage} eventId={eventId} initialChildren={children}/>")
s=s.replace('function NativeSetupWorkspace({eventId,initialChildren=[]})', "function NativeSetupWorkspace({eventId,initialChildren=[],stage=null})")
s=s.replace(" const [children,setChildren]", " const [params]=useSearchParams()\n const visible=key=>!stage||stage===key\n const [children,setChildren]")
s=s.replace("initialChildren.find(c=>c.origin==='native')?.id??''", "initialChildren.find(c=>c.id===params.get('competitionId')&&c.origin==='native')?.id??initialChildren.find(c=>c.origin==='native')?.id??''")
s=s.replace('<h2 className="text-xl font-semibold">Competition setup</h2>', '<h2 className="text-xl font-semibold">{stage === \'workspace\' ? \'Step 5 — Rounds & Scoring\' : stage === \'contestants\' ? \'Step 6 — Contestants / Entries\' : stage === \'judges\' ? \'Step 7 — Judges\' : \'Competition setup\'}</h2>')
s=s.replace('  <form onSubmit={e=>{e.preventDefault();create()}}>', '  {!stage&&<form onSubmit={e=>{e.preventDefault();create()}}>')
s=s.replace('Create competition</Button></fieldset></form>', 'Create competition</Button></fieldset></form>}')
s=s.replace('  <details><summary>Event entrants and judge enrollment</summary>', '  {(visible(\'contestants\')||visible(\'judges\'))&&<details open={!!stage}><summary>Event entrants and judge enrollment</summary>')
s=s.replace('   <form onSubmit={e=>{e.preventDefault();void run(()=>pageantService.createContestant', "   {visible('contestants')&&<form onSubmit={e=>{e.preventDefault();void run(()=>pageantService.createContestant")
s=s.replace("entryType:'individual'", "entryType:view?.competition.participation_format==='group'?'team':view?.competition.participation_format==='duo'?'pair':'individual'")
s=s.replace("'Event entrant created')}}", "'Event entrant created').then(()=>{setMasterName('');setMasterNumber(n=>Number(n)+1)})}}")
s=s.replace('Create event entrant</Button></fieldset></form>', 'Create event entrant</Button></fieldset></form>}')
s=s.replace('   <fieldset disabled={busy||loading||event?.status', "   {visible('judges')&&<fieldset disabled={busy||loading||event?.status",1)
s=s.replace('   </fieldset>\n  </details>', '   </fieldset>}\n  </details>}')
s=s.replace('   <h3 className="font-semibold">1. Participation', "   {visible('contestants')&&<><h3 className=\"font-semibold\">1. Participation")
s=s.replace('</Button></li>)}</ul>', '</Button></li>)}</ul></>}')
s=s.replace('   <h3 className="font-semibold">2. Structure', "   {visible('workspace')&&<><h3 className=\"font-semibold\">2. Structure")
s=s.replace('Save competition configuration</Button></fieldset>', 'Save competition configuration</Button></fieldset></>}')
s=s.replace('   <h3 className="font-semibold">3. Explicit', "   {visible('judges')&&<><h3 className=\"font-semibold\">3. Explicit")
s=s.replace('   </fieldset>\n   <h3 className="font-semibold">4. Review', '   </fieldset></>}\n   {!stage&&<><h3 className="font-semibold">4. Review')
s=s.replace('   <nav className="flex flex-wrap gap-4"', '   </>}<nav className="flex flex-wrap gap-4"')
s=s.replace('  </>}\n </section>', "  </>}\n  {stage&&<StageFooter module=\"competition\" currentKey={stage} eventId={eventId} saving={busy} nextDisabled={loading||dirty||!!error||!children.length}/> }\n </section>")
# No organizer-created rounds are silently inserted when the structure changes.
s=s.replace('  const pre=crypto.randomUUID(),final=crypto.randomUUID()\n', '')
a=s.index("  patch({structure,criteria:[],rounds:structure==='single'");b=s.index('\n',a)
s=s[:a]+"  patch({structure,criteria:[],rounds:[]})"+s[b:]
# Final rounds still need incoming score contributions; put controls in the
# preceding round's transition section, not under the final round.
a=s.index('   <label>Score carry');b=s.index("   {i<value.rounds.length-1&&",a)
s=s[:a]+'''   {i<value.rounds.length-1&&<div className="space-y-3"><label>Next-round score handling<select className={INPUT_CLASS} aria-label={`Round ${i+1} score carry`} value={value.rounds[i+1].progression??'back_to_zero'} onChange={e=>{
    const policy=e.target.value
    patch({rounds:value.rounds.map((x,k)=>policy==='weighted'?{...x,progression:'weighted',weight:x.weight??100/value.rounds.length}:{...x,progression:policy,...(policy==='back_to_zero'?{weight:undefined}:{})})})
   }}><option value="back_to_zero">Back to Zero</option><option value="carry_forward">Carry forward previous scores</option><option value="weighted">Combine previous and current scores</option></select></label>
   {value.rounds[i+1].progression==='weighted'&&<>{value.rounds.map((x,k)=><Field key={x.id} label={`${x.name} contribution percentage`} type="number" min="0" max="100" step="any" value={x.weight} onChange={weight=>round(k,{weight})}/>)}<p>Total contribution: {value.rounds.reduce((sum,x)=>sum+(Number(x.weight)||0),0)}% — must total 100%.</p></>}
   </div>}
'''+s[b:]
s=s.replace('  <label>Tie policy', '  <CalculationPreview method={value.scoringConfig.calculationMethod}/>\n  <label>Tie policy')
p.write_text(s,encoding='utf-8')
p=Path('frontend/src/components/ui/ModuleStageLayout.jsx');s=p.read_text(encoding='utf-8');s=s.replace("competition: ['review', 'workspace']", "competition: ['review', 'workspace', 'categories', 'type', 'contestants', 'judges']")
p.write_text(s,encoding='utf-8')
p=Path('backend/src/foundation/mapper.js');s=p.read_text(encoding='utf-8').replace('competitionType: row.competition_type ?? null,','competitionType: row.competition_type ?? null,\n    competitionCreatedAt: row.competition_created_at ?? null,');p.write_text(s,encoding='utf-8')
