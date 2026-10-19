import { useCallback, useEffect, useRef, useState } from 'react'
import useCompetitionSync from '@/hooks/useCompetitionSync'
import useLatestRequest from '@/hooks/useLatestRequest'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useAuth } from '@/hooks/useAuth'
import { workflowService } from '@/services/competition-workflow.service'
import Button from '@/components/ui/Button'
export default function CompetitionReviewer({eventId}){
 const {user}=useAuth()
 const[data,setData]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false)
 const mutationPending=useRef(false)
 const beginRequest=useLatestRequest(`${eventId}:${user?.id}`)
 const load=useCallback(async()=>{
  const isCurrent=beginRequest()
  try{const response=await workflowService.review(eventId);if(isCurrent()){setData(response.data);setError('')}}
  catch(e){if(isCurrent())setError(e.response?.data?.message??'Reviewer access unavailable')}
  finally{if(isCurrent())setLoading(false)}
 },[eventId,beginRequest])
 useEffect(()=>{setData(null);setLoading(true);void load()},[load])
 const{connected,recovering}=useCompetitionSync(eventId,load)
 const action=async(fn)=>{
  if(mutationPending.current)return
  const reason=window.prompt('Verification reason / evidence')?.trim();if(!reason)return
  mutationPending.current=true;setBusy(true)
  try{await fn(reason);await load()}catch(e){setError(e.response?.data?.message??'Approval failed')}
  finally{mutationPending.current=false;setBusy(false)}
 }
 return <section className="v-card p-6 space-y-4"><h2 className="v-section-title">Independent verification</h2><p role="status" className="v-caption">{connected?recovering?'Updating verification state?':'Live updates connected':'Live updates interrupted; checking verification state every 15 seconds.'}</p>{loading&&!data&&<LoadingSpinner/>}{error&&<p role="alert">{error} <Button variant="secondary" onClick={load}>Retry reviewer access</Button></p>}{data&&<><p>Official method: {data.rules.scoringConfig.calculationMethod} · {data.ready?'Sources complete':'Sources incomplete'}</p><div className="overflow-x-auto"><table className="v-table"><thead><tr><th>Entry</th><th>Judge total</th><th>Major breakdown</th></tr></thead><tbody>{data.worksheets.map(w=><tr key={`${w.roundId}:${w.judgeId}:${w.entryId}`}><td>{data.rules.contestants.find(e=>e.id===w.entryId)?.name}</td><td>{w.total??'Missing'}</td><td>{w.criteria.map(c=>`${c.name}: ${c.contribution}`).join(' · ')}</td></tr>)}</tbody></table></div>{data.deductions.filter(d=>d.decision_status==='pending').map(d=><div key={d.id}><span>{d.reason} · {d.amount} · {d.evidence}</span><Button disabled={busy} onClick={()=>action(reason=>workflowService.approve(eventId,{kind:'deduction',id:d.id,reason}))}>Approve predefined deduction</Button><Button disabled={busy} variant="secondary" onClick={()=>action(reason=>workflowService.approve(eventId,{kind:'deduction-reject',id:d.id,reason}))}>Reject report</Button></div>)}{data.eligibility.filter(d=>d.status==='pending').map(d=><div key={d.id}><span>Non-competing: {d.reason}</span><Button disabled={busy} onClick={()=>action(reason=>workflowService.approve(eventId,{kind:'eligibility',id:d.id,reason}))}>Approve eligibility decision</Button><Button disabled={busy} variant="secondary" onClick={()=>action(reason=>workflowService.approve(eventId,{kind:'eligibility-reject',id:d.id,reason}))}>Reject report</Button></div>)}{(data.amendments??[]).filter(a=>a.status==='pending').map(a=><div key={a.id}><p>Rules amendment: {a.reason}. Approval invalidates old submissions and requires rejudging.</p><p>Proposed method: {a.proposed_config.calculationMethod}. Scoring panel: {(a.proposed_config.scoringJudgeIds??data.rules.judges.filter(j=>j.role!=='score_reviewer').map(j=>j.judgeId)).map(id=>data.rules.judges.find(j=>j.judgeId===id)?.displayName??'Judge').join(', ')}</p><Button disabled={busy} onClick={()=>action(reason=>workflowService.approveAmendment(eventId,{id:a.id,reason}))}>Approve acknowledged amendment</Button></div>)}{data.calculations.filter(c=>c.status==='ready_for_verification').map(c=><div key={c.id} className="v-card p-3"><p>Calculation {c.created_at} · Rules version {data.rules.version}</p><pre className="text-xs overflow-auto">{JSON.stringify(c.result_snapshot,null,2)}</pre><Button disabled={busy} onClick={()=>action(reason=>workflowService.reviewerVerify(eventId,c.id,{reason}))}>Verify calculation independently</Button></div>)}</>}</section>
}
