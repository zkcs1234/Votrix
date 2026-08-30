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
  const [activeTab, setActiveTab] = useState('rounds')
  const [showAdvanced, setShowAdvanced] = useState(false)

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
            {foundation?.event?.title ?? 'Structure & Scoring'}
          </h2>
          <p className="mt-1 text-sm text-v-text-subtle">
            Define the <strong>rounds</strong> (the weighted, judged segments), plus divisions and
            scoring rules. Contestants and criteria are assigned to rounds on their own pages.
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

      <div className="flex items-center justify-between gap-2 border-b border-v-border text-sm">
        <div className="flex gap-2">
          {(() => {
            const hasCategories = (foundation?.categories ?? []).length > 0
            // Rounds lead. Categories is an advanced layer (group rounds into
            // weighted buckets) — only shown when revealed or already in use.
            const tabs = [
              { id: 'rounds', label: 'Rounds' },
              { id: 'divisions', label: 'Divisions' },
              { id: 'scoring', label: 'Scoring config' },
              ...(showAdvanced || hasCategories ? [{ id: 'structure', label: 'Categories' }] : []),
            ]
            return tabs.map((tab) => (
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
            ))
          })()}
        </div>
        {!showAdvanced && (foundation?.categories ?? []).length === 0 && (
          <button
            type="button"
            onClick={() => {
              setShowAdvanced(true)
              setActiveTab('structure')
            }}
            className="text-xs text-v-text-subtle hover:text-v-text-muted"
            title="Categories group rounds into higher-level weighted buckets. Most competitions don't need this."
          >
            + Advanced (Categories)
          </button>
        )}
      </div>

      <TypeHint type={foundation?.event?.competition_type} />
      <SetupReadiness foundation={foundation} />

      {activeTab === 'structure' && <StructureTab foundation={foundation} reload={load} />}
      {activeTab === 'divisions' && <DivisionsTab foundation={foundation} reload={load} />}
      {activeTab === 'rounds' && <RoundsTab foundation={foundation} reload={load} />}
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

  // Read-only per-round summary. The actual assignment now lives on the
  // Contestants page (contestants → round) and the Criteria page (criteria →
  // round), so a round only DEFINES itself here.
  const assignedCritTotal = allCriteria
    .filter((cr) => assignedCriteriaIds.has(cr.id))
    .reduce((s, cr) => s + Number(cr.percentage ?? 0), 0)
  const critComplete = assignedCriteriaIds.size > 0 && Math.abs(assignedCritTotal - 100) < 0.1

  // Phase 6 — per-round advancement/elimination + score policy.
  const [advType, setAdvType] = useState(round.advancementType ?? 'none')
  const [advValue, setAdvValue] = useState(round.advancementValue ?? '')
  const [scorePolicy, setScorePolicy] = useState(round.scorePolicy ?? 'independent')
  const [savingAdv, setSavingAdv] = useState(false)
  const isFinalized = Boolean(round.finalizedAt)
  const needsValue = advType === 'top_n' || advType === 'top_percent' || advType === 'threshold'

  const saveAdvancement = async () => {
    setSavingAdv(true)
    try {
      // Send the full round (the update validator resets unspecified fields).
      await pageantService.updateRound(eventId, round.id, {
        name: round.name,
        description: round.description ?? null,
        weight: round.weight,
        displayOrder: round.displayOrder,
        categoryId: round.categoryId ?? null,
        divisionId: round.divisionId ?? null,
        isOpen: round.isOpen,
        advancementType: advType,
        advancementValue: needsValue && advValue !== '' ? Number(advValue) : null,
        scorePolicy,
      })
      reload()
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to save advancement settings')
    } finally {
      setSavingAdv(false)
    }
  }

  return (
    <div className="border-t border-v-border px-4 pb-4 pt-3 space-y-4">
      {/* Read-only summary — assignment moved to the Contestants & Criteria pages. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-v-border bg-v-surface px-3 py-2">
          <p className="text-[11px] uppercase tracking-wider text-v-text-muted">Contestants</p>
          <p className="text-sm text-v-text">
            {assignedContestantIds.size} assigned{' '}
            <span className="text-xs text-v-text-subtle">/ {allContestants.length} total</span>
          </p>
          <p className="mt-0.5 text-[11px] text-v-text-subtle">
            Assign on the <strong>Contestants</strong> page.
          </p>
        </div>
        <div className="rounded-lg border border-v-border bg-v-surface px-3 py-2">
          <p className="text-[11px] uppercase tracking-wider text-v-text-muted">Criteria</p>
          <p className={`text-sm ${critComplete ? 'text-v-success' : 'text-v-text'}`}>
            {assignedCriteriaIds.size
              ? `${assignedCritTotal.toFixed(0)}% ${critComplete ? '✓' : '/ 100%'}`
              : 'None yet'}
          </p>
          <p className="mt-0.5 text-[11px] text-v-text-subtle">
            Configure on the <strong>Criteria</strong> page.
          </p>
        </div>
      </div>

      {/* Phase 6 — advancement / elimination + score policy */}
      <div className="rounded-lg border border-v-border bg-v-surface-elevated/40 p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wider text-v-text-muted">
            Advancement & scoring
          </p>
          {isFinalized && (
            <span className="rounded bg-v-success/10 px-1.5 py-0.5 text-[10px] font-medium text-v-success">
              Finalized
            </span>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-[11px] text-v-text-muted" title="Applies when deciding who advances. The final event ranking always combines rounds by their weights.">
              Score policy (advancement)
            </label>
            <select
              className="w-full rounded-lg border border-v-border bg-v-surface px-2 py-1.5 text-sm text-v-text disabled:opacity-50"
              value={scorePolicy}
              disabled={isFinalized}
              onChange={(e) => setScorePolicy(e.target.value)}
            >
              <option value="independent">Independent — this round only</option>
              <option value="cumulative">Cumulative — carry prior rounds</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-v-text-muted">Advancement</label>
            <select
              className="w-full rounded-lg border border-v-border bg-v-surface px-2 py-1.5 text-sm text-v-text disabled:opacity-50"
              value={advType}
              disabled={isFinalized}
              onChange={(e) => setAdvType(e.target.value)}
            >
              <option value="none">None (no elimination)</option>
              <option value="top_n">Top N advance</option>
              <option value="top_percent">Top % advance</option>
              <option value="threshold">Score threshold</option>
              <option value="manual">Manual pick</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-v-text-muted">
              {advType === 'top_n' ? 'N' : advType === 'top_percent' ? 'Percent' : advType === 'threshold' ? 'Min score' : 'Value'}
            </label>
            <input
              type="number"
              className="w-full rounded-lg border border-v-border bg-v-surface px-2 py-1.5 text-sm text-v-text disabled:opacity-50"
              value={advValue}
              disabled={isFinalized || !needsValue}
              onChange={(e) => setAdvValue(e.target.value)}
              placeholder={needsValue ? '' : '—'}
            />
          </div>
        </div>
        {/* Phase 4 (W5): explain what advancement does and where it runs. */}
        <p className="mt-2 text-[11px] leading-relaxed text-v-text-subtle">
          {advType === 'none' && 'No elimination — every contestant stays for the next round.'}
          {advType === 'top_n' && 'The top N by score advance to the next round (per division when divisions are on).'}
          {advType === 'top_percent' && 'The top N% by score advance to the next round.'}
          {advType === 'threshold' && 'Contestants scoring at or above this value advance.'}
          {advType === 'manual' && 'You pick who advances by hand when finalizing.'}
          {' '}You set the rule here; you <strong>run</strong> it later from{' '}
          <strong>Live Control → “Finalize round &amp; advance”</strong>, where you can review and override
          the qualifiers before confirming.
        </p>
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            disabled={savingAdv || isFinalized}
            onClick={saveAdvancement}
            className="rounded-lg bg-v-primary px-3 py-1.5 text-xs font-medium text-v-sidebar-active hover:bg-v-primary-hover disabled:opacity-50"
          >
            {savingAdv ? 'Saving...' : 'Save settings'}
          </button>
        </div>
      </div>
    </div>
  )
}

// L3 — soft signposting: a read-only hint about which optional layers a given
// competition type usually needs. Every tab stays available; nothing is hidden.
const TYPE_HINTS = {
  pageant: 'Pageant — typically uses Categories + Rounds (prelim → final). All tabs stay available.',
  dance: 'Dance — typically uses Rounds and Divisions (solo / team). Categories optional.',
  singing: 'Singing — usually just Criteria; add Rounds only if you run heats and a final.',
  talent: 'Talent — usually flat Criteria; Categories, Divisions, and Rounds are optional.',
  simple: 'Simple — you can skip Categories, Divisions, and Rounds; Criteria alone is enough.',
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

// Phase 4 (W1/W3/W4) — progressive readiness so the organizer sees what's
// missing DURING setup, not only when they hit Start. Mirrors the backend
// pre-flight (contestants ≥1, active judges ≥1, criteria total 100% — per round
// when rounds carry their own criteria, else event-wide).
function SetupReadiness({ foundation }) {
  if (!foundation) return null
  const contestants = foundation.contestants ?? []
  const judges = (foundation.judges ?? []).filter((j) => j.isActive !== false)
  const criteria = foundation.criteria ?? []
  const rounds = foundation.rounds ?? []
  const usesRoundCriteria = rounds.some((r) => (r.criteriaIds ?? []).length > 0)

  let criteriaOk
  if (usesRoundCriteria) {
    criteriaOk = rounds.every((r) => {
      const ids = r.criteriaIds ?? []
      if (!ids.length) return true
      const total = criteria
        .filter((c) => ids.includes(c.id))
        .reduce((s, c) => s + Number(c.percentage ?? 0), 0)
      return Math.abs(total - 100) < 0.1
    })
  } else {
    const total = criteria.reduce((s, c) => s + Number(c.percentage ?? 0), 0)
    criteriaOk = criteria.length > 0 && Math.abs(total - 100) < 0.1
  }

  const checks = [
    { label: 'At least one contestant', ok: contestants.length > 0 },
    { label: 'At least one active judge', ok: judges.length > 0 },
    {
      label: usesRoundCriteria ? "Each round's criteria total 100%" : 'Criteria total 100%',
      ok: criteriaOk,
    },
  ]
  const allOk = checks.every((c) => c.ok)

  return (
    <div
      className={`rounded-lg border px-4 py-3 ${
        allOk ? 'border-v-success/30 bg-v-success-bg' : 'border-v-border bg-v-surface'
      }`}
    >
      <p className={`mb-2 text-xs font-semibold ${allOk ? 'text-v-success' : 'text-v-text-muted'}`}>
        {allOk ? '✓ Ready to open scoring' : 'Setup checklist'}
      </p>
      <ul className="grid gap-1 sm:grid-cols-3">
        {checks.map((c) => (
          <li key={c.label} className="flex items-center gap-1.5 text-xs">
            <span className={c.ok ? 'text-v-success' : 'text-amber-400'}>{c.ok ? '✓' : '○'}</span>
            <span className={c.ok ? 'text-v-text-muted' : 'text-v-text'}>{c.label}</span>
          </li>
        ))}
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
