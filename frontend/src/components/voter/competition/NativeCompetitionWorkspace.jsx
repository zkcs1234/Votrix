import { judgeDivisionOptions } from '@/utils/judgeContestantDivisions'
import {DEDUCTION_LABELS, validJudgeDeductionRecords} from '../../../../../shared/competition-deductions.js'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, Filter, Lock, Search, Settings2, Shield, Trophy, Users } from 'lucide-react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import useCompetitionSync from '@/hooks/useCompetitionSync'
import useCompetitionContext from '@/hooks/useCompetitionContext'
import { nativeCompetitionService as service } from '@/services/competition-native.service'
import CompetitionScoringForm from './CompetitionScoringForm'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import NativeTabulationWorkspace from '@/components/organizer/competition/NativeTabulationWorkspace'
import {nativeTabulationService} from '@/services/competition-native-tabulation.service'
import {competitionRetryDelay} from '@/utils/competitionRetry'

const message=e=>e.response?.data?.message??e.message??'Unable to connect. Saved local drafts are retained.'
export const nativeContextKey=(eventId,judgeId,ctx)=>`votrix.native.scoring.v1:${judgeId}:${eventId}:${ctx.competitionId}:${ctx.roundId??'single'}:${ctx.sessionId??'waiting'}:${ctx.rulesVersion}:${ctx.setupRevision}:${ctx.inputRevision}`
const chooseKey=c=>`${c.competitionId}:${c.roundId??'single'}`
const serverScores=view=>Object.fromEntries((view.drafts??[]).flatMap(d=>Object.entries(d.scores).map(([id,value])=>[`${d.entry_id}:${id}`,value])))
const roundStatusLabel=status=>({open:'OPEN',active:'OPEN',paused:'PAUSED',submitted:'SUBMITTED',closed:'CLOSED',waiting:'CLOSED',review:'CLOSED'}[status]??'CLOSED')
function RoundNavigation({contexts,selected,onSelect,statusFor,isDisabled,ariaLabel}) {
 return <nav className="v-native-round-nav" aria-label={ariaLabel}>
  <span className="v-native-round-label">Round</span>
  <div className="v-native-round-options">
   {contexts.map((context,index)=>{
    const status=roundStatusLabel(statusFor(context))
    const key=chooseKey(context)
    return <button key={key} type="button" className="v-native-round-option" data-status={status.toLowerCase()} aria-pressed={selected===key} aria-label={`Round ${index+1}: ${status}${context.roundName?` — ${context.roundName}`:''}`} title={context.roundName||undefined} disabled={isDisabled?.(context,index)} onClick={()=>onSelect(key)}>
     <span>Round {index+1}</span><strong>{status}</strong>
    </button>
   })}
  </div>
 </nav>
}

// Flag defaults off. Existing pages continue without any native request.
export function CompetitionWorkspaceBoundary({owner=false,Legacy}) {
 const {eventId}=useParams()
 const [params]=useSearchParams(),requestedCompetition=params.get('competitionId'),requestedRound=params.get('roundId')
 const [state,setState]=useState(null)
 const {user}=useAuth(),actor=user?.id
 const discoveryActor=useRef(actor);discoveryActor.current=actor
 const discoveryRequest=useRef(0)
 const discover=useCallback(async()=>{
  const sequence=++discoveryRequest.current
  try{
   const {data}=await service.choices(eventId,owner)
   const choices=owner?data.contexts??[]:(data.contexts??[]).filter(context=>context.reviewer!==true&&context.state!=='review')
   let reviewerChoices=owner?[]:(data.contexts??[]).filter(context=>context.reviewer===true||context.state==='review')
   if(!owner&&!choices.length&&!reviewerChoices.length&&import.meta.env.VITE_COMPETITION_NATIVE_TABULATION_ENABLED==='true'){
    const response=await nativeTabulationService.reviewerChoices(eventId);reviewerChoices=response.data.contexts??[]
   }
   let event=data.event
   if(owner&&data.nativeEvent&&choices.length&&event?.status==='scheduled'){
    const {data:activation}=await service.activateLiveControl(eventId)
    event={...event,status:activation.status}
   }
   if(sequence===discoveryRequest.current&&discoveryActor.current===actor)setState({choices,reviewerChoices,nativeEvent:data.nativeEvent,eventName:data.eventName,event})
  }catch(e){if(sequence===discoveryRequest.current&&discoveryActor.current===actor)setState({error:message(e)})}
 },[eventId,owner,actor])
 const invalidateDiscovery=useCallback(()=>{discoveryRequest.current++},[])
 useCompetitionSync(eventId,discover,{enabled:import.meta.env.VITE_COMPETITION_NATIVE_SCORING_ENABLED==='true'&&state?.nativeEvent!==false})
 useEffect(()=>{
  if(import.meta.env.VITE_COMPETITION_NATIVE_SCORING_ENABLED!=='true')return
  setState(null);void discover()
  return invalidateDiscovery
 },[discover,invalidateDiscovery])
 if(import.meta.env.VITE_COMPETITION_NATIVE_SCORING_ENABLED!=='true')return <Legacy/>
 if(!state)return <p role="status">Loading competition contexts…</p>
 if(state.error)return <p role="alert">{state.error}</p>
 const choices=[...state.choices,...(state.reviewerChoices??[])]
 const initial= requestedCompetition?choices.find(c=>c.competitionId===requestedCompetition&&(c.roundId??null)===(requestedRound??null)):choices[0]
 if(requestedCompetition&&!initial)return <p role="alert">This competition or round is not currently assigned to you.</p>
 if(initial&&state.reviewerChoices?.some(context=>chooseKey(context)===chooseKey(initial)))return <NativeTabulationWorkspace key={`${eventId}:${requestedCompetition}:${requestedRound}`} eventId={eventId} choices={state.reviewerChoices.map(context=>({...context,eventName:state.eventName??context.eventName}))} initialChoice={initial} reviewer/>
 if(!state.choices.length&&state.nativeEvent===true)return owner?<p>Complete competition setup before starting scoring. <Link to={`/organizer/competition/events/${eventId}/workspace`}>Open competition setup</Link></p>:<p>No competition or round is currently assigned to you. Contact the organizer.</p>
 if(!state.choices.length&&state.nativeEvent!==false)return <p role="alert">Competition identity is unavailable. Reconnect before continuing.</p>
 if(!state.choices.length)return <Legacy/>
 return <NativeCompetitionWorkspace key={owner?`${eventId}:owner`:`${eventId}:${owner}:${requestedCompetition}:${requestedRound}`} eventId={eventId} eventName={state.eventName} event={state.event} choices={state.choices} initialChoice={initial} owner={owner}/>
}

