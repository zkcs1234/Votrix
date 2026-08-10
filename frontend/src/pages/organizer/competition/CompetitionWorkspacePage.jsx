import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { pageantService } from '@/services/pageant.service'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { INPUT_CLASS, LABEL_CLASS } from '@/utils/uiClasses'

// Phase 4 — Competition Scoring Foundation workspace.
// Single page that exposes the dynamic structure of an event:
// categories, rounds, criteria, contestants, judges, and scoring config.
export default function CompetitionWorkspacePage() {
  const { eventId } = useParams()
  const [foundation, setFoundation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('structure')

  const load = () => {
    pageantService
      .getFoundation(eventId)
      .then(({ data }) => setFoundation(data.foundation))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [eventId])

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-v-text">
            {foundation?.event?.title ?? 'Competition workspace'}
          </h2>
          <p className="mt-1 text-sm text-v-text-subtle">
            Dynamic scoring engine: unlimited categories, rounds, criteria, and judges.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <SubNav to={`/organizer/competition/events/${eventId}/contestants`}>
            Contestants
          </SubNav>
          <SubNav to={`/organizer/competition/events/${eventId}/criteria`}>
            Criteria
          </SubNav>
          <SubNav to={`/organizer/competition/events/${eventId}/judges`}>Judges</SubNav>
          <SubNav to={`/organizer/competition/events/${eventId}/rankings`}>
            Rankings
          </SubNav>
        </div>
      </div>

      <div className="flex gap-2 border-b border-v-border text-sm">
        {[
          { id: 'structure', label: 'Categories' },
          { id: 'divisions', label: 'Divisions' },
          { id: 'rounds', label: 'Rounds' },
          { id: 'judges', label: 'Judge assignments' },
          { id: 'scoring', label: 'Scoring config' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
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

      {activeTab === 'structure' && <StructureTab foundation={foundation} reload={load} />}
      {activeTab === 'divisions' && <DivisionsTab foundation={foundation} reload={load} />}
      {activeTab === 'rounds' && <RoundsTab foundation={foundation} reload={load} />}
      {activeTab === 'judges' && <JudgesTab foundation={foundation} reload={load} />}
      {activeTab === 'scoring' && <ScoringTab foundation={foundation} reload={load} />}
    </div>
  )
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

function RoundsTab({ foundation, reload }) {
  const { eventId } = useParams()
  const divisionsEnabled = foundation?.event?.divisions_enabled
  const divisions = foundation?.divisions ?? []

  const [name, setName] = useState('')
  const [weight, setWeight] = useState(0)
  const [categoryId, setCategoryId] = useState('')
  const [divisionId, setDivisionId] = useState('')
  const [saving, setSaving] = useState(false)
  const [expandedRoundId, setExpandedRoundId] = useState(null)

  const totalWeight = useMemo(
    () => (foundation?.rounds ?? []).reduce((s, r) => s + Number(r.weight), 0),
    [foundation],
  )

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await pageantService.createRound(eventId, {
        name,
        weight: Number(weight),
        categoryId: categoryId || null,
        divisionId: divisionId || null,
      })
      setName('')
      setWeight(0)
      setCategoryId('')
      setDivisionId('')
      reload()
    } finally {
      setSaving(false)
    }
  }

  const toggleOpen = async (round) => {
    await pageantService.updateRound(eventId, round.id, { isOpen: !round.isOpen })
    reload()
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={submit}
        className={`grid gap-4 v-card p-6 ${divisionsEnabled ? 'sm:grid-cols-[1fr_120px_1fr_1fr_auto]' : 'sm:grid-cols-[1fr_120px_1fr_auto]'}`}
      >
        <div>
          <label className={LABEL_CLASS}>Round name</label>
          <input
            className={INPUT_CLASS}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Preliminary, Final"
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
        <div>
          <label className={LABEL_CLASS}>Category (optional)</label>
          <select
            className={INPUT_CLASS}
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">— Event-wide —</option>
            {(foundation?.categories ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
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
              {divisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
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
            Add round
          </button>
        </div>
      </form>

      <p
        className={`text-sm ${
          Math.abs(totalWeight - 100) < 0.01 ? 'text-v-success' : 'text-amber-400'
        }`}
      >
        Round weight total: {totalWeight.toFixed(2)}% (must equal 100%)
      </p>

      <ul className="space-y-3">
        {(foundation?.rounds ?? []).map((round) => {
          const divisionName = round.division_id ? divisions.find(d => d.id === round.division_id)?.name : null

          return (
            <li
              key={round.id}
              className="rounded-xl border border-v-border bg-v-surface"
            >
              {/* Round header row */}
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div className="flex items-start gap-3">
                  <div>
                    <p className="font-medium text-v-text">{round.name}</p>
                    <p className="text-xs text-v-text-subtle mt-0.5">
                      {round.weight}% · {round.contestantIds?.length ?? 0} contestants ·{' '}
                      {round.criteriaIds?.length ?? 0} criteria ·{' '}
                      {round.categoryId
                        ? foundation?.categories?.find((c) => c.id === round.categoryId)?.name ?? 'Category'
                        : 'Event-wide'}
                    </p>
                  </div>
                  {divisionsEnabled && divisionName && (
                    <span className="rounded-full bg-v-primary/10 px-2 py-0.5 text-[10px] font-medium text-v-primary uppercase tracking-wide">
                      {divisionName}
                    </span>
                  )}
                </div>
                <div className="flex gap-2 text-sm">
                  <button
                    type="button"
                    onClick={() => setExpandedRoundId(expandedRoundId === round.id ? null : round.id)}
                    className="rounded-lg border border-v-border px-3 py-1 text-xs text-v-text-muted hover:bg-v-surface-elevated"
                  >
                    {expandedRoundId === round.id ? 'Hide assignments' : 'Assign contestants & criteria'}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleOpen(round)}
                    className={round.isOpen ? 'text-v-success' : 'text-v-text-muted'}
                  >
                    {round.isOpen ? 'Open' : 'Closed'}
                  </button>
                  <button
                    type="button"
                    className="text-v-danger"
                    onClick={async () => {
                      if (confirm('Delete this round?')) {
                        await pageantService.deleteRound(eventId, round.id)
                        reload()
                      }
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>

              {/* Expanded assignment panel */}
            {expandedRoundId === round.id && (
              <RoundAssignmentPanel
                eventId={eventId}
                round={round}
                allContestants={foundation?.contestants ?? []}
                allCriteria={foundation?.criteria ?? []}
                reload={reload}
              />
            )}
          </li>
        )})}
        {!foundation?.rounds?.length && (
          <li className="rounded-lg border border-dashed border-v-border px-4 py-6 text-center text-sm text-v-text-subtle">
            No rounds yet. Rounds are optional — add them to stage the competition.
          </li>
        )}
      </ul>
    </div>
  )
}

function RoundAssignmentPanel({ eventId, round, allContestants, allCriteria, reload }) {
  const assignedContestantIds = new Set(round.contestantIds ?? [])
  const assignedCriteriaIds = new Set(round.criteriaIds ?? [])
  const [busy, setBusy] = useState(null) // tracks which id is loading

  const toggleContestant = async (contestantId) => {
    setBusy(`c-${contestantId}`)
    try {
      if (assignedContestantIds.has(contestantId)) {
        await pageantService.removeRoundContestant(eventId, round.id, contestantId)
      } else {
        await pageantService.addRoundContestant(eventId, round.id, contestantId)
      }
      reload()
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update contestant')
    } finally {
      setBusy(null)
    }
  }

  const toggleCriteria = async (criteriaId) => {
    setBusy(`cr-${criteriaId}`)
    try {
      if (assignedCriteriaIds.has(criteriaId)) {
        await pageantService.removeRoundCriteria(eventId, round.id, criteriaId)
      } else {
        await pageantService.addRoundCriteria(eventId, round.id, criteriaId)
      }
      reload()
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update criteria')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="border-t border-v-border px-4 pb-4 pt-3 grid gap-4 sm:grid-cols-2">
      {/* Contestants */}
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-v-text-muted">
          Contestants in this round
        </p>
        {allContestants.length === 0 ? (
          <p className="text-xs text-v-text-subtle">No contestants added to the event yet.</p>
        ) : (
          <ul className="space-y-1">
            {allContestants.map((c) => {
              const id = c.id
              const assigned = assignedContestantIds.has(id)
              const loading = busy === `c-${id}`
              // foundation returns raw DB rows (snake_case) or mapped camelCase depending on path
              const number = c.contestantNumber ?? c.contestant_number
              return (
                <li key={id} className="flex items-center justify-between rounded-lg border border-v-border px-3 py-2 text-sm">
                  <span className="text-v-text">
                    #{number} {c.name}
                  </span>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => toggleContestant(id)}
                    className={`rounded px-2 py-0.5 text-xs font-medium transition disabled:opacity-50 ${
                      assigned
                        ? 'bg-v-success/10 text-v-success hover:bg-v-danger/10 hover:text-v-danger'
                        : 'bg-v-surface-elevated text-v-text-muted hover:bg-v-primary/10 hover:text-v-primary'
                    }`}
                  >
                    {loading ? '...' : assigned ? 'Remove' : 'Add'}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Criteria */}
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-v-text-muted">
          Criteria in this round
        </p>
        {allCriteria.length === 0 ? (
          <p className="text-xs text-v-text-subtle">No criteria added to the event yet.</p>
        ) : (
          <ul className="space-y-1">
            {allCriteria.map((cr) => {
              const id = cr.id
              const assigned = assignedCriteriaIds.has(id)
              const loading = busy === `cr-${id}`
              const pct = cr.percentage ?? cr.percentage
              return (
                <li key={id} className="flex items-center justify-between rounded-lg border border-v-border px-3 py-2 text-sm">
                  <span className="text-v-text">
                    {cr.name}{' '}
                    <span className="text-xs text-v-text-subtle">{Number(pct).toFixed(1)}%</span>
                  </span>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => toggleCriteria(id)}
                    className={`rounded px-2 py-0.5 text-xs font-medium transition disabled:opacity-50 ${
                      assigned
                        ? 'bg-v-success/10 text-v-success hover:bg-v-danger/10 hover:text-v-danger'
                        : 'bg-v-surface-elevated text-v-text-muted hover:bg-v-primary/10 hover:text-v-primary'
                    }`}
                  >
                    {loading ? '...' : assigned ? 'Remove' : 'Add'}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

function JudgesTab({ foundation, reload }) {
  const { eventId } = useParams()
  const [scope, setScope] = useState('event')
  const [scopeId, setScopeId] = useState('')

  const addAssignment = async (judge) => {
    if (!scopeId) {
      alert('Pick a category or round id')
      return
    }
    try {
      await pageantService.createJudgeAssignment(eventId, judge.id, {
        scope,
        scopeId,
      })
      reload()
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to add assignment')
    }
  }

  const removeAssignment = async (judge, assignment) => {
    await pageantService.deleteJudgeAssignment(eventId, judge.id, assignment.id)
    reload()
  }

  const assignmentsByJudge = (judgeId) =>
    (foundation?.assignments ?? []).filter((a) => a.judgeId === judgeId)

  const scopeLabel = (a) => {
    if (a.scope === 'event') return 'Event-wide'
    if (a.scope === 'division')
      return `Division: ${
        foundation?.divisions?.find((d) => d.id === a.scopeId)?.name ?? a.scopeId
      }`
    if (a.scope === 'category')
      return `Category: ${
        foundation?.categories?.find((c) => c.id === a.scopeId)?.name ?? a.scopeId
      }`
    return `Round: ${
      foundation?.rounds?.find((r) => r.id === a.scopeId)?.name ?? a.scopeId
    }`
  }

  const divisionsEnabled = foundation?.event?.divisions_enabled

  const getScopeItems = () => {
    if (scope === 'event') return null
    if (scope === 'division') return foundation?.divisions
    if (scope === 'category') return foundation?.categories
    return foundation?.rounds
  }
  const isEventScope = scope === 'event'
  const scopeItems = getScopeItems()

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-v-border/50 bg-v-surface-elevated px-4 py-3 text-sm text-v-text-muted">
        To register or invite judges, go to the{' '}
        <Link
          to={`/organizer/competition/events/${eventId}/judges`}
          className="text-v-primary underline hover:text-v-primary-hover"
        >
          Judges page
        </Link>
        . This tab is only for scoping existing judges to specific rounds or categories.
      </div>

      <ul className="space-y-2">
        {(foundation?.judges ?? []).map((judge) => {
          const list = assignmentsByJudge(judge.id)
          return (
            <li
              key={judge.id}
              className="space-y-3 rounded-xl border border-v-border px-4 py-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-v-text">
                    {judge.displayName || judge.email}
                  </p>
                  <p className="text-xs text-v-text-subtle">
                    {judge.email} · {judge.role}
                  </p>
                </div>
              </div>

              <div className="space-y-1 rounded-lg bg-v-surface-elevated px-3 py-2 text-sm">
                <p className="text-v-text-muted">Assignments</p>
                {list.length === 0 && (
                  <p className="text-xs text-v-text-subtle">
                    No assignments yet — defaults to event-wide.
                  </p>
                )}
                {list.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="text-v-text-muted">{scopeLabel(a)}</span>
                    <button
                      type="button"
                      className="text-v-danger"
                      onClick={() => removeAssignment(judge, a)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-end gap-2 text-sm">
                <select
                  className={INPUT_CLASS}
                  value={scope}
                  onChange={(e) => {
                    setScope(e.target.value)
                    setScopeId('')
                  }}
                >
                  <option value="event">Event</option>
                  {divisionsEnabled && <option value="division">Division</option>}
                  <option value="category">Category</option>
                  <option value="round">Round</option>
                </select>
                <button
                  type="button"
                  onClick={() => addAssignment(judge)}
                  className="rounded-lg border border-v-border px-3 py-1.5 text-v-text-muted"
                >
                  Add assignment
                </button>
              </div>
            </li>
          )
        })}
        {!foundation?.judges?.length && (
          <li className="rounded-lg border border-dashed border-v-border px-4 py-6 text-center text-sm text-v-text-subtle">
            No judges registered yet. Go to the{' '}
            <Link
              to={`/organizer/competition/events/${eventId}/judges`}
              className="text-v-primary underline"
            >
              Judges page
            </Link>{' '}
            to add judges first.
          </li>
        )}
      </ul>
    </div>
  )
}

function ScoringTab({ foundation, reload }) {
  const { eventId } = useParams()
  const config = foundation?.scoringConfig ?? {}
  const [scoreType, setScoreType] = useState(config.scoreType ?? 'range_1_100')
  const [calculationMethod, setCalculationMethod] = useState(
    config.calculationMethod ?? 'weighted_average',
  )
  const [decimalPlaces, setDecimalPlaces] = useState(config.decimalPlaces ?? 2)
  const [customMin, setCustomMin] = useState(config.customMin ?? 0)
  const [customMax, setCustomMax] = useState(config.customMax ?? 100)
  const [dropHighest, setDropHighest] = useState(config.dropHighest ?? 0)
  const [dropLowest, setDropLowest] = useState(config.dropLowest ?? 0)
  const [includeOverallRanking, setIncludeOverallRanking] = useState(config.includeOverallRanking ?? false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await pageantService.setScoringConfig(eventId, {
        scoreType,
        calculationMethod,
        decimalPlaces: Number(decimalPlaces),
        customMin: Number(customMin),
        customMax: Number(customMax),
        dropHighest: Number(dropHighest),
        dropLowest: Number(dropLowest),
        includeOverallRanking: Boolean(includeOverallRanking),
      })
      setSaved(true)
      reload()
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save config')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save} className="grid gap-4 v-card p-6 sm:grid-cols-2">
      <div>
        <label className={LABEL_CLASS}>Score type</label>
        <select
          className={INPUT_CLASS}
          value={scoreType}
          onChange={(e) => setScoreType(e.target.value)}
        >
          <option value="range_1_10">1–10</option>
          <option value="range_1_100">1–100</option>
          <option value="decimal">Decimal (0–10)</option>
          <option value="custom_range">Custom range</option>
        </select>
      </div>
      <div>
        <label className={LABEL_CLASS}>Calculation method</label>
        <select
          className={INPUT_CLASS}
          value={calculationMethod}
          onChange={(e) => setCalculationMethod(e.target.value)}
        >
          <option value="average">Average</option>
          <option value="weighted_average">Weighted average</option>
          <option value="sum">Sum</option>
          <option value="highest_score">Highest score</option>
          <option value="lowest_removal">Lowest-score removal</option>
        </select>
      </div>
      <div>
        <label className={LABEL_CLASS}>Decimal places</label>
        <input
          type="number"
          min={0}
          max={6}
          className={INPUT_CLASS}
          value={decimalPlaces}
          onChange={(e) => setDecimalPlaces(e.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={LABEL_CLASS}>Custom min</label>
          <input
            type="number"
            className={INPUT_CLASS}
            value={customMin}
            onChange={(e) => setCustomMin(e.target.value)}
            disabled={scoreType !== 'custom_range'}
          />
        </div>
        <div>
          <label className={LABEL_CLASS}>Custom max</label>
          <input
            type="number"
            className={INPUT_CLASS}
            value={customMax}
            onChange={(e) => setCustomMax(e.target.value)}
            disabled={scoreType !== 'custom_range'}
          />
        </div>
      </div>
      <div>
        <label className={LABEL_CLASS}>Drop highest N</label>
        <input
          type="number"
          min={0}
          className={INPUT_CLASS}
          value={dropHighest}
          onChange={(e) => setDropHighest(e.target.value)}
        />
      </div>
      <div>
        <label className={LABEL_CLASS}>Drop lowest N</label>
        <input
          type="number"
          min={0}
          className={INPUT_CLASS}
          value={dropLowest}
          onChange={(e) => setDropLowest(e.target.value)}
        />
      </div>
      
      {foundation?.event?.divisions_enabled && (
        <div className="sm:col-span-2 v-card p-4 border border-v-primary/30">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={Boolean(includeOverallRanking)}
              onChange={(e) => setIncludeOverallRanking(e.target.checked)}
              disabled={saving}
            />
            <div>
              <span className="block font-medium text-v-text">Enable Overall Rankings</span>
              <span className="text-sm text-v-text-subtle">
                When divisions are enabled, this displays a combined ranking of all contestants alongside division rankings.
              </span>
            </div>
          </label>
        </div>
      )}

      <div className="sm:col-span-2 flex items-center justify-between">
        <div>
          {error && <p className="text-sm text-v-danger">{error}</p>}
          {saved && <p className="text-sm text-v-success">Saved.</p>}
        </div>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-v-primary px-4 py-2 text-sm text-white disabled:opacity-60"
        >
          Save scoring config
        </button>
      </div>
    </form>
  )
}

function DivisionsTab({ foundation, reload }) {
  const { eventId } = useParams()
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
              <DivisionRow key={div.id} division={div} eventId={eventId} reload={reload} />
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
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({
    name: division.name,
    description: division.description || '',
    isActive: division.isActive,
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
    } catch (err) {
      if (err.response?.status === 409) {
        if (window.confirm('This division contains data and cannot be deleted. Deactivate it instead?')) {
          await pageantService.updateDivision(eventId, division.id, { isActive: false })
          reload()
        }
      } else {
        alert(err.message)
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
