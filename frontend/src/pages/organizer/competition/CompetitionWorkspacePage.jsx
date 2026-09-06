import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'

import { pageantService } from '@/services/pageant.service'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { INPUT_CLASS, LABEL_CLASS, HELPER_TEXT } from '@/utils/uiClasses'

// Option B — Structure & Scoring is now a single guided wizard:
//   Format → Build Stages & Rounds → Define Criteria → Divisions → Scoring → Review
//
// A "stage" is a first-class competition phase (Prelims / Semis / Finals). In the
// data model a stage is a competition_category with is_stage = true that owns
// rounds (category_id) and carries a cut rule (advancement) + carry policy.
// Single-stage events just use event-wide rounds (category_id = null) — the
// engine handles both. Criteria are defined per round inside this flow.

const STEPS = [
  { key: 'format', label: 'Format' },
  { key: 'stages', label: 'Build Stages & Rounds' },
  { key: 'criteria', label: 'Define Criteria' },
  { key: 'divisions', label: 'Divisions' },
  { key: 'scoring', label: 'Scoring Rules' },
  { key: 'review', label: 'Review & Lock' },
]

const pct100 = (total) => Math.abs(Number(total) - 100) < 0.1
const pctShow = (total) => Math.round(Number(total) * 100) / 100

export default function CompetitionWorkspacePage() {
  const { eventId } = useParams()
  const [foundation, setFoundation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [stepKey, setStepKey] = useState('stages')

  const load = useCallback(() => {
    return pageantService
      .getFoundation(eventId)
      .then(({ data }) => setFoundation(data.foundation))
      .finally(() => setLoading(false))
  }, [eventId])

  useEffect(() => {
    load()
  }, [load])

  const stepIndex = STEPS.findIndex((s) => s.key === stepKey)
  const goNext = () => setStepKey(STEPS[Math.min(stepIndex + 1, STEPS.length - 1)].key)
  const goPrev = () => setStepKey(STEPS[Math.max(stepIndex - 1, 0)].key)

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-v-text">
          {foundation?.event?.title ?? 'Structure & Scoring'}
        </h2>
        <p className="mt-1 text-sm text-v-text-subtle">
          Set up how this competition is run and scored. Walk the steps in order — each builds on
          the last. You can come back and change anything until you lock it.
        </p>
      </div>

      <WizardSteps steps={STEPS} current={stepKey} onSelect={setStepKey} />

      <div className="pt-2">
        {stepKey === 'format' && <FormatStep foundation={foundation} onNext={goNext} />}
        {stepKey === 'stages' && (
          <StagesRoundsStep foundation={foundation} reload={load} onNext={goNext} onPrev={goPrev} />
        )}
        {stepKey === 'criteria' && (
          <CriteriaStep foundation={foundation} reload={load} onNext={goNext} onPrev={goPrev} />
        )}
        {stepKey === 'divisions' && (
          <DivisionsStep foundation={foundation} reload={load} onNext={goNext} onPrev={goPrev} />
        )}
        {stepKey === 'scoring' && (
          <ScoringStep foundation={foundation} reload={load} onNext={goNext} onPrev={goPrev} />
        )}
        {stepKey === 'review' && (
          <ReviewStep foundation={foundation} onPrev={goPrev} />
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared UI
// ---------------------------------------------------------------------------
function WizardSteps({ steps, current, onSelect }) {
  const currentIndex = steps.findIndex((s) => s.key === current)
  return (
    <ol className="flex w-full items-center gap-1 overflow-x-auto border-b border-v-border pb-3 text-sm">
      {steps.map((s, i) => {
        const done = i < currentIndex
        const active = s.key === current
        return (
          <li key={s.key} className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onSelect(s.key)}
              className="flex items-center gap-2 rounded-lg px-2 py-1"
            >
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold ${
                  active
                    ? 'border-v-primary bg-v-primary text-white'
                    : done
                      ? 'border-emerald-500 bg-emerald-500 text-white'
                      : 'border-v-border-strong text-v-text-subtle'
                }`}
              >
                {done ? '✓' : i + 1}
              </span>
              <span className={active ? 'font-medium text-v-text' : 'text-v-text-subtle'}>
                {s.label}
              </span>
            </button>
            {i < steps.length - 1 && <span className="mx-1 h-px w-4 bg-v-border" aria-hidden />}
          </li>
        )
      })}
    </ol>
  )
}

function FooterNav({ onPrev, onNext, nextLabel = 'Next →', prevLabel = '‹ Back', nextDisabled }) {
  return (
    <div className="mt-6 flex justify-between">
      {onPrev ? (
        <button
          type="button"
          onClick={onPrev}
          className="rounded-lg border border-v-border px-4 py-2 text-sm text-v-text-muted hover:bg-v-surface-elevated"
        >
          {prevLabel}
        </button>
      ) : (
        <span />
      )}
      {onNext && (
        <button
          type="button"
          onClick={onNext}
          disabled={nextDisabled}
          className="rounded-lg bg-v-primary px-4 py-2 text-sm font-medium text-white hover:bg-v-primary-hover disabled:opacity-50"
        >
          {nextLabel}
        </button>
      )}
    </div>
  )
}

function WeightNote({ total, label = 'These' }) {
  const ok = pct100(total)
  return (
    <p className={`mt-2 text-sm ${ok ? 'text-v-success' : 'text-amber-400'}`}>
      {label} currently add up to {pctShow(total)}%. {ok ? "✓ That's correct." : 'They need to total 100%.'}
    </p>
  )
}

// ---------------------------------------------------------------------------
// Step 1 — Format (guidance; non-destructive)
// ---------------------------------------------------------------------------
const FORMATS = [
  {
    key: 'simple',
    title: 'Simple Scoring',
    flow: 'One stage, one round — no elimination',
    desc: 'Everyone is scored once and the highest total wins. Good for small or quick events.',
  },
  {
    key: 'rounds',
    title: 'Multiple Rounds',
    flow: 'Several rounds, all counting toward one total',
    desc: 'Contestants go through several rounds (e.g. Costume, Talent, Q&A); every round counts. Nobody is cut.',
  },
  {
    key: 'elim',
    title: 'Elimination Stages',
    flow: 'Prelims → cut → Semis → cut → Finals',
    desc: 'The big-stage pageant format. Contestants are narrowed stage by stage until a final round decides placements. Turn on multiple stages in the next step.',
  },
  {
    key: 'rubric',
    title: 'Judged Performance',
    flow: 'Every contestant scored against the same checklist',
    desc: 'For dance, singing, and similar. Each contestant is scored against a fixed set of criteria.',
  },
]

function FormatStep({ foundation, onNext }) {
  const stages = (foundation?.categories ?? []).filter((c) => c.isStage)
  const rounds = foundation?.rounds ?? []
  const [selected, setSelected] = useState(
    stages.length ? 'elim' : rounds.length > 1 ? 'rounds' : 'rounds',
  )

  return (
    <div>
      <p className="mb-1 text-sm font-medium text-v-text">Which of these sounds most like your event?</p>
      <p className={`${HELPER_TEXT} mb-4`}>
        This is guidance only — it doesn&apos;t change anything yet. Build the exact structure in the
        next step. Choose &ldquo;Elimination Stages&rdquo; if contestants are cut between phases.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {FORMATS.map((f) => {
          const on = selected === f.key
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setSelected(f.key)}
              className={`rounded-xl border p-4 text-left transition ${
                on ? 'border-v-primary bg-v-primary/5' : 'border-v-border hover:bg-v-surface-elevated'
              }`}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-v-primary">
                {f.flow}
              </p>
              <p className="mt-1 font-semibold text-v-text">{f.title}</p>
              <p className="mt-1 text-sm text-v-text-subtle">{f.desc}</p>
            </button>
          )
        })}
      </div>
      <FooterNav onNext={onNext} nextLabel="Next: Build Stages & Rounds →" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 2 — Build Stages & Rounds
// ---------------------------------------------------------------------------
function StagesRoundsStep({ foundation, reload, onNext, onPrev }) {
  const { eventId } = useParams()
  const stages = useMemo(
    () =>
      (foundation?.categories ?? [])
        .filter((c) => c.isStage)
        .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)),
    [foundation],
  )
  const rounds = foundation?.rounds ?? []
  const eventWideRounds = rounds.filter((r) => !r.categoryId)
  const multiStage = stages.length > 0

  const [busy, setBusy] = useState(false)
  const [newStageName, setNewStageName] = useState('')
  const [newStageWeight, setNewStageWeight] = useState('')

  const setMode = async (yes) => {
    if (yes === multiStage) return
    if (!yes && stages.length) {
      alert('Remove the stages below first to switch back to a single-stage event.')
      return
    }
    if (yes) {
      // Create the first stage; move any existing event-wide rounds into it so no
      // structure is lost.
      setBusy(true)
      try {
        const { data } = await pageantService.createCategory(eventId, {
          name: 'Preliminaries',
          weight: 100,
          isStage: true,
          advancementType: 'none',
          carryPolicy: 'reset',
          displayOrder: 0,
        })
        const stageId = data?.category?.id ?? data?.id
        for (const r of eventWideRounds) {
          await pageantService.updateRound(eventId, r.id, { ...roundPayload(r), categoryId: stageId })
        }
        await reload()
      } finally {
        setBusy(false)
      }
    }
  }

  const addStage = async () => {
    if (!newStageName.trim()) return
    setBusy(true)
    try {
      await pageantService.createCategory(eventId, {
        name: newStageName.trim(),
        weight: Number(newStageWeight || 0),
        isStage: true,
        advancementType: 'none',
        carryPolicy: 'reset',
        displayOrder: stages.length,
      })
      setNewStageName('')
      setNewStageWeight('')
      await reload()
    } finally {
      setBusy(false)
    }
  }

  const stageWeightTotal = stages.reduce((s, st) => s + Number(st.weight ?? 0), 0)
  const eventRoundTotal = eventWideRounds.reduce((s, r) => s + Number(r.weight ?? 0), 0)

  const canContinue = multiStage
    ? stages.length > 0 && pct100(stageWeightTotal)
    : eventWideRounds.length > 0 && pct100(eventRoundTotal)

  return (
    <div>
      <div className="rounded-lg border border-v-border bg-v-surface p-4">
        <label className={LABEL_CLASS}>Will this competition have multiple stages?</label>
        <p className={HELPER_TEXT}>
          Choose Yes if contestants move through separate phases such as Preliminaries → Semifinals →
          Finals, with cuts between them.
        </p>
        <select
          className={`${INPUT_CLASS} mt-2 sm:w-72`}
          value={multiStage ? 'yes' : 'no'}
          onChange={(e) => setMode(e.target.value === 'yes')}
          disabled={busy}
        >
          <option value="no">No — one stage</option>
          <option value="yes">Yes — multiple stages</option>
        </select>
      </div>

      {!multiStage && (
        <div className="mt-6">
          <RoundsEditor
            eventId={eventId}
            stageId={null}
            rounds={eventWideRounds}
            reload={reload}
            title="Rounds"
            hint="Add the rounds contestants are judged on. Each round's weight counts toward the final score."
          />
          <WeightNote total={eventRoundTotal} label="Round weights" />
        </div>
      )}

      {multiStage && (
        <div className="mt-6 space-y-4">
          {stages.map((stage, idx) => (
            <StageCard key={stage.id} eventId={eventId} stage={stage} index={idx} rounds={rounds} reload={reload} />
          ))}

          <div className="rounded-xl border border-dashed border-v-border p-4">
            <p className="mb-2 text-sm font-medium text-v-text">Add a stage</p>
            <div className="grid gap-3 sm:grid-cols-[1fr_140px_auto]">
              <input
                className={INPUT_CLASS}
                placeholder="e.g. Finals"
                value={newStageName}
                onChange={(e) => setNewStageName(e.target.value)}
              />
              <input
                type="number"
                className={INPUT_CLASS}
                placeholder="Weight %"
                min={0}
                max={100}
                value={newStageWeight}
                onChange={(e) => setNewStageWeight(e.target.value)}
              />
              <button
                type="button"
                onClick={addStage}
                disabled={busy || !newStageName.trim()}
                className="rounded-lg bg-v-primary px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                + Add stage
              </button>
            </div>
          </div>

          <WeightNote total={stageWeightTotal} label="Stage weights" />
        </div>
      )}

      <FooterNav
        onPrev={onPrev}
        onNext={onNext}
        nextLabel="Next: Define Criteria →"
        nextDisabled={!canContinue}
      />
    </div>
  )
}

// Full round payload for updates (the update validator resets unspecified fields).
function roundPayload(r) {
  return {
    name: r.name,
    description: r.description ?? null,
    weight: r.weight,
    displayOrder: r.displayOrder,
    categoryId: r.categoryId ?? null,
    divisionId: r.divisionId ?? null,
    isOpen: r.isOpen,
  }
}

function StageCard({ eventId, stage, index, rounds, reload }) {
  const stageRounds = rounds.filter((r) => r.categoryId === stage.id)
  const [name, setName] = useState(stage.name)
  const [weight, setWeight] = useState(stage.weight)
  const [cut, setCut] = useState(stage.advancementType ?? 'none')
  const [cutValue, setCutValue] = useState(stage.advancementValue ?? '')
  const [carry, setCarry] = useState(stage.carryPolicy ?? 'reset')
  const [saving, setSaving] = useState(false)
  const needsValue = cut === 'top_n' || cut === 'top_percent' || cut === 'threshold'

  const saveStage = async () => {
    setSaving(true)
    try {
      await pageantService.updateCategory(eventId, stage.id, {
        name,
        weight: Number(weight),
        isStage: true,
        advancementType: cut,
        advancementValue: needsValue && cutValue !== '' ? Number(cutValue) : null,
        carryPolicy: carry,
      })
      await reload()
    } finally {
      setSaving(false)
    }
  }

  const removeStage = async () => {
    if (!confirm(`Remove the "${stage.name}" stage? Its rounds will be deleted.`)) return
    await pageantService.deleteCategory(eventId, stage.id)
    reload()
  }

  const roundTotal = stageRounds.reduce((s, r) => s + Number(r.weight ?? 0), 0)

  return (
    <div className="rounded-xl border border-v-border bg-v-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-v-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-v-primary text-xs font-semibold text-white">
            {index + 1}
          </span>
          <span className="font-semibold text-v-text">{stage.name}</span>
          <span className="text-xs text-v-text-subtle">{stage.weight}% of final</span>
        </div>
        <button type="button" onClick={removeStage} className="text-sm text-v-danger">
          Remove stage
        </button>
      </div>

      <div className="space-y-4 px-4 py-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={LABEL_CLASS}>Stage name</label>
            <input className={INPUT_CLASS} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className={LABEL_CLASS}>Stage weight %</label>
            <input
              type="number"
              className={INPUT_CLASS}
              min={0}
              max={100}
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className={LABEL_CLASS}>Who advances after this stage?</label>
            <select className={INPUT_CLASS} value={cut} onChange={(e) => setCut(e.target.value)}>
              <option value="none">Everyone — no cut</option>
              <option value="top_n">Top N advance</option>
              <option value="top_percent">Top % advance</option>
              <option value="threshold">Score threshold</option>
              <option value="manual">Manual pick</option>
            </select>
          </div>
          <div>
            <label className={LABEL_CLASS}>
              {cut === 'top_n' ? 'N' : cut === 'top_percent' ? 'Percent' : cut === 'threshold' ? 'Min score' : 'Value'}
            </label>
            <input
              type="number"
              className={INPUT_CLASS}
              value={cutValue}
              disabled={!needsValue}
              onChange={(e) => setCutValue(e.target.value)}
              placeholder={needsValue ? '' : '—'}
            />
          </div>
          <div>
            <label className={LABEL_CLASS}>Do scores carry over?</label>
            <select className={INPUT_CLASS} value={carry} onChange={(e) => setCarry(e.target.value)}>
              <option value="reset">Reset — start next stage at zero</option>
              <option value="carry_50">Carry 50% forward</option>
              <option value="carry_full">Carry full score forward</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={saveStage}
            disabled={saving}
            className="rounded-lg border border-v-border px-3 py-1.5 text-sm text-v-text-muted hover:bg-v-surface-elevated disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save stage settings'}
          </button>
        </div>

        <div className="border-t border-v-border pt-4">
          <RoundsEditor
            eventId={eventId}
            stageId={stage.id}
            rounds={stageRounds}
            reload={reload}
            title={`Rounds in ${stage.name}`}
            hint="Each round is a judged segment. Round weights within a stage total 100%."
          />
          <WeightNote total={roundTotal} label="Round weights in this stage" />
        </div>
      </div>
    </div>
  )
}

// Rounds editor reused for event-wide (single stage) and per-stage lists.
function RoundsEditor({ eventId, stageId, rounds, reload, title, hint }) {
  const [name, setName] = useState('')
  const [weight, setWeight] = useState('')
  const [busy, setBusy] = useState(false)

  const add = async () => {
    if (!name.trim()) return
    setBusy(true)
    try {
      await pageantService.createRound(eventId, {
        name: name.trim(),
        weight: Number(weight || 0),
        categoryId: stageId,
        displayOrder: rounds.length,
      })
      setName('')
      setWeight('')
      await reload()
    } finally {
      setBusy(false)
    }
  }

  const remove = async (r) => {
    if (!confirm(`Delete round "${r.name}"?`)) return
    await pageantService.deleteRound(eventId, r.id)
    reload()
  }

  return (
    <div>
      <p className="text-sm font-medium text-v-text">{title}</p>
      {hint && <p className={HELPER_TEXT}>{hint}</p>}
      <ul className="mt-3 space-y-2">
        {rounds.map((r) => (
          <li
            key={r.id}
            className="flex items-center justify-between rounded-lg border border-v-border bg-v-surface px-3 py-2"
          >
            <span className="text-sm text-v-text">
              {r.name} <span className="text-xs text-v-text-subtle">· {r.weight}%</span>
              <span className="ml-2 text-xs text-v-text-subtle">
                {(r.criteriaIds?.length ?? 0)} criteria
              </span>
            </span>
            <button type="button" onClick={() => remove(r)} className="text-xs text-v-danger">
              Delete
            </button>
          </li>
        ))}
        {rounds.length === 0 && (
          <li className="rounded-lg border border-dashed border-v-border px-3 py-4 text-center text-sm text-v-text-subtle">
            No rounds yet.
          </li>
        )}
      </ul>
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_120px_auto]">
        <input
          className={INPUT_CLASS}
          placeholder="Round name (e.g. Talent)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          type="number"
          className={INPUT_CLASS}
          placeholder="Weight %"
          min={0}
          max={100}
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
        />
        <button
          type="button"
          onClick={add}
          disabled={busy || !name.trim()}
          className="rounded-lg border border-dashed border-v-border px-3 py-2 text-sm font-medium text-v-primary disabled:opacity-50"
        >
          + Add round
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 3 — Define Criteria (per round, minor criteria total 100%)
// ---------------------------------------------------------------------------
function resolveScaleBounds(cfg = {}) {
  switch (cfg.scoreType) {
    case 'range_1_10':
      return { min: 1, max: 10 }
    case 'decimal':
      return { min: 0, max: 10 }
    case 'custom_range': {
      const min = Number(cfg.customMin ?? 0)
      const max = Number(cfg.customMax ?? 100)
      if (Number.isNaN(min) || Number.isNaN(max) || max < min) return { min: 0, max: 100 }
      return { min, max }
    }
    default:
      return { min: 1, max: 100 }
  }
}

function CriteriaStep({ foundation, reload, onNext, onPrev }) {
  const { eventId } = useParams()
  const rounds = foundation?.rounds ?? []
  const criteria = foundation?.criteria ?? []
  const bounds = resolveScaleBounds(foundation?.event?.scoring_config)

  const [selectedRoundId, setSelectedRoundId] = useState(rounds[0]?.id ?? null)
  const [name, setName] = useState('')
  const [percentage, setPercentage] = useState('')
  const [busy, setBusy] = useState(false)

  const selectedRound = rounds.find((r) => r.id === selectedRoundId) ?? rounds[0] ?? null
  const roundCritIds = new Set(selectedRound?.criteriaIds ?? [])
  const roundCriteria = criteria.filter((c) => roundCritIds.has(c.id))
  const total = roundCriteria.reduce((s, c) => s + Number(c.percentage ?? 0), 0)

  const add = async (e) => {
    e.preventDefault()
    if (!name.trim() || !(Number(percentage) > 0) || !selectedRound) return
    setBusy(true)
    try {
      const { data } = await pageantService.createCriteria(eventId, {
        name: name.trim(),
        percentage: Number(percentage),
        minScore: bounds.min,
        maxScore: bounds.max,
      })
      const created = data?.criteria ?? data
      if (created?.id) await pageantService.addRoundCriteria(eventId, selectedRound.id, created.id)
      setName('')
      setPercentage('')
      await reload()
    } finally {
      setBusy(false)
    }
  }

  const removeFromRound = async (c) => {
    await pageantService.removeRoundCriteria(eventId, selectedRound.id, c.id)
    await pageantService.deleteCriteria(eventId, c.id).catch(() => {})
    reload()
  }

  if (!rounds.length) {
    return (
      <div>
        <div className="rounded-lg border border-dashed border-v-border px-4 py-8 text-center text-sm text-v-text-subtle">
          Add at least one round in the previous step before defining criteria.
        </div>
        <FooterNav onPrev={onPrev} onNext={onNext} nextLabel="Next: Divisions →" />
      </div>
    )
  }

  return (
    <div>
      <p className={`${HELPER_TEXT} mb-3`}>
        For each round, list exactly what judges score and how much each part is worth. Each round&apos;s
        criteria must total 100%. Score scale is {bounds.min}–{bounds.max} (set in Scoring Rules).
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        {rounds.map((r) => {
          const ids = r.criteriaIds ?? []
          const t = criteria.filter((c) => ids.includes(c.id)).reduce((s, c) => s + Number(c.percentage ?? 0), 0)
          const ok = ids.length > 0 && pct100(t)
          const active = r.id === selectedRound?.id
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => setSelectedRoundId(r.id)}
              className={`rounded-lg border px-3 py-1.5 text-sm ${
                active ? 'border-v-primary bg-v-primary/10 text-v-text' : 'border-v-border text-v-text-muted'
              }`}
            >
              {r.name}
              <span className={`ml-1.5 text-[10px] ${ok ? 'text-v-success' : 'text-amber-400'}`}>
                {ids.length ? `${pctShow(t)}%` : '—'}
              </span>
            </button>
          )
        })}
      </div>

      <form onSubmit={add} className="grid gap-3 rounded-xl border border-v-border bg-v-surface p-4 sm:grid-cols-[1fr_140px_auto]">
        <div>
          <label className={LABEL_CLASS}>New criterion for &ldquo;{selectedRound?.name}&rdquo;</label>
          <input
            className={INPUT_CLASS}
            placeholder="e.g. Technique, Stage Presence"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div>
          <label className={LABEL_CLASS}>Weight %</label>
          <input
            type="number"
            className={INPUT_CLASS}
            min={0}
            max={100}
            step="0.01"
            value={percentage}
            onChange={(e) => setPercentage(e.target.value)}
          />
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-v-primary px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            + Add
          </button>
        </div>
      </form>

      <ul className="mt-4 space-y-2">
        {roundCriteria.map((c) => (
          <li
            key={c.id}
            className="flex items-center justify-between rounded-lg border border-v-border bg-v-surface px-3 py-2"
          >
            <span className="text-sm text-v-text">
              {c.name} <span className="text-xs text-v-text-subtle">· {Number(c.percentage).toFixed(2)}%</span>
            </span>
            <button type="button" onClick={() => removeFromRound(c)} className="text-xs text-v-danger">
              Remove
            </button>
          </li>
        ))}
        {!roundCriteria.length && (
          <li className="rounded-lg border border-dashed border-v-border px-3 py-4 text-center text-sm text-v-text-subtle">
            No criteria in this round yet.
          </li>
        )}
      </ul>
      <WeightNote total={total} label={`${selectedRound?.name ?? 'Round'} criteria`} />

      <FooterNav onPrev={onPrev} onNext={onNext} nextLabel="Next: Divisions →" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 4 — Divisions
// ---------------------------------------------------------------------------
function DivisionsStep({ foundation, reload, onNext, onPrev }) {
  const { eventId } = useParams()
  const enabled = foundation?.event?.divisions_enabled ?? false
  const divisions = foundation?.divisions ?? []
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const toggle = async () => {
    setBusy(true)
    try {
      await pageantService.setDivisionsEnabled(eventId, !enabled)
      await reload()
    } finally {
      setBusy(false)
    }
  }

  const add = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    try {
      await pageantService.createDivision(eventId, { name: name.trim() })
      setName('')
      await reload()
    } finally {
      setBusy(false)
    }
  }

  const remove = async (d) => {
    if (!confirm(`Delete division "${d.name}"?`)) return
    try {
      await pageantService.deleteDivision(eventId, d.id)
      reload()
    } catch {
      alert('This division has data and cannot be deleted; deactivate it instead from the full page.')
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-v-primary/30 bg-v-primary/5 p-4">
        <div>
          <h3 className="font-semibold text-v-text">Separate categories, like Men and Women?</h3>
          <p className="text-sm text-v-text-subtle">
            Turn this on if groups should never be compared — each gets its own ranking and winner.
          </p>
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          className={`rounded-lg px-4 py-2 text-sm font-medium ${
            enabled ? 'bg-red-500/10 text-red-500' : 'bg-v-primary text-white'
          }`}
        >
          {enabled ? 'Disable divisions' : 'Enable divisions'}
        </button>
      </div>

      {enabled && (
        <>
          <form onSubmit={add} className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
            <input
              className={INPUT_CLASS}
              placeholder="Division name (e.g. Ms., Mr.)"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button
              type="submit"
              disabled={busy || !name.trim()}
              className="rounded-lg bg-v-primary px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              + Add division
            </button>
          </form>
          <ul className="mt-4 space-y-2">
            {divisions.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between rounded-lg border border-v-border bg-v-surface px-3 py-2"
              >
                <span className="text-sm text-v-text">{d.name}</span>
                <button type="button" onClick={() => remove(d)} className="text-xs text-v-danger">
                  Delete
                </button>
              </li>
            ))}
            {!divisions.length && (
              <li className="rounded-lg border border-dashed border-v-border px-3 py-4 text-center text-sm text-v-text-subtle">
                No divisions yet.
              </li>
            )}
          </ul>
        </>
      )}

      <FooterNav onPrev={onPrev} onNext={onNext} nextLabel="Next: Scoring Rules →" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 5 — Scoring Rules (Option B: new methods, tiebreaks, judge weighting)
// ---------------------------------------------------------------------------
const METHOD_DESC = {
  average: 'Add up judges’ scores and divide by the number of judges.',
  weighted_average: 'Rounds and criteria count by their weights — the standard method.',
  sum: 'Add every score together, no dividing.',
  trimmed_average: 'Drop the highest and lowest judge scores first, then average.',
  rank_based: 'Judges still enter numbers; each judge’s numbers are turned into ranks, then combined — a strict or lenient judge can’t drag scores up or down.',
  percentile: 'Each judge’s scores are normalized for how strict or lenient they are before combining.',
  highest_score: 'Take the single highest judge score.',
  lowest_removal: 'Drop the lowest score(s), then average.',
}
const TIEBREAK_DESC = {
  none: 'Genuine ties share a rank (standard).',
  highest_criterion: 'The contestant with the higher single best criterion wins the tie.',
  highest_round: 'Whoever scored higher in a chosen round wins the tie.',
  countback: 'Whoever won more individual criteria head-to-head wins.',
  judges_majority: 'Whoever more judges scored higher overall wins.',
  manual: 'The organizer decides the tie live.',
}

function ScoringStep({ foundation, reload, onNext, onPrev }) {
  const { eventId } = useParams()
  const cfg = foundation?.scoringConfig ?? foundation?.event?.scoring_config ?? {}
  const rounds = foundation?.rounds ?? []

  const [scoreType, setScoreType] = useState(cfg.scoreType ?? 'range_1_100')
  const [calculationMethod, setCalculationMethod] = useState(cfg.calculationMethod ?? 'weighted_average')
  const [decimalPlaces, setDecimalPlaces] = useState(cfg.decimalPlaces ?? 2)
  const [customMin, setCustomMin] = useState(cfg.customMin ?? 0)
  const [customMax, setCustomMax] = useState(cfg.customMax ?? 100)
  const [dropHighest, setDropHighest] = useState(cfg.dropHighest ?? 0)
  const [dropLowest, setDropLowest] = useState(cfg.dropLowest ?? 0)
  const [tieBreaker, setTieBreaker] = useState(cfg.tieBreaker ?? 'none')
  const [tieBreakRoundId, setTieBreakRoundId] = useState(cfg.tieBreakRoundId ?? '')
  const [judgeWeightingEnabled, setJudgeWeightingEnabled] = useState(Boolean(cfg.judgeWeightingEnabled))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)

  const usesTrim = calculationMethod === 'trimmed_average' || calculationMethod === 'lowest_removal'

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
        tieBreaker,
        tieBreakRoundId: tieBreaker === 'highest_round' ? tieBreakRoundId || null : null,
        judgeWeightingEnabled,
      })
      setSaved(true)
      await reload()
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save scoring config')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save} className="space-y-5">
      <div className="grid gap-4 rounded-xl border border-v-border bg-v-surface p-5 sm:grid-cols-2">
        <div>
          <label className={LABEL_CLASS}>Score scale judges use</label>
          <select className={INPUT_CLASS} value={scoreType} onChange={(e) => setScoreType(e.target.value)}>
            <option value="range_1_10">1–10</option>
            <option value="range_1_100">1–100</option>
            <option value="decimal">Decimal (0–10)</option>
            <option value="custom_range">Custom range</option>
          </select>
        </div>
        <div>
          <label className={LABEL_CLASS}>How scores are combined</label>
          <select
            className={INPUT_CLASS}
            value={calculationMethod}
            onChange={(e) => setCalculationMethod(e.target.value)}
          >
            <option value="average">Average</option>
            <option value="weighted_average">Weighted average</option>
            <option value="sum">Sum</option>
            <option value="trimmed_average">Trimmed average</option>
            <option value="rank_based">Rank-based</option>
            <option value="percentile">Percentile-normalized</option>
          </select>
          <p className={HELPER_TEXT}>{METHOD_DESC[calculationMethod]}</p>
        </div>

        {scoreType === 'custom_range' && (
          <>
            <div>
              <label className={LABEL_CLASS}>Custom min</label>
              <input type="number" className={INPUT_CLASS} value={customMin} onChange={(e) => setCustomMin(e.target.value)} />
            </div>
            <div>
              <label className={LABEL_CLASS}>Custom max</label>
              <input type="number" className={INPUT_CLASS} value={customMax} onChange={(e) => setCustomMax(e.target.value)} />
            </div>
          </>
        )}

        {usesTrim && (
          <>
            <div>
              <label className={LABEL_CLASS}>Drop highest N</label>
              <input type="number" min={0} className={INPUT_CLASS} value={dropHighest} onChange={(e) => setDropHighest(e.target.value)} />
            </div>
            <div>
              <label className={LABEL_CLASS}>Drop lowest N</label>
              <input type="number" min={0} className={INPUT_CLASS} value={dropLowest} onChange={(e) => setDropLowest(e.target.value)} />
            </div>
          </>
        )}

        <div>
          <label className={LABEL_CLASS}>Decimal places</label>
          <input type="number" min={0} max={6} className={INPUT_CLASS} value={decimalPlaces} onChange={(e) => setDecimalPlaces(e.target.value)} />
        </div>
      </div>

      <div className="grid gap-4 rounded-xl border border-v-border bg-v-surface p-5 sm:grid-cols-2">
        <div>
          <label className={LABEL_CLASS}>Tie-break rule</label>
          <select className={INPUT_CLASS} value={tieBreaker} onChange={(e) => setTieBreaker(e.target.value)}>
            <option value="none">Share the rank (standard)</option>
            <option value="highest_criterion">Higher best criterion</option>
            <option value="highest_round">Higher score in a chosen round</option>
            <option value="countback">Won more criteria head-to-head</option>
            <option value="judges_majority">More judges scored them higher</option>
            <option value="manual">Organizer decides live</option>
          </select>
          <p className={HELPER_TEXT}>{TIEBREAK_DESC[tieBreaker]}</p>
        </div>
        {tieBreaker === 'highest_round' && (
          <div>
            <label className={LABEL_CLASS}>Which round decides?</label>
            <select className={INPUT_CLASS} value={tieBreakRoundId} onChange={(e) => setTieBreakRoundId(e.target.value)}>
              <option value="">Each contestant’s best round</option>
              {rounds.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-v-border bg-v-surface p-5">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={judgeWeightingEnabled}
            onChange={(e) => setJudgeWeightingEnabled(e.target.checked)}
            className="mt-1"
          />
          <span>
            <span className="block font-medium text-v-text">Weight judges differently</span>
            <span className="text-sm text-v-text-subtle">
              Off = every judge counts equally. On = set each judge’s weight on the Judges page (weights
              should total 100%).
            </span>
          </span>
        </label>
      </div>

      <div className="flex items-center justify-between">
        <div>
          {error && <p className="text-sm text-v-danger">{error}</p>}
          {saved && <p className="text-sm text-v-success">Saved.</p>}
        </div>
        <button type="submit" disabled={saving} className="rounded-lg bg-v-primary px-4 py-2 text-sm text-white disabled:opacity-50">
          {saving ? 'Saving…' : 'Save scoring rules'}
        </button>
      </div>

      <FooterNav onPrev={onPrev} onNext={onNext} nextLabel="Next: Review & Lock →" />
    </form>
  )
}

// ---------------------------------------------------------------------------
// Step 6 — Review & Lock
// ---------------------------------------------------------------------------
function ReviewStep({ foundation, onPrev }) {
  const stages = (foundation?.categories ?? []).filter((c) => c.isStage)
  const rounds = foundation?.rounds ?? []
  const criteria = foundation?.criteria ?? []
  const divisions = foundation?.divisions ?? []
  const cfg = foundation?.scoringConfig ?? {}

  const issues = []
  if (stages.length) {
    const st = stages.reduce((s, x) => s + Number(x.weight ?? 0), 0)
    if (!pct100(st)) issues.push(`Stage weights add up to ${pctShow(st)}%, not 100%.`)
    for (const stage of stages) {
      const sr = rounds.filter((r) => r.categoryId === stage.id)
      const rt = sr.reduce((s, r) => s + Number(r.weight ?? 0), 0)
      if (!sr.length) issues.push(`Stage "${stage.name}" has no rounds.`)
      else if (!pct100(rt)) issues.push(`Stage "${stage.name}" round weights add up to ${pctShow(rt)}%, not 100%.`)
    }
  } else {
    const ew = rounds.filter((r) => !r.categoryId)
    const rt = ew.reduce((s, r) => s + Number(r.weight ?? 0), 0)
    if (!ew.length) issues.push('Add at least one round.')
    else if (!pct100(rt)) issues.push(`Round weights add up to ${pctShow(rt)}%, not 100%.`)
  }
  for (const r of rounds) {
    const ids = r.criteriaIds ?? []
    const t = criteria.filter((c) => ids.includes(c.id)).reduce((s, c) => s + Number(c.percentage ?? 0), 0)
    if (!ids.length) issues.push(`Round "${r.name}" has no criteria.`)
    else if (!pct100(t)) issues.push(`Round "${r.name}" criteria add up to ${pctShow(t)}%, not 100%.`)
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-v-border bg-v-surface p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-v-text-muted">Structure</p>
        <p className="mt-1 text-sm text-v-text">
          {stages.length
            ? `${stages.length} stage(s): ${stages.map((s) => `${s.name} (${s.weight}%)`).join(', ')}`
            : 'Single stage'}
          {' · '}
          {rounds.length} round(s) · {criteria.length} criteria
        </p>
        {divisions.length > 0 && (
          <p className="mt-1 text-sm text-v-text-subtle">
            Divisions: {divisions.map((d) => d.name).join(', ')}
          </p>
        )}
        <p className="mt-1 text-sm text-v-text-subtle">
          Scoring: {cfg.calculationMethod ?? 'weighted_average'} · tie-break: {cfg.tieBreaker ?? 'none'}
          {cfg.judgeWeightingEnabled ? ' · weighted judges' : ''}
        </p>
      </div>

      {issues.length ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-5">
          <p className="text-sm font-semibold text-amber-300">Fix these before scoring can open:</p>
          <ul className="mt-2 list-disc pl-5 text-sm text-amber-200">
            {issues.map((i, idx) => (
              <li key={idx}>{i}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-5">
          <p className="text-sm font-semibold text-emerald-300">
            ✓ Structure checks out. Add contestants and judges, then start scoring from Live Control.
          </p>
        </div>
      )}

      <FooterNav onPrev={onPrev} />
    </div>
  )
}
