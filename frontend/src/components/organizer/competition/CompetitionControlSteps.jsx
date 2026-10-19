import {useCallback,useEffect,useRef,useState} from 'react'
import {Link} from 'react-router-dom'
import {ArrowDown,ArrowUp,CheckCircle,Clock,GripVertical,Lock,Pause,Play,Square,X} from 'lucide-react'
import Button from '@/components/ui/Button'
import {INPUT_CLASS} from '@/utils/uiClasses'
import {workflowService} from '@/services/competition-workflow.service'
import {competitionSessionService} from '@/services/competition-session.service'
import useCompetitionSync from '@/hooks/useCompetitionSync'
import useLatestRequest from '@/hooks/useLatestRequest'
import {useAuth} from '@/hooks/useAuth'
import {ExistingLiveWorkflowTools} from './CompetitionLiveWorkflowPanel'
import './CompetitionLiveWorkflowPanel.css'

const allowed=(gate,id)=>!gate||gate.mode==='all'||gate.mode==='selected'&&gate.ids?.includes(id)
const gateFor=(ids,all)=>({mode:!ids.length?'none':ids.length===all.length?'all':'selected',ids:ids.length===all.length?[]:ids})

export default function CompetitionControlSteps({eventId,session,foundation,reload,event,readOnly=false,onStepChange}){
 const {user}=useAuth()
 const actorId=user?.id
 const [step,setStep]=useState(session?2:1),[roundId,setRoundId]=useState(session?.currentRoundId??foundation?.rounds?.[0]?.id??'')
 const [name,setName]=useState('Stage lineup'),[mode,setMode]=useState('alternating'),[slots,setSlots]=useState([]),[unplacedSelection,setUnplacedSelection]=useState([])
 const [lineups,setLineups]=useState([]),[selectedLineupId,setSelectedLineupId]=useState(''),[saved,setSaved]=useState(null),[plannedCriteria,setPlannedCriteria]=useState([]),[plannedEntries,setPlannedEntries]=useState([])
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[lineupError,setLineupError]=useState(''),[filter,setFilter]=useState(''),[search,setSearch]=useState(''),[advanced,setAdvanced]=useState(false)
 const pending=useRef(false),initialized=useRef(''),dragged=useRef(null),recovered=useRef(null)
 const rulesId=session?.rulesVersion??foundation?.event?.official_rules_id??event?.officialRulesId
 const preparationKey=actorId&&rulesId?`votrix.stage-preparation.${actorId}.${eventId}.${rulesId}`:null
 const rounds=foundation?.rounds??[],divisions=foundation?.divisions??[]
 const round=rounds.find(r=>r.id===roundId)
 const entries=(foundation?.contestants??[]).filter(e=>!round||round.contestantIds?.includes(e.id))
 const criteria=(foundation?.criteria??[]).filter(c=>c.isActive!==false&&c.is_active!==false&&(!round||round.criteriaIds?.includes(c.id)))
 const byId=new Map(entries.map(e=>[e.id,e])),placed=slots.flat(),unplaced=entries.filter(e=>!placed.includes(e.id))
 const valid=entries.length>0&&slots.length>0&&slots.every(s=>s.length>0)&&placed.length===entries.length&&new Set(placed).size===entries.length&&placed.every(id=>byId.has(id))
 const liveEntries=session?.roundContestants??[]
 const liveCriteria=(session?.criteriaControl??[]).map(c=>({...c,percentage:c.percentage??foundation?.criteria?.find(f=>f.id===c.id)?.percentage}))
 const beginRequest=useLatestRequest(`${eventId}:${rulesId??'draft'}:${actorId}`)
 const load=useCallback(async()=>{
  const current=beginRequest()
  try{const{data}=await workflowService.action(eventId,'lineups');if(current()){
   const records=data.result??[];setLineups(records);setLineupError('')
   if(preparationKey&&!session&&recovered.current!==preparationKey){recovered.current=preparationKey;try{const plan=JSON.parse(localStorage.getItem(preparationKey)??'null'),lineup=records.find(record=>record.id===plan?.lineupId&&record.rules_version===rulesId);if(lineup&&Array.isArray(lineup.slots)&&Array.isArray(plan.plannedCriteria)&&Array.isArray(plan.plannedEntries)){
    initialized.current=`${eventId}:${rulesId}:${lineup.round_id??''}:${actorId}`
    setRoundId(lineup.round_id??'');setName(lineup.name);setMode(lineup.mode);setSlots(lineup.slots);setSelectedLineupId(lineup.id);setPlannedCriteria(plan.plannedCriteria);setPlannedEntries(plan.plannedEntries);setSaved({...lineup,plannedCriteria:plan.plannedCriteria,plannedEntries:plan.plannedEntries});setStep(2)
   }}catch{/* use authoritative saved lineups if local recovery is unavailable */}}
  }}
  catch(e){if(current())setLineupError(e.response?.data?.message??'Saved stage lineups could not be loaded.')}
 },[eventId,beginRequest,preparationKey,session,rulesId,actorId])
 useEffect(()=>{if(!readOnly)void load()},[load,readOnly])
 useCompetitionSync(eventId,load,{enabled:!readOnly})
 useEffect(()=>{onStepChange?.(step)},[step,onStepChange])
 useEffect(()=>{
  const key=`${eventId}:${rulesId}:${roundId}:${actorId}`
  if(initialized.current===key)return
  initialized.current=key
  const order=session?.currentRoundId===(roundId||null)&&session?.contestantOrder?.length?session.contestantOrder.filter(id=>byId.has(id)):entries.map(e=>e.id)
  setSlots(order.map(id=>[id]));setSaved(null);setSelectedLineupId('');setUnplacedSelection([])
  const sameRound=session?.currentRoundId===(roundId||null)
  setPlannedCriteria(criteria.filter(c=>!sameRound||allowed(session?.accessConfig?.criteria,c.id)).map(c=>c.id))
  setPlannedEntries(entries.filter(e=>!sameRound||allowed(session?.accessConfig?.entries,e.id)).map(e=>e.id))
  // Seed once for this scope; live refetches must not overwrite draft ordering.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[eventId,rulesId,roundId,actorId])
 const perform=async task=>{
  if(readOnly||pending.current)return false
  pending.current=true;setBusy(true);setError('')
  try{await task();await reload();return true}
  catch(e){setError(e.response?.data?.message??e.message??'The operation failed. Your preparation is retained.');await reload();return false}
  finally{pending.current=false;setBusy(false)}
 }
 const action=(type,payload)=>perform(()=>workflowService.action(eventId,type,payload))
 const move=(from,to)=>{if(busy||from<0||from>=slots.length||to<0||to>=slots.length)return;setSlots(old=>{const next=[...old],[item]=next.splice(from,1);next.splice(to,0,item);return next});setSaved(null)}
 const arrange=()=>{
  const groups=[...new Set([...divisions.map(d=>d.id),...entries.map(e=>e.divisionId??null)])].map(id=>entries.filter(e=>(e.divisionId??null)===id).sort((a,b)=>a.contestantNumber-b.contestantNumber))
  const ordered=mode==='alternating'?Array.from({length:Math.max(0,...groups.map(g=>g.length))},(_,i)=>groups.map(g=>g[i]).filter(Boolean)).flat():groups.flat()
  setSlots(ordered.map(e=>[e.id]));setUnplacedSelection([]);setSaved(null)
 }
 const save=async()=>{
  const ok=await perform(async()=>{const{data}=await workflowService.action(eventId,'lineup-save',{roundId:roundId||null,name:name.trim(),mode,criteriaId:null,slots});if(!data.result?.id)throw new Error('The saved stage could not be confirmed. Retry preparation.');setSelectedLineupId(data.result.id);setSaved({...data.result,plannedCriteria:[...plannedCriteria],plannedEntries:[...plannedEntries]});if(preparationKey)try{localStorage.setItem(preparationKey,JSON.stringify({lineupId:data.result.id,plannedCriteria,plannedEntries}))}catch{/* current-tab preparation remains available */}await load()})
  if(ok)setStep(2)
 }
 const apply=async()=>{
  if(saved.round_id&&saved.round_id!==session?.currentRoundId)await competitionSessionService.setActiveRound(eventId,saved.round_id)
  await workflowService.action(eventId,'lineup-activate',{lineupId:saved.id,confirmed:true})
  await workflowService.action(eventId,'access',{kind:'entries',gate:gateFor(saved.plannedEntries,entries.map(e=>e.id))})
  await workflowService.action(eventId,'access',{kind:'criteria',gate:gateFor(saved.plannedCriteria,criteria.map(c=>c.id))})
 }
 const start=()=>perform(async()=>{
  await competitionSessionService.startSession(eventId)
  try{await competitionSessionService.pauseSession(eventId);await apply();await competitionSessionService.resumeSession(eventId)}
  catch(e){try{await competitionSessionService.pauseSession(eventId)}catch{/* reload shows actual status; never promise pause succeeded */}throw new Error(`The session started, but preparation did not finish. Review its saved status before resuming. ${e.response?.data?.message??e.message??''}`,{cause:e})}
 })
 const toggle=(kind,id,all)=>{const open=all.filter(key=>allowed(session.accessConfig?.[kind],key));action('access',{kind,gate:gateFor(open.includes(id)?open.filter(key=>key!==id):[...open,id],all)})}
 const activeRound=rounds.find(r=>r.id===session?.currentRoundId)
 const activeLineup=lineups.find(l=>l.id===session?.lineupId)
 if(readOnly)return <section className="v-control-panel"><h3>Performance controls closed</h3><p className="v-control-intro">Official results are published. Further changes require an authorized amendment; saved history is preserved.</p><Link className="text-v-primary underline" to={`/organizer/competition/events/${eventId}/tabulation`}>Open Tabulation</Link></section>
 return <section>
  <nav className="v-control-steps" aria-label="Competition control steps"><button className="v-control-step" type="button" aria-current={step===1?'step':undefined} disabled={busy} onClick={()=>setStep(1)}><b>1</b>Stage Lineup & Scoring Access</button><button className="v-control-step" type="button" aria-current={step===2?'step':undefined} disabled={busy||!saved&&!session} onClick={()=>setStep(2)}><b>2</b>Live Session</button></nav>
  <div className="v-control-panel">{step===1?<>
   <h3>Stage Lineup & Scoring Access</h3><p className="v-control-intro">Prepare the performance order, verify configured weights and plan who can score. Saving the stage does not start judging.</p>
   {!rulesId&&<p className="v-control-help">Publish scoring configuration in <Link className="underline" to={`/organizer/competition/events/${eventId}/review`}>Review & Publish</Link> before saving a live stage.</p>}
   <div className="v-control-columns"><div className="v-control-block"><h4>Stage setup</h4><div className="v-control-fields">
    <label>Round<select className={INPUT_CLASS} value={roundId} disabled={busy} onChange={e=>setRoundId(e.target.value)}>{!rounds.length&&<option value="">Event-wide scoring</option>}{rounds.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
    <label>Saved stage<select className={INPUT_CLASS} value={selectedLineupId} disabled={busy} onChange={e=>{setSelectedLineupId(e.target.value);const selected=lineups.find(l=>l.id===e.target.value);if(selected){setSlots(selected.slots);setName(selected.name);setMode(selected.mode);setSaved(null);setPlannedCriteria(selected.criteria_id?[selected.criteria_id]:criteria.map(c=>c.id))}}}><option value="">Choose a saved lineup</option>{lineups.filter(l=>l.round_id===(roundId||null)&&(!rulesId||l.rules_version===rulesId)).map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
    <label>Stage name<input className={INPUT_CLASS} value={name} disabled={busy} onChange={e=>{setName(e.target.value);setSaved(null)}}/></label></div>
    <div className="v-control-toolbar"><Button size="sm" variant="secondary" disabled={busy||!entries.length} onClick={arrange}>Auto Arrange</Button><label className="v-caption">Arrangement<select className={INPUT_CLASS} disabled={busy} value={mode} onChange={e=>{setMode(e.target.value);setSaved(null)}}><option value="alternating">Alternating divisions</option><option value="division">Division by division</option><option value="manual">Manual order</option><option value="grouped">Grouped performance</option></select></label></div>
    <h4 className="mb-3">Stage lineup</h4><ol className="v-control-list">{slots.map((slot,index)=><li className="v-control-slot" key={slot.join(':')} draggable={!busy} onDragStart={()=>{dragged.current=index}} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(dragged.current!=null)move(dragged.current,index);dragged.current=null}}>
     <GripVertical className="h-4 w-4 shrink-0 text-v-text-subtle" aria-hidden/><div className="v-control-slot-members">{slot.map(id=>byId.has(id)?<Entry key={id} entry={byId.get(id)} divisions={divisions}><button className="v-control-toggle" type="button" disabled={busy} data-open={plannedEntries.includes(id)} onClick={()=>{setPlannedEntries(old=>old.includes(id)?old.filter(key=>key!==id):[...old,id]);setSaved(null)}}>{plannedEntries.includes(id)?'Planned open':'Planned closed'}</button></Entry>:<p key={id} role="alert" className="v-error-text">A saved entry is no longer eligible. Remove this draft slot and review the field.</p>)}</div>
     <div className="v-control-entry-actions"><button className="v-control-icon-button" type="button" aria-label={`Move slot ${index+1} up`} disabled={busy||index===0} onClick={()=>move(index,index-1)}><ArrowUp/></button><button className="v-control-icon-button" type="button" aria-label={`Move slot ${index+1} down`} disabled={busy||index===slots.length-1} onClick={()=>move(index,index+1)}><ArrowDown/></button><button className="v-control-icon-button" type="button" aria-label={`Remove slot ${index+1} from draft lineup`} disabled={busy} onClick={()=>{setSlots(old=>old.filter((_,i)=>i!==index));setSaved(null)}}><X/></button></div>
    </li>)}</ol>
    {unplaced.length>0&&<div className="v-control-help"><p className="mb-2 font-medium">Unplaced contestants</p>{unplaced.map(e=><label key={e.id} className="mr-3 inline-flex items-center gap-1"><input type="checkbox" disabled={busy} checked={unplacedSelection.includes(e.id)} onChange={v=>setUnplacedSelection(old=>v.target.checked?[...old,e.id]:old.filter(id=>id!==e.id))}/>{e.name}</label>)}<div className="v-control-toolbar"><Button size="sm" variant="secondary" disabled={busy||!unplacedSelection.length} onClick={()=>{setSlots(old=>[...old,...unplacedSelection.map(id=>[id])]);setUnplacedSelection([]);setSaved(null)}}>Add individual slots</Button><Button size="sm" variant="secondary" disabled={busy||!unplacedSelection.length} onClick={()=>{setSlots(old=>[...old,[...unplacedSelection]]);setUnplacedSelection([]);setSaved(null)}}>Add as grouped slot</Button></div></div>}
    <p className="v-caption mt-3">Place every eligible contestant exactly once. Removing a draft slot does not remove participation or judge assignments.</p>
   </div><div className="v-control-block"><h4>Scoring access / major criteria</h4><p className="v-control-intro">Configured weights are read-only. Planned access takes effect only when applied to a live session.</p>{criteria.map(c=><Criterion key={c.id} criterion={c} open={plannedCriteria.includes(c.id)} planned disabled={busy} onToggle={()=>{setPlannedCriteria(old=>old.includes(c.id)?old.filter(id=>id!==c.id):[...old,c.id]);setSaved(null)}}/>)}</div></div>
   <div className="v-control-footer">{session&&<Button variant="secondary" disabled={busy} onClick={()=>setStep(2)}>Cancel preparation</Button>}<Button loading={busy} disabled={busy||!rulesId||!name.trim()||!valid} onClick={save}>Save Stage Lineup & Continue to Live Session</Button></div>
  </>:<>
   <h3>Live Session</h3><p className="v-control-intro">Control saved scoring permissions and monitor judging. Drafts, locks and round submission remain separate.</p>
   <div className="v-control-live-bar"><span className="flex flex-wrap items-center gap-3"><strong>{session?.status==='active'?'LIVE':session?.status==='paused'?'PAUSED':session?.status==='completed'?'CLOSED':'READY'}</strong><span>{activeRound?.name??round?.name??'Event-wide scoring'}</span>{lineups.find(l=>l.id===session?.lineupId)?.name&&<span>{lineups.find(l=>l.id===session.lineupId).name}</span>}{session?.startedAt&&<span>Started {new Date(session.startedAt).toLocaleTimeString()}</span>}</span><div className="flex gap-2">
    {!session?<Button disabled={busy||!saved||!valid} loading={busy} onClick={start}><Play className="h-4 w-4"/>Start Live Session</Button>:<>{session.status==='active'&&<Button size="sm" variant="secondary" disabled={busy} onClick={()=>perform(()=>competitionSessionService.pauseSession(eventId))}><Pause className="h-4 w-4"/>Pause</Button>}{session.status==='paused'&&<Button size="sm" disabled={busy} onClick={()=>perform(()=>competitionSessionService.resumeSession(eventId))}><Play className="h-4 w-4"/>Resume</Button>}{session.status!=='completed'&&<Button size="sm" variant="danger" disabled={busy} onClick={()=>{if(window.confirm('End this performance? Locked round submission and Tabulation remain separate.'))perform(()=>competitionSessionService.completeSession(eventId))}}><Square className="h-4 w-4"/>End Session</Button>}</>}
   </div></div>
   {!session?<p className="v-control-help">The lineup is saved. Startup and access changes are separate existing operations; preparation is applied while paused before resuming. Planned permissions are not already live.</p>:<>
    {saved&&saved.id!==session.lineupId&&<div className="v-control-toolbar"><Button disabled={busy||session.status==='completed'} onClick={()=>{if(window.confirm('Apply this saved lineup and planned access? An active session will pause while preparation is applied.'))perform(async()=>{const resume=session.status==='active';if(resume)await competitionSessionService.pauseSession(eventId);await apply();if(resume)await competitionSessionService.resumeSession(eventId)})}}>Apply saved stage & access</Button><span className="v-caption">Preparation is not active until applied.</span></div>}
    {activeLineup&&<div className="v-control-toolbar"><span className="v-caption">Presenting slot {(session.activeSlot??0)+1} of {activeLineup.slots.length}: {(activeLineup.slots[session.activeSlot??0]??[]).map(id=>foundation?.contestants?.find(e=>e.id===id)?.name??'Contestant').join(' + ')}</span><Button size="sm" variant="secondary" disabled={busy||session.status==='completed'||!session.activeSlot} onClick={()=>action('slot',{index:session.activeSlot-1})}>Previous contestant / slot</Button><Button size="sm" variant="secondary" disabled={busy||session.status==='completed'||(session.activeSlot??0)>=activeLineup.slots.length-1} onClick={()=>action('slot',{index:(session.activeSlot??0)+1})}>Next contestant / slot</Button></div>}
    <div className="v-control-columns v-control-live-columns"><div className="v-control-block"><h4>Round & major criteria</h4><div className="v-control-fields"><label>Current round<select className={INPUT_CLASS} value={session.currentRoundId??''} disabled={busy||session.status==='completed'} onChange={e=>perform(()=>competitionSessionService.setActiveRound(eventId,e.target.value))}>{!rounds.length&&<option value="">Event-wide scoring</option>}{rounds.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label><Link className="text-xs text-v-primary underline" to={`/organizer/competition/events/${eventId}/rankings`}>View rankings</Link></div>{liveCriteria.map(c=><Criterion key={c.id} criterion={c} open={allowed(session.accessConfig?.criteria,c.id)} disabled={busy||session.status==='completed'} onToggle={()=>toggle('criteria',c.id,liveCriteria.map(item=>item.id))}/>)}</div>
     <div className="v-control-block"><h4>Contestant access</h4><div className="v-control-filters"><button type="button" aria-pressed={!filter} onClick={()=>setFilter('')}>Event-wide</button>{divisions.map(d=><button type="button" key={d.id} aria-pressed={filter===d.id} onClick={()=>setFilter(d.id)}>{d.name}</button>)}</div><input className={INPUT_CLASS} type="search" aria-label="Search contestant" placeholder="Search contestant…" value={search} onChange={e=>setSearch(e.target.value)}/><div className="v-control-toolbar"><Button size="sm" variant="secondary" disabled={busy||session.status==='completed'} onClick={()=>action('access',{kind:'entries',gate:{mode:'all',ids:[]}})}>Open all contestants</Button><Button size="sm" variant="secondary" disabled={busy||session.status==='completed'} onClick={()=>action('access',{kind:'entries',gate:{mode:'none',ids:[]}})}>Close all contestants</Button></div>
      <div className="v-control-list">{liveEntries.filter(e=>(!filter||foundation?.contestants?.find(c=>c.id===e.id)?.divisionId===filter)&&`${e.name} ${e.contestantNumber}`.toLowerCase().includes(search.toLowerCase())).map(e=>{const open=allowed(session.accessConfig?.entries,e.id);return <Entry key={e.id} entry={foundation?.contestants?.find(c=>c.id===e.id)??e} divisions={divisions}><button className="v-control-toggle" type="button" data-open={open&&session.status==='active'} disabled={busy||session.status==='completed'} aria-label={`${open?'Close':'Open'} scoring for ${e.name}`} onClick={()=>toggle('entries',e.id,liveEntries.map(item=>item.id))}>{open&&session.status==='active'?<CheckCircle/>:open?<Clock/>:<Lock/>}{open?session.status==='active'?'Open':'Waiting':'Closed'}</button></Entry>})}</div>
     </div></div>
    {session.status==='completed'&&<p className="v-control-help">Performance is closed. Use the existing authorized reopening tools if correction or a next round is needed; official results remain separate.</p>}
    <details className="mt-4" onToggle={e=>setAdvanced(e.currentTarget.open)}><summary className="cursor-pointer text-sm">Advanced stage tools & authorized corrections</summary>{advanced&&<ExistingLiveWorkflowTools eventId={eventId} session={session} foundation={foundation} reload={reload}/>}</details>
   </>}
   <div className="v-control-footer"><Button variant="secondary" disabled={busy} onClick={()=>setStep(1)}>Edit stage preparation</Button><Link className="inline-flex items-center rounded-lg border border-v-border px-3 py-2 text-xs text-v-primary" to={`/organizer/competition/events/${eventId}/tabulation`}>Continue to Tabulation</Link></div>
  </>}
  {error&&<p role="alert" className="v-error-text mt-3">{error}</p>}{lineupError&&<p role="alert" className="v-error-text mt-3">{lineupError} <button type="button" className="underline" onClick={load}>Retry saved stages</button></p>}
  </div>
 </section>
}
function Criterion({criterion,open,onToggle,disabled,planned=false}){
 return <div className="v-control-criterion"><div className="v-control-entry-name">{criterion.name}<span className="v-control-weight">{criterion.percentage}%</span></div><button className="v-control-toggle" type="button" data-open={open} disabled={disabled} aria-label={`${open?'Close':'Open'} ${planned?'planned ':''}criterion ${criterion.name}`} onClick={onToggle}>{open?<CheckCircle/>:<Lock/>}{planned?'Planned ':''}{open?'Open':'Closed'}</button></div>
}
function Entry({entry,divisions,children}){
 const division=entry.divisionName??divisions.find(d=>d.id===entry.divisionId)?.name??'',label=String(entry.gender??entry.sex??division).toLowerCase()
 const female=/\b(female|women|woman|girls?|f)\b/.test(label),male=!female&&/\b(male|men|man|boys?|m)\b/.test(label),accent=female?'#db2777':male?'#2563eb':null
 const indicator=female?'F':male?'M':division.split(/\s+/).filter(Boolean).slice(0,2).map(word=>word[0]).join('').toUpperCase()
 return <div className="v-control-entry" style={accent?{'--control-accent':accent,'--control-row-bg':`color-mix(in srgb, ${accent} 6%, var(--v-surface))`}:undefined}><span className="v-control-number" title={division||undefined}>#{entry.contestantNumber}{indicator&&<small>{indicator}</small>}</span>{entry.photo&&<img className="v-control-photo" src={entry.photo} alt=""/>}<span className="v-control-entry-name">{entry.name}</span>{children}</div>
}
