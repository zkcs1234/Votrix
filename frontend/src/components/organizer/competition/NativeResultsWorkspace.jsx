import {useCallback,useEffect,useRef,useState} from 'react'
import {useAuth} from '@/hooks/useAuth'
import useCompetitionSync from '@/hooks/useCompetitionSync'
import {nativeCompetitionService} from '@/services/competition-native.service'
import {nativeResultsService as service} from '@/services/competition-native-results.service'
import Button from '@/components/ui/Button'
import {Link} from 'react-router-dom'
const key=c=>`${c.competitionId}:${c.roundId??'single'}`
const message=e=>e.response?.data?.message??e.message??'Unable to load current official results'
export function NativeResultsBoundary({eventId,Legacy,analytics=false}){
 const [state,setState]=useState(null)
 useEffect(()=>{if(import.meta.env.VITE_COMPETITION_NATIVE_RESULTS_ENABLED!=='true')return;let alive=true;setState(null);nativeCompetitionService.choices(eventId,true).then(({data})=>{if(alive)setState({choices:data.contexts??[],nativeEvent:data.nativeEvent})}).catch(e=>{if(alive)setState({error:message(e)})});return()=>{alive=false}},[eventId])
 if(import.meta.env.VITE_COMPETITION_NATIVE_RESULTS_ENABLED!=='true')return <Legacy/>
 if(!state)return <p role="status">Loading competition results…</p>
 if(state.error)return <p role="alert">{state.error}</p>
 if(!state.choices.length&&state.nativeEvent===true)return <p>Complete competition setup before viewing official results. <Link to={`/organizer/competition/events/${eventId}/workspace`}>Open competition setup</Link></p>
 if(!state.choices.length&&state.nativeEvent!==false)return <p role="alert">Competition identity is unavailable. Reconnect before continuing.</p>
 if(!state.choices.length)return <Legacy/>
 return <NativeResultsWorkspace key={eventId} eventId={eventId} choices={state.choices} analytics={analytics}/>
}
export default function NativeResultsWorkspace({eventId,choices,analytics=false}){
 const {user}=useAuth(),actorId=user?.id
 const [selected,setSelected]=useState(key(choices[0])),[data,setData]=useState(null),[error,setError]=useState(null),[busy,setBusy]=useState(false),[reason,setReason]=useState(''),[historyId,setHistoryId]=useState(''),[exportJudge,setExportJudge]=useState(''),[retry,setRetry]=useState(false)
 const choice=choices.find(c=>key(c)===selected)??choices[0],identity=`${eventId}:${actorId}:${selected}`
 const identityRef=useRef(identity);identityRef.current=identity
 const sequence=useRef(0),pending=useRef(new Map())
 const view=data?.viewerId===actorId&&data.eventId===eventId&&data.competitionId===choice.competitionId&&data.roundId===choice.roundId?data:null
 const invalidate=useCallback(()=>{sequence.current++;setData(null)},[])
 const refresh=useCallback(async()=>{
  const expected=identity,request=++sequence.current
  setData(null)
  try{const {data:result}=await service.owned(eventId,choice.competitionId,choice.roundId);if(identityRef.current!==expected||sequence.current!==request)return;if(result.eventId!==eventId||result.competitionId!==choice.competitionId||result.roundId!==choice.roundId||result.viewerId!==actorId)throw new Error('Official results identity mismatch');setData(result);setError(null)}catch(e){if(identityRef.current===expected&&sequence.current===request){setData(null);setError(message(e))}}
 },[identity,eventId,choice.competitionId,choice.roundId,actorId])
 useEffect(()=>{setData(null);setHistoryId('');setExportJudge('');setReason('');setRetry(pending.current.has(identity));setBusy(false);void refresh()},[refresh,identity])
 useCompetitionSync(eventId,refresh,{competitionId:choice.competitionId,roundId:choice.roundId,onInvalidate:invalidate})
 const publicationActive=view?.publication&&view.publication.action!=='withdraw'
 const currentPublished=publicationActive&&view.publication.current&&view.calculation?.id===view.publication.calculationId
 const transition=async(action,replay=false)=>{
  if(busy)return
  const expected=identity,body=replay?pending.current.get(identity):{roundId:choice.roundId,requestId:crypto.randomUUID(),expectedPublicationVersion:view.publication?.version??0,calculationId:view.calculation?.id??null,sourceDigest:view.sourceDigest,reason,acknowledged:true,action}
  if(!body)return
  pending.current.set(identity,body);setRetry(true);setBusy(true)
  try{await service.publish(eventId,choice.competitionId,body);pending.current.delete(expected);if(identityRef.current===expected){setRetry(false);await refresh()}}catch(e){if(identityRef.current===expected){await refresh();if(identityRef.current===expected)setError(message(e))}}finally{if(identityRef.current===expected)setBusy(false)}
 }
 const download=async(kind)=>{
  const expected=identity;setBusy(true)
  try{const result=await service.export(eventId,choice.competitionId,{kind,roundId:choice.roundId??undefined,sourceDigest:view.sourceDigest,calculationId:view.calculation?.id??undefined,judgeId:kind==='judge'?exportJudge:undefined});if(identityRef.current!==expected)return;const url=URL.createObjectURL(result.data),a=document.createElement('a');a.href=url;a.download=`competition-${choice.competitionId}-${choice.roundId??'single'}-${kind}.csv`;a.click();URL.revokeObjectURL(url)}catch(e){if(identityRef.current===expected){setData(null);setError(message(e))}}finally{if(identityRef.current===expected)setBusy(false)}
 }
 const history=view?.history.find(h=>h.calculationId===historyId)
 const official=historyId?history?.results:view?.official
 const showOrganizerDeductions=official?.deductionSettings?.organizer??true
 const showJudgeDeductions=official?.deductionSettings?.judge===true
 const groups=[...new Map(choices.map(c=>[c.competitionId,c])).values()]
 return <section className="v-competition-workflow space-y-4">
  <h1>{analytics?'Results & Analytics':'Official results'}</h1>
  <div className="flex flex-wrap gap-4"><label>Competition <select aria-label="Competition" value={choice.competitionId} onChange={e=>setSelected(key(choices.find(c=>c.competitionId===e.target.value)))}>{groups.map(c=><option key={c.competitionId} value={c.competitionId}>{c.competitionName}</option>)}</select></label>{choices.filter(c=>c.competitionId===choice.competitionId).some(c=>c.roundId!=null)&&<label>Round <select aria-label="Round" value={selected} onChange={e=>setSelected(e.target.value)}>{choices.filter(c=>c.competitionId===choice.competitionId).map(c=><option key={key(c)} value={key(c)}>{c.roundName}</option>)}</select></label>}</div>
  {error&&<p role="alert">{error}</p>}
  {!view&&<p role="status">Checking current official state…</p>}
  {view&&<>
   <p>Publication: {publicationActive?`version ${view.publication.version}${view.publication.current?'':' — published snapshot requires review'}`:'Not published'}. Finalization does not publish results.</p>
   <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div><dt>Competition participation</dt><dd>{view.statistics.participants}</dd></div><div><dt>Eligible in selected round</dt><dd>{view.statistics.eligibleParticipants}</dd></div><div><dt>Current judge completion</dt><dd>{view.statistics.submittedJudges}/{view.statistics.requiredJudges}</dd></div><div><dt>Current finalized version</dt><dd>{view.calculation?.version??'None'}</dd></div></dl>
   {!view.complete&&<p>Current judge sheets or qualification are incomplete. Score-bearing results and exports are hidden; historical submissions do not complete a reopened sheet.</p>}
   {view.complete&&<>
    <label>Results version <select aria-label="Results version" value={historyId} onChange={e=>setHistoryId(e.target.value)}><option value="">Current official results</option>{view.history.map(h=><option key={h.calculationId} value={h.calculationId}>Version {h.version} — {h.current?'current':'historical / superseded'}</option>)}</select></label>
    {historyId&&<p>Historical finalized snapshot. This is not the current result and cannot be published or exported as current.</p>}
    {!official&&<p>No current finalized calculation. Drafts and unfinalized totals are not official results.</p>}
    {official&&<>{showJudgeDeductions&&<p className="v-caption">Calculated scores include submitted judge deductions. Original submissions and adjusted judge totals remain available in Tabulation.</p>}<p>Method: {official.method} · tie policy: {official.tiePolicy} · precision: {official.precision} · finalized {official.finalizedAt}</p><div className="v-table-wrap"><table className="v-table"><caption>{historyId?'Historical finalized standings':'Current official standings'}</caption><thead><tr><th>Rank</th><th>Entry</th><th>Score / placement</th>{showOrganizerDeductions&&<th>Organizer deductions</th>}</tr></thead><tbody>{official.standings.map(r=><tr key={r.participationId}><td>{r.rank}{r.tied&&' (tie)'}</td><td>#{r.entryNumber} {r.name}</td><td>{r.manual?`Manual placement ${r.rank}`:r.score}{r.numericCarryScore!=null&&<span className="block text-xs text-v-text-subtle">Numeric contribution: {r.numericCarryScore}</span>}</td>{showOrganizerDeductions&&<td>{r.deductionTotal??'—'} {r.manual?'':r.deductionUnits}{r.pointDeductionTotal>0&&<span className="block text-xs text-v-text-subtle">{r.pointDeductionTotal} numeric points before ranking</span>}</td>}</tr>)}</tbody></table></div>
    {analytics&&<div aria-label="Official score summary">{official.method!=='manual'&&official.method!=='rank_based'?official.standings.map(r=><div key={r.participationId}><span>{r.name}: {r.score}</span> <meter min={Math.min(0,...official.standings.map(x=>x.score))} max={Math.max(1,...official.standings.map(x=>x.score))} value={r.score}/></div>):<ol>{official.standings.map(r=><li key={r.participationId}>{r.name}: placement {r.rank}{r.tied?' (tie)':''}</li>)}</ol>}</div>}</>}
    <fieldset disabled={busy||!!historyId}><legend>Authorized CSV exports</legend><select aria-label="Export judge" value={exportJudge} onChange={e=>setExportJudge(e.target.value)}><option value="">Select judge</option>{view.progress.map((j,i)=><option key={j.judgeId} value={j.judgeId}>{j.judgeName??`Judge ${i+1}`}</option>)}</select><Button disabled={!exportJudge} onClick={()=>download('judge')}>Judge worksheet CSV</Button><Button onClick={()=>download('worksheets')}>All worksheets CSV</Button><Button disabled={!currentPublished} onClick={()=>download('tabulation')}>Published tabulation CSV</Button><Button disabled={!currentPublished} onClick={()=>download('final')}>Published final results CSV</Button></fieldset>
    {!currentPublished&&<p className="v-caption">Tabulation and official result exports are available only after the current finalized calculation has been published.</p>}
   </>}
   <fieldset disabled={busy}><legend>Explicit publication controls</legend><label>Publication reason <input aria-label="Publication reason" value={reason} onChange={e=>setReason(e.target.value)}/></label><Button disabled={reason.trim().length<5||!view.calculation||!!historyId||retry} onClick={()=>transition(publicationActive?'replace':'publish')}>{publicationActive?'Replace published version':'Publish selected finalized version'}</Button>{publicationActive&&<Button disabled={reason.trim().length<5||retry} onClick={()=>transition('withdraw')}>Withdraw publication</Button>}{retry&&<Button onClick={()=>transition(null,true)}>Retry original publication action</Button>}</fieldset>
   {publicationActive&&<a href={`/competition/events/${eventId}/competitions/${choice.competitionId}/results${choice.roundId?`?roundId=${choice.roundId}`:''}`} target="_blank" rel="noreferrer">View published snapshot</a>}
  </>}
 </section>
}
