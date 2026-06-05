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
          { id: 'structure', label: 'Structure' },
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
  const [name, setName] = useState('')
  const [weight, setWeight] = useState(0)
  const [saving, setSaving] = useState(false)

  const totalWeight = useMemo(
    () => (foundation?.categories ?? []).reduce((s, c) => s + Number(c.weight), 0),
    [foundation],
  )

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await pageantService.createCategory(eventId, { name, weight: Number(weight) })
      setName('')
      setWeight(0)
      reload()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={submit}
        className="grid gap-4 v-card p-6 sm:grid-cols-[1fr_120px_auto]"
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
          <CategoryRow key={cat.id} cat={cat} eventId={eventId} reload={reload} />
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

function CategoryRow({ cat, eventId, reload }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({
    name: cat.name,
    weight: cat.weight,
    isActive: cat.isActive,
  })

  const save = async () => {
    await pageantService.updateCategory(eventId, cat.id, {
      name: draft.name,
      weight: Number(draft.weight),
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
          <div>
            <p className="font-medium text-v-text">{cat.name}</p>
            <p className="text-xs text-v-text-subtle">
              {cat.weight}% · {cat.isActive ? 'Active' : 'Inactive'}
            </p>
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
  const [name, setName] = useState('')
  const [weight, setWeight] = useState(0)
  const [categoryId, setCategoryId] = useState('')
  const [saving, setSaving] = useState(false)

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
      })
      setName('')
      setWeight(0)
      setCategoryId('')
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
        className="grid gap-4 v-card p-6 sm:grid-cols-[1fr_120px_1fr_auto]"
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

      <ul className="space-y-2">
        {(foundation?.rounds ?? []).map((round) => (
          <li
            key={round.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-v-border px-4 py-3"
          >
            <div>
              <p className="font-medium text-v-text">{round.name}</p>
              <p className="text-xs text-v-text-subtle">
                {round.weight}% · {round.contestantIds?.length ?? 0} contestants ·{' '}
                {round.criteriaIds?.length ?? 0} criteria ·{' '}
                {round.categoryId
                  ? foundation?.categories?.find((c) => c.id === round.categoryId)?.name ??
                    'Category'
                  : 'Event-wide'}
              </p>
            </div>
            <div className="flex gap-2 text-sm">
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
          </li>
        ))}
        {!foundation?.rounds?.length && (
          <li className="rounded-lg border border-dashed border-v-border px-4 py-6 text-center text-sm text-v-text-subtle">
            No rounds yet. Rounds are optional — add them to stage the competition.
          </li>
        )}
      </ul>
    </div>
  )
}

function JudgesTab({ foundation, reload }) {
  const { eventId } = useParams()
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [role, setRole] = useState('judge')
  const [scope, setScope] = useState('event')
  const [scopeId, setScopeId] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const invite = async (e) => {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      await pageantService.inviteJudgeV2(eventId, {
        email,
        firstName,
        lastName,
        role,
        temporaryPassword: undefined,
      })
      setEmail('')
      setFirstName('')
      setLastName('')
      reload()
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to invite judge')
    } finally {
      setSaving(false)
    }
  }

  const updateRole = async (judge, nextRole) => {
    await pageantService.updateJudgeV2(eventId, judge.id, { role: nextRole })
    reload()
  }

  const remove = async (judge) => {
    if (!confirm('Remove this judge from the event?')) return
    await pageantService.deleteJudgeV2(eventId, judge.id)
    reload()
  }

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
    if (a.scope === 'category')
      return `Category: ${
        foundation?.categories?.find((c) => c.id === a.scopeId)?.name ?? a.scopeId
      }`
    return `Round: ${
      foundation?.rounds?.find((r) => r.id === a.scopeId)?.name ?? a.scopeId
    }`
  }

  return (
    <div className="space-y-6">
      <form onSubmit={invite} className="grid gap-4 v-card p-6 sm:grid-cols-2">
        <div>
          <label className={LABEL_CLASS}>Email</label>
          <input
            type="email"
            className={INPUT_CLASS}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={LABEL_CLASS}>First name</label>
            <input
              className={INPUT_CLASS}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>
          <div>
            <label className={LABEL_CLASS}>Last name</label>
            <input
              className={INPUT_CLASS}
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className={LABEL_CLASS}>Role</label>
          <select
            className={INPUT_CLASS}
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="judge">Judge</option>
            <option value="head_judge">Head Judge</option>
            <option value="score_reviewer">Score Reviewer</option>
          </select>
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-v-primary px-4 py-2 text-sm text-white disabled:opacity-60"
          >
            Invite judge
          </button>
        </div>
        {error && <p className="text-sm text-v-danger sm:col-span-2">{error}</p>}
      </form>

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
                <div className="flex items-center gap-2 text-sm">
                  <select
                    className={INPUT_CLASS}
                    value={judge.role}
                    onChange={(e) => updateRole(judge, e.target.value)}
                  >
                    <option value="judge">Judge</option>
                    <option value="head_judge">Head Judge</option>
                    <option value="score_reviewer">Score Reviewer</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => remove(judge)}
                    className="text-v-danger"
                  >
                    Remove
                  </button>
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
                  <option value="category">Category</option>
                  <option value="round">Round</option>
                </select>
                {scope === 'event' ? (
                  <input
                    className={INPUT_CLASS}
                    value={foundation?.event?.id ?? ''}
                    readOnly
                  />
                ) : (
                  <select
                    className={INPUT_CLASS}
                    value={scopeId}
                    onChange={(e) => setScopeId(e.target.value)}
                  >
                    <option value="">— select —</option>
                    {((scope === 'category' ? foundation?.categories : foundation?.rounds) ?? []).map(
                      (x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ),
                    )}
                  </select>
                )}
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
            No judges invited yet.
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
