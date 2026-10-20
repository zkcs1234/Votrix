import {useCallback,useEffect,useRef,useState} from 'react'
import {Link,useParams,useLocation,useSearchParams} from 'react-router-dom'
import {Check, ChevronRight, Link2, Pencil, Search, Trash2, Trophy, UserPlus, Users, ShieldCheck} from 'lucide-react'
import {nativeCompetitionService as service} from '@/services/competition-native.service'
import {pageantService} from '@/services/pageant.service'
import {fetchCompetitionSetupData, invalidateCompetitionSetupData, setCompetitionSetupData} from '@/services/competition-setup-cache'
import CompetitionCreationReview from './CompetitionCreationReview'
import StageFooter from '@/components/ui/StageFooter'
import RoundsScoringEditor from './RoundsScoringEditor'
import {setupReadiness} from '../../../../../shared/competition-setup-readiness.js'
import Button from '@/components/ui/Button'
import {competitionScoringReady} from '../../../../../shared/competition-creation-flow.js'
import {INPUT_CLASS} from '@/utils/uiClasses'

const message=e=>e.response?.data?.message??e.message??'Unable to load competition setup'
const blank=()=>({structure:'single',rounds:[],criteria:[],scoringConfig:{calculationMethod:'weighted_average',criterionBasis:'percentage',minorWeightBasis:'overall',tiePolicy:'shared',decimalPlaces:2,defaultMinScore:1,defaultMaxScore:10,deductionMode:'none',deductionRules:[]}})
const convertLegacyMinorWeights=configuration=>{
 if(configuration?.scoringConfig?.minorWeightBasis==='overall')return {configuration,converted:false}
 const converted=structuredClone(configuration)
 let changed=false
 converted.criteria=(converted.criteria??[]).map(criterion=>{
  const minors=criterion.minorCriteria??[]
  if(!minors.some(minor=>minor.percentage!==undefined))return criterion
  changed=true
  return {...criterion,minorCriteria:minors.map(minor=>({...minor,percentage:Number(minor.percentage)*Number(criterion.percentage)/100}))}
 })
 converted.scoringConfig={...converted.scoringConfig,minorWeightBasis:'overall'}
 return {configuration:converted,converted:changed}
}
const name=j=>j.displayName||[j.firstName,j.lastName].filter(Boolean).join(' ')||j.email||j.id

// Disabled builds make no native request; mapped legacy setups keep their page.
export function NativeSetupBoundary({Legacy}){
 const {eventId}=useParams(),location=useLocation(),[state,setState]=useState(null),[legacy,setLegacy]=useState(false),[attempt,setAttempt]=useState(0)
 useEffect(()=>{
  if(import.meta.env.VITE_COMPETITION_NATIVE_SETUP_ENABLED!=='true')return
  let alive=true;setState(null);setLegacy(false);const started=performance.now()
  fetchCompetitionSetupData(eventId,'competitions',()=>service.list(eventId)).then(({data})=>{if(import.meta.env.DEV)console.debug('[competition-setup] boundary list',Math.round(performance.now()-started),'ms');if(alive)setState(data)}).catch(e=>{if(import.meta.env.DEV)console.debug('[competition-setup] boundary list failed',Math.round(performance.now()-started),'ms');if(alive)setState({error:message(e)})})
  return()=>{alive=false}
 },[eventId,attempt])
 if(import.meta.env.VITE_COMPETITION_NATIVE_SETUP_ENABLED!=='true')return <Legacy/>
 if(!state)return <p role="status">Loading competition setup…</p>
 if(state.error)return <div><p role="alert">{state.error}</p><Button onClick={()=>setAttempt(n=>n+1)}>Retry setup</Button></div>
 const children=state.competitions??[]
 if(legacy&&children.length===0||children.length===1&&children[0].origin==='legacy'&&state.legacyMapping)return <Legacy/>
 if(location.pathname.endsWith('/review'))return <CompetitionCreationReview key={eventId} eventId={eventId}/>
 const stage=location.pathname.endsWith('/contestants')?'contestants':location.pathname.endsWith('/judges')?'judges':'workspace'
 return <><NativeSetupWorkspace key={`${eventId}:${stage}`} stage={stage} eventId={eventId} initialChildren={children}/>{children.length===0&&<Button variant="secondary" onClick={()=>setLegacy(true)}>Use existing legacy setup</Button>}</>
}

