import {useId,useRef,useState} from 'react'
import {Link} from 'react-router-dom'
import {competitionSessionService} from '@/services/competition-session.service'
import Button from '@/components/ui/Button'
import {INPUT_CLASS,LABEL_CLASS} from '@/utils/uiClasses'
import {stagePath} from '@/utils/eventStages'
import {advancementLabel,nextRound,orderedRounds} from '../../../../../shared/competition-participation.js'

const sourceKey=versions=>JSON.stringify([...(versions ?? [])].map(source=>({id:source.id,version:source.version})).sort((a,b)=>String(a.id).localeCompare(String(b.id))))
function currentCalculation(calculation,state,eventId,roundId){
  return Boolean(calculation?.verified_at&&['under_verification','finalized','published'].includes(calculation.status)
    &&calculation.round_id===roundId&&calculation.rules_version===state.rules.id
    &&(!calculation.event_id||calculation.event_id===eventId)
    &&(!calculation.session_id||calculation.session_id===state.session?.id)
    &&(!calculation.source_digest||calculation.source_digest===state.sourceDigest)
    &&(!calculation.source_versions||!state.sourceVersions||sourceKey(calculation.source_versions)===sourceKey(state.sourceVersions)))
}
function QualificationRound({eventId,state,calculation,source,destination,onConfirm,blocked}){
  const [preview,setPreview]=useState(null),[selected,setSelected]=useState([]),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[confirmedContext,setConfirmedContext]=useState(null)
  const reasonId=useId(),inFlight=useRef(false)
  const context=JSON.stringify({eventId,roundId:source.id,rulesId:state.rules.id,sessionId:state.session?.id,
    sourceDigest:state.sourceDigest,versions:sourceKey(state.sourceVersions),calculationId:calculation?.id,verifiedAt:calculation?.verified_at,calculationStatus:calculation?.status})
  const latestContext=useRef(context);latestContext.current=context
  const activePreview=preview?.context===context?preview.data:null
  const manual=source.advancementType==='manual',standing=activePreview?.standing ?? []
  const eligible=standing.filter(entry=>Number.isInteger(entry.rank)&&entry.rank>0).map(entry=>entry.contestantId)
  const ready=activePreview?.ready===true&&currentCalculation(calculation,state,eventId,source.id)
  const confirmed=confirmedContext===context
  const canConfirm=!blocked&&!busy&&!confirmed&&ready&&selected.every(id=>eligible.includes(id))&&(!manual||Boolean(reason.trim()))
  const loadPreview=async()=>{
    if(blocked||inFlight.current)return
    inFlight.current=true;setBusy(true);setPreview(null);setError('')
    const requestedContext=context
    try{
      const {data}=await competitionSessionService.previewRoundAdvancement(eventId,source.id)
      if(latestContext.current!==requestedContext)return
      if(data.roundId!==source.id||!Array.isArray(data.standing)||!Array.isArray(data.qualifiers)
        ||data.qualifiers.some(id=>!data.standing.some(entry=>entry.contestantId===id))){throw new Error('Invalid qualification preview. Refresh saved tabulation before confirming.')}
      setPreview({context:requestedContext,data});setSelected([...data.qualifiers]);setReason('')
    }catch(failure){if(latestContext.current===requestedContext)setError(failure.response?.data?.message ?? failure.message ?? 'Qualification preview unavailable')}
    finally{inFlight.current=false;setBusy(false)}
  }
  const confirm=async()=>{
    if(!canConfirm||inFlight.current)return
    inFlight.current=true;setBusy(true);setError('')
    const payload={roundId:source.id,calculationId:calculation.id,reason:reason.trim()}
    if(manual)payload.overrides={add:selected.filter(id=>!activePreview.qualifiers.includes(id)),remove:activePreview.qualifiers.filter(id=>!selected.includes(id))}
    try{if(await onConfirm(payload)!==false)setConfirmedContext(context);else setError('Confirmation failed. Check the saved advancement record before retrying.')}
    catch(failure){setError(failure.response?.data?.message ?? 'Advancement confirmation failed')}
    finally{inFlight.current=false;setBusy(false)}
  }
  const settings=`${stagePath('competition','workspace',eventId)}?${new URLSearchParams({tab:'rounds',section:'advancement',roundId:source.id})}`
  return <section className="v-card min-w-0 space-y-3 p-4" aria-label={`${source.name} advancement`}>
    <h3 className="font-medium text-v-text">{source.name} → {destination.name}</h3>
    <p className="text-sm text-v-text-muted">{advancementLabel(source)}. Verified {state.rules.scoringConfig.calculationMethod==='manual'?'recorded placements':'round results'} determine qualifiers.</p>
    {['top_n','top_percent'].includes(source.advancementType)&&<p className="text-xs text-v-text-subtle">Shared cutoff ties advance together. The approved count can exceed the requested number.</p>}
    <Link to={settings} className="inline-block text-xs text-v-primary underline">View Advancement Rules</Link>
    <div className="flex flex-wrap gap-2"><Button variant="secondary" loading={busy} disabled={blocked||busy||confirmed} onClick={loadPreview}>Preview qualifiers</Button><Button variant="secondary" disabled={!canConfirm} onClick={confirm}>Confirm advancement</Button></div>
    {confirmed&&<p role="status" className="text-sm">Advancement confirmed. <Link to={stagePath('competition','live',eventId)} className="text-v-primary underline">Activate {destination.name} in Live Control</Link></p>}
    {error&&<p role="alert" className="v-error-text">{error}</p>}
    {activePreview&&<div className="space-y-3">
      <p role="status" className="text-sm">{source.name}: {activePreview.ready?'Submitted sources complete':'Provisional / incomplete'}</p>
      {!ready&&<p className="text-xs text-v-text-subtle">A current verified calculation for this round and rules version is required before confirmation.</p>}
      <div className="space-y-2">{standing.map(entry=><label key={entry.contestantId} className="flex items-start gap-2 text-sm"><input type="checkbox" aria-label={`Select ${entry.contestantName}`} disabled={!manual||!ready||busy||blocked||!eligible.includes(entry.contestantId)} checked={selected.includes(entry.contestantId)} onChange={event=>setSelected(current=>event.target.checked?[...new Set([...current,entry.contestantId])]:current.filter(id=>id!==entry.contestantId))}/><span>{entry.contestantName} · rank {entry.rank ?? 'Incomplete'}</span></label>)}</div>
      {manual&&<p className="text-xs text-v-text-subtle">The published rule permits manual qualifier selection from these eligible ranked entries. Record the reason for the approved selection.</p>}
      <div><label htmlFor={reasonId} className={LABEL_CLASS}>{manual?'Manual qualification reason':'Advancement reason (optional)'}</label><textarea id={reasonId} className={`${INPUT_CLASS} w-full`} disabled={busy||blocked} value={reason} onChange={event=>setReason(event.target.value)} required={manual}/></div>
    </div>}
  </section>
}
export default function CompetitionAdvancementPanel({eventId,state,calculation,onConfirm,blocked=false}){
  const rounds=orderedRounds(state.rules.rounds)
  const sources=rounds.filter(round=>round.purpose!=='special').map(source=>({source,destination:nextRound(rounds,source)}))
    .filter(({source,destination})=>destination&&destination.purpose!=='special'&&Number(destination.displayOrder ?? 0)>Number(source.displayOrder ?? 0))
  return <section className="min-w-0 space-y-3" aria-label="Round progression and advancement">
    {!sources.length&&<p className="v-card p-5 text-sm text-v-text-muted">No later main rounds are configured for progression.</p>}
    {sources.map(({source,destination})=>(source.advancementType ?? 'none')==='none'?<section key={source.id} className="v-card min-w-0 space-y-3 p-4" aria-label={`${source.name} progression`}>
      <h3 className="font-medium text-v-text">{source.name} → {destination.name}</h3>
      <p className="text-sm font-medium text-v-text">All eligible contestants continue</p>
      <p className="text-sm text-v-text-muted">No elimination is configured. Eligible source-round entries continue according to the saved round sequence. Live Control opens judging separately.</p>
      <Link to={stagePath('competition','live',eventId)} className="inline-block text-sm text-v-primary underline">Activate {destination.name} in Live Control</Link>
    </section>:<QualificationRound key={`${state.rules.id}:${source.id}`} {...{eventId,state,calculation,source,destination,onConfirm,blocked}}/>) }
  </section>
}