export default function NativeCompetitionWorkspace({eventId,eventName,event=null,choices,owner=false,initialChoice=null}) {
 const {user}=useAuth()
 const judgeId=user?.id
 const {selected,setSelected,choice}=useCompetitionContext(choices,initialChoice,owner)
 const choicesRef=useRef(choices);choicesRef.current=choices
 const choiceRef=useRef(choice);choiceRef.current=choice
 const identity=`${eventId}:${judgeId}:${selected}:${owner}`
 const identityRef=useRef(identity);identityRef.current=identity
 const request=useRef(0),version=useRef(null),viewRef=useRef(null),queue=useRef({}),storageKey=useRef(null),busyRef=useRef(false),scoresRef=useRef({}),viewError=useRef(false)
 const [snapshot,setView]=useState(null),[ownerSnapshots,setOwnerSnapshots]=useState({}),[ownerTabulations,setOwnerTabulations]=useState({}),[scores,setScores]=useState({}),[error,setError]=useState(null),[notice,setNotice]=useState(null),[busy,setBusy]=useState(false),[pending,setPending]=useState(0),[submittingKey,setSubmittingKey]=useState(null),[accessBusyKeys,setAccessBusyKeys]=useState(()=>new Set()),[submitConfirmOpen,setSubmitConfirmOpen]=useState(false)
 const accessQueue=useRef(Promise.resolve())
 const view=snapshot?.context?.eventId===eventId&&snapshot.context.competitionId===choice.competitionId&&snapshot.context.roundId===choice.roundId&&(owner||snapshot.viewerJudgeId===judgeId)?snapshot:null
 const [divisionFilter,setDivisionFilter]=useState('all')
 const divisionOptions=judgeDivisionOptions(view)
 const activeDivision=divisionOptions.some(division=>division.id===divisionFilter)?divisionFilter:'all'
 useEffect(()=>{setDivisionFilter('all')},[identity])
 const [deductionDrafts,setDeductionDrafts]=useState({})
 const deductionDraftsRef=useRef({})
 const eventClosed=!!view?.eventStatus&&!['draft','scheduled','active'].includes(view.eventStatus)
 const [reason,setReason]=useState(''),[correctionJudge,setCorrectionJudge]=useState('')
 const persist=useCallback(()=>{
  setPending(Object.keys(queue.current).length)
  if(storageKey.current)try{localStorage.setItem(storageKey.current,JSON.stringify(queue.current))}catch{setError('Local draft storage is unavailable. Keep this page open until scores are saved.')}
 },[])
 const refresh=useCallback(async()=>{
  const expected=identity,seq=++request.current
  try {
   const activeChoice=choiceRef.current
   const responses=owner
    ?await Promise.all(choicesRef.current.map(async context=>({context,data:(await service.view(eventId,context.competitionId,context.roundId,true)).data})))
    :[{context:activeChoice,data:(await service.view(eventId,activeChoice.competitionId,activeChoice.roundId,false)).data}]
   const data=responses.find(item=>chooseKey(item.context)===chooseKey(activeChoice))?.data
   if(identityRef.current!==expected||seq!==request.current)return
   if(!data)throw new Error('Selected competition context was not returned')
   if(data.context?.competitionId!==activeChoice.competitionId||data.context.roundId!==activeChoice.roundId||(!owner&&data.viewerJudgeId!==judgeId))throw new Error('Scoring context identity mismatch')
   if(owner){
    setOwnerSnapshots(Object.fromEntries(responses.map(({context,data:viewData})=>[chooseKey(context),viewData])))
    void Promise.all(responses.map(async({context})=>({key:chooseKey(context),result:await nativeTabulationService.snapshot(eventId,context.competitionId,context.roundId).then(response=>response.data).catch(()=>null)}))).then(results=>{
     if(identityRef.current===expected&&seq===request.current)setOwnerTabulations(Object.fromEntries(results.map(({key,result})=>[key,result])))
    })
   }
   const stamp=`${data.context.sessionId}:${data.context.rulesVersion}`
   if(version.current?.stamp===stamp&&(Number(data.session?.revision??0)<version.current.revision||Number(data.session?.source_revision??0)<version.current.source))return
   version.current={stamp,revision:Number(data.session?.revision??0),source:Number(data.session?.source_revision??0)}
   const key=nativeContextKey(eventId,judgeId,data.context)
   if(storageKey.current!==key){storageKey.current=key;try{queue.current=JSON.parse(localStorage.getItem(key)??'{}')}catch{queue.current={}}}
   for(const [row,job] of Object.entries(queue.current)) {
    const saved=data.drafts?.find(d=>d.entry_id===job.entryId&&d.criterion_id===job.criterionId)
    if(job.action==='submit'&&data.submission || job.body&&saved&&saved.revision>job.body.rowRevision&&Object.keys(saved.scores).length===Object.keys(job.body.scores??{}).length&&Object.entries(saved.scores).every(([id,value])=>job.body.scores[id]===value)&&(job.body.deductions===undefined||JSON.stringify(saved.deductions??[])===JSON.stringify(job.body.deductions))&&(job.action!=='lock'||saved.locked))delete queue.current[row]
   }
   viewRef.current=data;setView(data);persist();if(viewError.current){viewError.current=false;setError(null)}
   const merged={...serverScores(data)}
   for(const job of Object.values(queue.current))if(job.values)for(const [id,value] of Object.entries(job.values))merged[`${job.entryId}:${id}`]=value
   scoresRef.current=merged;setScores(merged);setPending(Object.keys(queue.current).length)
   const mergedDeductions=Object.fromEntries((data.drafts??[]).map(d=>[`${d.entry_id}:${d.criterion_id}`,d.deductions??[]]))
   for(const [row,job]of Object.entries(queue.current))if(job.deductions)mergedDeductions[row]=job.deductions
   deductionDraftsRef.current=mergedDeductions;setDeductionDrafts(mergedDeductions)
  }catch(e){if(identityRef.current===expected){viewError.current=true;setError(message(e));if(viewRef.current){const blocked={...viewRef.current,session:{...viewRef.current.session,status:'unavailable'},criteria:viewRef.current.criteria.map(k=>({...k,open:false})),contestants:viewRef.current.contestants.map(x=>({...x,open:false}))};viewRef.current=blocked;setView(blocked)}}}
 },[eventId,owner,judgeId,identity,persist])
 const applyAccessInvalidation=useCallback(payload=>{
  if(owner||payload?.eventId!==eventId||payload?.competitionId!==choice.competitionId||
   (payload?.roundId??null)!==(choice.roundId??null)||!payload?.access)return
  const current=viewRef.current
  if(!current?.session||payload.sessionId!==current.session.id||
   !Number.isSafeInteger(payload.sessionRevision)||payload.sessionRevision<=Number(current.session.revision??0))return
  const {kind,targetId,open}=payload.access
  if(typeof open!=='boolean'||!['entry','criterion'].includes(kind))return
  const isEntry=kind==='entry'
  const exists=(isEntry?current.contestants:current.criteria).some(item=>item.id===targetId)
  if(!exists)return
  const accessField=isEntry?'entry_access':'criterion_access'
  const updated={
   ...current,
   context:{...current.context,sessionRevision:payload.sessionRevision},
   session:{...current.session,revision:payload.sessionRevision,[accessField]:{...current.session[accessField],[targetId]:open}},
   contestants:isEntry?current.contestants.map(entry=>entry.id===targetId?{...entry,open}:entry):current.contestants,
   criteria:isEntry?current.criteria:current.criteria.map(criterion=>criterion.id===targetId?{...criterion,open}:criterion),
  }
  viewRef.current=updated
  setView(updated)
 },[eventId,choice.competitionId,choice.roundId,owner])
 useEffect(()=>{
  deductionDraftsRef.current={};setDeductionDrafts({});viewRef.current=null;queue.current={};storageKey.current=null;version.current=null;scoresRef.current={};setView(null);setOwnerSnapshots({});setOwnerTabulations({});setScores({});setError(null);setNotice(null);setPending(0);setBusy(false);setSubmittingKey(null);setAccessBusyKeys(new Set());accessQueue.current=Promise.resolve();setCorrectionJudge('');setReason('')
  void refresh()
 },[refresh])
 const {connected}= useCompetitionSync(eventId,refresh,{competitionId:owner?null:choice.competitionId,roundId:owner?null:choice.roundId,onInvalidate:applyAccessInvalidation})
 const envelope=()=>({...viewRef.current.context,requestId:crypto.randomUUID()})
 const flush=useCallback(async()=>{
  if(busyRef.current||owner||!viewRef.current?.session||viewRef.current.session.status!=='active')return false
  if(!Object.keys(queue.current).length)return true
  if(!Object.values(queue.current).some(job=>!job.blocked&&!(job.retryAt>Date.now())&&(job.action==='submit'||viewRef.current.criteria.some(k=>k.id===job.criterionId&&k.open)&&viewRef.current.contestants.some(e=>e.id===job.entryId&&e.open))))return false
  const expected=identity,key=storageKey.current
  let refreshAfterWrite=false
  busyRef.current=true;setBusy(true)
  try {
   for(const row of Object.keys(queue.current)) {
    if(identityRef.current!==expected)return false
    const job=queue.current[row],current=viewRef.current
    if(job.blocked||job.retryAt>Date.now())continue
    const criterion=current.criteria.find(k=>k.id===job.criterionId),entry=current.contestants.find(e=>e.id===job.entryId)
    if(job.action!=='submit'&&(!criterion?.open||!entry?.open))continue
    if(!job.body) {
     const values=Object.fromEntries(Object.entries(job.values??{}).filter(([,v])=>v!==''&&v!=null).map(([id,v])=>[id,Number(v)]))
     const saved=current.drafts.find(d=>d.entry_id===job.entryId&&d.criterion_id===job.criterionId)
     job.body={...current.context,requestId:crypto.randomUUID(),entryId:job.entryId,criterionId:job.criterionId,rowRevision:saved?.revision??0,scores:values,deductions:job.deductions??saved?.deductions??[]};persist()
    }
    if(job.action==='lock')setSubmittingKey(row)
    const {data}=await service.score(eventId,choice.competitionId,job.action,job.body)
    if(identityRef.current!==expected||storageKey.current!==key)return false
    if(job.action!=='submit') {
     const drafts=[...current.drafts]
     const idx=drafts.findIndex(d=>d.entry_id===job.entryId&&d.criterion_id===job.criterionId)
     const saved={session_id:current.context.sessionId,judge_id:judgeId,entry_id:job.entryId,criterion_id:job.criterionId,scores:job.body.scores,deductions:job.body.deductions??[],revision:data.rowRevision,locked:data.locked}
     if(idx<0)drafts.push(saved);else drafts[idx]=saved
     const contestants=job.action==='lock'
      ?current.contestants.map(cont=>cont.id===job.entryId?{...cont,lockedCriteria:[...new Set([...(cont.lockedCriteria??[]),job.criterionId])]}:cont)
      :current.contestants
     const updated={...current,drafts,contestants}
     viewRef.current=updated;setView(updated)
    } else {
     const updated={...current,submission:{id:data.submissionId}}
     viewRef.current=updated;setView(updated)
    }
    // Preserve keystrokes entered while a previous draft request was in flight.
    if(queue.current[row]===job){delete queue.current[row];persist()}
   }
   setError(null);return true
  }catch(e){if(identityRef.current===expected){refreshAfterWrite=true;setError(message(e));if(e.response?.status===429){for(const job of Object.values(queue.current))job.retryAt=Date.now()+competitionRetryDelay(e);persist()}if([400,403,409].includes(e.response?.status)){for(const job of Object.values(queue.current))job.blocked=true;persist()}}return false}
  finally{busyRef.current=false;if(identityRef.current===expected){setBusy(false);setSubmittingKey(Object.entries(queue.current).find(([,job])=>job.action==='lock'&&!job.blocked&&!(job.retryAt>Date.now()))?.[0]??null);if(refreshAfterWrite)void refresh()}}
 },[identity,owner,eventId,choice.competitionId,persist,refresh,judgeId])
 useEffect(()=>{if(!owner){const timer=setInterval(()=>void flush(),1500);return()=>clearInterval(timer)}},[flush,owner])
 const change=(entryId,targetId,value)=>{
  const criterion=view.criteria.find(k=>k.id===targetId||(k.minors??[]).some(m=>m.id===targetId))
  const pointsBasis=view.criterionBasis==='points',row=`${entryId}:${criterion.id}`,targets=pointsBasis?[criterion]:criterion.minors?.length?criterion.minors:[criterion]
  const next={...scoresRef.current,[`${entryId}:${targetId}`]:value};scoresRef.current=next;setScores(next)
  queue.current[row]={entryId,criterionId:criterion.id,action:'draft',values:Object.fromEntries(targets.map(t=>[t.id,next[`${entryId}:${t.id}`]??''])),deductions:deductionDraftsRef.current[row]??[],blocked:!validJudgeDeductionRecords(deductionDraftsRef.current[row]??[],view.deductionSettings?.rules??[])};persist()
 }
 const changeDeductions=(entryId,criterionId,records)=>{
  const row=`${entryId}:${criterionId}`,criterion=view.criteria.find(item=>item.id===criterionId)
  const targets=view.criterionBasis==='points'?[criterion]:criterion.minors?.length?criterion.minors:[criterion]
  const next={...deductionDraftsRef.current,[row]:records};deductionDraftsRef.current=next;setDeductionDrafts(next)
  queue.current[row]={entryId,criterionId,action:'draft',values:Object.fromEntries(targets.map(target=>[target.id,scoresRef.current[`${entryId}:${target.id}`]??''])),deductions:records,blocked:!validJudgeDeductionRecords(records,view.deductionSettings?.rules??[])};persist();void flush()
 }
 const accessControl=(kind,targetId,open)=>{
  const key=`${kind}:${targetId}`,expected=identity
  setAccessBusyKeys(previous=>new Set(previous).add(key))
  setNotice(null)
  const operation=async()=>{
   try{
    if(identityRef.current!==expected)return
    const current=viewRef.current
    if(!current?.session)throw new Error('No active scoring session is available')
    const {data}=await service.control(eventId,choice.competitionId,'access',{
     ...current.context,requestId:crypto.randomUUID(),sessionId:current.session.id,
     sessionRevision:current.session.revision,kind,targetId,open,
    })
    if(identityRef.current!==expected)return
    const isEntry=kind==='entry'
    const accessField=isEntry?'entry_access':'criterion_access'
    const updated={
     ...current,
     context:{...current.context,sessionRevision:data.sessionRevision},
     session:{...current.session,revision:data.sessionRevision,[accessField]:{...current.session[accessField],[targetId]:open}},
     contestants:isEntry?current.contestants.map(entry=>entry.id===targetId?{...entry,open}:entry):current.contestants,
     criteria:isEntry?current.criteria:current.criteria.map(criterion=>criterion.id===targetId?{...criterion,open}:criterion),
    }
    viewRef.current=updated
    setView(updated)
    setOwnerSnapshots(previous=>({...previous,[chooseKey(choice)]:updated}))
    setError(null)
   }catch(error){
    if(identityRef.current===expected){setError(message(error));setNotice(null);void refresh()}
   }finally{
    setAccessBusyKeys(previous=>{const next=new Set(previous);next.delete(key);return next})
   }
  }
  const queued=accessQueue.current.catch(()=>{}).then(operation)
  accessQueue.current=queued
  return queued
 }
 const lock=async(entryId,criterionId)=>{
  const criterion=view.criteria.find(k=>k.id===criterionId),targets=view.criterionBasis==='points'?[criterion]:criterion.minors?.length?criterion.minors:[criterion]
  setSubmittingKey(`${entryId}:${criterionId}`)
  queue.current[`${entryId}:${criterionId}`]={entryId,criterionId,action:'lock',values:Object.fromEntries(targets.map(t=>[t.id,scoresRef.current[`${entryId}:${t.id}`]??''])),deductions:deductionDraftsRef.current[`${entryId}:${criterionId}`]??[],blocked:!validJudgeDeductionRecords(deductionDraftsRef.current[`${entryId}:${criterionId}`]??[],view.deductionSettings?.rules??[])};persist();await flush()
 }
 const submit=async()=>{
  if(busyRef.current)return
  const expected=identity
  if(!await flush()||identityRef.current!==expected||Object.keys(queue.current).length)return false
  queue.current.submit={action:'submit',body:envelope()};persist();return flush()
 }
 const confirmSubmit=async()=>{
  await submit()
  setSubmitConfirmOpen(false)
 }
 const control=async(action,extra={})=>{
  const expected=identity
  setBusy(true)
  try{const {data}=await service.control(eventId,choice.competitionId,action,{...envelope(),...extra});if(identityRef.current===expected){setError(null);setNotice(action==='close'&&data?.calculation?`Scoring closed. ${data.calculation.status==='up_to_date'?'Scores calculated automatically. Continue to Tabulation to review and finalize this round.':data.calculation.message??'Automatic calculation will run once all current submissions and configured deductions are ready.'}`:action==='start'?'Category scoring opened.':action==='close'?'Category scoring closed.':action==='access'?extra.open?'Judge scoring access opened for participant.':'Judge scoring access closed for participant.':action==='pause'?'Scoring paused.':action==='resume'?'Scoring resumed.':'Live control updated.')}}catch(e){if(identityRef.current===expected){setError(message(e));setNotice(null)}}finally{if(identityRef.current===expected){setBusy(false);await refresh()}}
 }
 const proceedToCategory=async targetChoice=>{
  const target=ownerSnapshots[chooseKey(targetChoice)]
  if(!owner||busy||!target?.context||target.session){
   setError('The next category context is not ready to open. Refresh Live Control and try again.')
   return
  }
  setSelected(chooseKey(targetChoice))
  setBusy(true)
  try{
   await service.control(eventId,targetChoice.competitionId,'start',{...target.context,requestId:crypto.randomUUID()})
   setError(null)
   setNotice(`${targetChoice.competitionName} is now open for live scoring.`)
  }catch(e){
   setError(message(e))
   setNotice(null)
  }finally{
   setBusy(false)
   await refresh()
  }
 }
 const groups=[...new Map(choices.map(c=>[c.competitionId,c])).values()]
 const categoryState=category=>{
  const states=choices.filter(context=>context.competitionId===category.competitionId).map(context=>context.state)
  if(category.competitionId===choice.competitionId&&view){
   if(view.submission)return 'submitted'
   if(view.session?.status==='paused')return 'paused'
   if(view.scoringAvailable)return 'open'
  }
  return ['open','paused','submitted','waiting','closed','review'].find(state=>states.includes(state))??'waiting'
 }
 const firstOpenCategory=groups.findIndex(category=>categoryState(category)==='open')
 const lockedReason=view?.submission
  ? 'Your round is submitted. Wait for the organizer to open the next category or round.'
  : view?.session?.status==='paused'
   ? 'Scoring is paused. Your saved drafts are safe; wait for the organizer to resume.'
   : view?.scoringAvailable===false
    ? 'This category is locked until the organizer opens scoring.'
    : null
 if(owner)return <NativeOrganizerLiveDashboard eventId={eventId} eventName={eventName} event={event} choices={choices} choice={choice} selected={selected} setSelected={setSelected} views={ownerSnapshots} tabulations={ownerTabulations} view={view} connected={connected} busy={busy} accessBusyKeys={accessBusyKeys} error={error} notice={notice} eventClosed={eventClosed} setError={setError} control={control} proceedToCategory={proceedToCategory} accessControl={accessControl} reason={reason} setReason={setReason} correctionJudge={correctionJudge} setCorrectionJudge={setCorrectionJudge}/>
 return <div className="v-native-judge-workspace">
  <header className="v-native-judge-header">
   {!owner&&<Link to="/participant" className="v-native-dashboard-link"><ArrowLeft aria-hidden/>Back to dashboard</Link>}
   <h1>{eventName||'Competition scoring'}</h1>
   <p>{owner?'Live Control':'Judge workspace'} · {owner?'Manage scoring access by category and round.':'Your scores are private until submitted.'}</p>
  </header>
  <nav className="v-native-category-nav" aria-label="Competition categories">
   {groups.map((category,index)=>{
    const state=categoryState(category),active=category.competitionId===choice.competitionId
    const next=firstOpenCategory>=0&&index===firstOpenCategory+1
    const label=state==='open'?'OPEN FOR SCORING':state==='paused'?'SCORING PAUSED':state==='submitted'?'SUBMITTED':state==='closed'?'CLOSED':next?'UP NEXT · LOCKED':'LOCKED'
    return <button key={category.competitionId} type="button" className="v-native-category-tab" data-active={active} data-available={state==='open'} aria-current={active?'page':undefined} aria-label={`${category.competitionName}: ${label}`} onClick={()=>{const target=choices.find(c=>c.competitionId===category.competitionId&&c.state==='open')??choices.find(c=>c.competitionId===category.competitionId);if(target)setSelected(chooseKey(target))}}>
     <span className="v-native-category-number">{index+1}</span><span className="v-native-category-name">{category.competitionName}</span>
     <span className="v-native-category-state">{label}</span>
     {!owner&&state!=='open'&&<Lock aria-hidden className="v-native-category-lock"/>}
    </button>
   })}
  </nav>
  <div className="v-native-judge-session-bar">
   <RoundNavigation ariaLabel="Scoring rounds" contexts={choices.filter(c=>c.competitionId===choice.competitionId)} selected={selected} onSelect={setSelected} statusFor={context=>{
    const current=chooseKey(context)===selected?view:null
    if(current?.laterRoundBlocked)return 'closed'
    if(current?.session?.status==='active')return current.scoringAvailable===false?'closed':'open'
    if(current?.session?.status==='paused')return 'paused'
    if(current?.session?.status==='closed')return 'closed'
    if(current?.submission)return 'submitted'
    return context.state
   }}/>
   <span className="v-native-live-indicator" data-live={view?.session?.status==='active'} role="status">{view?.session?.status==='active'?(connected?'Scoring session is live':'Reconnecting to live session'):view?.session?.status==='paused'?'Scoring is paused':view?.submission?'Round submitted · waiting for organizer':owner?'Session not started':'Waiting for organizer to open scoring'}</span>
   {!owner&&divisionOptions.length>0&&<nav className="v-native-division-filter" aria-label="Contestant division filter"><div role="group" aria-label="Show contestants by division"><button type="button" aria-pressed={activeDivision==='all'} onClick={()=>setDivisionFilter('all')}>Event Wide</button>{divisionOptions.map(division=><button key={division.id} type="button" data-division-tone={division.tone} aria-pressed={activeDivision===division.id} onClick={()=>setDivisionFilter(division.id)}>{division.label}</button>)}</div></nav>}
   {!owner&&<span className="v-native-connection-state">{connected?'Connected':'Reconnecting'}</span>}
  </div>
  {error&&<p role="alert">{error}</p>}
  {!view&&<p>Loading authorized scoring context…</p>}
  {view?.laterRoundBlocked&&<p>Scoring requires confirmed qualification from finalized tabulation. Closing the previous round does not qualify entries.</p>}
  {eventClosed&&<p>This event is {view.eventStatus}. Scoring is read only.</p>}
  {!owner&&view&&lockedReason&&<p className="v-native-judge-notice" role="status"><Lock aria-hidden/>{lockedReason}</p>}
  {view&&owner&&<fieldset disabled={busy||eventClosed||view.session?.status==='unavailable'} className="space-y-4">
   <div className="flex flex-wrap gap-2">
    {!view.session&&<Button disabled={busy||view.laterRoundBlocked} onClick={()=>control('start')}>Start scoring</Button>}
    {view.session?.status==='active'&&<Button disabled={busy} onClick={()=>control('pause')}>Pause</Button>}
    {view.session?.status==='paused'&&<Button disabled={busy} onClick={()=>control('resume')}>Resume</Button>}
    {view.session&&view.session.status!=='closed'&&<Button disabled={busy} onClick={()=>control('close')}>Close scoring</Button>}
   </div>
   <p>Closing scoring does not finalize results or advance contestants.</p>
   <fieldset disabled={busy||!view.session||view.session.status==='closed'}><legend>Scoring access</legend>
    {view.contestants.map(e=><label key={e.id} className="block"><input type="checkbox" checked={view.session?.entry_access?.[e.id]===true} onChange={x=>control('access',{kind:'entry',targetId:e.id,open:x.target.checked})}/> #{e.contestantNumber} {e.name}</label>)}
    {view.criteria.map(k=><label key={k.id} className="block"><input type="checkbox" checked={view.session?.criterion_access?.[k.id]===true} onChange={x=>control('access',{kind:'criterion',targetId:k.id,open:x.target.checked})}/> {k.name} ({k.percentage}%)</label>)}
   </fieldset>
   <table><caption>Judge completion</caption><thead><tr><th>Judge</th><th>Locks</th><th>Round submission</th></tr></thead><tbody>{view.progress?.map(j=><tr key={j.judgeId}><td>{j.judgeName??j.judgeId}</td><td>{j.lockedCount}/{j.requiredCount}</td><td>{j.submitted?'Submitted':'Pending'}</td></tr>)}</tbody></table>
   {view.session&&<fieldset><legend>Audited reopen or correction</legend><label>Reason <input value={reason} onChange={e=>setReason(e.target.value)}/></label><label>Judge <select value={correctionJudge} onChange={e=>setCorrectionJudge(e.target.value)}><option value="">Reopen session only</option>{view.progress?.map(j=><option key={j.judgeId} value={j.judgeId}>{j.judgeName??j.judgeId}</option>)}</select></label><p>This preserves submitted history and pauses scoring. Selecting a judge unlocks that judge’s sources for correction.</p><Button disabled={busy||reason.trim().length<5} onClick={()=>control('reopen',{reason,judgeId:correctionJudge||null,acknowledged:true})}>Confirm audited reopen</Button></fieldset>}
  </fieldset>}
  {view&&!owner&&<>
   <CompetitionScoringForm key={`${identity}:${view.context.sessionId}`} sheet={view} divisionFilter={activeDivision} scores={scores} deductionDrafts={deductionDrafts} onDeductionChange={changeDeductions} onScoreChange={change} onSubmitCriterion={lock} submittingKey={submittingKey} sessionState={{contestantOrder:view.session?.entry_ids??[]}} simplified/>
   <footer className="v-native-submit-footer">
    <div className="v-native-submit-status" role="status">
     <strong>{pending?`Saving ${pending} draft${pending===1?'':'s'}`:view.submission?'Round submitted':'Drafts saved'}</strong>
     <span>{view.submission?'Wait for the organizer to open the next category.':view.scoringAvailable?'Lock every criterion for every contestant before submitting their scores.':lockedReason??'Drafts will sync when scoring is available.'}</span>
     {error&&<span className="v-error-text">{error}</span>}
    </div>
    <div className="v-native-submit-actions">
     {pending>0&&<Button variant="secondary" disabled={busy} onClick={()=>{for(const job of Object.values(queue.current))job.blocked=false;persist();void flush()}}>Retry saves</Button>}
     {Object.values(queue.current).some(job=>job.blocked)&&<Button variant="secondary" disabled={busy||view.session?.status!=='active'||!!view.submission} onClick={()=>{for(const [row,job] of Object.entries(queue.current)){if(job.action==='submit'){delete queue.current[row];continue}delete job.body;job.blocked=false;job.action='draft'}persist();void flush()}}>Review scores</Button>}
     <Button className="v-native-submit-button" disabled={busy||view.scoringAvailable===false||!!view.submission||view.session?.status!=='active'||!view.contestants.length||!view.contestants.every(e=>view.criteria.every(k=>e.lockedCriteria.includes(k.id)))} onClick={()=>setSubmitConfirmOpen(true)}>{view.submission?'Scores Submitted':'Submit Scores'}</Button>
    </div>
   </footer>
   <Modal open={submitConfirmOpen} onClose={()=>setSubmitConfirmOpen(false)} closeDisabled={busy} closeOnBackdrop={!busy} title="Submit scores for this round?" id="submit-scores-confirmation" size="sm" footer={<div className="flex justify-end gap-2"><Button variant="secondary" disabled={busy} onClick={()=>setSubmitConfirmOpen(false)}>Cancel</Button><Button loading={busy} disabled={busy} onClick={confirmSubmit}>{busy?'Submitting…':'Yes, Submit Scores'}</Button></div>}>
    <p className="text-sm text-v-text-muted">After submitting, you won’t be able to edit these scores unless the organizer reopens the round.</p>
   </Modal>
  </>}
 </div>
}

function NativeOrganizerLiveDashboard({eventId,eventName,event,choices,choice,selected,setSelected,views,tabulations,view,connected,busy,accessBusyKeys,error,notice,eventClosed,control,proceedToCategory,accessControl,reason,setReason,correctionJudge,setCorrectionJudge}) {
 const tabulationPath=`/organizer/competition/events/${eventId}/tabulation/overview?${new URLSearchParams({competitionId:choice.competitionId,...(choice.roundId?{roundId:choice.roundId}:{})})}`
 const [search,setSearch]=useState('')
 const isPageant=(event?.competitionType??event?.competition_type)?.toLowerCase()==='pageant'
 const [accessFilter,setAccessFilter]=useState('all')
 const [page,setPage]=useState(1)
 const [activity,setActivity]=useState([])
 const [activityError,setActivityError]=useState(null)
 const pageSize=8
 useEffect(()=>{
  let current=true
  const refreshActivity=()=>void service.activity(eventId).then(({data})=>{if(current){setActivity(data.activity??[]);setActivityError(null)}}).catch(error=>{if(current)setActivityError(message(error))})
  refreshActivity()
  const timer=setInterval(refreshActivity,30_000)
  return()=>{current=false;clearInterval(timer)}
 },[eventId,notice])
 const categories=[...new Map(choices.map(context=>[context.competitionId,context])).values()]
 const contextsFor=competitionId=>choices.filter(context=>context.competitionId===competitionId)
 const viewsFor=competitionId=>contextsFor(competitionId).map(context=>views[chooseKey(context)]).filter(Boolean)
 const tabsFor=competitionId=>contextsFor(competitionId).map(context=>tabulations[chooseKey(context)]).filter(Boolean)
 const allContexts=Object.values(views)
 const activeOther=allContexts.some(snapshot=>chooseKey(snapshot.context)!==chooseKey(choice)&&snapshot.session?.status==='active')
 const categoryLiveComplete=category=>{
  const contexts=contextsFor(category.competitionId)
  return contexts.length>0&&contexts.every(context=>{
   const snapshot=views[chooseKey(context)]
   return snapshot?.session?.status==='closed'&&snapshot.progress?.length>0&&snapshot.progress.every(judge=>judge.submitted)
  })
 }
 const categoryStatus=category=>{
  const snapshots=viewsFor(category.competitionId)
  const categoryTabs=tabsFor(category.competitionId)
  if(snapshots.some(snapshot=>snapshot.session?.status==='active'))return 'scoring'
  if(snapshots.some(snapshot=>snapshot.session?.status==='paused'))return 'paused'
  if(categoryTabs.length===contextsFor(category.competitionId).length&&categoryTabs.length>0&&categoryTabs.every(snapshot=>snapshot.calculation?.finalized))return 'finalized'
  if(categoryLiveComplete(category))return 'ready-to-tabulate'
  if(snapshots.some(snapshot=>snapshot.session?.status==='closed'))return 'awaiting-review'
  if(snapshots.some(snapshot=>snapshot.progress?.length&&snapshot.progress.every(judge=>judge.submitted)))return 'awaiting-review'
  return 'waiting'
 }
 const currentCategory=categories.find(category=>category.competitionId===choice.competitionId)
 const currentIndex=categories.findIndex(category=>category.competitionId===choice.competitionId)
 const priorComplete=currentIndex<=0||categories.slice(0,currentIndex).every(categoryLiveComplete)
 const currentCategoryComplete=!!currentCategory&&categoryLiveComplete(currentCategory)
 const nextCategory=categories.slice(currentIndex+1).find(category=>!categoryLiveComplete(category))??null
 const allCategoriesComplete=categories.length>0&&categories.every(categoryLiveComplete)
 const session=view?.session
 const entryAccess=session?.entry_access??{}
 const criterionAccess=session?.criterion_access??{}
 const contestants=view?.contestants??[]
 const criteria=view?.criteria??[]
 const accessibleCount=contestants.filter(contestant=>entryAccess[contestant.id]===true).length
 const judges=[...new Map(allContexts.flatMap(snapshot=>snapshot.progress??[]).map(judge=>[judge.judgeId,judge])).values()]
 const submissions=allContexts.flatMap(snapshot=>snapshot.progress??[])
 const submittedCount=submissions.filter(judge=>judge.submitted).length
 const allEntries=[...new Map(allContexts.flatMap(snapshot=>snapshot.contestants??[]).map(participant=>[participant.id,participant])).values()]
 const normalizedSearch=search.trim().toLocaleLowerCase()
 const filtered=contestants.filter(contestant=>{
  const open=entryAccess[contestant.id]===true
  return (!normalizedSearch||`${contestant.name} ${contestant.contestantNumber} ${contestant.id}`.toLocaleLowerCase().includes(normalizedSearch))&&(accessFilter==='all'||(accessFilter==='open')===open)
 })
 const pageCount=Math.max(1,Math.ceil(filtered.length/pageSize))
 const currentPage=Math.min(page,pageCount)
 const pageRows=filtered.slice((currentPage-1)*pageSize,currentPage*pageSize)
 const lockedCategory=!view||eventClosed||Boolean(activeOther)||!priorComplete||Boolean(view?.laterRoundBlocked)
 const selectedContextStatus=categoryStatus(currentCategory??choice)
 const selectedSubmitted=(view?.progress??[]).filter(judge=>judge.submitted).length
 const selectedJudges=(view?.progress??[]).length
 const allJudgesSubmitted=selectedJudges>0&&selectedSubmitted===selectedJudges
 const waitingJudges=Math.max(0,selectedJudges-selectedSubmitted)
 const fmtDate=value=>value?new Date(value).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}):'Schedule not set'
 const statusLabel=status=>({
  scoring:'Scoring',paused:'Paused','awaiting-review':'Awaiting review','ready-to-tabulate':'Ready to tabulate',finalized:'Finalized',waiting:'Waiting',
 }[status]??status)
 const statusClass=status=>`v-live-status v-live-status-${status}`
 const openAccess=async contestant=>{
  const isOpen=entryAccess[contestant.id]===true
  if(isOpen&&session?.status==='active'&&!window.confirm(`Close judge scoring access for ${contestant.name}? Existing scores will be kept, but judges can no longer add or change this participant's scores.`))return
  await accessControl('entry',contestant.id,!isOpen)
 }
 const openCriterionAccess=async criterion=>{
  const isOpen=criterionAccess[criterion.id]===true
  if(isOpen&&session?.status==='active'&&!window.confirm(`Close judge scoring access for ${criterion.name}? Existing scores will be kept, but judges can no longer add or change scores for this criterion.`))return
  await accessControl('criterion',criterion.id,!isOpen)
 }
 const closeScoring=async()=>{
  if(!allJudgesSubmitted)return
  if(!window.confirm(`Close scoring for ${choice.competitionName}? Scores will be preserved and remain available for later tabulation.`))return
  await control('close')
 }
 const openCategory=async()=>{
  if(lockedCategory||session)return
  await control('start')
 }
 const selectCategory=category=>{
  const target=contextsFor(category.competitionId)[0]
  if(target)setSelected(chooseKey(target))
 }

 return <main className="v-native-live-dashboard">
  <header className="v-native-live-topbar">
   <div className="v-native-live-brand"><span className="v-native-live-mark">V</span><div><strong>{eventName||'Competition Live Control'}</strong><span>Organizer Live Control</span></div></div>
   <div className="v-native-live-top-status"><span className={`v-live-connect-dot ${connected?'is-connected':''}`}/>{connected?'Live updates connected':'Reconnecting to live updates'}</div>
  </header>
  <div className="v-native-live-event">
   {event?.banner&&<img className="v-native-live-banner" src={event.banner} alt=""/>}
   <div className="v-native-live-event-info">
    <h1>{eventName||'Competition event'}</h1>
    <p><CalendarDays aria-hidden/>{fmtDate(event?.start_date)}{event?.end_date?` – ${new Date(event.end_date).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'})}`:''}</p>
   </div>
   <span className={statusClass(eventClosed?'closed':event?.status==='scheduled'?'scheduled':'ongoing')}>{event?.status==='scheduled'?'Event scheduled':eventClosed?'Event read only':'Event ongoing'}</span>
   <Link className="v-native-live-back" to="/organizer/competition/events">Competition events</Link>
  </div>
  {error&&<p className="v-native-live-alert" role="alert">{error}</p>}
  {notice&&<p className="v-native-live-notice" role="status"><Check aria-hidden/>{notice}</p>}
  <section className="v-native-live-metrics" aria-label="Event overview">
   <Metric icon={Trophy} label="Categories" value={categories.length}/>
   <Metric icon={Users} label="Participants" value={allEntries.length}/>
   <Metric icon={Shield} label="Assigned judges" value={judges.length}/>
   <Metric icon={Check} label="Judge submissions" value={`${submittedCount}/${submissions.length}`}/>
   <Metric icon={Clock3} label="Categories finalized" value={`${categories.filter(category=>categoryStatus(category)==='finalized').length}/${categories.length}`}/>
  </section>
  <nav className="v-native-live-category-strip" aria-label="Competition categories">
   {categories.map((category,index)=>{
    const status=categoryStatus(category),active=category.competitionId===choice.competitionId
    return <button key={category.competitionId} type="button" className="v-native-live-category" data-active={active} onClick={()=>selectCategory(category)}>
     <span className="v-native-live-category-index">{index+1}</span><span className="v-native-live-category-text"><strong>{category.competitionName}</strong><small>{statusLabel(status)}</small></span><span className={statusClass(status)}/></button>
   })}
  </nav>
  <div className="v-native-live-layout">
   <section className="v-native-live-main">
    <div className="v-native-live-card">
     <div className="v-native-live-section-head">
      <div><h2>Participants</h2><p>Manage judge scoring access for this category and round.</p></div>
      <div className="v-native-live-toolbar">
       <label className="v-native-live-search"><Search aria-hidden/><span className="sr-only">Search participants</span><input value={search} onChange={event=>{setSearch(event.target.value);setPage(1)}} placeholder="Search participants…"/></label>
       <label className="v-native-live-filter"><Filter aria-hidden/><span className="sr-only">Filter scoring access</span><select value={accessFilter} onChange={event=>{setAccessFilter(event.target.value);setPage(1)}}><option value="all">All access</option><option value="open">Open for scoring</option><option value="closed">Scoring access closed</option></select></label>
      </div>
     </div>
     <div className="v-native-live-controls">
      <label>Category / round<select aria-label="Selected category and round" value={selected} onChange={event=>setSelected(event.target.value)}>{choices.map(context=><option key={chooseKey(context)} value={chooseKey(context)}>{context.competitionName} · {context.roundName}</option>)}</select></label>
      <span className={statusClass(selectedContextStatus)}>{statusLabel(selectedContextStatus)}</span>
      <span className="v-native-live-count">{accessibleCount} of {contestants.length} participants open for judge scoring</span>
     </div>
     {view?.deductionSettings&&<p className="v-caption">{DEDUCTION_LABELS[view.deductionSettings.mode]}. {view.deductionSettings.mode==='judge'?'Deductions lock and submit with judge scores. Reopening a score requires a fresh submission.':view.deductionSettings.mode==='organizer'?'Record organizer deductions in Tabulation after the judge sheets are complete.':'No deduction controls are enabled for this round.'}</p>}
     <div className="v-native-live-table-wrap">
      <table className="v-native-live-table">
       <thead><tr><th>#</th><th>Participant</th><th>Participant ID</th><th>Status</th><th>Judge scoring access</th><th>Action</th></tr></thead>
       <tbody>
        {pageRows.map(contestant=>{
         const scoringOpen=entryAccess[contestant.id]===true
         const accessBusy=accessBusyKeys.has(`entry:${contestant.id}`)
         return <tr key={contestant.id}>
          <td className="v-native-live-number">{contestant.contestantNumber}</td>
          <td><div className="v-native-live-person">{contestant.photo?<img src={contestant.photo} alt=""/>:<span className="v-native-live-avatar">{contestant.name?.trim()?.[0]?.toUpperCase()??'?'}</span>}<strong>{contestant.name}</strong></div></td>
          <td><code title={contestant.id}>{contestant.id.slice(0,8)}</code></td>
          <td><span className={statusClass(scoringOpen?'scoring':'waiting')}>{scoringOpen?'Ready':'Waiting'}</span></td>
          <td><span className={`v-native-live-access ${scoringOpen?'is-open':''}`}>{scoringOpen?'Open':'Closed'}</span></td>
          <td><button type="button" className={`v-native-live-row-action ${scoringOpen?'is-close':''} ${accessBusy?'is-loading':''}`} disabled={busy||accessBusy||!session||session.status==='closed'||eventClosed} aria-label={accessBusy?`Updating scoring access for ${contestant.name}`:`${scoringOpen?'Close':'Open'} scoring for ${contestant.name}`} title={scoringOpen?'Close judge scoring access for this participant':'Open judge scoring access for this participant'} onClick={()=>void openAccess(contestant)}>{accessBusy&&<span className="v-native-live-action-spinner" aria-hidden="true"/>}{accessBusy?'Saving…':scoringOpen?'Close scoring':'Open for scoring'}</button></td>
         </tr>
        })}
        {!pageRows.length&&<tr><td colSpan={6} className="v-native-live-empty">{contestants.length?'No participants match your search or filter.':'No participants are assigned to this category and round.'}</td></tr>}
       </tbody>
      </table>
     </div>
     <div className="v-native-live-table-footer"><span>Showing {filtered.length?((currentPage-1)*pageSize+1):0}–{Math.min(currentPage*pageSize,filtered.length)} of {filtered.length} participants</span><div><button type="button" aria-label="Previous page" disabled={currentPage===1} onClick={()=>setPage(currentPage-1)}><ChevronLeft aria-hidden/></button><span>{currentPage} / {pageCount}</span><button type="button" aria-label="Next page" disabled={currentPage===pageCount} onClick={()=>setPage(currentPage+1)}><ChevronRight aria-hidden/></button></div></div>
    </div>
    <section className="v-native-live-card" aria-labelledby="v-native-live-criteria-title">
     <div className="v-native-live-section-head">
      <div><h2 id="v-native-live-criteria-title">Major criteria</h2><p>Open or close judge scoring for each criterion in the selected category and round. A judge locks a major criterion per participant; that lock covers all score inputs under it.</p></div>
     </div>
     <div className="v-native-live-criteria-table-wrap">
      <table className="v-native-live-criteria-table">
       <caption className="sr-only">Major criterion scoring access and judge lock progress for the selected category and round.</caption>
       <thead><tr><th scope="col">Major criterion</th><th scope="col">Weight</th><th scope="col">Judge scoring</th><th scope="col">Participant locks</th><th scope="col">Judges complete</th><th scope="col">Action</th></tr></thead>
       <tbody>
        {criteria.map(criterion=>{
         const scoringOpen=criterionAccess[criterion.id]===true
         const hasLockProgress=Number.isInteger(criterion.lockedCount)&&Number.isInteger(criterion.requiredCount)
         const accessBusy=accessBusyKeys.has(`criterion:${criterion.id}`)
         return <tr key={criterion.id}>
          <th scope="row">{criterion.name}</th>
          <td>{criterion.percentage}%</td>
          <td><span className={statusClass(scoringOpen?'scoring':'waiting')}>{scoringOpen?'Open':'Closed'}</span></td>
          <td>{hasLockProgress?`${criterion.lockedCount}/${criterion.requiredCount} locked`:session?'Unavailable':'No session'}</td>
          <td>{hasLockProgress?(criterion.judgeCount===0?'No judges assigned':`${criterion.lockedJudgeCount??0}/${criterion.judgeCount} complete`):session?'Unavailable':'No session'}</td>
          <td><button type="button" className={`v-native-live-row-action ${scoringOpen?'is-close':''} ${accessBusy?'is-loading':''}`} disabled={busy||accessBusy||!session||session.status==='closed'||eventClosed} aria-label={accessBusy?`Updating scoring access for ${criterion.name}`:`${scoringOpen?'Close':'Open'} scoring for ${criterion.name}`} onClick={()=>void openCriterionAccess(criterion)}>{accessBusy&&<span className="v-native-live-action-spinner" aria-hidden="true"/>}{accessBusy?'Saving…':scoringOpen?'Close scoring':'Open for scoring'}</button></td>
         </tr>
        })}
        {!criteria.length&&<tr><td colSpan={6} className="v-native-live-empty">No major criteria are configured for this category and round.</td></tr>}
       </tbody>
      </table>
     </div>
     {(!session||session.status==='closed')&&<p className="v-native-live-explainer">Start scoring before changing criterion access.</p>}
    </section>
    <div className="v-native-live-card v-native-live-access-note">
     <div><h3>Performer access</h3><p>Native competition setup currently has no separate performer access control. The participant controls above affect <strong>judge scoring access only</strong>; they do not open or close a performer login or performance workflow.</p></div>
     <span className="v-live-status v-live-status-waiting">Not available in this workflow</span>
    </div>
   </section>
   <aside className="v-native-live-sidebar">
    <section className="v-native-live-card">
     <div className="v-native-live-side-title"><h2>Live Control Panel</h2><span className={statusClass(session?.status==='active'?'scoring':session?.status==='paused'?'paused':'waiting')}>{session?.status==='active'?'Scoring live':session?.status==='paused'?'Paused':'Waiting'}</span></div>
     <div className="v-native-live-current"><span>Current category</span><strong>{choice.competitionName}</strong><RoundNavigation ariaLabel="Live control rounds" contexts={contextsFor(choice.competitionId)} selected={selected} onSelect={setSelected} statusFor={context=>{const roundView=views[chooseKey(context)];return roundView?.laterRoundBlocked?'closed':roundView?.session?.status??context.state}} isDisabled={(context,index)=>isPageant&&index>0&&views[chooseKey(context)]?.laterRoundBlocked!==false}/><p>{selectedSubmitted} of {selectedJudges} judges submitted</p></div>
     <div className="v-native-live-buttons">
      {!session&&<button type="button" disabled={busy||lockedCategory} title={!view?'Loading the selected round':activeOther?'Close scoring in the currently active category first':!priorComplete?'Finish live scoring and close previous categories before opening this category':view?.laterRoundBlocked?'Confirm qualification for this round before opening it.':undefined} onClick={()=>void openCategory()}>{busy?'Opening…':choice.roundId?`Open ${choice.roundName} scoring`:'Open Category'}</button>}
      {session?.status==='active'&&<><button type="button" className="secondary" disabled={busy||eventClosed} onClick={()=>void control('pause')}>Pause scoring</button><button type="button" className="danger" disabled={busy||eventClosed||!allJudgesSubmitted} title={!allJudgesSubmitted?(selectedJudges?`Waiting for ${waitingJudges} judge${waitingJudges===1?'':'s'} to submit.`:'No required judges are assigned to this category and round.'):undefined} onClick={()=>void closeScoring()}>{busy?'Closing…':`Close ${choice.competitionName}`}</button></>}
      {session?.status==='paused'&&<><button type="button" disabled={busy||eventClosed} onClick={()=>void control('resume')}>Resume scoring</button><button type="button" className="danger" disabled={busy||eventClosed||!allJudgesSubmitted} title={!allJudgesSubmitted?(selectedJudges?`Waiting for ${waitingJudges} judge${waitingJudges===1?'':'s'} to submit.`:'No required judges are assigned to this category and round.'):undefined} onClick={()=>void closeScoring()}>{busy?'Closing…':`Close ${choice.competitionName}`}</button></>}
      {session?.status==='closed'&&<p>Scoring is closed. Submissions are preserved; review and finalize results in Tabulation.</p>}
      {session?.status==='active'&&!allJudgesSubmitted&&<p role="status">Waiting for {selectedJudges?`${waitingJudges} judge${waitingJudges===1?'':'s'} to submit.`:'required judges to be assigned.'}</p>}
      {session?.status==='active'&&allJudgesSubmitted&&<p role="status">All required judges have submitted. Close this category to continue.</p>}
      {session?.status==='closed'&&currentCategoryComplete&&nextCategory&&<div className="v-native-live-progression" role="status"><strong>{choice.competitionName} closed — {selectedSubmitted}/{selectedJudges} judges submitted.</strong><span>Scores are saved and ready for later tabulation.</span><button type="button" disabled={busy||eventClosed||activeOther} onClick={()=>void proceedToCategory(contextsFor(nextCategory.competitionId)[0])}>{busy?`Opening ${nextCategory.competitionName}…`:`Proceed to ${nextCategory.competitionName} →`}</button></div>}
      {session?.status==='closed'&&allJudgesSubmitted&&<div className="v-native-live-progression" role="status"><strong>{choice.roundName} scoring is closed.</strong><span>Scores calculate automatically. Review and finalize this round in Tabulation, then confirm the proposed qualifiers before opening the next round.</span><Link to={tabulationPath}>{choice.roundId?`Go to ${choice.roundName} Tabulation`:'Go to Tabulation'} &rarr;</Link></div>}
      {!session&&lockedCategory&&<p>{!view?'Loading the selected round.':activeOther?'Another category or round is currently scoring. Close it before opening this one.':!priorComplete?'Complete and close previous categories after all required judges submit before opening this category.':eventClosed?'This event is read only.':'Category unavailable.'}</p>}
      {allCategoriesComplete&&<div className="v-native-live-progression" role="status"><strong>All Competition Categories Completed</strong><span>All live scoring sessions are closed. Scores are ready for tabulation.</span></div>}
     </div>
     <p className="v-native-live-explainer">Closing scoring preserves all submitted work. It does not finalize results or advance contestants.</p>
    </section>
    <section className="v-native-live-card">
     <div className="v-native-live-side-title"><h2>Category Queue</h2><span>{categories.length} total</span></div>
     <ol className="v-native-live-queue">{categories.map((category,index)=>{
      const state=categoryStatus(category),active=category.competitionId===choice.competitionId
      const isNext=index===currentIndex+1
      return <li key={category.competitionId} data-active={active}><span className="v-native-live-queue-number">{index+1}</span><div><strong>{category.competitionName}</strong><small>{statusLabel(state)}{isNext&&state==='waiting'?' · Next after finalization':''}</small></div><button type="button" disabled={busy||eventClosed||state==='scoring'} onClick={()=>selectCategory(category)} aria-label={`View ${category.competitionName}`}>View</button></li>
     })}</ol>
    </section>
    <section className="v-native-live-card">
     <h2 className="v-native-live-quick-title">Quick Actions</h2>
     <div className="v-native-live-quick-links">
      <Link to={tabulationPath}><Trophy aria-hidden/>Results & tabulation</Link>
      <Link to={`/organizer/competition/events/${eventId}/judges`}><Users aria-hidden/>Judge management</Link>
      <Link to={`/organizer/competition/events/${eventId}/workspace`}><Shield aria-hidden/>Category rules</Link>
      <Link to={`/organizer/competition/events/${eventId}/edit`}><Settings2 aria-hidden/>Event settings</Link>
     </div>
     <p className="v-native-live-explainer">Independent categories advance after all assigned judges submit and the organizer closes live scoring. Finalization and publication can happen later in Tabulation. Qualification rules for later rounds remain in effect.</p>
    </section>
    <section className="v-native-live-card">
     <div className="v-native-live-side-title"><h2>Recent activity</h2><span>Latest 25</span></div>
     {activityError?<p className="v-native-live-explainer" role="alert">{activityError}</p>:activity.length?<ol className="v-native-live-activity">{activity.slice(0,8).map((item,index)=><li key={`${item.createdAt}:${index}`}><span className="v-native-live-activity-mark"><Check aria-hidden/></span><div><strong>{activityLabel(item.action)}</strong><small>{item.competitionName} · {item.roundName} · {item.actorId.slice(0,8)}</small><time>{new Date(item.createdAt).toLocaleString()}</time></div></li>)}</ol>:<p className="v-native-live-explainer">No audited scoring activity has been recorded for this event yet.</p>}
    </section>
    {view?.session&&<section className="v-native-live-card">
     <h2 className="v-native-live-quick-title">Audited correction</h2>
     <label className="v-native-live-field">Reason<input value={reason} onChange={event=>setReason(event.target.value)} placeholder="Explain the correction"/></label>
     <label className="v-native-live-field">Judge<select value={correctionJudge} onChange={event=>setCorrectionJudge(event.target.value)}><option value="">Reopen session only</option>{view.progress?.map(judge=><option key={judge.judgeId} value={judge.judgeId}>{judge.judgeName??judge.judgeId}</option>)}</select></label>
     <p className="v-native-live-explainer">Reopening preserves submitted history, pauses scoring, and may require affected judges to submit again.</p>
     <button type="button" className="v-native-live-row-action" disabled={busy||eventClosed||reason.trim().length<5} onClick={()=>void control('reopen',{reason,judgeId:correctionJudge||null,acknowledged:true})}>Confirm audited reopen</button>
    </section>}
   </aside>
  </div>
 </main>
}

function Metric({icon:Icon,label,value}) {
 return <div className="v-native-live-metric"><span><Icon aria-hidden/></span><div><small>{label}</small><strong>{value}</strong></div></div>
}

function activityLabel(action) {
 return ({start:'Scoring session opened',pause:'Scoring paused',resume:'Scoring resumed',close:'Scoring session closed',access:'Judge scoring access changed',reopen:'Audited scoring correction',draft:'Judge draft saved',lock:'Criterion score locked',submit:'Judge submitted round'})[action]??'Scoring activity'
}
