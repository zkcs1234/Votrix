import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, ChevronRight, Info, LockKeyhole, Plus, Settings2, Trash2 } from 'lucide-react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { nativeCompetitionService as service } from '@/services/competition-native.service'
import { pageantService } from '@/services/pageant.service'
import {fetchCompetitionSetupData, invalidateCompetitionSetupData, setCompetitionSetupData} from '@/services/competition-setup-cache'
import Button from '@/components/ui/Button'
import StageFooter from '@/components/ui/StageFooter'
import { INPUT_CLASS } from '@/utils/uiClasses'
import { COMPETITION_TYPES, COMPETITION_PRESETS, PARTICIPATION_FORMATS } from '../../../../../shared/competition-creation-flow.js'

const message = e => e.response?.data?.message || e.message || 'Unable to save competition choices'
const typeLabel = type => COMPETITION_TYPES.find(([key]) => key === type)?.[1] ?? type
const formatLabel = format => PARTICIPATION_FORMATS.find(([key]) => key === format)?.[1] ?? 'Individual'

export default function CompetitionCategoriesPage({ typeOnly = false }) {
  const { eventId } = useParams(), navigate = useNavigate(), location = useLocation()
  const routePrefetch = !typeOnly && location.state?.categoriesPrefetch?.eventId === eventId
    ? location.state.categoriesPrefetch
    : null
  const consumedPrefetch = useRef(false)
  const [event, setEvent] = useState(routePrefetch?.event ?? null)
  const [children, setChildren] = useState(routePrefetch?.children ?? [])
  const [divisions, setDivisions] = useState(routePrefetch?.divisions ?? [])
  const [type, setType] = useState(routePrefetch?.type ?? '')
  const [customType, setCustomType] = useState(routePrefetch?.customType ?? '')
  const [name, setName] = useState(''), [format, setFormat] = useState('individual')
  const [customOpen, setCustomOpen] = useState(false)
  const [error, setError] = useState(''), [loading, setLoading] = useState(!routePrefetch), [busy, setBusy] = useState(false)
  const pending = useRef(null), operation = useRef(false)

  const load = useCallback(async () => {
    let [ev, list] = await Promise.all([
      fetchCompetitionSetupData(eventId,'event',()=>pageantService.getEvent(eventId)),
      fetchCompetitionSetupData(eventId,'competitions',()=>service.list(eventId)),
    ])
    const savedType = ev.data.event.competitionType ?? ev.data.event.competition_type ?? ''
    const divisionList = savedType === 'pageant'
      ? await fetchCompetitionSetupData(eventId,'divisions',()=>pageantService.listDivisions(eventId))
      : { data: { divisions: [] } }
    let savedChildren = list.data.competitions ?? []
    if (ev.data.event.status === 'draft' && savedType === 'pageant' && divisionList.data.divisions?.length && !savedChildren.some(child =>
      child.origin === 'native' && child.name.trim().toLowerCase() === 'pageant',
    )) {
      await service.create(eventId, {
        id: crypto.randomUUID(),
        name: 'Pageant',
        competitionType: 'pageant',
      })
      const refreshed = await service.list(eventId)
      list = refreshed
      savedChildren = refreshed.data.competitions ?? []
    }
    setEvent(ev.data.event)
    setChildren(savedChildren)
    setDivisions(divisionList.data.divisions ?? [])
    setCompetitionSetupData(eventId,'event',ev)
    setCompetitionSetupData(eventId,'competitions',list)
    if (savedType === 'pageant') setCompetitionSetupData(eventId,'divisions',divisionList)
    setType(COMPETITION_TYPES.some(([key]) => key === savedType) ? savedType : savedType ? 'other' : '')
    setCustomType(COMPETITION_TYPES.some(([key]) => key === savedType) ? '' : savedType)
    setError('')
  }, [eventId])

  useEffect(() => {
    if (routePrefetch && !consumedPrefetch.current) {
      consumedPrefetch.current = true
      setEvent(routePrefetch.event)
      setChildren(routePrefetch.children)
      setDivisions(routePrefetch.divisions)
      setType(routePrefetch.type)
      setCustomType(routePrefetch.customType)
      setError('')
      setLoading(false)
      navigate(location.pathname, { replace: true, state: null })
      return
    }
    if (consumedPrefetch.current && !routePrefetch && location.pathname.endsWith('/categories')) return
    consumedPrefetch.current = false
    let alive = true
    setLoading(true)
    load().catch(e => { if (alive) setError(message(e)) }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [eventId, load, location.pathname, location.state, navigate, routePrefetch, typeOnly])

  const nativeChildren = children.filter(c => c.origin === 'native')
  const pageantChild = nativeChildren.find(c => c.name.trim().toLowerCase() === 'pageant')
  const selectedChildren = type === 'pageant' ? (pageantChild ? [pageantChild] : []) : nativeChildren
  const selectedCount = type === 'pageant' ? selectedChildren.length : nativeChildren.length
  const locked = loading || !event || event.status !== 'draft' || children.some(c => c.official_child_rules_id)
  const lockMessage = event?.status !== 'draft'
    ? 'This event is no longer a draft, so its competition setup is locked.'
    : children.some(c => c.official_child_rules_id)
      ? 'At least one competition has frozen rules. Unfreeze or create a new draft before changing this setup.'
      : ''

  const run = async (action, { onError } = {}) => {
    if (operation.current) return
    operation.current = true; setBusy(true); setError('')
    try {
      const shouldReload = await action()
      if (shouldReload !== false) {
        await invalidateCompetitionSetupData(eventId)
        await load()
      }
    } catch (e) {
      onError?.()
      setError(message(e))
    }
    finally { operation.current = false; setBusy(false) }
  }

  const saveType = () => run(async () => {
    const next = type === 'other' ? customType.trim() : type
    if (!next) throw new Error('Choose a type and name any custom type.')
    const previous = event.competitionType ?? event.competition_type
    const typeChanged = next !== previous
    if (typeChanged && children.length) {
      if (!window.confirm('Changing type removes all draft competitions, their scoring, entry associations, and judge assignments. Shared event entrants are retained. Continue?')) return false
      for (const child of children) await service.remove(eventId, child.id, { expectedSetupRevision: child.setup_revision, expectedInputRevision: child.input_revision })
    }
    const updated = typeChanged
      ? await pageantService.updateEvent(eventId, { competitionType: next })
      : null
    const nextEvent = updated?.data?.event ?? { ...event, competitionType: next, competition_type: next }
    let nextChildren = typeChanged ? [] : children
    const nextDivisions = next === 'pageant'
      ? previous === 'pageant'
        ? divisions
        : (await pageantService.listDivisions(eventId)).data.divisions ?? []
      : []
    if (next === 'pageant' && nextDivisions.length && !nextChildren.some(child =>
      child.origin === 'native' && child.name.trim().toLowerCase() === 'pageant',
    )) {
      const created = await service.create(eventId, {
        id: crypto.randomUUID(),
        name: 'Pageant',
        competitionType: 'pageant',
      })
      nextChildren = [...nextChildren, created.data.competition]
    }
    navigate(`/organizer/competition/events/${eventId}/categories`, {
      state: {
        categoriesPrefetch: {
          eventId,
          event: nextEvent,
          children: nextChildren,
          divisions: nextDivisions,
          type: COMPETITION_TYPES.some(([key]) => key === next) ? next : 'other',
          customType: COMPETITION_TYPES.some(([key]) => key === next) ? '' : next,
        },
      },
    })
    setCompetitionSetupData(eventId,'event',{data:{event:nextEvent}})
    setCompetitionSetupData(eventId,'competitions',{data:{competitions:nextChildren}})
    if (next === 'pageant') setCompetitionSetupData(eventId,'divisions',{data:{divisions:nextDivisions}})
    return false
  })

  const add = choice => {
    const childName = choice.trim()
    if (!childName) { setError('Enter a competition or category name.'); return }
    if (children.some(c => c.name.toLowerCase() === childName.toLowerCase())) { setError('This competition is already selected.'); return }
    if (pending.current?.name !== childName) pending.current = { id: crypto.randomUUID(), name: childName, competitionType: event.competitionType ?? event.competition_type }
    const optimisticId = pending.current.id
    const optimisticChild = {
      ...pending.current,
      origin: 'native',
      participation_format: type === 'pageant' ? 'individual' : format,
      setup_revision: null,
      input_revision: null,
    }
    const previousChildren = children
    setChildren(current => [...current.filter(child => child.id !== optimisticId), optimisticChild])
    run(async () => {
      const { data } = await service.create(eventId, pending.current)
      const edited = await service.edit(eventId, data.competition.id, {
        name: childName,
        competitionType: pending.current.competitionType,
        participationFormat: type === 'pageant' ? 'individual' : format,
        expectedSetupRevision: data.competition.setup_revision,
      })
      const savedChild = edited?.data?.competition ?? {
        ...data.competition,
        participation_format: type === 'pageant' ? 'individual' : format,
      }
      setChildren(current => current.map(child =>
        child.id === optimisticId ? savedChild : child,
      ))
      setCompetitionSetupData(eventId,'competitions',current => ({
        ...current,
        data: {
          ...current?.data,
          competitions: [...(current?.data?.competitions ?? children), savedChild],
        },
      }))
      pending.current = null
      setName('')
      return false
    }, {
      onError: () => setChildren(previousChildren),
    })
  }

  const addPageantDivision = divisionName => {
    const normalizedName = divisionName.trim()
    if (!normalizedName) { setError('Enter a division name.'); return }
    if (divisions.some(division => division.name.toLowerCase() === normalizedName.toLowerCase())) {
      setError('This division is already configured.')
      return
    }
    const optimisticDivision = { id: crypto.randomUUID(), name: normalizedName }
    const previousDivisions = divisions
    const previousChildren = children
    setDivisions(current => [...current, optimisticDivision])
    if (!pageantChild) {
      setChildren(current => [...current, {
        id: crypto.randomUUID(),
        name: 'Pageant',
        competitionType: 'pageant',
        origin: 'native',
        participation_format: 'individual',
      }])
    }
    run(async () => {
      if (!pageantChild) {
        const request = pending.current?.name === 'Pageant'
          ? pending.current
          : { id: crypto.randomUUID(), name: 'Pageant', competitionType: 'pageant' }
        pending.current = request
        const created = await service.create(eventId, request)
        setChildren(current => current.map(child => child.name === 'Pageant' && !child.setup_revision
          ? created.data.competition
          : child))
        setCompetitionSetupData(eventId,'competitions',current => ({
          ...current,
          data: {
            ...current?.data,
            competitions: [...(current?.data?.competitions ?? children), created.data.competition],
          },
        }))
        pending.current = null
      }
      if (!divisions.length && !(event.divisionsEnabled ?? event.divisions_enabled)) {
        await pageantService.setDivisionsEnabled(eventId, true)
      }
      const createdDivision = await pageantService.createDivision(eventId, { name: normalizedName })
      setDivisions(current => current.map(division =>
        division.id === optimisticDivision.id ? createdDivision.data.division : division,
      ))
      setCompetitionSetupData(eventId,'divisions',current => ({
        ...current,
        data: { ...current?.data, divisions: [...(current?.data?.divisions ?? divisions), createdDivision.data.division] },
      }))
      setName('')
      return false
    }, {
      onError: () => {
        setDivisions(previousDivisions)
        setChildren(previousChildren)
      },
    })
  }

  const removePageantDivision = division => {
    if (!division) return
    if (!window.confirm(`Remove the ${division.name} division? Divisions with registered contestants cannot be deleted.`)) return
    const previousDivisions = divisions
    setDivisions(current => current.filter(item => item.id !== division.id))
    run(async () => {
      await pageantService.deleteDivision(eventId, division.id)
      setCompetitionSetupData(eventId,'divisions',current => ({
        ...current,
        data: { ...current?.data, divisions: (current?.data?.divisions ?? divisions).filter(item => item.id !== division.id) },
      }))
      return false
    }, { onError: () => setDivisions(previousDivisions) })
  }

  const remove = child => {
    if (window.confirm(`Remove ${child.name} and its scoring, entry associations, and assignments?`)) {
      const previousChildren = children
      setChildren(current => current.filter(item => item.id !== child.id))
      run(async () => {
        await service.remove(eventId, child.id, { expectedSetupRevision: child.setup_revision, expectedInputRevision: child.input_revision })
        setCompetitionSetupData(eventId,'competitions',current => ({
          ...current,
          data: { ...current?.data, competitions: (current?.data?.competitions ?? children).filter(item => item.id !== child.id) },
        }))
        return false
      }, { onError: () => setChildren(previousChildren) })
    }
  }

  if (typeOnly) {
    return <section className="mx-auto max-w-2xl space-y-6 pb-20">
      <header className="space-y-2">
        <p className="text-sm font-semibold text-v-primary">Step 3 of 6</p>
        <h1 className="v-page-title">What kind of competition is this?</h1>
        <p className="v-helper-text text-sm">Choose the type that best matches your event. We will suggest common categories in the next step.</p>
      </header>
      {error && <ErrorCard error={error} retry={() => run(load)} />}
      <fieldset disabled={locked || busy} className="v-card space-y-5 p-5 sm:p-6">
        <label className="block">
          <span className="v-label">Competition type</span>
          <select className={INPUT_CLASS} value={type} onChange={e => setType(e.target.value)}>
            <option value="">Choose a type</option>
            {COMPETITION_TYPES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        {type === 'other' && <label className="block">
          <span className="v-label">Name your competition type</span>
          <input className={INPUT_CLASS} maxLength={32} placeholder="e.g. Cultural Showcase" value={customType} onChange={e => setCustomType(e.target.value)} />
        </label>}
        {children.length > 0 && <Notice>Changing the saved type removes its dependent draft setup, but shared event entrants are retained.</Notice>}
      </fieldset>
      <StageFooter module="competition" currentKey="type" eventId={eventId} saving={busy} onNext={locked ? () => navigate(`/organizer/competition/events/${eventId}/categories`) : saveType} nextDisabled={!type || type === 'other' && !customType.trim() || !!error || loading} />
    </section>
  }

  const presets = COMPETITION_PRESETS[type] ?? []
  return <section className="mx-auto max-w-5xl space-y-7 pb-20">
    <header className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-v-primary">Step 4 of 6</p>
          <h1 className="v-page-title">Choose your {type === 'pageant' ? 'divisions' : 'competitions'}</h1>
        </div>
        {type && <span className="v-badge border border-v-border bg-v-surface-elevated">{typeLabel(type)}</span>}
      </div>
      <p className="v-helper-text max-w-2xl text-sm">{type === 'pageant' ? 'Choose divisions within one Pageant competition. Scoring rules, rounds, and judges are configured once for the Pageant.' : 'Select everything that will be judged separately. Each selection gets its own contestants, criteria, judges, rounds, and results.'}</p>
    </header>

    {error && <ErrorCard error={error} retry={() => run(load)} />}
    {lockMessage && <div className="flex items-start gap-3 rounded-xl border border-v-border bg-v-surface-elevated p-4 text-sm text-v-text-muted"><LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-v-text-subtle" /><p>{lockMessage}</p></div>}
    {loading && <p role="status" className="v-helper-text">Loading your saved competitions…</p>}

    {!loading && <div className="grid items-start gap-6 lg:grid-cols-[minmax(280px,0.9fr)_minmax(500px,1.6fr)]">
      <fieldset disabled={locked || busy} className="space-y-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="v-section-title">Suggested choices</h2>
            <p className="v-helper-text">Click a card to add or remove it.</p>
          </div>
          <span className="text-sm font-medium text-v-text-muted">{selectedCount} selected</span>
        </div>
        {presets.length ? <div className="grid gap-2">
          {presets.map(choice => {
            const selected = type === 'pageant'
              ? divisions.some(division => division.name.toLowerCase() === choice.toLowerCase())
              : children.some(c => c.name.toLowerCase() === choice.toLowerCase())
            const child = children.find(c => c.name.toLowerCase() === choice.toLowerCase())
            return <label key={choice} className={`group flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 transition ${selected ? 'border-v-primary bg-v-primary-soft/40 ring-1 ring-v-primary' : 'border-v-border bg-v-surface hover:border-v-primary/60 hover:bg-v-surface-elevated'}`}>
              <input className="sr-only" type="checkbox" checked={selected} onChange={e => type === 'pageant' ? (e.target.checked ? addPageantDivision(choice) : removePageantDivision(divisions.find(division => division.name.toLowerCase() === choice.toLowerCase()))) : (e.target.checked ? add(choice) : remove(child))} />
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${selected ? 'border-v-primary bg-v-primary text-white' : 'border-v-border-strong text-transparent group-hover:border-v-primary'}`}><Check className="h-3.5 w-3.5" /></span>
              <span className="text-xs font-medium text-v-text">{choice}</span>
            </label>
          })}
        </div> : <div className="v-empty-state"><Info className="h-6 w-6 text-v-text-subtle" /><p className="v-empty-state-title">Add your own competition below</p><p className="v-empty-state-description">There are no preset choices for this competition type.</p></div>}

        {!customOpen ? <button type="button" disabled={locked || busy} onClick={() => setCustomOpen(true)} className="group flex min-h-12 w-full cursor-pointer items-center gap-2 rounded-lg border border-dashed border-v-border-strong bg-v-surface px-3 py-2.5 text-left transition hover:border-v-primary/60 hover:bg-v-surface-elevated disabled:cursor-not-allowed disabled:opacity-60">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-v-border-strong text-v-primary group-hover:border-v-primary"><Plus className="h-3.5 w-3.5" /></span>
          <span><span className="block text-xs font-semibold text-v-text">Add a custom {type === 'pageant' ? 'division' : 'competition'}</span><span className="v-helper-text">Use this when it is not in the suggestions.</span></span>
        </button> : <div className="rounded-lg border border-v-primary bg-v-primary-soft/30 p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2"><span className="flex h-5 w-5 items-center justify-center rounded border border-v-primary bg-v-primary text-white"><Plus className="h-3.5 w-3.5" /></span><span className="text-xs font-semibold text-v-text">Add a custom {type === 'pageant' ? 'division' : 'competition'}</span></div>
            <button type="button" className="text-xs text-v-text-subtle hover:text-v-text" onClick={() => { setCustomOpen(false); setName('') }}>Cancel</button>
          </div>
          <form onSubmit={e => { e.preventDefault(); type === 'pageant' ? addPageantDivision(name) : add(name) }} className="grid gap-2">
            <label><span className="v-label">{type === 'pageant' ? 'Division name' : 'Competition name'}</span><input autoFocus className={INPUT_CLASS} maxLength={200} required placeholder={type === 'pageant' ? 'e.g. Teen Division' : 'e.g. Original Song'} value={name} onChange={e => setName(e.target.value)} /></label>
            <div className="flex items-end gap-2">
              {type !== 'pageant' && <label className="min-w-0 flex-1"><span className="v-label">Participants</span><select className={INPUT_CLASS} value={format} onChange={e => setFormat(e.target.value)}>{PARTICIPATION_FORMATS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>}
              <Button type="submit"><Plus className="h-4 w-4" />Add</Button>
            </div>
          </form>
        </div>}
      </fieldset>

      <section className="space-y-4 lg:sticky lg:top-6" aria-labelledby="selected-competitions-heading">
        <div className="flex items-end justify-between gap-3">
          <div><h2 id="selected-competitions-heading" className="v-section-title">Your selected competitions</h2><p className="v-helper-text">Review each one before scoring setup.</p></div>
          <span className="v-badge border border-v-primary bg-v-primary-soft text-v-primary">{selectedCount}</span>
        </div>
        {selectedChildren.length > 0 ? <div className="space-y-3">
          {selectedChildren.map(child => <article key={child.id} className="v-card flex flex-col gap-3 p-4">
            <div className="flex items-start justify-between gap-2"><div><h3 className="text-base font-semibold text-v-text">{child.name}</h3><p className="v-helper-text">{type === 'pageant' ? `${divisions.length} ${divisions.length === 1 ? 'division' : 'divisions'}${divisions.length ? ` · ${divisions.map(division => division.name).join(' · ')}` : ''}` : child.official_child_rules_id ? 'Rules frozen' : 'Ready for scoring setup'}</p></div>{type !== 'pageant' && <span className="v-badge border border-v-border px-2 py-0.5 text-[0.7rem]">{formatLabel(child.participation_format)}</span>}</div>
            {type === 'pageant' ? <ul className="flex flex-wrap gap-2">{divisions.map(division => <li key={division.id} className="inline-flex items-center gap-2 rounded-full border border-v-border bg-v-surface-elevated px-3 py-1 text-xs text-v-text">{division.name}<button type="button" disabled={locked || busy} aria-label={`Remove ${division.name} division`} onClick={() => removePageantDivision(division)} className="font-semibold text-v-text-subtle hover:text-v-danger">×</button></li>)}</ul> : <label><span className="v-label text-xs">Participant format</span><select className={`${INPUT_CLASS} py-1.5 text-xs`} disabled={locked || busy} value={child.participation_format ?? 'individual'} onChange={e => run(() => service.edit(eventId, child.id, { name: child.name, competitionType: child.competition_type, participationFormat: e.target.value, expectedSetupRevision: child.setup_revision }))}>{PARTICIPATION_FORMATS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>}
            <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-v-border pt-2">
              <Link className="inline-flex items-center gap-1 text-xs font-semibold text-v-primary hover:underline" to={`/organizer/competition/events/${eventId}/workspace?competitionId=${child.id}`}>{type === 'pageant' ? 'Configure Pageant scoring' : 'Configure scoring'} <ChevronRight className="h-3.5 w-3.5" /></Link>
              {type !== 'pageant' && <Button className="px-2 py-1 text-xs" variant="secondary" disabled={locked || busy} onClick={() => remove(child)}><Trash2 className="h-3.5 w-3.5" />Remove</Button>}
            </div>
          </article>)}
        </div> : <div className="v-empty-state py-10"><Settings2 className="h-8 w-8 text-v-text-subtle" /><p className="v-empty-state-title">Nothing selected yet</p><p className="v-empty-state-description">Choose a card or add a custom competition on the left.</p></div>}
      </section>
    </div>}
    <StageFooter module="competition" currentKey="categories" eventId={eventId} saving={busy} nextDisabled={!(type === 'pageant' ? pageantChild && divisions.length > 0 : nativeChildren.length > 0) || !!error || loading} />
  </section>
}

function Notice({ children }) {
  return <div className="flex items-start gap-2 rounded-lg border border-v-border bg-v-surface-elevated p-3 text-xs text-v-text-muted"><Info className="mt-0.5 h-4 w-4 shrink-0 text-v-text-subtle" />{children}</div>
}

function ErrorCard({ error, retry }) {
  return <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-v-danger/30 bg-v-danger/5 p-4"><p className="v-error-text m-0">{error}</p><Button variant="secondary" onClick={retry}>Retry</Button></div>
}
