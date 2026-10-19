import { NativeSetupBoundary } from '@/components/organizer/competition/NativeSetupWorkspace'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { pageantService } from '@/services/pageant.service'
import { useToast } from '@/hooks/useToast'
import { getErrorMessage } from '@/utils/getErrorMessage'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import ImageUploadField from '@/components/upload/ImageUploadField'
import ReadOnlyEventBanner from '@/components/organizer/ReadOnlyEventBanner'
import FilterBar from '@/components/ui/FilterBar'
import Button from '@/components/ui/Button'
import CompetitionRoundParticipation from '@/components/organizer/competition/CompetitionRoundParticipation'
import {stagePath} from '@/utils/eventStages'
import useCompetitionSync from '@/hooks/useCompetitionSync'
import useTableFilter from '@/hooks/useTableFilter'
import { INPUT_CLASS, LABEL_CLASS } from '@/utils/uiClasses'
import { ENTRY_TYPES, orderedRounds, participationFor, entryParticipation, roundAcceptsEntry } from '../../../../../shared/competition-participation.js'

const blank = { name:'', number:1, divisionId:'', entryType:'individual', entryLabel:'' }
export default function CompetitionContestantsPage() { return <NativeSetupBoundary Legacy={LegacyCompetitionContestantsPage}/> }
function LegacyCompetitionContestantsPage() {
  const { eventId } = useParams()
  const { success, error:toastError } = useToast()
  const [foundation,setFoundation] = useState(null), [loading,setLoading] = useState(true), [loadError,setLoadError] = useState('')
  const [values,setValues] = useState(blank), [editing,setEditing] = useState(null), [photo,setPhoto] = useState(null)
  const [busy,setBusy] = useState(false), [formError,setFormError] = useState(''), [selectedRoundId,setSelectedRoundId] = useState(null)
  const [selection,setSelection] = useState([]), [numberHint,setNumberHint] = useState('')
  const [formVersion,setFormVersion] = useState(0)
  const [qualifiersOnly,setQualifiersOnly] = useState(false)
  const recordsRef=useRef(null)
  const request = useRef(0), numberRequest = useRef(0), mutation = useRef(false), formRef = useRef(null)
  const load = useCallback(async (resetSelection = true) => {
    const id = ++request.current
    try {
      const { data } = await pageantService.getFoundation(eventId)
      if (id === request.current) { setFoundation(data.foundation); setLoadError(''); if (resetSelection) setSelection([]) }
      return data.foundation
    } catch (failure) {
      if (id === request.current) setLoadError(getErrorMessage(failure,'Could not load saved entries. Reload before making changes.'))
      throw failure
    } finally { if (id === request.current) setLoading(false) }
  },[eventId])
  useEffect(() => { const requests=request, numbers=numberRequest; load().catch(() => {}); return () => { requests.current++; numbers.current++ } },[load])
  useCompetitionSync(eventId, () => load(false))
  const list = foundation?.contestants ?? [], rounds = orderedRounds(foundation?.rounds), divisions = foundation?.divisions ?? []
  const divisionsEnabled = Boolean(foundation?.event?.divisions_enabled)
  const readOnly = !foundation || foundation.event?.status !== 'draft' || Boolean(foundation.event?.official_rules_id ?? foundation.event?.officialRulesId)
  const blocked = readOnly || busy || Boolean(loadError)
  const activeDivisions = divisions.filter(d => d.isActive !== false && d.is_active !== false)
  const set = (key,value) => { setValues(current => ({...current,[key]:value})); setFormError('') }
  useEffect(() => { setSelectedRoundId(current => rounds.some(r => r.id === current) ? current : rounds[0]?.id ?? null) },[foundation]) // eslint-disable-line react-hooks/exhaustive-deps
  const participation = participationFor(foundation ?? {},selectedRoundId), selectedRound = participation.round
  const assigned = new Set(participation.assignedIds)
  const divisionName = entry => divisions.find(d => d.id === (entry.divisionId ?? entry.division_id))?.name ?? 'Unassigned'
  const filters = useTableFilter({ rows:list, searchKeys:['name',e=>e.contestantNumber ?? e.contestant_number],
    facetFields:divisionsEnabled ? [{id:'division',label:'Division',accessor:divisionName}] : [] })
  const visible = filters.filtered.filter(entry=>!qualifiersOnly||participation.decision?.qualifiers.includes(entry.id))
  const eligible = entry => roundAcceptsEntry(selectedRound ?? {},entry) && !entryParticipation(foundation,entry,selectedRoundId).nonCompeting
  const selectable = visible.filter(entry => eligible(entry) || assigned.has(entry.id))
  const selected = selectable.filter(e => selection.includes(e.id))
  const refreshNumber = useCallback(async divisionId => {
    const id = ++numberRequest.current
    try { const { data } = await pageantService.getNextContestantNumber(eventId,divisionId || null)
      if (id === numberRequest.current) { setValues(current => ({...current,number:data.nextContestantNumber})); setNumberHint('Next available number') }
    } catch { if (id === numberRequest.current) setNumberHint('Enter an available number') }
  },[eventId])
  useEffect(() => { if (foundation && !editing && !readOnly) refreshNumber(divisionsEnabled ? values.divisionId : null) },[foundation,editing,readOnly,divisionsEnabled,values.divisionId,refreshNumber])
  const reset = () => { setValues(blank); setEditing(null); setPhoto(null); setFormVersion(current=>current+1); setFormError(''); setNumberHint('') }
  const mutate = async operation => {
    if (blocked || mutation.current) return
    mutation.current = true; setBusy(true)
    try { await operation(); await load() }
    catch (failure) { toastError(getErrorMessage(failure)); }
    finally { mutation.current = false; setBusy(false) }
  }
  const save = async event => {
    event.preventDefault()
    if (blocked || mutation.current) return
    if (!values.name.trim()) { setFormError('Enter a name for this contestant or entry.'); return }
    if (!Number.isInteger(Number(values.number)) || Number(values.number)<1) { setFormError('Enter a positive whole entry number.'); return }
    const validDivision = activeDivisions.some(d => d.id === values.divisionId) || (editing && values.divisionId && values.divisionId === (editing.divisionId ?? editing.division_id))
    if (divisionsEnabled && !validDivision) { setFormError('Select a configured division before saving.'); return }
    const payload = { name:values.name.trim(),contestantNumber:Number(values.number),entryLabel:values.entryLabel.trim(),
      ...(values.entryType === 'legacy' ? {} : {entryType:values.entryType}),
      ...(divisionsEnabled ? {divisionId:values.divisionId} : editing ? {} : {divisionId:null}) }
    await mutate(async () => {
      const { data } = editing ? await pageantService.updateContestant(eventId,editing.id,payload) : await pageantService.createContestant(eventId,payload)
      if (photo && data.contestant?.id) {
        try { await pageantService.uploadContestantPhoto(eventId,data.contestant.id,photo) }
        catch { toastError('Entry saved. Its photo could not be uploaded; edit the saved entry to try again.') }
      }
      reset(); success(editing ? 'Entry updated' : 'Entry registered. Round assignment is a separate step.')
    })
  }
  const assignSelected = mode => {
    if (participation.managed || !selectedRound) return
    const targets = selected.filter(e => mode === 'add' ? eligible(e) && !assigned.has(e.id) : assigned.has(e.id))
    if (!targets.length) return
    mutate(async () => {
      let saved = 0
      // Serial requests respect the shared event lock and stop on a failed write.
      try { for (const entry of targets) { await (mode === 'add' ? pageantService.addRoundContestant : pageantService.removeRoundContestant)(eventId,selectedRound.id,entry.id); saved++ } }
      catch (failure) { await load(); throw new Error(`${saved} of ${targets.length} updated. ${getErrorMessage(failure)}`, {cause:failure}) }
      success(`${saved} ${saved === 1 ? 'entry' : 'entries'} ${mode === 'add' ? 'assigned to' : 'removed from'} ${selectedRound.name}`)
    })
  }
  const edit = entry => {
    if (blocked) return
    numberRequest.current++; setEditing(entry); setPhoto(null); setFormError(''); setNumberHint('')
    setValues({name:entry.name,number:entry.contestantNumber ?? entry.contestant_number,divisionId:entry.divisionId ?? entry.division_id ?? '',entryType:entry.entryType ?? entry.entry_type ?? 'legacy',entryLabel:entry.entryLabel ?? entry.entry_label ?? ''})
    formRef.current?.scrollIntoView?.({behavior:'smooth',block:'start'}); formRef.current?.querySelector('select')?.focus({preventScroll:true})
  }
  const remove = entry => { if (!blocked && window.confirm(`Delete entry "${entry.name}"? Historical scoring records cannot be deleted.`)) mutate(async () => { await pageantService.deleteContestant(eventId,entry.id); if(editing?.id===entry.id)reset(); success('Entry deleted') }) }
  const selectEntry = (entry,checked) => setSelection(current => checked ? [...new Set([...current,entry.id])] : current.filter(id => id !== entry.id))
  if (loading) return <div className="flex justify-center py-20"><LoadingSpinner /></div>
  if (!foundation) return <div role="alert" className="v-card p-4 space-y-2"><p className="v-error-text">{loadError || 'Could not load saved entries.'}</p><p role="status" className="v-caption">Failed to load participation data</p><Button variant="secondary" onClick={() => { void load().catch(() => {}) }}>Reload saved entries</Button></div>
  const nameLabel = values.entryType === 'individual' ? 'Contestant full name' : 'Entry or group name'
  const ordinaryControls = rounds.length > 0 && !participation.managed && !readOnly
  const entryTypeLabel = entry => ENTRY_TYPES.find(t => t.id === (entry.entryType ?? entry.entry_type))?.label ?? 'Existing entry'
  const actions = entry => !readOnly && <div className="flex gap-3"><button type="button" disabled={blocked} className="text-v-primary disabled:opacity-50" onClick={()=>edit(entry)} aria-label={`Edit ${entry.name}`}>Edit</button><button type="button" disabled={blocked} className="text-v-danger disabled:opacity-50" onClick={()=>remove(entry)} aria-label={`Delete ${entry.name}`}>Delete</button></div>
  const qualification = entry => { const state=entryParticipation(foundation,entry,selectedRoundId); return <><span>{state.status}</span>{state.source && state.assigned.some(r=>r.id===selectedRoundId) && <span className="mt-1 block text-xs text-v-text-subtle">Confirmed from {participation.sources.find(r=>r.id===state.source.round_id)?.name} · source {state.source.calculation_id?.slice(0,8)} · rules {state.source.rules_version?.slice(0,8)}</span>}</> }
  const membershipNames = entry => entryParticipation(foundation,entry,selectedRoundId).assigned.map(r=>r.name).join(', ') || 'None'
  return <div className="min-w-0 space-y-5">
    <header><h2 className="text-xl font-semibold text-v-text">Contestants &amp; Entries</h2><p className="mt-1 text-sm text-v-text-subtle">Register participants, manage competition entries, and prepare round assignments.</p></header>
    {loadError && <div role="alert" className="v-card p-4"><p className="v-error-text">{loadError}</p><Button variant="secondary" onClick={()=>load().catch(()=>{})}>Reload saved entries</Button></div>}
    {readOnly && foundation && <ReadOnlyEventBanner status={foundation.event.status} noun="competition" frozen={Boolean(foundation.event?.official_rules_id ?? foundation.event?.officialRulesId)} />}
    <div className={`grid min-w-0 items-start gap-5 ${!readOnly ? 'xl:grid-cols-[minmax(270px,0.7fr)_minmax(0,2fr)]' : ''}`}>
      {!readOnly && <form ref={formRef} onSubmit={save} className="v-card min-w-0 scroll-mt-24 space-y-4 p-4 sm:p-5" noValidate aria-label="Entry registration">
        <h3 className="font-semibold text-v-text">{editing ? 'Edit entry' : 'Register an entry'}</h3>
        <fieldset disabled={blocked} className="min-w-0 space-y-4">
          <div><label className={LABEL_CLASS} htmlFor="entry-type">Entry type</label><select id="entry-type" className={`${INPUT_CLASS} w-full`} value={values.entryType} onChange={e=>set('entryType',e.target.value)}>{editing && values.entryType==='legacy' && <option value="legacy">Existing type unchanged</option>}{ENTRY_TYPES.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select></div>
          <div><label className={LABEL_CLASS} htmlFor="entry-name">{nameLabel}</label><input id="entry-name" className={`${INPUT_CLASS} w-full`} placeholder={values.entryType==='individual'?'Enter full name':'Enter pair, team, or group name'} value={values.name} onChange={e=>set('name',e.target.value)} required /></div>
          <div className={`grid gap-4 ${divisionsEnabled?'sm:grid-cols-2 xl:grid-cols-1':''}`}><div><label className={LABEL_CLASS} htmlFor="entry-number">Entry number</label><input id="entry-number" type="number" min="1" step="1" className={`${INPUT_CLASS} w-full`} value={values.number} onChange={e=>set('number',e.target.value)} disabled={Boolean(editing)} required />{numberHint && <p className="mt-1 text-xs text-v-text-subtle">{numberHint}</p>}</div>
          {divisionsEnabled && <div><label className={LABEL_CLASS} htmlFor="entry-division">Division</label><select id="entry-division" required className={`${INPUT_CLASS} w-full`} value={values.divisionId} onChange={e=>set('divisionId',e.target.value)}><option value="">Select a division</option>{editing && values.divisionId && !activeDivisions.some(d=>d.id===values.divisionId) && <option value={values.divisionId}>{divisionName(editing)} — existing registration</option>}{activeDivisions.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select>{!activeDivisions.length && <p className="mt-2 text-xs text-v-text-subtle">Create a division in <Link className="text-v-primary underline" to={`${stagePath('competition','workspace',eventId)}?tab=divisions`}>Structure &amp; Scoring</Link> before registering entries.</p>}</div>}</div>
          <div><label className={LABEL_CLASS} htmlFor="entry-label">Entry description <span className="font-normal text-v-text-subtle">(optional)</span></label><input id="entry-label" className={`${INPUT_CLASS} w-full`} value={values.entryLabel} onChange={e=>set('entryLabel',e.target.value)} placeholder="Short description" /></div>
          <ImageUploadField key={editing?.id ?? `new-${formVersion}`} label="Entry photo" variant="photo" onFileSelect={setPhoto} />
          <p className="text-xs leading-relaxed text-v-text-subtle">Registration creates an entry. Assign it to the initial round below; later qualification is confirmed separately.</p>
          {formError && <p role="alert" className="v-error-text">{formError}</p>}
          <div className="flex flex-wrap gap-2"><Button type="submit" loading={busy}>{editing?'Save entry':'Register entry'}</Button>{editing && <Button variant="secondary" onClick={reset}>Cancel edit</Button>}</div>
        </fieldset>
      </form>}
      <section className="min-w-0 space-y-4" aria-label="Registered entries">
        <CompetitionRoundParticipation eventId={eventId} foundation={foundation} rounds={rounds} selectedRoundId={selectedRoundId}
          onSelect={id=>{setSelectedRoundId(id);setSelection([]);setQualifiersOnly(false)}} readOnly={readOnly} blocked={blocked} loadError={loadError}
          selectedCount={selected.length} canAdd={selected.some(e=>eligible(e)&&!assigned.has(e.id))} canRemove={selected.some(e=>assigned.has(e.id))}
          onAssign={()=>assignSelected('add')} onRemove={()=>assignSelected('remove')}
          onViewQualified={()=>{setQualifiersOnly(true);recordsRef.current?.scrollIntoView?.({block:'start'});recordsRef.current?.focus({preventScroll:true})}} />
        {qualifiersOnly&&<div className="flex flex-wrap items-center gap-3 text-xs"><span>Showing approved qualifiers for {selectedRound?.name}</span><button type="button" className="text-v-primary underline" onClick={()=>setQualifiersOnly(false)}>Show all entries</button></div>}
        <FilterBar search={filters.search} onSearchChange={filters.setSearch} searchPlaceholder="Search name or entry number" facetFields={divisionsEnabled?[{id:'division',label:'Division'}]:[]} facets={filters.facets} activeFilters={filters.activeFilters} onFilterChange={filters.setFilter} onClear={filters.clearFilters} hasActiveFilters={filters.hasActiveFilters} resultCount={visible.length} totalCount={filters.totalCount} noun="entries" />
        <div ref={recordsRef} tabIndex={-1} className="v-card min-w-0 scroll-mt-24 overflow-hidden focus:outline-none">
          <div className="hidden overflow-x-auto lg:block"><table className="w-full text-left text-xs"><thead className="bg-v-surface-elevated text-v-text-muted"><tr>{ordinaryControls && <th className="p-3"><input type="checkbox" aria-label="Select all eligible shown entries" disabled={blocked || !selectable.length} checked={Boolean(selectable.length && selectable.every(e=>selection.includes(e.id)))} onChange={e=>setSelection(e.target.checked?selectable.map(e=>e.id):[])} /></th>}<th className="p-3">No.</th><th className="p-3">Name / entry type</th>{divisionsEnabled && <th className="p-3">Division</th>}<th className="p-3">Initial round</th><th className="p-3">Qualification status</th><th className="p-3">Assigned rounds</th>{!readOnly && <th className="p-3">Actions</th>}</tr></thead><tbody>{visible.map(entry=><tr key={entry.id} className="border-t border-v-border text-v-text">{ordinaryControls && <td className="p-3"><input type="checkbox" aria-label={`Select ${entry.name}`} disabled={blocked || (!eligible(entry) && !assigned.has(entry.id))} checked={selection.includes(entry.id)} onChange={e=>selectEntry(entry,e.target.checked)} /></td>}<td className="p-3 align-top">{entry.contestantNumber ?? entry.contestant_number}</td><td className="max-w-48 p-3 align-top"><div className="flex items-start gap-2">{entry.photo && <img src={entry.photo} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />}<div className="min-w-0"><span className="block break-words font-medium">{entry.name}</span><span className="mt-1 block text-v-text-subtle">{entryTypeLabel(entry)}</span></div></div></td>{divisionsEnabled && <td className="p-3 align-top">{divisionName(entry)}</td>}<td className="p-3 align-top">{entryParticipation(foundation,entry,selectedRoundId).initial?.name ?? (rounds.length?'Awaiting assignment':'Event-wide')}</td><td className="max-w-56 p-3 align-top">{qualification(entry)}</td><td className="p-3 align-top">{membershipNames(entry)}</td>{!readOnly && <td className="p-3 align-top">{actions(entry)}</td>}</tr>)}</tbody></table></div>
          <div className="divide-y divide-v-border lg:hidden">{visible.map(entry=><article key={entry.id} className="space-y-3 p-4"><div className="flex items-start gap-3">{ordinaryControls && <input type="checkbox" aria-label={`Select ${entry.name}`} disabled={blocked || (!eligible(entry) && !assigned.has(entry.id))} checked={selection.includes(entry.id)} onChange={e=>selectEntry(entry,e.target.checked)} />}<div className="min-w-0 flex-1"><p className="break-words text-sm font-medium text-v-text">#{entry.contestantNumber ?? entry.contestant_number} · {entry.name}</p><p className="mt-1 text-xs text-v-text-subtle">{entryTypeLabel(entry)}{divisionsEnabled?` · ${divisionName(entry)}`:''}</p></div></div><dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs"><dt className="text-v-text-subtle">Initial round</dt><dd>{entryParticipation(foundation,entry,selectedRoundId).initial?.name ?? (rounds.length?'Awaiting assignment':'Event-wide')}</dd><dt className="text-v-text-subtle">Qualification</dt><dd>{qualification(entry)}</dd><dt className="text-v-text-subtle">Assigned rounds</dt><dd>{membershipNames(entry)}</dd></dl>{actions(entry)}</article>)}</div>
          {!visible.length && <p className="p-5 text-sm text-v-text-subtle">{filters.hasActiveFilters?'No entries match your search.':'No entries registered yet.'}</p>}
        </div>
      </section>
    </div>
  </div>
}
