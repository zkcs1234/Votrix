import CompetitionRulesEditor from '@/components/organizer/competition/CompetitionRulesEditor'
import CompetitionRoundsTab from '@/components/organizer/competition/CompetitionRoundsTab'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { createPortal } from 'react-dom'
import useCriteriaSave from '@/hooks/useCriteriaSave'
import { criteriaProgressState } from '@/components/organizer/competition/CriteriaProgress'
import { evaluateCriteriaReadiness } from '../../../../../shared/competition-criteria-readiness.js'

import { pageantService } from '@/services/pageant.service'
import { useToast } from '@/hooks/useToast'
import { getErrorMessage } from '@/utils/getErrorMessage'
import Button from '@/components/ui/Button'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import CriteriaManager from '@/components/organizer/competition/CriteriaManager'
import ReadOnlyEventBanner from '@/components/organizer/ReadOnlyEventBanner'
import useEventStatus from '@/hooks/useEventStatus'
import { INPUT_CLASS, LABEL_CLASS } from '@/utils/uiClasses'
import { stagePath } from '@/utils/eventStages'

// The Structure & Scoring workspace walks through its tabs like the event form's
// stages: Rounds → Criteria → Divisions → Scoring rules → (Continue to Contestants).
const WORKSPACE_TAB_FLOW = ['rounds', 'criteria', 'divisions', 'scoring']
const WORKSPACE_TAB_LABEL = {
  rounds: 'Rounds',
  criteria: 'Criteria',
  divisions: 'Divisions',
  scoring: 'Scoring rules',
}
// Tabs that can be deep-linked via ?tab= (e.g. from a round's criteria summary).
const WORKSPACE_TABS = ['rounds', 'criteria', 'divisions', 'scoring', 'structure']

