import {useRef} from 'react'
import {Link} from 'react-router-dom'
import {CheckCircle2} from 'lucide-react'
import Button from '@/components/ui/Button'
import {stagePath} from '@/utils/eventStages'
import {participationFor} from '../../../../../shared/competition-participation.js'
import {buildParticipationState} from '../../../../../shared/competition-participation-state.js'

const phases={no_entries:'No registered entries',no_source_entries:'No source-round entries',awaiting_source_progression:'Waiting for source-round progression',awaiting_results:'Awaiting results',awaiting_tabulation:'Awaiting tabulation',awaiting_verification:'Awaiting verification',awaiting_approval:'Awaiting advancement approval',qualification_confirmed:'Qualification confirmed',no_qualifying_entries:'No qualifying entries',no_eligible_entries:'No eligible entries remain',unavailable:'Participation status unavailable',invalid_progression:'Round progression needs review'}
const scoring={not_open:'Not yet open',open:'Open',partly_open:'Open for selected entries or criteria',paused:'Paused',closed:'Round closed for scoring',unavailable:'Scoring status unavailable'}
export default function CompetitionRoundParticipation({eventId,foundation,rounds,selectedRoundId,onSelect,readOnly,blocked,selectedCount,canAdd,canRemove,onAssign,onRemove,onViewQualified,loadError}){
  const recordRef=useRef(null),saved=foundation ?? {},p=participationFor(saved,selectedRoundId)
  const state=p.summary ?? buildParticipationState(saved,{known:!saved.event?.official_rules_id}).rounds[selectedRoundId]
  const source=p.sources[0],workspace=stagePath('competition','workspace',eventId)
  const settingsUrl=source?`${workspace}?${new URLSearchParams({tab:'rounds',section:'advancement',roundId:source.id})}`:workspace
  const awaiting=state?.phase==='awaiting_results'?`Awaiting ${source?.name ?? 'source-round'} results`:phases[state?.phase]
  return <section className="v-card min-w-0 space-y-4 p-4 sm:p-5" aria-label="Round Participation">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-v-text">Round Participation</h3>{!loadError&&<span className="text-xs text-v-text-subtle">{saved.contestants?.length ?? 0} registered entries</span>}</div>
    {loadError?<p role="status" className="text-sm text-v-text-muted">Failed to load participation data. Reload saved entries to see current participation.</p>:!rounds.length?<p className="text-sm text-v-text-muted">No rounds configured. Registered eligible entries use the event-wide scoring scope.</p>:<>
      <div className="flex flex-wrap gap-2" aria-label="Select participation round">{rounds.map(r=><button key={r.id} type="button" aria-pressed={r.id===selectedRoundId} onClick={()=>onSelect(r.id)} className={`rounded-lg border px-3 py-2 text-sm ${r.id===selectedRoundId?'border-v-primary bg-v-primary/10 text-v-text':'border-v-border text-v-text-muted'}`}>{r.name}</button>)}</div>
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-v-text">{selectedRoundId===rounds[0]?.id?'Initial Round Assignment':p.round?.name}</h4>
        {p.mode==='all_continue'?<>
          <p className="flex items-center gap-2 text-sm font-medium text-v-text"><CheckCircle2 className="h-4 w-4 text-v-success" aria-hidden="true"/>All eligible contestants continue</p>
          <p className="text-sm text-v-text-muted">{state?.plannedEntryIds.length ?? p.plannedIds.length} planned entries</p>
          <p className="text-xs leading-relaxed text-v-text-subtle">No elimination is configured. Eligible {source?.name} participants continue to {p.round?.name} according to the event's round sequence. Live Control opens judging separately.</p>
          {state?.phase!=='all_continue'&&<p className="text-sm text-v-text-muted">{awaiting}{state?.phase==='awaiting_source_progression'?` in ${source?.name}`:''}</p>}
          <Link className="inline-block text-xs text-v-primary underline" to={settingsUrl}>View Round Progression</Link>
        </>:p.protected?<>
          <p className="text-sm font-medium text-v-text" role="status">{awaiting}</p>
          <p className="text-sm text-v-text-muted">Qualification rule: {state?.ruleLabel ?? ''} from {source?.name}</p>
          {state?.phase!=='unavailable'&&state?.phase!=='invalid_progression'&&<p className="text-sm text-v-text-muted">Confirmed {p.round?.purpose==='final'?'finalists':'qualifiers'}: {p.decision?.qualifiers?.length ?? 0}</p>}
          {p.decision?<>
            <p className="text-xs text-v-text-subtle">Source: {source?.name}. Advancement approved. {p.assignedIds.length} eligible for this round's scoring scope.</p>
            <div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={onViewQualified}>View Qualified Entries</Button><Button size="sm" variant="secondary" onClick={()=>{recordRef.current.open=!recordRef.current.open;recordRef.current.scrollIntoView?.({block:'nearest'})}}>View Advancement Record</Button></div>
            <details ref={recordRef} className="rounded-lg border border-v-border p-3 text-xs"><summary className="cursor-pointer font-medium text-v-text">Approved advancement record</summary><dl className="mt-3 grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2"><dt>Decision</dt><dd className="break-all">{p.decision.id}</dd><dt>Calculation source</dt><dd className="break-all">{p.decision.calculation_id}</dd><dt>Rules version</dt><dd className="break-all">{p.decision.rules_version}</dd><dt>Selection</dt><dd>{p.decision.selection_basis==='manual'?'Approved manual selection':p.decision.selection_basis==='automatic'?'Automatic rule':'Historical approved decision'}</dd><dt>Confirmed</dt><dd>{p.decision.confirmed_at ?? 'Recorded in the advancement decision'}</dd><dt>Reason</dt><dd className="break-words">{p.decision.reason || 'No additional reason recorded'}</dd></dl></details>
          </>:<>
            <p className="text-xs leading-relaxed text-v-text-subtle">{p.round?.purpose==='final'?'Finalists':'Qualifiers'} will be determined after {saved.scoringConfig?.calculationMethod==='manual'?'recorded official placements are independently verified':'required judges submit and tabulation is verified'}, and advancement is approved. Registration and planned memberships do not authorize {p.round?.name} scoring.</p>
            {p.storedIds.length>0&&<details className="text-xs text-v-text-subtle"><summary className="cursor-pointer">View {p.storedIds.length} saved planned entries — unqualified</summary><p className="mt-2">{foundation.contestants.filter(e=>p.storedIds.includes(e.id)).map(e=>e.name).join(', ')}</p></details>}
          </>}
          <div className="flex flex-wrap gap-3 text-xs"><Link className="text-v-primary underline" to={settingsUrl}>View Advancement Rules</Link>{readOnly&&<Link className="text-v-primary underline" to={stagePath('competition','tabulation',eventId)}>Review advancement in Tabulation</Link>}</div>
        </>:<>
          <p className="text-sm text-v-text-muted">{p.assignedIds.length} entries assigned to {p.round?.name}</p>
          {!saved.contestants?.length&&<p className="text-xs text-v-text-subtle">No registered entries. Register entries before assigning this round.</p>}
          {readOnly?<p className="text-xs text-v-text-subtle">Saved round assignments are locked after publication.</p>:<><p className="text-xs text-v-text-subtle">Select eligible rows, then assign or remove them from this round.</p><div className="flex flex-wrap gap-2"><Button size="sm" disabled={blocked||!canAdd} onClick={onAssign}>Assign Selected</Button><Button size="sm" variant="secondary" disabled={blocked||!canRemove} onClick={onRemove}>Remove Selected</Button><span className="self-center text-xs text-v-text-subtle">{selectedCount} selected</span></div></>}
        </>}
        <p className="border-t border-v-border pt-3 text-xs text-v-text-muted">Scoring status: {scoring[state?.scoringStatus] ?? scoring.unavailable}</p>
        {p.managed&&!readOnly&&<p className="text-xs text-v-text-subtle">Manage the source-round field and saved progression rule. Ordinary destination assignment is unavailable.</p>}
      </div>
    </>}
  </section>
}