function ContestantsStep({event,eventId,children,selected,view,entries,masters,used,masterNumber,setMasterNumber,editable,busy,dirty,run,service,pageantService,divisions,editingEntry,setEditingEntry,onBack,onProceed}) {
 const pageant=event?.competitionType==='pageant'||event?.competition_type==='pageant'||event?.eventType==='pageant'||event?.event_type==='pageant'
 const [nameValue,setNameValue]=useState(''),[category,setCategory]=useState(''),[photo,setPhoto]=useState(null),[query,setQuery]=useState(''),[reuseOpen,setReuseOpen]=useState(false),[picked,setPicked]=useState([])
 const [divisionNumber,setDivisionNumber]=useState(null),[numberLoading,setNumberLoading]=useState(false),[numberError,setNumberError]=useState('')
 const numberRequest=useRef(0)
 const categories=divisions?.length?divisions:event?.divisions??event?.categories??[]
 const available=masters.filter(m=>!used.has(m.id)&&(!query.trim()||String(m.name).toLowerCase().includes(query.trim().toLowerCase())))
 const current=children.find(c=>c.id===selected)
 const configured=Boolean(view?.configuration&&view.criteriaReadiness?.allReady)
 const arrangedEntries=pageant?[...entries].sort((left,right)=>{
  const leftContestant=masters.find(m=>m.id===left.contestant_id)
  const rightContestant=masters.find(m=>m.id===right.contestant_id)
  const leftNumber=Number(leftContestant?.contestantNumber??leftContestant?.contestant_number??left.entry_number)
  const rightNumber=Number(rightContestant?.contestantNumber??rightContestant?.contestant_number??right.entry_number)
  const leftDivision=divisions.findIndex(item=>item.id===(leftContestant?.divisionId??leftContestant?.division_id))
  const rightDivision=divisions.findIndex(item=>item.id===(rightContestant?.divisionId??rightContestant?.division_id))
  return leftNumber-rightNumber
   ||(leftDivision<0?Number.MAX_SAFE_INTEGER:leftDivision)-(rightDivision<0?Number.MAX_SAFE_INTEGER:rightDivision)
 }):entries
 const selectDivision=async divisionId=>{
  const request=++numberRequest.current
  setCategory(divisionId)
  setDivisionNumber(null)
  setNumberError('')
  if(!divisionId)return
  setNumberLoading(true)
  try{
   const {data}=await pageantService.getNextContestantNumber(eventId,divisionId)
   if(!Number.isInteger(data.nextContestantNumber)||data.nextContestantNumber<1)throw new Error('Unable to determine the next contestant number for this division.')
   if(request===numberRequest.current)setDivisionNumber(data.nextContestantNumber)
  }catch(error){
   if(request===numberRequest.current)setNumberError(message(error))
  }finally{
   if(request===numberRequest.current)setNumberLoading(false)
  }
 }
 const addNew=async e=>{
  e.preventDefault()
  if(!configured||!nameValue.trim()||(pageant&&(!category||!Number.isInteger(divisionNumber)||numberLoading)))return
  await run(async()=>{
   const result=await pageantService.createContestant(eventId,{name:nameValue.trim(),contestantNumber:pageant?divisionNumber:Number(masterNumber),entryType:current?.participation_format??current?.participationFormat??'individual',...(pageant?{divisionId:category}:{})})
   const contestant=result.data.contestant
   await service.addEntry(eventId,selected,{contestantId:contestant.id})
   if(photo)await pageantService.uploadContestantPhoto(eventId,contestant.id,photo)
   setNameValue('');setPhoto(null)
   if(pageant)setDivisionNumber(number=>number+1)
   else setMasterNumber(Number(masterNumber)+1)
  },'Entry registered')
 }
 const remove=entry=>{if(window.confirm('Remove this entry from this competition? The shared entry and other competition associations will be retained.'))void run(()=>service.removeEntry(eventId,selected,entry.id,{expectedSetupRevision:view.competition.setup_revision,expectedInputRevision:view.competition.input_revision}),'Entry removed')}
 const edit=entry=>setEditingEntry({...masters.find(m=>m.id===entry.contestant_id),...entry})
 const saveEdit=async e=>{e.preventDefault();await run(()=>pageantService.updateContestant(eventId,editingEntry.id,{name:editingEntry.name,contestantNumber:editingEntry.contestantNumber??editingEntry.contestant_number,entryType:editingEntry.entryType??'individual'}),'Entry updated');setEditingEntry(null)}
 const addExisting=async()=>{const selectedEntries=masters.filter(m=>picked.includes(m.id)&&!used.has(m.id));if(!selectedEntries.length)return;const saved=await run(async()=>{for(const m of selectedEntries)await service.addEntry(eventId,selected,{contestantId:m.id})},`${selectedEntries.length} existing ${selectedEntries.length===1?'entry':'entries'} associated`);if(saved){setPicked([]);setReuseOpen(false)}}
 return <section className="space-y-5" aria-label="Contestants and entries">
  {!configured&&<div className="rounded-xl border border-amber-300/50 bg-amber-50/60 p-4 text-sm text-amber-900">Complete and save this competition's Step 5 scoring configuration before registering entries.</div>}
  <div className="grid gap-4 sm:grid-cols-2"><div className="v-card p-4"><div className="flex items-center gap-2"><Users className="h-5 w-5 text-v-primary"/><span className="text-sm text-v-text-subtle">Registered entries</span></div><strong className="mt-1 block text-2xl text-v-text">{entries.length}</strong></div><div className="v-card p-4"><div className="flex items-center gap-2"><Link2 className="h-5 w-5 text-v-primary"/><span className="text-sm text-v-text-subtle">Reusable entries</span></div><strong className="mt-1 block text-2xl text-v-text">{masters.filter(m=>!used.has(m.id)).length}</strong></div></div>
  <div className="v-card space-y-4 p-5"><div><h3 className="text-lg font-semibold text-v-text">{current?.name??'Competition'} Entries</h3><p className="text-sm text-v-text-subtle">{pageant?'Register contestants only from the configured pageant categories.':'Manage entries for this competition.'}</p></div><div><h3 className="text-lg font-semibold text-v-text">{pageant?'Add Contestant':'Register a New Entry'}</h3><p className="text-sm text-v-text-subtle">{pageant?'Register contestants only from the configured pageant categories.':'Add a dance crew, team, group, or individual performer to this competition.'}</p></div>
   <form onSubmit={addNew} className="grid gap-3 md:grid-cols-2">{pageant&&<label className="rs-field">Division / Category<select className={INPUT_CLASS} aria-label="Division / Category" value={category} onChange={e=>selectDivision(e.target.value)} disabled={busy} required><option value="">Select category</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}<label className="rs-field">{pageant?'Contestant number':'Entry number'}<input className={INPUT_CLASS} aria-label={pageant?'Contestant number':'Entry number'} value={pageant?(numberLoading?'Loading...':divisionNumber??'Select a division'):masterNumber} readOnly/>{pageant&&<span className="text-xs font-normal text-v-text-subtle">Numbers restart at 1 for each division.</span>}</label><label className="rs-field">{pageant?'Contestant Name':'Entry name'}<input className={INPUT_CLASS} aria-label={pageant?'Contestant Name':'Entry name'} value={nameValue} onChange={e=>setNameValue(e.target.value)} required maxLength={200}/></label>{pageant&&<label className="rs-field">Contestant photo <span className="font-normal text-v-text-subtle">(optional)</span><input className={INPUT_CLASS} aria-label="Contestant photo (optional)" type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>setPhoto(e.target.files?.[0]??null)}/><span className="text-xs font-normal text-v-text-subtle">Add a photo to help identify this contestant. JPG, PNG, or WebP.</span>{photo&&<span className="truncate text-xs font-medium text-v-text" title={photo.name}>Selected: {photo.name}</span>}</label>}{numberError&&<div className="md:col-span-2 flex flex-wrap items-center gap-3"><p className="text-sm text-v-danger" role="alert">{numberError}</p><Button type="button" variant="secondary" disabled={busy||numberLoading} onClick={()=>void selectDivision(category)}>Retry loading number</Button></div>}<Button type="submit" disabled={busy||dirty||!editable||!configured||!nameValue.trim()||pageant&&(!category||!Number.isInteger(divisionNumber)||numberLoading||!!numberError)} className="md:col-span-2"><UserPlus className="h-4 w-4"/>Save &amp; Add Next</Button></form>
   <Button variant="secondary" disabled={busy||dirty||!editable||!configured} onClick={()=>setReuseOpen(true)}>Select Existing Entries</Button>
  </div>
  {editingEntry&&<form className="v-card space-y-3 p-4" onSubmit={saveEdit}><label className="rs-field">Entry name<input className={INPUT_CLASS} aria-label="Edit entry name" value={editingEntry.name??''} onChange={e=>setEditingEntry({...editingEntry,name:e.target.value})} required maxLength={200}/></label><div className="flex gap-2"><Button type="submit" disabled={busy||!editable}>Save</Button><Button type="button" variant="secondary" onClick={()=>setEditingEntry(null)}>Cancel</Button></div></form>}
  <div className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-[0_10px_30px_rgba(30,64,175,0.08)]">
   <div className="flex flex-wrap items-center justify-between gap-3 border-b border-blue-100 px-4 py-3 sm:px-5">
    <div className="flex items-center gap-3">
     <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm"><Users className="h-5 w-5" aria-hidden="true"/></span>
     <div><h3 className="text-lg font-bold tracking-tight text-slate-900">Registered Entries</h3><p className="mt-0.5 text-xs text-slate-500">Manage and view all registered participants for this event.</p></div>
    </div>
    <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800"><Users className="h-3.5 w-3.5 text-blue-600" aria-hidden="true"/>{current?.name??'Competition'}</span>
   </div>
   {!entries.length?<p className="p-4 text-sm text-slate-500">No entries registered yet.</p>:<div className="overflow-x-auto"><table className="min-w-[680px] w-full text-left text-sm"><thead><tr className="bg-blue-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500"><th className="whitespace-nowrap px-4 py-2.5">{pageant?'Contestant #':'No.'}</th>{pageant&&<th className="whitespace-nowrap px-3 py-2.5">Division</th>}<th className="px-3 py-2.5">Entry Name</th><th className="whitespace-nowrap px-3 py-2.5">Type</th><th className="whitespace-nowrap px-3 py-2.5">Status</th><th className="whitespace-nowrap px-3 py-2.5">Action</th></tr></thead><tbody>{arrangedEntries.map(entry=>{const master=masters.find(m=>m.id===entry.contestant_id);const divisionId=master?.divisionId??master?.division_id;const divisionName=divisions.find(item=>item.id===divisionId)?.name;const displayedNumber=pageant?(master?.contestantNumber??master?.contestant_number??entry.entry_number):entry.entry_number;const divisionStyle=divisionName?.trim().toLowerCase()==='women'?'bg-fuchsia-50 text-fuchsia-800 ring-1 ring-inset ring-fuchsia-200':divisionName?.trim().toLowerCase()==='men'?'bg-sky-50 text-sky-800 ring-1 ring-inset ring-sky-200':'bg-violet-50 text-violet-800 ring-1 ring-inset ring-violet-200';return <tr key={entry.id} className="border-b border-blue-100 last:border-b-0"><td className="whitespace-nowrap px-4 py-2.5"><span className={`inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-sm font-bold ${pageant?divisionStyle:'bg-slate-100 text-slate-800'}`}>{displayedNumber}</span></td>{pageant&&<td className="whitespace-nowrap px-3 py-2.5"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${divisionStyle}`}>{divisionName??'Unassigned'}</span></td>}<td className="px-3 py-2.5"><div className="flex items-center gap-2">{master?.photo&&<img src={master.photo} alt={`${master.name??'Contestant'} photo`} className="h-9 w-9 shrink-0 rounded-full border border-blue-100 object-cover"/>}<span className="font-semibold text-slate-900">{master?.name??entry.contestant_id}</span></div></td><td className="whitespace-nowrap px-3 py-2.5"><span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700"><Users className="h-3.5 w-3.5" aria-hidden="true"/>Entry</span></td><td className="whitespace-nowrap px-3 py-2.5"><span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-600"><span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true"/>Active</span></td><td className="whitespace-nowrap px-3 py-2.5"><div className="flex items-center gap-2"><button type="button" className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-blue-50 px-3 text-xs font-semibold text-blue-700 transition hover:bg-blue-100" onClick={()=>edit(entry)}><Pencil className="h-3.5 w-3.5" aria-hidden="true"/>Edit</button><button type="button" aria-label={`Remove draft participation #${entry.entry_number}`} title={`Remove draft participation #${entry.entry_number}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-rose-50 px-3 text-xs font-semibold text-rose-600 transition hover:bg-rose-100" onClick={()=>remove(entry)}><Trash2 className="h-3.5 w-3.5" aria-hidden="true"/>Remove</button></div></td></tr>})}</tbody></table></div>}
  </div>
  <div className="flex flex-wrap justify-between gap-3"><Button variant="secondary" disabled={busy} onClick={onBack}>← Back</Button><Button disabled={busy||dirty||!configured||!entries.length} onClick={onProceed}>{busy?'Saving...':'Save & Return to Competitions →'}</Button></div>
  {reuseOpen&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-labelledby="reuse-title"><div className="w-full max-w-lg rounded-2xl bg-v-surface p-5 shadow-xl"><div className="flex items-center justify-between"><h3 id="reuse-title" className="text-lg font-semibold">Select Existing Entries</h3><button type="button" aria-label="Close" onClick={()=>setReuseOpen(false)}>×</button></div><p className="mt-1 text-sm text-v-text-subtle">Choose entries from this event that are not registered in {current?.name}.</p><label className="rs-field mt-4">Search entries<input className={INPUT_CLASS} aria-label="Search entries" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search entries..."/><Search className="sr-only"/></label><div className="mt-3 max-h-64 space-y-2 overflow-y-auto">{available.map(m=><label key={m.id} className="flex items-center gap-3 rounded-lg border border-v-border p-3"><input type="checkbox" checked={picked.includes(m.id)} onChange={e=>setPicked(current=>e.target.checked?[...current,m.id]:current.filter(id=>id!==m.id))}/><span className="flex-1">{m.name}</span><span className="text-xs text-v-text-subtle">{m.entry_type??'Existing entry'}</span></label>)}{!available.length&&<p className="p-3 text-sm text-v-text-subtle">No reusable entries found.</p>}</div><div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={()=>setReuseOpen(false)}>Cancel</Button><Button disabled={!picked.length||busy} onClick={addExisting}>Add Selected Entries</Button></div></div></div>}
 </section>
}

export default function NativeSetupWorkspace({eventId,initialChildren=[],stage=null}){
 const [params,setParams]=useSearchParams()
 const [configuring,setConfiguring]=useState(stage!=='contestants'&&(stage!=='workspace'||params.has('competitionId')||params.has('scoringStep')))
 const visible=key=>(!stage||stage===key)&&(key!=='workspace'||stage!=='workspace'||configuring)
 const [children,setChildren]=useState(initialChildren),[selected,setSelected]=useState(initialChildren.find(c=>c.id===params.get('competitionId')&&c.origin==='native')?.id??initialChildren.find(c=>c.origin==='native'&&c.name.trim().toLowerCase()==='pageant'&&(c.competition_type??c.competitionType)==='pageant')?.id??initialChildren.find(c=>c.origin==='native')?.id??'')
 const [activeRoundId,setActiveRoundId]=useState(null)
 const [summaries,setSummaries]=useState({}),[roundCounts,setRoundCounts]=useState({}),[stepReadiness,setStepReadiness]=useState({}),[activeSetupStep,setActiveSetupStep]=useState(['structure','criteria','score-sheet','deductions'].includes(params.get('scoringStep'))?params.get('scoringStep'):'structure'),[showValidation,setShowValidation]=useState(false)
 const [snapshot,setSnapshot]=useState(null),[configuration,setConfiguration]=useState(blank),[entries,setEntries]=useState([]),[masters,setMasters]=useState([]),[judges,setJudges]=useState([]),[pool,setPool]=useState([]),[event,setEvent]=useState(null),[pageantDivisions,setPageantDivisions]=useState([]),[divisionName,setDivisionName]=useState(''),[judgeAssignments,setJudgeAssignments]=useState([]),[roundsByCompetition,setRoundsByCompetition]=useState({})
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[dirty,setDirty]=useState(false),[ack,setAck]=useState(false)
 const [editingEntry,setEditingEntry]=useState(null)
 const initialList=useRef(initialChildren.length?initialChildren:null)
 const [pendingForms,setPendingForms]=useState({})
 const formPending=Object.values(pendingForms).some(Boolean)
 const trackPending=useCallback((key,pending)=>setPendingForms(current=>current[key]===pending?current:{...current,[key]:pending}),[])
 const [childName,setChildName]=useState(''),[masterNumber,setMasterNumber]=useState(1),[poolSearch,setPoolSearch]=useState(''),[poolPickerOpen,setPoolPickerOpen]=useState(false),[selectedPoolJudges,setSelectedPoolJudges]=useState([]),[judgeSearch,setJudgeSearch]=useState(''),[assignmentSearch,setAssignmentSearch]=useState(''),[assignmentCompetitionFilter,setAssignmentCompetitionFilter]=useState(''),[assignmentJudgeFilter,setAssignmentJudgeFilter]=useState(''),[assignmentStatusFilter,setAssignmentStatusFilter]=useState('all'),[assignmentDrawerOpen,setAssignmentDrawerOpen]=useState(false),[coverageManageCompetitionId,setCoverageManageCompetitionId]=useState(''),[assignmentDraftJudge,setAssignmentDraftJudge]=useState(''),[assignmentDraftCompetitions,setAssignmentDraftCompetitions]=useState([]),[assignmentDraftRound,setAssignmentDraftRound]=useState(''),[assignmentBeingEdited,setAssignmentBeingEdited]=useState(null)
 const identity=`${eventId}:${selected}`,current=useRef(identity);current.current=identity
 const generation=useRef(0),mutating=useRef(false),createRequest=useRef(null)
 const hasLoadedData=useRef(false);hasLoadedData.current=!!snapshot||!!event
 const view=snapshot?.competition?.id===selected&&snapshot.competition.event_id===eventId?snapshot:null
 const pageantEvent=event?.competitionType==='pageant'
 const editable=!!view&&!view.competition.official_child_rules_id&&event?.status==='draft'&&!event?.competitionCreatedAt&&!loading
 const reload=useCallback(async()=>{
  const expected=identity,request=++generation.current
  if(!hasLoadedData.current)setLoading(true)
  try{
   const [list,ev,master,enrolled,available,foundation,participation]=await Promise.all([
    initialList.current?Promise.resolve({data:{competitions:initialList.current}}):fetchCompetitionSetupData(eventId,'competitions',()=>service.list(eventId)),
    fetchCompetitionSetupData(eventId,'event',()=>pageantService.getEvent(eventId)),
    stage==='contestants'||stage===null?fetchCompetitionSetupData(eventId,'contestants',()=>pageantService.listContestants(eventId)):Promise.resolve({data:{contestants:[]}}),
    stage==='judges'||stage===null?fetchCompetitionSetupData(eventId,'enrollments',()=>service.enrollments(eventId)):Promise.resolve({data:{judges:[]}}),
    stage==='judges'||stage===null?fetchCompetitionSetupData(eventId,'judge-pool',()=>service.pool(eventId)):Promise.resolve({data:{judges:[]}}),
    selected?fetchCompetitionSetupData(eventId,`foundation:${selected}`,()=>service.foundation(eventId,selected)):Promise.resolve(null),
    selected&&(stage==='contestants'||stage==='judges'||stage===null)?fetchCompetitionSetupData(eventId,`entries:${selected}`,()=>service.entries(eventId,selected)):Promise.resolve(null),
   ])
   const eventDivisions = ev.data.event.competitionType === 'pageant'
    ? await fetchCompetitionSetupData(eventId,'divisions',()=>pageantService.listDivisions(eventId))
    : { data: { divisions: [] } }
   setCompetitionSetupData(eventId,'competitions',list)
   initialList.current=null
   if(current.current!==expected||generation.current!==request)return
   setChildren(list.data.competitions??[]);setEvent(ev.data.event);setPageantDivisions(eventDivisions.data.divisions??[]);setMasters(master.data.contestants??[]);setJudges(enrolled.data.judges??[]);setPool(available.data.judges??[]);setMasterNumber(Math.max(0,...(master.data.contestants??[]).map(m=>Number(m.contestantNumber??m.contestant_number)||0))+1)
   if(selected&&(foundation?.data?.competition?.id!==selected||foundation.data.competition.event_id!==eventId))throw new Error('Competition setup identity mismatch')
   const loadedConfiguration=structuredClone(foundation?.data.configuration??blank())
   const migratedConfiguration=convertLegacyMinorWeights(loadedConfiguration)
   setSnapshot(foundation?.data??null);setEntries(participation?.data.entries??[]);setConfiguration(migratedConfiguration.configuration);setActiveRoundId(foundation?.data.configuration?.rounds?.[0]?.id??null);setDirty(migratedConfiguration.converted);setAck(false);setNotice(migratedConfiguration.converted?'Legacy minor weights were converted to direct round percentages without changing their relative contribution. Save the configuration to apply the new format.':'');setError('')
   const branchCompetitions=(list.data.competitions??[]).filter(c=>c.origin==='native'&&(
    ev.data.event.competitionType!=='pageant'
    ||(c.competition_type??c.competitionType)!=='pageant'
    ||c.name.trim().toLowerCase()==='pageant'
   ))
   const branchStates=stage?await Promise.all(branchCompetitions.map(async c=>{
    if(stage==='contestants'){const [result,branchFoundation]=c.id===selected?[participation,foundation]:await Promise.all([fetchCompetitionSetupData(eventId,`entries:${c.id}`,()=>service.entries(eventId,c.id)),fetchCompetitionSetupData(eventId,`foundation:${c.id}`,()=>service.foundation(eventId,c.id)) ]),saved=branchFoundation?.data,scoring=competitionScoringReady(saved);return [c.id,{roundCount:saved?.configuration?.structure==='multiple'?saved.configuration.rounds.length:1,scoring,status:scoring&&result?.data.entries?.length?'complete':scoring?'in_progress':'not_configured',ready:scoring&&!!result?.data.entries?.length}]}
    const result=c.id===selected?foundation:await fetchCompetitionSetupData(eventId,`foundation:${c.id}`,()=>service.foundation(eventId,c.id)),saved=result?.data,scoring=competitionScoringReady(saved)
    const panel=saved.assignments.filter(a=>(enrolled.data.judges??[]).some(j=>j.id===a.participant_id&&j.isActive&&j.accountStatus==='active'&&['judge','head_judge'].includes(j.role)))
    const scopes=saved.configuration?.structure==='multiple'?saved.configuration.rounds:[{id:null}]
    const covered=!!saved.configuration&&scopes.every(r=>panel.some(a=>a.round_id==null||a.round_id===r.id))&&panel.length===saved.assignments.length
    return [c.id,{roundCount:saved.configuration?.structure==='multiple'?saved.configuration.rounds.length:1,rounds:saved.configuration?.rounds??[],scoring,status:scoring?'complete':saved.configuration?'in_progress':'not_configured',ready:stage==='workspace'?scoring:covered,assignments:(saved.assignments??[]).map(a=>({...a,competition_id:c.id,competition_name:c.name,rounds:saved.configuration?.rounds??[]}))}]
   })):[]
   if(current.current!==expected||generation.current!==request)return
   setRoundCounts(Object.fromEntries(branchStates.map(([id,state])=>[id,state.roundCount])));setRoundsByCompetition(Object.fromEntries(branchStates.map(([id,state])=>[id,state.rounds??[]])));setSummaries(Object.fromEntries(branchStates.map(([id,state])=>[id,state.status])));setStepReadiness(Object.fromEntries(branchStates.map(([id,state])=>[id,state.ready])));if(stage==='judges')setJudgeAssignments(branchStates.flatMap(([,state])=>state.assignments??[]))
   window.dispatchEvent(new CustomEvent('votrix-native-contexts-changed',{detail:{eventId,native:list.data.competitions?.some(c=>c.origin==='native')===true}}))
  }catch(e){if(import.meta.env.DEV)console.debug('[competition-setup] reload failed',message(e));if(current.current===expected&&generation.current===request){setSnapshot(null);setError(message(e))}}
  finally{if(current.current===expected&&generation.current===request)setLoading(false)}
 },[eventId,selected,identity,stage])
 const invalidateRequests=useCallback(()=>{generation.current++},[])
 useEffect(()=>{setSnapshot(null);setEntries([]);setConfiguration(blank());setDirty(false);setAck(false);setNotice('');setEditingEntry(null);void reload();return invalidateRequests},[reload,invalidateRequests])
 const run=async(action,success)=>{
  if(mutating.current)return
  mutating.current=true;setBusy(true);setNotice('');const expected=identity
  try{await action();if(current.current===expected){await invalidateCompetitionSetupData(eventId);await reload();if(current.current===expected)setNotice(success)};return true}
  catch(e){if(current.current===expected)setError(message(e));return false}
  finally{mutating.current=false;setBusy(false)}
 }
 useEffect(()=>{
  if(!dirty&&!formPending)return
  const unload=e=>{e.preventDefault();e.returnValue=''}
  const leave=e=>{const link=e.target.closest?.('a[href]');if(link&&!link.hasAttribute('download')&&link.getAttribute('href')!==window.location.pathname&&!window.confirm('Discard unsaved competition configuration changes?')){e.preventDefault();e.stopPropagation()}}
  window.addEventListener('beforeunload',unload);document.addEventListener('click',leave,true)
  return()=>{window.removeEventListener('beforeunload',unload);document.removeEventListener('click',leave,true)}
 },[dirty,formPending])
 const edit=next=>{setConfiguration(next);setDirty(true);setAck(false);setError('')}
 const validation=setupReadiness(configuration)
 const navigateStep=id=>{if(id===activeSetupStep)return;if(formPending&&!window.confirm('Discard the unfinished Add/Edit form? Use Add or Update to include it in the configuration first.'))return;setActiveSetupStep(id);setShowValidation(false);setPendingForms({});setParams(previous=>{const next=new URLSearchParams(previous);next.set('scoringStep',id);if(selected)next.set('competitionId',selected);return next},{replace:true})}
 const nextSubstep=()=>{setShowValidation(true);if(validation.ready[activeSetupStep])navigateStep(setupSteps[setupSteps.findIndex(s=>s.id===activeSetupStep)+1].id)}
 const returnToList=()=>{setConfiguring(false);setParams(previous=>{const next=new URLSearchParams(previous);next.delete('competitionId');next.delete('scoringStep');return next},{replace:true})}
 const proceedEntries=async()=>{if(!view?.configuration||!view.criteriaReadiness?.allReady||!entries.length){setError('Complete the saved scoring configuration and register at least one entry before proceeding.');return}if(mutating.current)return;mutating.current=true;setBusy(true);setError('');try{await reload();returnToList()}catch(e){setError(message(e))}finally{mutating.current=false;setBusy(false)}}
 const saveConfiguration=async()=>{setShowValidation(true);if(formPending||!validation.allReady)return;const saved=await run(()=>service.configure(eventId,selected,{configuration,expectedSetupRevision:view.competition.setup_revision}),'Configuration saved');if(saved&&stage==='workspace')returnToList()}
 const pageantRounds=pageantEvent&&view?.competition.name.trim().toLowerCase()==='pageant'&&configuration.structure==='multiple'?configuration.rounds??[]:[]
 const selectedRoundIndex=Math.max(0,pageantRounds.findIndex(round=>round.id===activeRoundId))
 const nextPageantRound=pageantRounds[selectedRoundIndex+1]
 const advancePageantRound=()=>{if(nextPageantRound&&!formPending){setShowValidation(false);setActiveRoundId(nextPageantRound.id)}}
 const addPageantDivision=async eventSubmit=>{
  eventSubmit.preventDefault()
  const nextName=divisionName.trim()
  if(!nextName||pageantDivisions.some(division=>division.name.toLowerCase()===nextName.toLowerCase()))return
  await run(async()=>{if(!pageantDivisions.length)await pageantService.setDivisionsEnabled(eventId,true);await pageantService.createDivision(eventId,{name:nextName});setDivisionName('')},'Pageant division added')
 }
 const removePageantDivision=division=>{
  if(!window.confirm(`Remove the ${division.name} division? Divisions with registered contestants cannot be deleted.`))return
  void run(()=>pageantService.deleteDivision(eventId,division.id),'Pageant division removed')
 }

 const choose=id=>{setConfiguring(true);if(id===selected){setParams(previous=>{const next=new URLSearchParams(previous);next.set('competitionId',id);return next},{replace:true});return;}if((dirty||formPending)&&!window.confirm('Discard unsaved configuration changes and unfinished forms?'))return;generation.current++;setSnapshot(null);setSelected(id);setError('');setPendingForms({});setParams(previous=>{const next=new URLSearchParams(previous);next.set('competitionId',id);return next},{replace:true})}
 const create=()=>run(async()=>{
  const body=createRequest.current?.name===childName.trim()?createRequest.current:{id:crypto.randomUUID(),name:childName.trim(),competitionType:null}
  createRequest.current=body;const {data}=await service.create(eventId,body);createRequest.current=null;setChildName('');setChildren(cs=>[...cs.filter(c=>c.id!==data.competition.id),data.competition]);setSelected(data.competition.id)
 },'Competition created')
 const assignments=view?.assignments??[],used=new Set(entries.map(e=>e.contestant_id))
 const nativeChildren=children.filter(c=>c.origin==='native')
 const pageantChild=nativeChildren.find(c=>c.name.trim().toLowerCase()==='pageant')
 const pageantChildId=pageantChild?.id
 const setupChildren=pageantEvent?nativeChildren.filter(c=>(c.competition_type??c.competitionType)!=='pageant'||c.name.trim().toLowerCase()==='pageant'):nativeChildren
 const setupSteps=[
  {id:'structure',label:'Structure',detail:'Rounds',ready:validation.ready.structure},
  {id:'criteria',label:'Criteria',detail:'What judges score',ready:validation.ready.criteria},
  {id:'score-sheet',label:'Score Sheet',detail:'Judge inputs',ready:validation.ready['score-sheet']},
  {id:'deductions',label:'Deductions',detail:'Optional rules',ready:validation.ready.deductions},
 ]
 const eligibleJudges=judges.filter(j=>j.isActive&&j.accountStatus==='active'&&['judge','head_judge'].includes(j.role))
 const filteredPool=pool.filter(j=>!poolSearch.trim()||[name(j),j.email].some(value=>String(value??'').toLowerCase().includes(poolSearch.trim().toLowerCase())))
 const selectablePool=filteredPool.filter(j=>!j.enrolled)
 const allFilteredSelected=selectablePool.length>0&&selectablePool.every(j=>selectedPoolJudges.includes(j.id))
 const togglePoolJudge=id=>setSelectedPoolJudges(current=>current.includes(id)?current.filter(judgeId=>judgeId!==id):[...current,id])
 const toggleAllPoolJudges=()=>setSelectedPoolJudges(current=>allFilteredSelected?current.filter(id=>!selectablePool.some(j=>j.id===id)):[...new Set([...current,...selectablePool.map(j=>j.id)])])
 const nativeCompetitions=setupChildren.filter(c=>c.origin==='native')
 const competitionCoverage=nativeCompetitions.map(competition=>{
  const assignments=judgeAssignments.filter(assignment=>assignment.competition_id===competition.id)
  const rounds=roundsByCompetition[competition.id]??[]
  const scopes=rounds.length>1?rounds:[{id:null}]
  const covered=scopes.every(round=>assignments.some(assignment=>assignment.round_id==null||assignment.round_id===round.id))
  return {competition,assignments,rounds,covered,judgeCount:new Set(assignments.map(assignment=>assignment.participant_id)).size}
 })
 const currentAssignmentRows=judgeAssignments.filter(assignment=>{
  const judge=judges.find(candidate=>candidate.id===assignment.participant_id)
  const competition=nativeCompetitions.find(candidate=>candidate.id===assignment.competition_id)
  const active=eligibleJudges.some(candidate=>candidate.id===assignment.participant_id)
  const query=assignmentSearch.trim().toLowerCase()
  return (!query||[name(judge??{id:assignment.participant_id}),judge?.email,competition?.name].some(value=>String(value??'').toLowerCase().includes(query)))
   &&(!assignmentCompetitionFilter||assignment.competition_id===assignmentCompetitionFilter)
   &&(!assignmentJudgeFilter||assignment.participant_id===assignmentJudgeFilter)
   &&(assignmentStatusFilter==='all'||(assignmentStatusFilter==='active'?active:!active))
 })
 const openCompetitionAssignment=coverage=>{
  if(coverage.covered){setCoverageManageCompetitionId(coverage.competition.id);return}
  setAssignmentBeingEdited(null)
  setAssignmentDraftJudge('')
  setAssignmentDraftCompetitions([coverage.competition.id])
  setAssignmentDrawerOpen(true)
 }
 const revokeAssignment=assignment=>{
  if(!window.confirm('Revoke this assignment? The judge will no longer access this competition target, and existing scores will be retained.'))return
  void run(()=>service.assign(eventId,assignment.competition_id,{participantId:assignment.participant_id,roundId:assignment.round_id},true),'Assignment revoked')
 }
 useEffect(()=>{
  if(!pageantEvent)return
  const selectedPageantChild=children.find(child=>child.id===selected&&(child.competition_type??child.competitionType)==='pageant')
  if(pageantChildId&&selected!==pageantChildId&&!dirty&&!formPending){
   setSelected(pageantChildId);setSnapshot(null)
   setParams(previous=>{const next=new URLSearchParams(previous);next.set('competitionId',pageantChildId);return next},{replace:true})
  }else if(!pageantChildId&&selectedPageantChild&&!dirty&&!formPending){
   setSelected('');setSnapshot(null);setConfiguring(false)
   setParams(previous=>{const next=new URLSearchParams(previous);next.delete('competitionId');next.delete('scoringStep');return next},{replace:true})
  }
 },[pageantEvent,pageantChildId,children,selected,dirty,formPending,setParams])
 const configurationIssues=Object.values(validation.issues).flat()
 const returnToCompetitions=()=>{if(!(dirty||formPending)||window.confirm('Discard unsaved configuration changes and return to competitions?')){setPendingForms({});setShowValidation(false);void reload();returnToList()}}
 const configurationStatus=dirty?'Unsaved changes':validation.allReady?'Configured':'Setup incomplete'
 return <section className={`v-competition-workflow space-y-5 ${stage==='workspace'?'rs-config-page':''}`} aria-label="Independent competition setup">
  <div className="rounded-2xl border border-v-border bg-v-surface-elevated/50 p-5 sm:p-6">
   <p className="text-xs font-semibold uppercase tracking-[0.14em] text-v-primary">{stage === 'workspace' ? 'Step 5 of 7' : stage === 'contestants' ? 'Step 6 of 7' : stage === 'judges' ? 'Step 7 of 7' : 'Competition setup'}</p>
   {stage==='workspace'&&view?<><nav className="rs-breadcrumbs" aria-label="Breadcrumb"><button type="button" onClick={returnToCompetitions}>Competitions</button><ChevronRight size={15} aria-hidden="true"/><span>{view.competition.name}</span><ChevronRight size={15} aria-hidden="true"/><span aria-current="page">Configuration</span></nav><div className="rs-page-heading"><div><h2>{view.competition.name}</h2><p>Configure scoring rounds and criteria for this competition. Review your setup before saving.</p></div><div className="rs-page-heading-actions"><span className="rs-config-status" data-status={dirty?'draft':validation.allReady?'complete':'incomplete'}>{configurationStatus}</span><Button variant="ghost" className="rs-back-button" onClick={returnToCompetitions}>← Back to Competitions</Button></div></div></>:<h2 className="mt-1 text-2xl font-semibold tracking-tight text-v-text">{stage === 'contestants' ? 'Contestants & Entries' : stage === 'judges' ? 'Judges' : 'Competition setup'}</h2>}
   {stage === 'judges' ? <p className="mt-2 max-w-3xl text-sm leading-relaxed text-v-text-subtle">Enroll judges and assign them to the competitions they will score.</p> : stage==='contestants'&& <p className="mt-2 max-w-3xl text-sm leading-relaxed text-v-text-subtle">Register contestants and entries for each selected competition.</p>}
   {!stage&&visible('workspace')&&<div className="mt-6 pb-1">
    <div className="grid grid-cols-2 gap-4 sm:flex sm:items-start">
     {setupSteps.map((step,index)=><div key={step.label} className="flex min-w-0 flex-1 items-start">
      <div className="flex flex-col items-center text-center">
       <button type="button" onClick={()=>navigateStep(step.id)} aria-current={activeSetupStep===step.id?'step':undefined} className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition ${activeSetupStep===step.id?'ring-4 ring-v-primary/15 ':''}${step.ready?'border-v-primary bg-v-primary text-white':'border-v-border-strong bg-v-surface text-v-text-subtle'}`}>{step.ready?<Check className="h-4 w-4"/>:<span className="text-xs font-semibold">{index+1}</span>}</button>
       <button type="button" onClick={()=>navigateStep(step.id)} className={`mt-2 whitespace-nowrap text-xs font-semibold ${activeSetupStep===step.id?'text-v-primary':'text-v-text'}`}>{step.label}</button>
       <span className="mt-0.5 whitespace-nowrap text-[11px] text-v-text-subtle">{step.detail}</span>
      </div>
      {index<setupSteps.length-1&&<span className={`mt-4 h-0.5 flex-1 ${setupSteps[index+1].ready?'bg-v-primary':'bg-v-border'}`} aria-hidden="true"/>}
     </div>)}
    </div>
   </div>}
  </div>
  {error&&<div><p role="alert">{error}</p><Button disabled={busy} onClick={()=>{if(!(dirty||formPending)||window.confirm('Discard unsaved changes and reload saved setup?'))void reload()}}>Reload saved setup</Button></div>}
  {notice&&<p role="status">{notice}</p>}{loading&&<p role="status">Loading saved setup…</p>}
  {children.some(c=>c.origin==='legacy')&&<p>Historical legacy competition records remain separate. Only native children are editable here.</p>}
  {stage&&(stage==='workspace'||stage==='contestants')&&!configuring&&<section className="rs-competition-list" aria-labelledby="competition-selector-title">
   <div className="rs-card-heading"><div><h3 id="competition-selector-title" className="rs-title">Selected Competitions</h3><p className="v-helper-text mt-1">{stage==='contestants'?'Register entries for each selected competition. Complete them one by one.':'Configure each competition separately. Save its settings to return here.'}</p></div><span className="rs-kicker">{setupChildren.filter(c=>summaries[c.id]==='complete').length} of {setupChildren.length} configured</span></div>
   {!setupChildren.length&&<p className="rs-empty">Select competitions in Step 4 to begin.</p>}
   {setupChildren.map(c=><article key={c.id} className="rs-competition-row"><span className="rs-competition-icon"><Trophy size={22}/></span><div className="rs-row-name"><h4>{c.name}</h4><p>{pageantEvent&&c.name.trim().toLowerCase()==='pageant'?`pageant · ${pageantDivisions.length} ${pageantDivisions.length===1?'division':'divisions'} · `:`${(c.competition_type??c.competitionType??'Competition').replaceAll('_',' ')} · `}{roundCounts[c.id]??1} {(roundCounts[c.id]??1)===1?'round':'rounds'}</p></div><span className="rs-status" data-complete={summaries[c.id]==='complete'}>{loading?'Loading...':summaries[c.id]==='complete'?'Configured':'Not Configured'}</span><Button variant={summaries[c.id]==='complete'?'secondary':'primary'} disabled={busy||loading||!!error||summaries[c.id]===undefined} aria-label={`${stage==='contestants'?'Manage Entries':summaries[c.id]==='complete'?'Edit Configuration':'Configure'} ${c.name}`} onClick={()=>choose(c.id)}>{stage==='contestants'?'Manage Entries':summaries[c.id]==='complete'?'Edit Configuration':'Configure'}</Button></article>)}
  </section>}
  <label className="sr-only">Competition<select className={INPUT_CLASS} aria-label="Setup competition" value={selected} disabled={busy} onChange={e=>choose(e.target.value)}><option value="">Choose a competition</option>{setupChildren.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
  {!stage&&<form onSubmit={e=>{e.preventDefault();create()}}><fieldset disabled={busy||loading||(event?.status!=='draft'||!!event?.competitionCreatedAt)} className="flex flex-wrap gap-3"><label>New competition name<input className={INPUT_CLASS} aria-label="New competition name" maxLength="200" value={childName} onChange={e=>{setChildName(e.target.value);createRequest.current=null}} required/></label><Button type="submit" disabled={!childName.trim()}>Create competition</Button></fieldset></form>}
  {visible('judges')&&<section className="v-card rounded-[18px] border border-v-border bg-v-surface p-4 sm:p-5" aria-label="Event judge enrollment">
   <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <div className="flex items-center gap-3">
     <span className="flex h-7 w-7 items-center justify-center rounded-full bg-v-primary text-[18px] font-semibold text-white">1</span>
     <div>
      <h3 className="text-[28px] leading-none font-semibold tracking-[-0.04em] text-v-text">Enroll Judges</h3>
      <p className="mt-2 text-[15px] leading-snug text-v-text-subtle">Add judges who are available to score competitions in this event.</p>
     </div>
    </div>
    <span className="inline-flex items-center rounded-full border border-v-border bg-v-surface-elevated px-3 py-1.5 text-[15px] font-medium text-v-text-subtle">{judges.length} {judges.length===1?'judge enrolled':'judges enrolled'}</span>
   </div>
   <div className="mt-5 border-t border-v-border pt-4">
    <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.18em] text-v-text-subtle">Select judges</div>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
     <div className="relative min-w-0 flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-v-text-subtle"/>
      <input className={`${INPUT_CLASS} min-h-[44px] w-full rounded-xl pl-9 text-[15px]`} aria-label="Search judges to enroll" placeholder="Search judges by name or email..." value={poolSearch} onChange={e=>{setPoolSearch(e.target.value);setPoolPickerOpen(true)}} onFocus={()=>setPoolPickerOpen(true)} onClick={()=>setPoolPickerOpen(true)} onKeyDown={e=>{if(e.key==='Escape')setPoolPickerOpen(false)}} disabled={busy||loading||(event?.status!=='draft'||!!event?.competitionCreatedAt)} aria-expanded={poolPickerOpen} aria-controls="judge-enrollment-options"/>
      {poolPickerOpen&&<div id="judge-enrollment-options" className="absolute left-0 right-0 top-full z-30 mt-2 max-h-80 overflow-y-auto rounded-xl border border-v-border bg-v-surface p-2 shadow-lg">
       <div className="flex items-center justify-between gap-3 px-2 py-1 text-xs text-v-text-subtle"><span>{selectedPoolJudges.length} selected</span><span>{selectablePool.length} available in results</span></div>
       {selectedPoolJudges.length>0&&<div className="flex flex-wrap gap-1.5 px-2 py-2">{selectedPoolJudges.map(id=>{const judge=pool.find(j=>j.id===id);return judge?<span key={id} className="inline-flex items-center gap-1 rounded-full border border-v-primary/20 bg-v-primary-soft px-2 py-1 text-xs text-v-primary">{name(judge)}<button type="button" aria-label={`Remove ${name(judge)} from selection`} className="font-semibold" onClick={()=>togglePoolJudge(id)}>×</button></span>:null})}</div>}
       {selectablePool.length>0&&<label className="flex cursor-pointer items-center gap-2 rounded-lg bg-v-primary-soft/60 px-2 py-2 text-xs font-medium text-v-text"><input type="checkbox" checked={allFilteredSelected} onChange={toggleAllPoolJudges}/><span>Select all ({selectablePool.length} available results)</span></label>}
       <div className="mt-1 divide-y divide-v-border">
        {filteredPool.map(j=><label key={j.id} className={`flex items-center gap-2 rounded-lg px-2 py-2 text-sm ${j.enrolled?'cursor-not-allowed opacity-65':'cursor-pointer hover:bg-v-surface-elevated'}`}><input type="checkbox" aria-label={`Select ${name(j)}`} checked={!j.enrolled&&selectedPoolJudges.includes(j.id)} disabled={j.enrolled} onChange={()=>togglePoolJudge(j.id)}/><span className="min-w-0 flex-1"><span className="block truncate font-medium text-v-text">{name(j)}</span><span className="block truncate text-xs text-v-text-subtle">{j.email??'—'}</span></span><span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-medium ${j.enrolled?'bg-v-surface-elevated text-v-text-subtle':'bg-emerald-50 text-emerald-700'}`}>{j.enrolled?'Already enrolled':'Available'}</span></label>)}
        {!filteredPool.length&&<p className="px-3 py-5 text-center text-sm text-v-text-subtle">No judges match your search.</p>}
       </div>
       <div className="flex justify-between border-t border-v-border px-2 pt-2 text-xs"><button type="button" className="text-v-primary hover:underline" onClick={()=>setSelectedPoolJudges([])}>Clear all</button><button type="button" className="text-v-text-subtle hover:text-v-text" onClick={()=>setPoolPickerOpen(false)}>Close</button></div>
      </div>}
     </div>
     <Button className="min-h-[44px] px-4 text-[15px] font-medium" disabled={!selectedPoolJudges.length || busy || loading || !!event?.competitionCreatedAt || event?.status!=='draft'} onClick={()=>run(async()=>{const ids=[...new Set(selectedPoolJudges)].filter(id=>pool.some(j=>j.id===id&&!j.enrolled));if(!ids.length)throw new Error('Select at least one available judge.');await service.enroll(eventId,ids);setSelectedPoolJudges([]);setPoolSearch('');setPoolPickerOpen(false)},'Selected judges enrolled without sending invitations')}>+ Enroll {selectedPoolJudges.length?`${selectedPoolJudges.length} `:''}{selectedPoolJudges.length===1?'Judge':'Judges'}</Button>
    </div>
   </div>
  </section>}
  {view&&<>
   {stage==='judges'&&!entries.length&&<p role="status">Register entries in Step 6 before assigning judges to this competition.</p>}
   {visible('contestants')&&configuring&&<ContestantsStep event={event} eventId={eventId} children={nativeChildren} selected={selected} view={view} entries={entries} masters={masters} used={used} masterNumber={masterNumber} setMasterNumber={setMasterNumber} editable={editable} busy={busy} dirty={dirty} run={run} service={service} pageantService={pageantService} divisions={pageantDivisions} editingEntry={editingEntry} setEditingEntry={setEditingEntry} onBack={returnToList} onProceed={proceedEntries}/>}
   {visible('workspace')&&<>{stage!=='workspace'&&<h3 className="font-semibold">2. Structure, criteria and scoring rules</h3>}
   {stage==='workspace'&&pageantEvent&&<section className="v-card space-y-3 p-4" aria-labelledby="pageant-divisions-heading"><div><h3 id="pageant-divisions-heading" className="text-sm font-semibold text-v-text">Pageant divisions</h3><p className="v-helper-text">These divisions organize contestants. The Pageant shares one scoring configuration across them.</p></div><ul className="flex flex-wrap gap-2">{pageantDivisions.map(division=><li key={division.id} className="inline-flex items-center gap-2 rounded-full border border-v-border bg-v-surface-elevated px-3 py-1.5 text-sm text-v-text">{division.name}<button type="button" aria-label={`Remove ${division.name} division`} disabled={!editable||busy} className="font-semibold text-v-text-subtle hover:text-v-danger disabled:opacity-50" onClick={()=>removePageantDivision(division)}>×</button></li>)}{!pageantDivisions.length&&<li className="text-sm text-v-text-subtle">No divisions configured yet.</li>}</ul><form onSubmit={addPageantDivision} className="flex flex-wrap gap-2"><label className="sr-only" htmlFor="pageant-division-name">New division name</label><input id="pageant-division-name" className={`${INPUT_CLASS} min-w-0 flex-1`} maxLength={200} placeholder="Add a custom division" value={divisionName} onChange={e=>setDivisionName(e.target.value)} disabled={!editable||busy}/><Button type="submit" disabled={!editable||busy||!divisionName.trim()}>Add division</Button></form></section>}
   {view.competition.official_child_rules_id&&<p>{view.rulesCurrent?'Rules frozen. Continue to Live Control.':'Frozen rules are stale after a dependency change. Scoring is blocked pending an authorized amendment.'}</p>}
   {stage!=='workspace'&&<p className="text-sm font-semibold">Current competition: {view.competition.name}</p>}
   <fieldset disabled={busy||!editable} className={`space-y-5 ${stage==='workspace'?'rs-config-fieldset':''}`}><RoundsScoringEditor key={selected} value={configuration} onChange={edit} entries={entries} step={stage==='workspace'?'configuration':activeSetupStep} onPendingChange={trackPending} hasPendingForm={formPending} draft={dirty} competitionName={view.competition.name} activeRoundId={activeRoundId} onRoundChange={setActiveRoundId}/>
    {stage==='workspace'?<>
      {showValidation&&!validation.allReady&&<div role="alert" className="rs-validation"><p className="font-semibold">Complete the following before saving:</p><ul>{Object.values(validation.issues).flat().map(issue=><li key={issue}>{issue}</li>)}</ul></div>}
      {formPending&&<p role="status" className="text-sm text-v-text-muted">Save or cancel the unfinished form before saving this competition.</p>}
      <div className="rs-save-footer rs-config-sticky-footer"><div className="rs-save-footer-copy"><p className="font-medium text-v-text">{nextPageantRound?`Round ${selectedRoundIndex+1} of ${pageantRounds.length}`:dirty?'Unsaved configuration changes':'Configuration status'}</p><p className="v-helper-text">{nextPageantRound?`Round ${selectedRoundIndex+1} of ${pageantRounds.length} · Changes are saved after the final round.`:!validation.allReady?configurationIssues[0]??'Complete the required configuration before saving.':dirty?'Save to apply these changes.':'Your configuration is ready to save.'}</p>{formPending&&<p className="rs-footer-warning">Finish or cancel the open form before continuing.</p>}</div><div className="rs-save-footer-actions"><Button variant="secondary" onClick={returnToCompetitions}>Back to Competitions</Button>{nextPageantRound?<Button aria-label={`Proceed to ${nextPageantRound.name} →`} disabled={busy||formPending||!validation.allReady} onClick={advancePageantRound}>Next: {nextPageantRound.name} <ChevronRight size={16}/></Button>:<Button disabled={busy||formPending||!validation.allReady} onClick={saveConfiguration}>{busy?'Saving…':'Save & Return to Competitions'}</Button>}</div></div>
    </>:<>    {(showValidation||dirty)&&validation.issues[activeSetupStep].length>0&&<ul className="rounded-xl border border-v-border p-4 text-sm text-v-danger" aria-label="Substep validation">{validation.issues[activeSetupStep].map(issue=><li key={issue}>{issue}</li>)}</ul>}
    {showValidation&&activeSetupStep==='deductions'&&!validation.allReady&&<p role="alert">Review incomplete substeps before completing this competition.</p>}
    {formPending&&<p role="status" className="text-sm text-v-text-muted">Use Add or Update to include the unfinished form before saving.</p>}
    <div className="flex flex-wrap justify-between gap-3 border-t border-v-border pt-4">
     <Button variant="secondary" disabled={activeSetupStep==='structure'} onClick={()=>navigateStep(setupSteps[setupSteps.findIndex(s=>s.id===activeSetupStep)-1].id)}>Back: {setupSteps[Math.max(0,setupSteps.findIndex(s=>s.id===activeSetupStep)-1)].label}</Button>
     <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={!dirty||formPending} onClick={()=>run(()=>service.configure(eventId,selected,{configuration,expectedSetupRevision:view.competition.setup_revision}),'Configuration saved')}>Save competition configuration</Button>{activeSetupStep==='deductions'?<Button disabled={!dirty||formPending} onClick={saveConfiguration}>Save &amp; Complete</Button>:<Button onClick={nextSubstep}>Next: {setupSteps[setupSteps.findIndex(s=>s.id===activeSetupStep)+1].label}</Button>}</div>
    </div>
</>}
   </fieldset></>}
   {visible('judges')&&<div className="space-y-5" aria-label="Judge assignments">
     <section className="v-card space-y-4 p-4 sm:p-5" aria-labelledby="judge-assignments-title">
       <div className="flex items-start gap-3">
         <span className="flex h-7 w-7 items-center justify-center rounded-full bg-v-primary text-sm font-semibold text-white">2</span>
         <div>
           <h3 id="judge-assignments-title" className="text-lg font-semibold text-v-text">Judge Assignments</h3>
           <p className="text-sm text-v-text-subtle">Assign each enrolled judge to one or more competitions.</p>
         </div>
       </div>
       <div className="relative">
         <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-v-text-subtle"/>
         <input className={`${INPUT_CLASS} pl-9`} aria-label="Search judges" placeholder="Search judges..." value={judgeSearch} onChange={e=>setJudgeSearch(e.target.value)}/>
       </div>
       <div className="overflow-x-auto">
         <table className="w-full min-w-[640px] text-left text-sm">
           <thead>
             <tr className="border-b border-v-border text-xs uppercase tracking-wide text-v-text-subtle"><th className="px-3 py-2">Judge</th><th className="px-3 py-2">Email</th><th className="px-3 py-2">Competitions</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Action</th></tr>
           </thead>
           <tbody>
             {eligibleJudges.filter(j=>!judgeSearch.trim()||name(j).toLowerCase().includes(judgeSearch.trim().toLowerCase())||String(j.email??'').toLowerCase().includes(judgeSearch.trim().toLowerCase())).map(j=>{
               const assignedCount=judgeAssignments.filter(a=>a.participant_id===j.id).length
               const assigned=assignedCount>0
               return <tr key={j.id} className="border-b border-v-border last:border-0"><td className="px-3 py-3"><div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-v-primary-soft font-medium text-v-primary">{(name(j).split(' ').map(part=>part[0]).join('').slice(0,2)||'J').toUpperCase()}</span><span className="font-medium text-v-text">{name(j)}</span></div></td><td className="px-3 py-3 text-v-text-subtle">{j.email??'—'}</td><td className="px-3 py-3"><span className="inline-flex items-center rounded-full border border-v-border bg-v-surface-elevated px-2.5 py-1 text-xs font-medium text-v-text-subtle">{assignedCount} {assignedCount===1?'competition':'competitions'}</span></td><td className="px-3 py-3"><span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${assigned?'border-emerald-200 bg-emerald-50 text-emerald-700':'border-amber-200 bg-amber-50 text-amber-700'}`}><span className={`inline-flex h-4 w-4 items-center justify-center rounded-full ${assigned?'bg-emerald-500 text-white':'bg-amber-500 text-white'}`}>{assigned?<Check className="h-3 w-3"/>:<span className="text-[10px] leading-none">!</span>}</span>{assigned?'Assigned':'Needs assignment'}</span></td><td className="px-3 py-3 text-right"><Button size="sm" variant={assigned?'secondary':'primary'} onClick={()=>{const selectedCompetitionIds = judgeAssignments.filter(a=>a.participant_id===j.id).map(a=>a.competition_id); setAssignmentDraftJudge(j.id); setAssignmentDraftCompetitions(selectedCompetitionIds); setAssignmentDrawerOpen(true)}}>{assigned?'Manage':'Assign'}</Button></td></tr>
             })}
           </tbody>
         </table>
       </div>
     </section>

     <section className="v-card space-y-4 p-4 sm:p-5" aria-labelledby="competition-coverage-title">
      <div className="flex items-start gap-3">
       <span className="flex h-7 w-7 items-center justify-center rounded-full bg-v-primary text-sm font-semibold text-white">3</span>
       <div>
        <h3 id="competition-coverage-title" className="text-lg font-semibold text-v-text">Competition Coverage</h3>
        <p className="text-sm text-v-text-subtle">See which competitions have judges assigned and which still need judges.</p>
       </div>
      </div>
      <div className="overflow-x-auto">
       <table className="w-full min-w-[560px] text-left text-sm">
        <thead><tr className="border-b border-v-border bg-v-surface-elevated text-xs uppercase tracking-wide text-v-text-subtle"><th className="px-3 py-2">Competition</th><th className="px-3 py-2">Judges assigned</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Actions</th></tr></thead>
        <tbody>
         {competitionCoverage.map(coverage=>{
          const covered=coverage.covered
          const rounds=coverage.rounds.length
          return <tr key={coverage.competition.id} className="border-b border-v-border last:border-0">
           <td className="px-3 py-3"><span className="block font-medium text-v-text">{coverage.competition.name}</span><span className="text-xs text-v-text-subtle">{rounds>1?`${rounds} scoring rounds`:'Single Scoring Phase'}</span></td>
           <td className="px-3 py-3 text-v-text">{coverage.judgeCount}</td>
           <td className="px-3 py-3"><span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${covered?'border-emerald-200 bg-emerald-50 text-emerald-700':'border-amber-200 bg-amber-50 text-amber-700'}`}>{covered?<Check className="h-3 w-3"/>:<span aria-hidden="true">!</span>}{covered?'Covered':'Needs judge'}</span></td>
           <td className="px-3 py-3 text-right"><Button size="sm" variant={covered?'secondary':'primary'} disabled={!eligibleJudges.length||busy||dirty} onClick={()=>openCompetitionAssignment(coverage)}>{covered?'Manage':'Assign Judge'}</Button></td>
          </tr>
         })}
         {!competitionCoverage.length&&<tr><td colSpan="4" className="px-3 py-5 text-center text-sm text-v-text-subtle">No competitions are available for judge assignment.</td></tr>}
        </tbody>
       </table>
      </div>
     </section>

     {coverageManageCompetitionId&&(()=>{
      const competition=nativeCompetitions.find(item=>item.id===coverageManageCompetitionId)
      const assignedJudges=judgeAssignments.filter(assignment=>assignment.competition_id===coverageManageCompetitionId)
      const rounds=roundsByCompetition[coverageManageCompetitionId]??[]
      return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4" role="dialog" aria-modal="true" aria-labelledby="coverage-manage-title">
       <div className="w-full max-w-2xl rounded-2xl border border-v-border bg-v-surface p-5 shadow-v-shadow-xl">
        <div className="flex items-start justify-between gap-3">
         <div><h3 id="coverage-manage-title" className="text-xl font-semibold text-v-text">Assigned Judges</h3><p className="text-sm text-v-text-subtle">{competition?.name??'Competition'} · {assignedJudges.length} assignment{assignedJudges.length===1?'':'s'}</p></div>
         <button type="button" aria-label="Close assigned judges" className="rounded-lg border border-v-border p-1 text-v-text-subtle hover:bg-v-surface-elevated" onClick={()=>setCoverageManageCompetitionId('')}>×</button>
        </div>
        <div className="mt-4 max-h-80 space-y-2 overflow-y-auto">
         {assignedJudges.map(assignment=>{
          const judge=eligibleJudges.find(item=>item.id===assignment.participant_id)??judges.find(item=>item.id===assignment.participant_id)
          const roundName=rounds.find(item=>item.id===assignment.round_id)?.name??(assignment.round_id?'Unknown round':rounds.length>1?'All rounds':'Single Scoring Phase')
          return <div key={`${assignment.participant_id}:${assignment.round_id??'single'}`} className="flex flex-col gap-3 rounded-xl border border-v-border p-3 sm:flex-row sm:items-center">
           <div className="min-w-0 flex-1"><p className="truncate font-medium text-v-text">{name(judge??{id:assignment.participant_id})}</p><p className="text-xs text-v-text-subtle">{roundName}</p></div>
           <div className="flex shrink-0 gap-2">
            <Button size="sm" variant="secondary" disabled={!eligibleJudges.some(item=>item.id===assignment.participant_id)||busy||dirty} onClick={()=>{setAssignmentBeingEdited(assignment);setAssignmentDraftJudge(assignment.participant_id);setAssignmentDraftCompetitions([assignment.competition_id]);setAssignmentDraftRound(assignment.round_id??'');setCoverageManageCompetitionId('');setAssignmentDrawerOpen(true)}}><Pencil className="h-3.5 w-3.5"/>Edit</Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={()=>revokeAssignment(assignment)}><Trash2 className="h-3.5 w-3.5"/>Remove</Button>
           </div>
          </div>
         })}
         {!assignedJudges.length&&<p className="rounded-lg border border-dashed border-v-border p-4 text-center text-sm text-v-text-subtle">No judges are assigned to this competition yet.</p>}
        </div>
        <div className="mt-4 flex justify-between border-t border-v-border pt-4">
         <Button variant="secondary" onClick={()=>setCoverageManageCompetitionId('')}>Close</Button>
         <Button disabled={!eligibleJudges.length||busy||dirty} onClick={()=>{setAssignmentBeingEdited(null);setAssignmentDraftJudge('');setAssignmentDraftCompetitions([coverageManageCompetitionId]);setAssignmentDraftRound('');setCoverageManageCompetitionId('');setAssignmentDrawerOpen(true)}}>+ Add Judge</Button>
        </div>
       </div>
      </div>
     })()}

     <section className="v-card space-y-4 p-4 sm:p-5" aria-labelledby="current-assignments-title">
      <div>
       <h3 id="current-assignments-title" className="text-lg font-semibold text-v-text">Current Assignments</h3>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
       <label className="relative"><span className="sr-only">Search assignments</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-v-text-subtle"/><input className={`${INPUT_CLASS} pl-9`} aria-label="Search assignments" placeholder="Search assignments..." value={assignmentSearch} onChange={e=>setAssignmentSearch(e.target.value)}/></label>
       <label><span className="sr-only">Filter assignments by competition</span><select className={INPUT_CLASS} aria-label="Filter assignments by competition" value={assignmentCompetitionFilter} onChange={e=>setAssignmentCompetitionFilter(e.target.value)}><option value="">All Competitions</option>{nativeCompetitions.map(competition=><option key={competition.id} value={competition.id}>{competition.name}</option>)}</select></label>
       <label><span className="sr-only">Filter assignments by judge</span><select className={INPUT_CLASS} aria-label="Filter assignments by judge" value={assignmentJudgeFilter} onChange={e=>setAssignmentJudgeFilter(e.target.value)}><option value="">All Judges</option>{eligibleJudges.map(judge=><option key={judge.id} value={judge.id}>{name(judge)}</option>)}</select></label>
       <label><span className="sr-only">Filter assignments by status</span><select className={INPUT_CLASS} aria-label="Filter assignments by status" value={assignmentStatusFilter} onChange={e=>setAssignmentStatusFilter(e.target.value)}><option value="all">All Statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
      </div>
      <div className="overflow-x-auto">
       <table className="w-full min-w-[760px] text-left text-sm">
        <thead><tr className="border-b border-v-border bg-v-surface-elevated text-xs uppercase tracking-wide text-v-text-subtle"><th className="px-3 py-2">Judge</th><th className="px-3 py-2">Competition</th><th className="px-3 py-2">Round / Phase</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Actions</th></tr></thead>
        <tbody>
         {currentAssignmentRows.map(assignment=>{
          const judge=judges.find(candidate=>candidate.id===assignment.participant_id)
          const competition=nativeCompetitions.find(candidate=>candidate.id===assignment.competition_id)
          const active=eligibleJudges.some(candidate=>candidate.id===assignment.participant_id)
          const competitionRounds=roundsByCompetition[assignment.competition_id]??[]
          const roundName=competitionRounds.find(round=>round.id===assignment.round_id)?.name??(assignment.round_id?'Unknown round':competitionRounds.length>1?'All rounds':'Single Scoring Phase')
          return <tr key={`${assignment.competition_id}:${assignment.participant_id}:${assignment.round_id??'single'}`} className="border-b border-v-border last:border-0">
           <td className="px-3 py-3 font-medium text-v-text">{name(judge??{id:assignment.participant_id})}</td>
           <td className="px-3 py-3 text-v-text">{competition?.name??assignment.competition_name??'Unknown competition'}</td>
           <td className="px-3 py-3 text-v-text-subtle">{roundName}</td>
           <td className="px-3 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${active?'bg-emerald-50 text-emerald-700':'bg-amber-50 text-amber-700'}`}>{active?'Active':'Inactive'}</span></td>
           <td className="px-3 py-3 text-right"><div className="inline-flex gap-2"><Button size="sm" variant="secondary" disabled={!active||busy||dirty} onClick={()=>{setAssignmentBeingEdited(assignment);setAssignmentDraftJudge(assignment.participant_id);setAssignmentDraftCompetitions([assignment.competition_id]);setAssignmentDraftRound(assignment.round_id??'');setAssignmentDrawerOpen(true)}}><Pencil className="h-3.5 w-3.5"/>Edit</Button><Button size="sm" variant="secondary" disabled={busy} onClick={()=>revokeAssignment(assignment)}><Trash2 className="h-3.5 w-3.5"/>Revoke</Button></div></td>
          </tr>
         })}
         {!currentAssignmentRows.length&&<tr><td colSpan="5" className="px-3 py-5 text-center text-sm text-v-text-subtle">{judgeAssignments.length?'No assignments match these filters.':'No judge assignments yet.'}</td></tr>}
        </tbody>
       </table>
      </div>
      <p className="text-xs text-v-text-subtle">Showing {currentAssignmentRows.length} of {judgeAssignments.length} assignments.</p>
     </section>

     {assignmentDrawerOpen&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-v-border bg-v-surface p-5 shadow-v-shadow-xl">
       <div className="flex items-start justify-between gap-3">
        <div><h3 className="text-xl font-semibold text-v-text">Assign Judge</h3><p className="text-sm text-v-text-subtle">Assign an enrolled judge to one or more competitions.</p></div>
        <button type="button" aria-label="Close assignment panel" className="rounded-lg border border-v-border p-1 text-v-text-subtle hover:bg-v-surface-elevated" onClick={()=>{setAssignmentDrawerOpen(false);setAssignmentDraftJudge('');setAssignmentDraftCompetitions([]);setAssignmentDraftRound('');setAssignmentBeingEdited(null)}}>×</button>
       </div>
       <div className="mt-5 space-y-4">
        <label className="block"><span className="mb-1 block text-xs font-medium uppercase tracking-wide text-v-text-subtle">Judge</span>
         {assignmentDraftJudge&&!assignmentBeingEdited
          ? <div className="flex items-center justify-between rounded-lg border border-v-border bg-v-surface-elevated px-3 py-2.5"><span className="font-medium text-v-text">{name(eligibleJudges.find(j=>j.id===assignmentDraftJudge)??{id:assignmentDraftJudge})}</span><span className="inline-flex items-center gap-1 rounded-full bg-v-primary-soft px-2 py-1 text-xs font-medium text-v-primary"><ShieldCheck className="h-3 w-3"/>Judge</span></div>
          : <select className={INPUT_CLASS} aria-label="Coverage judge" value={assignmentDraftJudge} onChange={e=>setAssignmentDraftJudge(e.target.value)}><option value="">Select an enrolled judge</option>{eligibleJudges.map(j=><option key={j.id} value={j.id}>{name(j)}</option>)}</select>}
        </label>
        <div><span className="mb-2 block text-xs font-medium uppercase tracking-wide text-v-text-subtle">Competitions</span>
         {assignmentBeingEdited
          ? <select className={INPUT_CLASS} aria-label="Edit assignment competition" value={assignmentDraftCompetitions[0]??''} onChange={e=>{setAssignmentDraftCompetitions(e.target.value?[e.target.value]:[]);setAssignmentDraftRound('')}}><option value="">Select competition</option>{nativeCompetitions.map(competition=><option key={competition.id} value={competition.id}>{competition.name}</option>)}</select>
          : <div className="space-y-2">
             {nativeCompetitions.length
              ? nativeCompetitions.map(competition=>{
                 const selected=assignmentDraftCompetitions.includes(competition.id)
                 return <button key={competition.id} type="button" onClick={()=>setAssignmentDraftCompetitions(current=>current.includes(competition.id)?current.filter(id=>id!==competition.id):[...current,competition.id])} className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left transition ${selected?'border-v-primary bg-v-primary-soft':'border-v-border bg-v-surface hover:border-v-primary/50'}`}><span className="font-medium text-v-text">{competition.name}</span><span className="inline-flex items-center gap-2 text-xs text-v-text-subtle">{selected?<><Check className="h-3 w-3 text-v-primary"/>Selected</>:'Select'}</span></button>
               })
              : <p className="rounded-lg border border-dashed border-v-border bg-v-surface-elevated p-3 text-sm text-v-text-subtle">No competitions available.</p>}
            </div>}
        </div>
        {assignmentBeingEdited&&(()=>{const competitionId=assignmentDraftCompetitions[0],rounds=roundsByCompetition[competitionId]??[];return rounds.length>1?<label className="block"><span className="mb-1 block text-xs font-medium uppercase tracking-wide text-v-text-subtle">Round</span><select className={INPUT_CLASS} aria-label="Edit assignment round" value={assignmentDraftRound} onChange={e=>setAssignmentDraftRound(e.target.value)}><option value="">Select round</option>{rounds.map(round=><option key={round.id} value={round.id}>{round.name}</option>)}</select></label>:null})()}
        <div className="flex justify-end gap-2 border-t border-v-border pt-4">
         <Button variant="secondary" onClick={()=>{setAssignmentDrawerOpen(false);setAssignmentDraftJudge('');setAssignmentDraftCompetitions([]);setAssignmentDraftRound('');setAssignmentBeingEdited(null)}}>Cancel</Button>
         <Button disabled={!assignmentDraftJudge||!assignmentDraftCompetitions.length||busy||dirty} onClick={async()=>{
          if(!assignmentDraftJudge||!assignmentDraftCompetitions.length)return
          const targetJudge=assignmentDraftJudge,selected=[...new Set(assignmentDraftCompetitions)]
          if(assignmentBeingEdited){
           const targetCompetition=selected[0],targetRound=assignmentDraftRound||null
           if((roundsByCompetition[targetCompetition]??[]).length>1&&!targetRound)return setError('Select a scoring round before updating this assignment.')
           const duplicate=judgeAssignments.some(assignment=>assignment.id!==assignmentBeingEdited.id&&assignment.participant_id===targetJudge&&assignment.competition_id===targetCompetition&&(assignment.round_id??null)===targetRound)
           if(duplicate)return setError('This judge already has an assignment for that scoring target.')
           if(assignmentBeingEdited.competition_id===targetCompetition&&(assignmentBeingEdited.round_id??null)===targetRound){setAssignmentDrawerOpen(false);setAssignmentBeingEdited(null);return}
           const ok=await run(async()=>{
            await service.assign(eventId,assignmentBeingEdited.competition_id,{participantId:assignmentBeingEdited.participant_id,roundId:assignmentBeingEdited.round_id??null},true)
            await service.assign(eventId,targetCompetition,{participantId:targetJudge,roundId:targetRound})
           },'Assignment updated')
           if(ok){setAssignmentDrawerOpen(false);setAssignmentDraftJudge('');setAssignmentDraftCompetitions([]);setAssignmentDraftRound('');setAssignmentBeingEdited(null)}
           return
          }
          const ok=await run(async()=>{
           for(const competitionId of selected){
            const rounds=roundsByCompetition[competitionId]??[]
            const targetRounds=rounds.length>1?rounds.map(round=>round.id):[null]
            for(const roundId of targetRounds){
             const existing=judgeAssignments.some(assignment=>assignment.participant_id===targetJudge&&assignment.competition_id===competitionId&&(assignment.round_id??null)===roundId)
             if(!existing)await service.assign(eventId,competitionId,{participantId:targetJudge,roundId})
            }
           }
          },'Judge assigned')
          if(ok){setAssignmentDrawerOpen(false);setAssignmentDraftJudge('');setAssignmentDraftCompetitions([]);setAssignmentDraftRound('');setAssignmentBeingEdited(null)}
         }}>{assignmentDraftCompetitions.length>1?'Assign Competitions':'Assign Competition'}</Button>
        </div>
       </div>
      </div>
     </div>}
   </div>}
   {!stage&&<><h3 className="font-semibold">4. Review and freeze</h3><p>Check the selected entrants, round rosters, criteria totals and explicit panel. Freezing prevents ordinary setup edits; it does not start scoring or publish results.</p>
   <fieldset disabled={busy||!editable||dirty}><label><input aria-label="Acknowledge competition rules" type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/> I reviewed this competition’s saved rules and assignments.</label><Button disabled={!ack||!view.configuration||!entries.length||!assignments.length||!view.criteriaReadiness?.allReady} onClick={()=>run(()=>service.freeze(eventId,selected,{acknowledged:true,expectedSetupRevision:view.competition.setup_revision,expectedInputRevision:view.competition.input_revision}),'Competition rules frozen')}>Freeze competition rules</Button></fieldset>
   {view.criteriaReadiness&&!view.criteriaReadiness.allReady&&<p role="status">Each phase needs complete criteria totaling 100% before freezing.</p>}
   </>}{stage!=='workspace'&&<nav className="flex flex-wrap gap-4" aria-label="Competition workflow"><Link to={`/organizer/competition/events/${eventId}/live`}>Live Control</Link><Link to={`/organizer/competition/events/${eventId}/tabulation`}>Tabulation and qualification</Link><Link to={`/organizer/competition/events/${eventId}/rankings`}>Official results, publication and CSV</Link></nav>}
  </>}
  {stage&&!event?.competitionCreatedAt&&setupChildren.some(c=>!stepReadiness[c.id])&&<p role="status">Complete this step for every selected competition before continuing.</p>}
  {stage&&<StageFooter module="competition" currentKey={stage} eventId={eventId} saving={busy} nextDisabled={loading||dirty||formPending||!!error||!setupChildren.length||!event?.competitionCreatedAt&&setupChildren.some(c=>!stepReadiness[c.id])}/> }
 </section>
}