// Phase 4 — Competition Scoring Foundation workspace.
// Single page that exposes the dynamic structure of an event:
// categories, rounds, criteria, contestants, judges, and scoring config.
export default function CompetitionWorkspacePage() {
  const { eventId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const { status, setupLocked, loading: statusLoading } = useEventStatus(pageantService, eventId)
  const [foundation, setFoundation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [roundCount, setRoundCount] = useState(0)
  const requestRef = useRef(0)
  const latestLoad = useRef(null)
  const [footerHeight, setFooterHeight] = useState(144)
  const requestedTab = searchParams.get('tab')
  const activeTab = WORKSPACE_TABS.includes(requestedTab) ? requestedTab : 'rounds'
  const setActiveTab = tab => setSearchParams(current => {
    const next = new URLSearchParams(current)
    next.set('tab', tab)
    next.delete('section')
    return next
  })
  const configureCriteria = roundId => setSearchParams(current => {
    const next = new URLSearchParams(current)
    next.set('tab', 'criteria')
    if (roundId) next.set('roundId', roundId)
    else next.delete('roundId')
    next.delete('section')
    return next
  })
  const configureDeductions = roundId => setSearchParams(current => {
    const next = new URLSearchParams(current)
    next.set('tab', 'scoring'); next.set('roundId', roundId); next.set('section', 'deductions')
    return next
  })
  const load = useCallback(() => {
    const request = ++requestRef.current
    const promise = (async () => { try {
      const { data } = await pageantService.getFoundation(eventId)
      if (request !== requestRef.current) return latestLoad.current
      setFoundation(data.foundation); setRoundCount(data.foundation.rounds?.length ?? 0); setLoadError('')
      return data.foundation
    } catch (error) {
      if (request !== requestRef.current) return latestLoad.current
      if (request === requestRef.current) setLoadError(getErrorMessage(error))
      throw error
    } finally { if (request === requestRef.current) setLoading(false) }
    })()
    latestLoad.current = promise
    return promise
  }, [eventId])
  const { save: saveCriteria, state: criteriaSaveState, recover: recoverCriteriaSave } = useCriteriaSave(load)
  const progress = useMemo(() => criteriaProgressState(foundation?.criteriaReadiness ?? evaluateCriteriaReadiness(foundation ?? {}), criteriaSaveState, loadError), [foundation, criteriaSaveState, loadError])
  const selectedRoundParam = searchParams.get('roundId')

  const handleTabKey = (event, tabId) => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const index = WORKSPACE_TAB_FLOW.indexOf(tabId)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? WORKSPACE_TAB_FLOW.length - 1
      : (index + (event.key === 'ArrowRight' ? 1 : -1) + WORKSPACE_TAB_FLOW.length) % WORKSPACE_TAB_FLOW.length
    setActiveTab(WORKSPACE_TAB_FLOW[next])
    document.getElementById(`workspace-tab-${WORKSPACE_TAB_FLOW[next]}`)?.focus()
  }

  useEffect(() => {
    void load().catch(() => {})
  }, [load, activeTab, selectedRoundParam])

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner />
      </div>
    )
  }
  if (!foundation) return <div className="v-card space-y-3 p-5"><p role="alert" className="v-error-text">{loadError || 'Could not load Structure & Scoring.'}</p><Button onClick={() => { setLoading(true); void load().catch(() => {}) }}>Retry</Button></div>

  return (
    <div className="space-y-5" style={activeTab === 'criteria' ? { paddingBottom: footerHeight + 16 } : undefined}>
      <div className={activeTab === 'rounds' ? 'flex items-start justify-between gap-3' : 'flex flex-wrap items-center justify-between gap-3'}>
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-v-text">
            {activeTab === 'rounds' ? 'Competition Rounds' : activeTab === 'criteria' ? 'Scoring Criteria' : 'Structure & Scoring'}
          </h2>
          <p className="mt-1 text-sm text-v-text-subtle">
            {activeTab === 'rounds' ? 'Create and manage the judging stages of your competition.' : activeTab === 'criteria' ? 'Configure what judges will score in each competition round.' : 'Set up judging rounds, scoring criteria, divisions, and scoring rules for your competition.'}
          </p>
        </div>
        {activeTab === 'rounds' ? <span className="shrink-0 rounded-md border border-v-border bg-v-surface px-2.5 py-1 text-xs text-v-text-muted">{roundCount} {roundCount === 1 ? 'round' : 'rounds'}</span>
        : <div className="flex flex-wrap items-center gap-2 text-sm">
          <SubNav to={`/organizer/competition/events/${eventId}/contestants`}>
            Contestants
          </SubNav>
          <SubNav to={`/organizer/competition/events/${eventId}/judges`}>Judges</SubNav>
          <SubNav to={`/organizer/competition/events/${eventId}/rankings`}>
            Rankings
          </SubNav>
        </div>}
      </div>

      <div className="min-w-0 overflow-x-auto overflow-y-hidden border-b border-v-border text-sm">
        <div className="flex w-max min-w-full gap-2" role="tablist" aria-label="Structure and scoring">
          {/* Categories (grouping rounds into weighted buckets) are hidden for now —
              rounds already carry their own weight. The tab/StructureTab and the
              backend/engine are left intact so the feature can be re-enabled later. */}
          {[
            { id: 'rounds', label: 'Rounds' },
            { id: 'criteria', label: 'Criteria' },
            { id: 'divisions', label: 'Divisions' },
            { id: 'scoring', label: 'Scoring rules' },
          ].map((tab) => (
            <button
              key={tab.id}
              id={`workspace-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`workspace-panel-${tab.id}`}
              tabIndex={activeTab === tab.id || (activeTab === 'structure' && tab.id === 'rounds') ? 0 : -1}
              onKeyDown={event => handleTabKey(event, tab.id)}
              onClick={() => setActiveTab(tab.id)}
              className={`-mb-px border-b-2 px-3 py-2 ${
                activeTab === tab.id
                  ? 'border-v-primary text-v-text'
                  : 'border-transparent text-v-text-subtle hover:text-v-text-muted'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {!statusLoading && setupLocked && (
        <ReadOnlyEventBanner status={status} noun="competition" />
      )}

      {activeTab !== 'rounds' && activeTab !== 'criteria' && <TypeHint type={foundation?.event?.competition_type} />}
      {activeTab === 'criteria' && loadError && !criteriaSaveState.error && <div role="alert" className="v-card space-y-2 p-3"><p className="text-sm text-v-text-muted">{loadError}</p><Button variant="secondary" onClick={() => { void load().catch(() => {}) }}>Reload saved criteria</Button></div>}

      <div role="tabpanel" id={`workspace-panel-${activeTab}`} aria-labelledby={activeTab === 'structure' ? undefined : `workspace-tab-${activeTab}`} aria-label={activeTab === 'structure' ? 'Categories' : undefined}>
      {activeTab === 'structure' && <StructureTab foundation={foundation} reload={load} />}
      {activeTab === 'divisions' && <DivisionsTab foundation={foundation} reload={load} />}
      {activeTab === 'rounds' && <CompetitionRoundsTab key={eventId} eventId={eventId} foundation={foundation} reload={load}
        readOnly={setupLocked || statusLoading || Boolean(foundation.event?.official_rules_id)} onConfigureCriteria={configureCriteria} onConfigureDeductions={configureDeductions} onCountChange={setRoundCount} />}
      {activeTab === 'criteria' && (
        <CriteriaManager key={eventId} eventId={eventId} foundation={foundation} initialRoundId={selectedRoundParam} onRoundChange={configureCriteria}
          progress={progress} saveCriteria={saveCriteria} saveState={criteriaSaveState} recoverSave={recoverCriteriaSave} readOnly={setupLocked || statusLoading} />
      )}
      {activeTab === 'scoring' && <CompetitionRulesEditor foundation={foundation} reload={load} eventId={eventId} readOnly={setupLocked} initialSection={searchParams.get('section')} />}
      </div>

      <WorkspaceStageFooter eventId={eventId} activeTab={activeTab} setActiveTab={setActiveTab} criteriaReady={progress.allReady} incompleteScopes={progress.scopes.filter(scope => !scope.ready)} onHeightChange={setFooterHeight} />
    </div>
  )
}

// Keep workspace navigation in document flow so it never covers forms/cards.
function WorkspaceStageFooter({ eventId, activeTab, setActiveTab, criteriaReady, incompleteScopes, onHeightChange }) {
  const idx = WORKSPACE_TAB_FLOW.indexOf(activeTab)
  const footerRef = useRef(null)
  const sticky = activeTab === 'criteria'
  useEffect(() => {
    if (!sticky || !footerRef.current) return
    const measure = () => onHeightChange(footerRef.current?.getBoundingClientRect().height ?? 144)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(footerRef.current)
    return () => observer.disconnect()
  }, [sticky, onHeightChange])

  let back
  let next
  if (activeTab === 'structure') {
    // Categories is an advanced side-tab, not part of the linear flow.
    back = { label: 'Back: Rounds', onClick: () => setActiveTab('rounds') }
    next = { label: 'Next: Scoring rules', onClick: () => setActiveTab('scoring') }
  } else {
    back =
      idx <= 0
        ? { label: 'Back: Branding', href: stagePath('competition', 'branding', eventId) }
        : {
            label: `Back: ${WORKSPACE_TAB_LABEL[WORKSPACE_TAB_FLOW[idx - 1]]}`,
            onClick: () => setActiveTab(WORKSPACE_TAB_FLOW[idx - 1]),
          }
    next =
      idx >= WORKSPACE_TAB_FLOW.length - 1
        ? { label: 'Continue to Contestants', href: `/organizer/competition/events/${eventId}/contestants` }
        : {
            label: `Continue to ${WORKSPACE_TAB_LABEL[WORKSPACE_TAB_FLOW[idx + 1]]}`,
            onClick: () => setActiveTab(WORKSPACE_TAB_FLOW[idx + 1]),
          }
  }

  const content = (
    <div ref={footerRef} data-workspace-footer className="v-rounds z-40 border-t border-v-border bg-v-surface shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
      {sticky && !criteriaReady && <p id="criteria-footer-requirements" className="px-4 pt-2 text-xs text-v-text-muted sm:px-6 md:px-8">Complete scoring criteria{incompleteScopes.length ? ` in ${incompleteScopes.map(scope => scope.name).join(', ')}` : ''} before continuing.</p>}
      <div className="mx-auto flex w-full flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-6 sm:py-3 md:px-8">
        <div className={sticky ? 'flex w-full items-center gap-3 sm:w-auto' : 'flex items-center gap-3'}>
          {back.href ? (
            <Link to={back.href}>
              <Button type="button" variant="secondary">
                <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
                {back.label}
              </Button>
            </Link>
          ) : (
            <Button type="button" variant="secondary" onClick={back.onClick} className={sticky ? 'w-full sm:w-auto' : ''}>
              <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
              {back.label}
            </Button>
          )}
        </div>
        <div className={sticky ? 'flex w-full items-center gap-3 sm:w-auto' : 'flex items-center gap-3'}>
          {next.href ? (
            <Link to={next.href}>
              <Button type="button">
                {next.label}
                <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
              </Button>
            </Link>
          ) : (
            <Button type="button" onClick={next.onClick} className={sticky ? 'w-full sm:w-auto' : ''} disabled={sticky && !criteriaReady} aria-describedby={sticky && !criteriaReady ? 'criteria-footer-requirements' : undefined}>
              {next.label}
              <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
            </Button>
          )}
        </div>
      </div>
    </div>
  )

  const portalTarget = sticky && document.getElementById('stage-footer-portal')
  return portalTarget ? createPortal(content, portalTarget) : <div className={sticky ? 'sticky bottom-0 z-40' : 'pt-1'}>{content}</div>
}

function SubNav({ to, children }) {
  return (
    <Link
      to={to}
      className="rounded-lg border border-v-border px-3 py-1.5 text-v-text-muted hover:bg-v-surface-elevated"
    >
      {children}
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------
function StructureTab({ foundation, reload }) {
  const { eventId } = useParams()
  const divisionsEnabled = foundation?.event?.divisions_enabled
  const divisions = foundation?.divisions ?? []

  const [name, setName] = useState('')
  const [weight, setWeight] = useState(0)
  const [divisionId, setDivisionId] = useState('')
  const [saving, setSaving] = useState(false)

  const totalWeight = useMemo(
    () => (foundation?.categories ?? []).reduce((s, c) => s + Number(c.weight), 0),
    [foundation],
  )

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await pageantService.createCategory(eventId, { 
        name, 
        weight: Number(weight),
        divisionId: divisionId || null 
      })
      setName('')
      setWeight(0)
      setDivisionId('')
      reload()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-v-border bg-v-surface-elevated/50 px-4 py-2.5 text-xs text-v-text-muted">
        <strong>Advanced.</strong> Categories group rounds into higher-level weighted buckets (e.g. a
        “Talent” category holding a prelim and a final round). Most competitions don&apos;t need this —
        rounds already carry their own weight. Assign a round to a category in the Rounds tab.
      </div>
      <form
        onSubmit={submit}
        className={`grid gap-4 v-card p-6 ${divisionsEnabled ? 'sm:grid-cols-[1fr_120px_1fr_auto]' : 'sm:grid-cols-[1fr_120px_auto]'}`}
      >
        <div>
          <label className={LABEL_CLASS}>Category name</label>
          <input
            className={INPUT_CLASS}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Talent, Evening Gown"
            required
          />
        </div>
        <div>
          <label className={LABEL_CLASS}>Weight %</label>
          <input
            type="number"
            step="0.01"
            className={INPUT_CLASS}
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            min={0}
            max={100}
          />
        </div>
        {divisionsEnabled && (
          <div>
            <label className={LABEL_CLASS}>Division (optional)</label>
            <select
              className={INPUT_CLASS}
              value={divisionId}
              onChange={(e) => setDivisionId(e.target.value)}
            >
              <option value="">— Event-wide —</option>
              {divisions.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
        )}
        <div className="flex items-end">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-v-primary px-4 py-2 text-sm text-white disabled:opacity-60"
          >
            Add category
          </button>
        </div>
      </form>

      <p
        className={`text-sm ${
          Math.abs(totalWeight - 100) < 0.01 ? 'text-v-success' : 'text-amber-400'
        }`}
      >
        Category weight total: {totalWeight.toFixed(2)}% (must equal 100%)
      </p>

      <ul className="space-y-2">
        {(foundation?.categories ?? []).map((cat) => (
          <CategoryRow key={cat.id} cat={cat} eventId={eventId} reload={reload} divisionsEnabled={divisionsEnabled} divisions={divisions} />
        ))}
        {!foundation?.categories?.length && (
          <li className="rounded-lg border border-dashed border-v-border px-4 py-6 text-center text-sm text-v-text-subtle">
            No categories yet. Categories are optional — add them to group criteria and rounds.
          </li>
        )}
      </ul>
    </div>
  )
}

function CategoryRow({ cat, eventId, reload, divisionsEnabled, divisions }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({
    name: cat.name,
    weight: cat.weight,
    divisionId: cat.divisionId || '',
    isActive: cat.isActive,
  })

  const save = async () => {
    await pageantService.updateCategory(eventId, cat.id, {
      name: draft.name,
      weight: Number(draft.weight),
      divisionId: draft.divisionId || null,
      isActive: draft.isActive,
    })
    setEditing(false)
    reload()
  }

  const remove = async () => {
    if (!confirm('Delete this category?')) return
    await pageantService.deleteCategory(eventId, cat.id)
    reload()
  }

  const divisionName = cat.divisionId ? divisions.find(d => d.id === cat.divisionId)?.name : null

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-v-border px-4 py-3">
      {editing ? (
        <div className="flex w-full flex-wrap items-end gap-2">
          <input
            className={INPUT_CLASS}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          <input
            type="number"
            step="0.01"
            className={INPUT_CLASS}
            value={draft.weight}
            onChange={(e) => setDraft({ ...draft, weight: e.target.value })}
          />
          {divisionsEnabled && (
            <select
              className={INPUT_CLASS}
              value={draft.divisionId}
              onChange={(e) => setDraft({ ...draft, divisionId: e.target.value })}
            >
              <option value="">— Event-wide —</option>
              {divisions.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          )}
          <label className="flex items-center gap-1 text-xs text-v-text-muted">
            <input
              type="checkbox"
              checked={draft.isActive}
              onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
            />
            Active
          </label>
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={save} className="text-v-success text-sm">
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-v-text-subtle text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <div>
              <p className="font-medium text-v-text">{cat.name}</p>
              <p className="text-xs text-v-text-subtle">
                {cat.weight}% · {cat.isActive ? 'Active' : 'Inactive'}
              </p>
            </div>
            {divisionsEnabled && divisionName && (
              <span className="rounded-full bg-v-primary/10 px-2 py-0.5 text-[10px] font-medium text-v-primary uppercase tracking-wide">
                {divisionName}
              </span>
            )}
          </div>
          <div className="flex gap-2 text-sm">
            <button type="button" onClick={() => setEditing(true)} className="text-v-text-muted">
              Edit
            </button>
            <button type="button" onClick={remove} className="text-v-danger">
              Delete
            </button>
          </div>
        </>
      )}
    </li>
  )
}

// L3 — soft signposting: a read-only hint about which optional layers a given
// competition type usually needs. Every tab stays available; nothing is hidden.
const TYPE_HINTS = {
  pageant:
    'Pageant setup: create rounds like Talent, Evening Gown, and Q&A — then give each round its own criteria (on the Criteria page).',
  dance:
    'Dance setup: create rounds (e.g. Preliminary → Final) with dance criteria; use Divisions for solo vs team.',
  singing:
    'Singing setup: add your criteria (Pitch, Tone, Performance). Add rounds only if you run heats and a final.',
  talent:
    'Talent setup: add flat criteria (Skill, Creativity, Presentation). Rounds are optional.',
  simple:
    'Simple setup: just add contestants and criteria — no rounds, divisions, or categories needed.',
}

function TypeHint({ type }) {
  const hint = type && TYPE_HINTS[type]
  if (!hint) return null
  return (
    <div className="rounded-lg border border-v-border bg-v-surface-elevated/50 px-4 py-2.5 text-xs text-v-text-muted">
      {hint}
    </div>
  )
}

function DivisionsTab({ foundation, reload }) {
  const { eventId } = useParams()
  const {error:toastError} = useToast()
  const divisionsEnabled = foundation?.event?.divisions_enabled ?? false
  const divisions = foundation?.divisions ?? []

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  const toggleEnabled = async () => {
    setSaving(true)
    try {
      await pageantService.setDivisionsEnabled(eventId, !divisionsEnabled)
      reload()
    } finally {
      setSaving(false)
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await pageantService.createDivision(eventId, { name, description })
      setName('')
      setDescription('')
      reload()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="v-card p-6 flex flex-wrap items-center justify-between gap-4 border border-v-primary/30 bg-v-primary/5">
        <div>
          <h3 className="text-lg font-semibold text-v-text">Enable Divisions</h3>
          <p className="text-sm text-v-text-subtle mt-1">
            Group contestants by category (e.g., Male, Female, Junior, Senior) to compute separate rankings.
          </p>
        </div>
        <button
          onClick={toggleEnabled}
          disabled={saving}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            divisionsEnabled 
              ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20' 
              : 'bg-v-primary text-white hover:bg-v-primary/90'
          }`}
        >
          {divisionsEnabled ? 'Disable Divisions' : 'Enable Divisions'}
        </button>
      </div>

      {divisionsEnabled && (
        <>
          <form onSubmit={submit} className="grid gap-4 v-card p-6 sm:grid-cols-[1fr_2fr_auto]">
            <div>
              <label className={LABEL_CLASS}>Division name</label>
              <input
                className={INPUT_CLASS}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Senior"
                required
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Description (Optional)</label>
              <input
                className={INPUT_CLASS}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Contestants aged 18 and above"
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={saving || !name.trim()}
                className="rounded-lg bg-v-primary px-4 py-2 text-sm text-white disabled:opacity-60"
              >
                Add division
              </button>
            </div>
          </form>

          <ul className="space-y-2">
            {divisions.map((div) => (
              <div key={div.id}><DivisionRow division={div} eventId={eventId} reload={reload}/><div className="flex gap-3 mb-3">{[-1,1].map(delta=><button key={delta} type="button" className="v-caption underline" onClick={async()=>{const i=divisions.findIndex(d=>d.id===div.id),j=i+delta;if(j<0||j>=divisions.length)return;try{await pageantService.updateDivision(eventId,div.id,{displayOrder:j});await pageantService.updateDivision(eventId,divisions[j].id,{displayOrder:i});reload()}catch(e){toastError(getErrorMessage(e))}}}>{delta<0?'Move division earlier':'Move division later'}</button>)}</div></div>
            ))}
            {divisions.length === 0 && (
              <li className="rounded-lg border border-dashed border-v-border px-4 py-6 text-center text-sm text-v-text-subtle">
                No divisions added yet. Add a division above to group your contestants.
              </li>
            )}
          </ul>
        </>
      )}
    </div>
  )
}

function DivisionRow({ division, eventId, reload }) {
  const { success, error: toastError } = useToast()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({
    name: division.name,
    description: division.description || '',
    rowColor: division.rowColor ?? division.row_color ?? (division.name?.toLowerCase()==='male'?'#DCEBFA':division.name?.toLowerCase()==='female'?'#F7DCEC':'#FFFFFF'),
    isActive: division.isActive ?? division.is_active,
  })

  const save = async () => {
    await pageantService.updateDivision(eventId, division.id, draft)
    setEditing(false)
    reload()
  }

  const remove = async () => {
    if (!window.confirm('Delete this division? This will only work if it has no data associated with it.')) return
    try {
      await pageantService.deleteDivision(eventId, division.id)
      reload()
      success('Division deleted')
    } catch (err) {
      if (err.response?.status === 409) {
        if (window.confirm('This division contains data and cannot be deleted. Deactivate it instead?')) {
          try {
            await pageantService.updateDivision(eventId, division.id, { isActive: false })
            reload()
            success('Division deactivated')
          } catch (deactivateErr) {
            toastError(getErrorMessage(deactivateErr))
          }
        }
      } else {
        toastError(getErrorMessage(err))
      }
    }
  }

  if (editing) {
    return (
      <li className="flex items-end gap-3 rounded-lg border border-v-border bg-v-surface p-4">
        <div className="flex-1">
          <label className="text-xs text-v-text-subtle mb-1 block">Name</label>
          <input
            className={INPUT_CLASS}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </div>
        <div className="flex-1">
          <label className="text-xs text-v-text-subtle mb-1 block">Description</label>
          <input
            className={INPUT_CLASS}
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
          <label className="v-caption">Division row color<input type="color" value={draft.rowColor} onChange={e=>setDraft({...draft,rowColor:e.target.value})}/></label>
        </div>
        <label className="flex items-center gap-2 pb-2">
          <input
            type="checkbox"
            checked={draft.isActive}
            onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
          />
          <span className="text-sm text-v-text">Active</span>
        </label>
        <button
          onClick={save}
          className="rounded-lg bg-v-primary px-3 py-2 text-sm text-white hover:bg-opacity-90"
        >
          Save
        </button>
        <button
          onClick={() => setEditing(false)}
          className="rounded-lg border border-v-border px-3 py-2 text-sm text-v-text-muted hover:text-v-text"
        >
          Cancel
        </button>
      </li>
    )
  }

  return (
    <li className="flex items-center justify-between rounded-lg border border-v-border bg-v-surface p-4">
      <div className={!division.isActive ? 'opacity-50' : ''}>
        <div className="flex items-center gap-2">
          <span className="font-medium text-v-text">{division.name}</span>
          {!division.isActive && (
            <span className="rounded-full bg-v-border px-2 py-0.5 text-xs text-v-text-muted">
              Inactive
            </span>
          )}
        </div>
        {division.description && <p className="text-sm text-v-text-subtle">{division.description}</p>}
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => setEditing(true)}
          className="rounded-lg px-3 py-1.5 text-sm text-v-primary hover:bg-v-primary/10"
        >
          Edit
        </button>
        <button
          onClick={remove}
          className="rounded-lg px-3 py-1.5 text-sm text-red-400 hover:bg-red-400/10"
        >
          Delete
        </button>
      </div>
    </li>
  )
}
