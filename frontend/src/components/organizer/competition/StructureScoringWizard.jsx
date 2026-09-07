import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'

import { pageantService } from '@/services/pageant.service'
import { useToast } from '@/hooks/useToast'
import { INPUT_CLASS, LABEL_CLASS } from '@/utils/uiClasses'

// Guided Structure & Scoring setup. Walks the organizer through the five steps
// in order, gating each one until its weights add up, instead of presenting
// every knob at once.
//
// How the wizard's vocabulary maps onto the schema:
//   Stage           -> competition_categories  (only created for multi-stage events)
//   Major criterion -> competition_rounds      (weight is a share of its stage)
//   Minor criterion -> competition_criteria    (weight is a share of its round)
// A stage's cut/carry rules are stored on the LAST round of that stage, because
// advancement runs when a round is finalized — finalizing a stage's last round
// is what moves contestants into the next stage.

const STEPS = [
  { key: 'rounds', label: 'Build Rounds' },
  { key: 'criteria', label: 'Define Criteria' },
  { key: 'divisions', label: 'Set Up Divisions' },
  { key: 'scoring', label: 'Set Scoring Rules' },
  { key: 'review', label: 'Review & Lock' },
]

// Weights rarely land on a clean 100 (33.3 x 3 = 99.9), so allow the rounding slack.
const pct100 = (total) => Math.abs(Number(total) - 100) < 0.1
const pctShow = (total) => Math.round(Number(total) * 100) / 100
const clampPct = (value) => {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, n))
}

const sumWeights = (items) => items.reduce((s, i) => s + Number(i.weight ?? 0), 0)
const sumPercentages = (items) => items.reduce((s, i) => s + Number(i.percentage ?? 0), 0)

const ADVANCEMENT_OPTIONS = [
  { value: 'none', label: 'Nobody is cut — everyone moves on' },
  { value: 'top_n', label: 'Only the top N move on' },
  { value: 'top_percent', label: 'Only the top N% move on' },
  { value: 'threshold', label: 'Everyone at or above a score moves on' },
  { value: 'manual', label: 'I pick who moves on by hand' },
]

const CALCULATION_METHODS = [
  { value: 'average', label: 'Average', desc: 'Add up what every judge gave, then divide by the number of judges. Easiest to explain, but one unusually harsh or generous judge moves the result a lot.' },
  { value: 'weighted_average', label: 'Weighted average', desc: 'Each round and criterion counts for the percentage you set. This is the standard method used by most pageants and competitions.' },
  { value: 'sum', label: 'Sum', desc: 'Every score is simply added together. Fast, but a single extreme score from one judge shifts the total a lot.' },
  { value: 'highest_score', label: 'Highest score', desc: "Only the single highest score a contestant received counts. Useful for best-attempt formats." },
  { value: 'lowest_removal', label: 'Trimmed average', desc: 'Drops the highest and lowest judge scores first, then averages the rest. Softens one judge who scored very differently. Works best with 5 or more judges.' },
  { value: 'rank_based', label: 'Rank-based', desc: 'Each judge effectively places contestants in order rather than scoring them, and those placements are combined. Keeps a judge who scores generously from outweighing one who scores tightly.' },
  { value: 'percentile', label: 'Percentile-normalized', desc: 'Each judge’s scores are rescaled onto their own range before being combined, correcting for judges who are consistently strict or lenient. Fairest with mismatched judges, but hardest to explain on stage.' },
]

const TIE_BREAKERS = [
  { value: 'none', label: 'Leave it as a tie (contestants share the rank)', desc: 'No tie-break runs. Both contestants show the same rank, and the next rank skips accordingly.' },
  { value: 'highest_round', label: 'Whoever scored higher in a specific round', desc: 'You nominate the deciding round (e.g. Q&A). Simple and easy to explain on stage.' },
  { value: 'countback', label: 'Whoever won more individual criteria ("countback")', desc: 'Counts how many individual criteria each tied contestant won. Fairer than picking one round, but takes longer to explain.' },
  { value: 'judges_majority', label: 'Whoever more judges scored higher', desc: "Checks each judge's own scores — whoever the majority of judges personally placed higher takes the tie." },
  { value: 'highest_criterion', label: 'Whoever has the single best criterion score', desc: 'Compares each contestant’s strongest individual criterion score.' },
  { value: 'manual', label: 'Let the organizer decide on the spot', desc: 'Nothing is resolved automatically — the tie stays visible and you make the call live.' },
]

const SCORE_TYPES = [
  { value: 'range_1_10', label: '1 to 10' },
  { value: 'range_1_100', label: '1 to 100' },
  { value: 'decimal', label: 'Decimal (0 to 10)' },
  { value: 'custom_range', label: 'Custom range' },
]

function scaleBounds(scoringConfig) {
  const cfg = scoringConfig ?? {}
  switch (cfg.scoreType) {
    case 'range_1_10':
      return { min: 1, max: 10 }
    case 'decimal':
      return { min: 0, max: 10 }
    case 'custom_range': {
      const min = Number(cfg.customMin ?? 0)
      const max = Number(cfg.customMax ?? 100)
      if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) return { min: 0, max: 100 }
      return { min, max }
    }
    default:
      return { min: 1, max: 100 }
  }
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------
function WeightNote({ total, unit = 'These' }) {
  const ok = pct100(total)
  return (
    <p className={`mt-2 text-xs ${ok ? 'text-v-success' : 'font-semibold text-amber-500'}`}>
      {unit} currently add up to {pctShow(total)}%.{' '}
      {ok ? "That's correct." : 'They need to add up to 100% before you can continue.'}
    </p>
  )
}

function Warning({ children }) {
  return (
    <div className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-500">
      {children}
    </div>
  )
}

function StepHeader({ title, children }) {
  return (
    <div>
      <h3 className="text-base font-semibold text-v-text">{title}</h3>
      {children && <p className="mt-1 text-sm text-v-text-subtle">{children}</p>}
    </div>
  )
}

function FooterNav({ onBack, backLabel, onNext, nextLabel, nextDisabled, nextTitle, busy }) {
  return (
    <div className="flex items-center justify-between gap-3 pt-2">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-v-border px-4 py-2 text-sm text-v-text-muted hover:bg-v-surface-elevated"
        >
          {backLabel ?? 'Back'}
        </button>
      ) : (
        <span />
      )}
      {onNext && (
        <button
          type="button"
          onClick={onNext}
          disabled={nextDisabled || busy}
          title={nextTitle}
          className="rounded-lg bg-v-primary px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Saving…' : nextLabel ?? 'Next'}
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Wizard shell
// ---------------------------------------------------------------------------
export default function StructureScoringWizard({ foundation, reload, onExit }) {
  const [step, setStep] = useState('rounds')
  const stepIndex = STEPS.findIndex((s) => s.key === step)
  const locked = Boolean(foundation?.event?.scoring_enabled)

  return (
    <div className="space-y-6">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-2 border-b border-v-border pb-3 text-sm">
        {STEPS.map((s, i) => {
          const done = i < stepIndex
          const current = i === stepIndex
          return (
            <li key={s.key} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setStep(s.key)}
                className={`flex items-center gap-2 rounded-lg px-2 py-1 ${
                  current ? 'text-v-text' : 'text-v-text-subtle hover:text-v-text-muted'
                }`}
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
                    done
                      ? 'bg-v-success text-white'
                      : current
                        ? 'bg-v-primary text-white'
                        : 'border border-v-border text-v-text-subtle'
                  }`}
                >
                  {done ? '✓' : i + 1}
                </span>
                <span className={current ? 'font-semibold' : ''}>{s.label}</span>
              </button>
              {i < STEPS.length - 1 && <span className="text-v-border">—</span>}
            </li>
          )
        })}
      </ol>

      {locked && <LockBanner reload={reload} />}

      <div className={locked ? 'pointer-events-none opacity-50' : ''}>
        {step === 'rounds' && (
          <BuildRoundsStep foundation={foundation} reload={reload} onDone={() => setStep('criteria')} />
        )}
        {step === 'criteria' && (
          <DefineCriteriaStep
            foundation={foundation}
            reload={reload}
            onBack={() => setStep('rounds')}
            onDone={() => setStep('divisions')}
          />
        )}
        {step === 'divisions' && (
          <DivisionsStep
            foundation={foundation}
            reload={reload}
            onBack={() => setStep('criteria')}
            onDone={() => setStep('scoring')}
          />
        )}
        {step === 'scoring' && (
          <ScoringRulesStep
            foundation={foundation}
            reload={reload}
            onBack={() => setStep('divisions')}
            onDone={() => setStep('review')}
          />
        )}
        {step === 'review' && (
          <ReviewLockStep
            foundation={foundation}
            reload={reload}
            onBack={() => setStep('scoring')}
            onExit={onExit}
          />
        )}
      </div>
    </div>
  )
}

function LockBanner({ reload }) {
  const { eventId } = useParams()
  const { error: showError } = useToast()
  const [busy, setBusy] = useState(false)

  const unlock = async () => {
    setBusy(true)
    try {
      await pageantService.setScoring(eventId, false)
      reload()
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to unlock')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pointer-events-auto flex flex-wrap items-center gap-3 rounded-lg border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-500">
      <span className="flex-1">
        This competition&apos;s structure and scoring rules are locked because scoring has been
        published. Rounds, weights, and criteria can no longer be changed here.
      </span>
      <button
        type="button"
        onClick={unlock}
        disabled={busy}
        title="Only do this if you're certain — changing structure after scoring starts can invalidate submitted scores"
        className="rounded-lg border border-amber-400/50 px-3 py-1.5 text-xs font-medium disabled:opacity-50"
      >
        {busy ? 'Unlocking…' : 'Unlock anyway'}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 1 — Build Rounds
// ---------------------------------------------------------------------------
function BuildRoundsStep({ foundation, reload, onDone }) {
  const { eventId } = useParams()
  const { error: showError } = useToast()

  const stages = foundation?.categories ?? []
  const rounds = foundation?.rounds ?? []
  const eventRounds = rounds.filter((r) => !r.divisionId)

  const [phase, setPhase] = useState(() => (stages.length || eventRounds.length ? 'perStage' : 'stages'))
  const [multiStage, setMultiStage] = useState(stages.length > 0)
  const [stageIndex, setStageIndex] = useState(0)
  const [busy, setBusy] = useState(false)

  const [stageName, setStageName] = useState('')
  const [stageWeight, setStageWeight] = useState('')

  // In single-stage mode there is no category, so the whole event is one bucket.
  const stageList = multiStage ? stages : [{ id: null, name: 'This competition', weight: 100 }]
  const roundsForStage = (stageId) => eventRounds.filter((r) => (r.categoryId ?? null) === stageId)

  const addStage = async () => {
    const name = stageName.trim()
    if (!name) return
    const weight = clampPct(stageWeight)
    setBusy(true)
    try {
      await pageantService.createCategory(eventId, { name, weight })
      setStageName('')
      setStageWeight('')
      reload()
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to add stage')
    } finally {
      setBusy(false)
    }
  }

  const removeStage = async (stageId) => {
    if (!window.confirm('Remove this stage? Any rounds inside it stay, but lose their stage.')) return
    try {
      await pageantService.deleteCategory(eventId, stageId)
      reload()
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to remove stage')
    }
  }

  // --- Phase A: how many stages? ---
  if (phase === 'stages') {
    const stageTotal = sumWeights(stages)
    const needsMore = multiStage && stages.length < 2
    return (
      <div className="space-y-5">
        <StepHeader title="Will this competition have multiple stages?">
          Choose Yes if contestants move through separate phases such as Preliminaries, Semifinals
          and Finals, with people cut between them.
        </StepHeader>

        <div className="v-card space-y-4 p-6">
          <select
            className={INPUT_CLASS}
            value={multiStage ? 'yes' : 'no'}
            onChange={(e) => setMultiStage(e.target.value === 'yes')}
          >
            <option value="no">No — one stage</option>
            <option value="yes">Yes — multiple stages</option>
          </select>

          {multiStage && (
            <div className="grid gap-3 border-t border-dashed border-v-border pt-4 sm:grid-cols-[1fr_140px_auto]">
              <div>
                <label className={LABEL_CLASS}>
                  {stages.length === 0 ? 'Add the first stage' : 'Add the next stage'}
                </label>
                <input
                  className={INPUT_CLASS}
                  value={stageName}
                  onChange={(e) => setStageName(e.target.value)}
                  placeholder="e.g. Preliminaries"
                />
              </div>
              <div>
                <label className={LABEL_CLASS}>Share of final %</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  className={INPUT_CLASS}
                  value={stageWeight}
                  onChange={(e) => setStageWeight(e.target.value)}
                  placeholder="%"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={addStage}
                  disabled={busy || !stageName.trim()}
                  className="rounded-lg border border-dashed border-v-border px-4 py-2 text-sm font-medium text-v-primary disabled:opacity-50"
                >
                  + Add stage
                </button>
              </div>
            </div>
          )}
        </div>

        {multiStage && stages.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-v-text-muted">Stages added</p>
            {stages.map((s, i) => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-xl border border-v-border px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-v-primary text-xs text-white">
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-medium text-v-text">{s.name}</p>
                    <p className="text-xs text-v-text-subtle">{s.weight}% of the final score</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeStage(s.id)}
                  className="text-sm text-v-danger"
                >
                  Remove
                </button>
              </div>
            ))}
            <WeightNote total={stageTotal} unit="Your stages" />
          </div>
        )}

        {needsMore && (
          <Warning>
            Multiple stages are enabled, so add at least two before continuing — otherwise choose
            &quot;one stage&quot; above.
          </Warning>
        )}

        <FooterNav
          onNext={() => setPhase('askMajor')}
          nextLabel="Next"
          nextDisabled={needsMore || (multiStage && !pct100(stageTotal))}
          nextTitle={
            needsMore
              ? 'Add at least two stages first'
              : multiStage && !pct100(stageTotal)
                ? 'Stage weights must total 100%'
                : undefined
          }
        />
      </div>
    )
  }

  // --- Phase B: does a stage hold several weighted parts? ---
  if (phase === 'askMajor') {
    return (
      <div className="space-y-5">
        <StepHeader title={`Will ${multiStage ? 'your stages' : 'this competition'} have multiple major criteria?`}>
          Choose Yes if there are several weighted parts — like Interview, Swimsuit and Evening Gown
          — each worth its own share. Choose No if everything is judged as one single whole.
        </StepHeader>
        <div className="v-card p-6">
          <p className="text-sm text-v-text-subtle">
            Either way you&apos;ll define exactly what judges score in the next step. This question
            just decides whether {multiStage ? 'a stage' : 'the competition'} is split into weighted
            parts first.
          </p>
        </div>
        <FooterNav
          onBack={() => setPhase('stages')}
          onNext={() => {
            setStageIndex(0)
            setPhase('perStage')
          }}
          nextLabel="Next"
        />
      </div>
    )
  }

  // --- Phase C: define each stage's rounds, one stage at a time ---
  const stage = stageList[stageIndex] ?? stageList[0]
  const stageRounds = roundsForStage(stage?.id ?? null)
  const roundTotal = sumWeights(stageRounds)
  const canContinue = stageRounds.length > 0 && pct100(roundTotal)
  const isLastStage = stageIndex >= stageList.length - 1

  return (
    <div className="space-y-5">
      <StepHeader title={`What major criteria happen in ${stage?.name ?? 'this competition'}?`}>
        {multiStage
          ? `Stage ${stageIndex + 1} of ${stageList.length}. These weights are a share of this stage, so they add up to 100% within it.`
          : 'Add each weighted part judges will score. Their weights add up to 100% across the competition.'}
      </StepHeader>

      {stageIndex > 0 && (
        <div className="space-y-2">
          {stageList.slice(0, stageIndex).map((s) => (
            <div
              key={s.id ?? 'single'}
              className="flex items-center gap-3 rounded-xl border border-v-border px-4 py-2.5 opacity-60"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-v-success text-[11px] text-white">
                ✓
              </span>
              <span className="text-sm text-v-text">{s.name}</span>
              <span className="text-xs text-v-text-subtle">
                {roundsForStage(s.id).length} major criteria · {pctShow(sumWeights(roundsForStage(s.id)))}%
              </span>
            </div>
          ))}
        </div>
      )}

      <RoundListEditor
        eventId={eventId}
        rounds={stageRounds}
        categoryId={stage?.id ?? null}
        divisionId={null}
        reload={reload}
        emptyHint="Add the first thing judges will score here, e.g. Interview or Talent."
      />
      <WeightNote total={roundTotal} />

      {multiStage && stageRounds.length > 0 && (
        // Keyed on the gate round so adding a round re-seeds the form from the
        // new last round rather than showing the previous one's saved rules.
        <StageAdvancement
          key={stageRounds[stageRounds.length - 1].id}
          eventId={eventId}
          stage={stage}
          stageRounds={stageRounds}
          isFinalStage={isLastStage}
          reload={reload}
        />
      )}

      <FooterNav
        onBack={() => (stageIndex > 0 ? setStageIndex(stageIndex - 1) : setPhase('askMajor'))}
        backLabel={stageIndex > 0 ? `Back: ${stageList[stageIndex - 1].name}` : 'Back'}
        onNext={() => (isLastStage ? onDone() : setStageIndex(stageIndex + 1))}
        nextLabel={isLastStage ? 'Next: Define Criteria' : `Next stage: ${stageList[stageIndex + 1]?.name}`}
        nextDisabled={!canContinue}
        nextTitle={canContinue ? undefined : 'Add at least one major criterion totalling 100%'}
      />
    </div>
  )
}

// Add / rename / reweight / remove the rounds belonging to one stage (or one
// division, when used from the divisions step).
function RoundListEditor({ eventId, rounds, categoryId, divisionId, reload, emptyHint }) {
  const { error: showError } = useToast()
  const [name, setName] = useState('')
  const [weight, setWeight] = useState('')
  const [busy, setBusy] = useState(false)

  const add = async () => {
    if (!name.trim()) return
    setBusy(true)
    try {
      await pageantService.createRound(eventId, {
        name: name.trim(),
        weight: clampPct(weight),
        categoryId: categoryId || null,
        divisionId: divisionId || null,
      })
      setName('')
      setWeight('')
      reload()
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to add')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="v-card space-y-3 p-6">
      {rounds.map((round) => (
        <RoundRow key={round.id} eventId={eventId} round={round} reload={reload} />
      ))}
      {rounds.length === 0 && <p className="text-sm text-v-text-subtle">{emptyHint}</p>}

      <div className="grid gap-3 border-t border-dashed border-v-border pt-4 sm:grid-cols-[1fr_120px_auto]">
        <input
          className={INPUT_CLASS}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Evening Gown"
        />
        <input
          type="number"
          min={0}
          max={100}
          className={INPUT_CLASS}
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          placeholder="%"
        />
        <button
          type="button"
          onClick={add}
          disabled={busy || !name.trim()}
          className="rounded-lg border border-dashed border-v-border px-4 py-2 text-sm font-medium text-v-primary disabled:opacity-50"
        >
          + Add
        </button>
      </div>
    </div>
  )
}

function RoundRow({ eventId, round, reload }) {
  const { error: showError } = useToast()
  const [name, setName] = useState(round.name)
  const [weight, setWeight] = useState(round.weight)
  const dirty = name !== round.name || Number(weight) !== Number(round.weight)

  const save = async () => {
    try {
      await pageantService.updateRound(eventId, round.id, {
        ...roundUpdatePayload(round),
        name: name.trim() || round.name,
        weight: clampPct(weight),
      })
      reload()
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to save')
    }
  }

  const remove = async () => {
    if (!window.confirm(`Remove "${round.name}"?`)) return
    try {
      await pageantService.deleteRound(eventId, round.id)
      reload()
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to remove')
    }
  }

  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_120px_auto_auto] sm:items-center">
      <input className={INPUT_CLASS} value={name} onChange={(e) => setName(e.target.value)} />
      <input
        type="number"
        min={0}
        max={100}
        className={INPUT_CLASS}
        value={weight}
        onChange={(e) => setWeight(e.target.value)}
      />
      <button
        type="button"
        onClick={save}
        disabled={!dirty}
        className="rounded-lg px-3 py-2 text-sm text-v-success disabled:opacity-30"
      >
        Save
      </button>
      <button type="button" onClick={remove} className="rounded-lg px-3 py-2 text-sm text-v-danger">
        Remove
      </button>
    </div>
  )
}

// The update validator resets any field the payload omits, so every save has to
// send the round whole.
function roundUpdatePayload(round) {
  return {
    name: round.name,
    description: round.description ?? null,
    weight: round.weight,
    displayOrder: round.displayOrder,
    categoryId: round.categoryId ?? null,
    divisionId: round.divisionId ?? null,
    isOpen: round.isOpen,
    advancementType: round.advancementType ?? 'none',
    advancementValue: round.advancementValue ?? null,
    scorePolicy: round.scorePolicy ?? 'independent',
  }
}

// A stage's cut lands on its last round, because advancement runs when a round
// is finalized and that round is the gate into the next stage.
function StageAdvancement({ eventId, stage, stageRounds, isFinalStage, reload }) {
  const { error: showError } = useToast()
  const gateRound = stageRounds[stageRounds.length - 1]
  const [advType, setAdvType] = useState(gateRound?.advancementType ?? 'none')
  const [advValue, setAdvValue] = useState(gateRound?.advancementValue ?? '')
  const [carry, setCarry] = useState(gateRound?.scorePolicy ?? 'independent')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  const needsValue = advType === 'top_n' || advType === 'top_percent' || advType === 'threshold'

  const save = async () => {
    if (!gateRound) return
    setBusy(true)
    setSaved(false)
    try {
      await pageantService.updateRound(eventId, gateRound.id, {
        ...roundUpdatePayload(gateRound),
        advancementType: advType,
        advancementValue: needsValue && advValue !== '' ? Number(advValue) : null,
        scorePolicy: carry,
      })
      setSaved(true)
      reload()
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to save stage rules')
    } finally {
      setBusy(false)
    }
  }

  if (isFinalStage) {
    return (
      <div className="rounded-lg border border-v-border bg-v-surface-elevated/40 px-4 py-3 text-xs text-v-text-subtle">
        This is the final stage, so nobody is cut after it — its results decide the placements.
      </div>
    )
  }

  return (
    <div className="v-card space-y-4 p-6">
      <div>
        <h4 className="text-sm font-semibold text-v-text">
          What happens at the end of {stage.name}?
        </h4>
        <p className="mt-1 text-xs text-v-text-subtle">
          Applied when you finalize <strong>{gateRound?.name}</strong> — the last part of this stage
          — from Live Control.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className={LABEL_CLASS}>How many move on?</label>
          <select className={INPUT_CLASS} value={advType} onChange={(e) => setAdvType(e.target.value)}>
            {ADVANCEMENT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL_CLASS}>
            {advType === 'top_n' ? 'How many' : advType === 'top_percent' ? 'Percent' : advType === 'threshold' ? 'Minimum score' : 'Value'}
          </label>
          <input
            type="number"
            className={INPUT_CLASS}
            value={advValue}
            disabled={!needsValue}
            onChange={(e) => setAdvValue(e.target.value)}
            placeholder={needsValue ? '' : '—'}
          />
        </div>
        <div>
          <label className={LABEL_CLASS}>Do scores start over next stage?</label>
          <select className={INPUT_CLASS} value={carry} onChange={(e) => setCarry(e.target.value)}>
            <option value="independent">Yes — everyone starts the next stage fresh</option>
            <option value="cumulative">No — carry this stage&apos;s score forward</option>
          </select>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        {saved && <span className="text-xs text-v-success">Saved.</span>}
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="rounded-lg border border-v-border px-3 py-1.5 text-xs font-medium text-v-text-muted disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save stage rules'}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 2 — Define Criteria, one round at a time
// ---------------------------------------------------------------------------
function DefineCriteriaStep({ foundation, reload, onBack, onDone }) {
  const rounds = foundation?.rounds ?? []
  const [index, setIndex] = useState(0)

  if (!rounds.length) {
    return (
      <div className="space-y-5">
        <Warning>
          There are no major criteria to break down yet — go back and add at least one first.
        </Warning>
        <FooterNav onBack={onBack} backLabel="Back: Build Rounds" />
      </div>
    )
  }

  const safeIndex = Math.min(index, rounds.length - 1)
  const round = rounds[safeIndex]
  const criteria = (foundation?.criteria ?? []).filter((c) => (round.criteriaIds ?? []).includes(c.id))
  const total = sumPercentages(criteria)
  const canContinue = criteria.length > 0 && pct100(total)
  const isLast = safeIndex >= rounds.length - 1

  return (
    <div className="space-y-5">
      <StepHeader title={`What's being judged within ${round.name}?`}>
        Round {safeIndex + 1} of {rounds.length}. List exactly what judges score here and how much
        each part is worth — they add up to 100% within this round.
      </StepHeader>

      {safeIndex > 0 && (
        <div className="space-y-2">
          {rounds.slice(0, safeIndex).map((r) => {
            const done = (foundation?.criteria ?? []).filter((c) => (r.criteriaIds ?? []).includes(c.id))
            return (
              <div
                key={r.id}
                className="flex items-center gap-3 rounded-xl border border-v-border px-4 py-2.5 opacity-60"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-v-success text-[11px] text-white">
                  ✓
                </span>
                <span className="text-sm text-v-text">{r.name}</span>
                <span className="text-xs text-v-text-subtle">{pctShow(sumPercentages(done))}%</span>
              </div>
            )
          })}
        </div>
      )}

      <CriteriaEditor
        foundation={foundation}
        round={round}
        criteria={criteria}
        reload={reload}
      />
      <WeightNote total={total} unit="These criteria" />

      <FooterNav
        onBack={() => (safeIndex > 0 ? setIndex(safeIndex - 1) : onBack())}
        backLabel={safeIndex > 0 ? `Back: ${rounds[safeIndex - 1].name}` : 'Back: Build Rounds'}
        onNext={() => (isLast ? onDone() : setIndex(safeIndex + 1))}
        nextLabel={isLast ? 'Next: Set Up Divisions' : `Next round: ${rounds[safeIndex + 1]?.name}`}
        nextDisabled={!canContinue}
        nextTitle={canContinue ? undefined : 'These criteria need to total 100% first'}
      />
    </div>
  )
}

function CriteriaEditor({ foundation, round, criteria, reload }) {
  const { eventId } = useParams()
  const { error: showError } = useToast()
  const [name, setName] = useState('')
  const [percentage, setPercentage] = useState('')
  const [busy, setBusy] = useState(false)
  const bounds = useMemo(
    () => scaleBounds(foundation?.event?.scoring_config),
    [foundation?.event?.scoring_config],
  )

  const add = async () => {
    const pct = Number(percentage)
    if (!name.trim() || !Number.isFinite(pct) || pct <= 0) {
      showError('Enter a name and a weight greater than 0')
      return
    }
    setBusy(true)
    try {
      const { data } = await pageantService.createCriteria(eventId, {
        name: name.trim(),
        percentage: pct,
        minScore: bounds.min,
        maxScore: bounds.max,
        divisionId: round.divisionId ?? null,
      })
      const created = data?.criteria ?? data
      if (created?.id) await pageantService.addRoundCriteria(eventId, round.id, created.id)
      setName('')
      setPercentage('')
      reload()
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to add criterion')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (criteriaId) => {
    // A criterion can be shared across rounds (the Criteria page can attach an
    // existing one), so only delete it outright when this was its last round.
    const usedElsewhere = (foundation?.rounds ?? []).some(
      (r) => r.id !== round.id && (r.criteriaIds ?? []).includes(criteriaId),
    )
    try {
      await pageantService.removeRoundCriteria(eventId, round.id, criteriaId)
      if (!usedElsewhere) await pageantService.deleteCriteria(eventId, criteriaId)
      reload()
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to remove criterion')
    }
  }

  return (
    <div className="v-card space-y-3 p-6">
      {criteria.map((c) => (
        <CriterionRow key={c.id} eventId={eventId} criterion={c} onRemove={remove} reload={reload} />
      ))}
      {criteria.length === 0 && (
        <p className="text-sm text-v-text-subtle">
          Nothing yet. Add what judges actually score in {round.name} — e.g. Confidence, Poise,
          Stage Presence.
        </p>
      )}

      <div className="grid gap-3 border-t border-dashed border-v-border pt-4 sm:grid-cols-[1fr_120px_auto]">
        <input
          className={INPUT_CLASS}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Confidence"
        />
        <input
          type="number"
          min={0}
          max={100}
          className={INPUT_CLASS}
          value={percentage}
          onChange={(e) => setPercentage(e.target.value)}
          placeholder="%"
        />
        <button
          type="button"
          onClick={add}
          disabled={busy || !name.trim()}
          className="rounded-lg border border-dashed border-v-border px-4 py-2 text-sm font-medium text-v-primary disabled:opacity-50"
        >
          + Add criterion
        </button>
      </div>
    </div>
  )
}

function CriterionRow({ eventId, criterion, onRemove, reload }) {
  const { error: showError } = useToast()
  const [name, setName] = useState(criterion.name)
  const [percentage, setPercentage] = useState(criterion.percentage)
  const dirty = name !== criterion.name || Number(percentage) !== Number(criterion.percentage)

  const save = async () => {
    try {
      await pageantService.updateCriteria(eventId, criterion.id, {
        name: name.trim() || criterion.name,
        percentage: clampPct(percentage),
      })
      reload()
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to save')
    }
  }

  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_120px_auto_auto] sm:items-center">
      <input className={INPUT_CLASS} value={name} onChange={(e) => setName(e.target.value)} />
      <input
        type="number"
        min={0}
        max={100}
        className={INPUT_CLASS}
        value={percentage}
        onChange={(e) => setPercentage(e.target.value)}
      />
      <button
        type="button"
        onClick={save}
        disabled={!dirty}
        className="rounded-lg px-3 py-2 text-sm text-v-success disabled:opacity-30"
      >
        Save
      </button>
      <button
        type="button"
        onClick={() => onRemove(criterion.id)}
        className="rounded-lg px-3 py-2 text-sm text-v-danger"
      >
        Remove
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 3 — Divisions
// ---------------------------------------------------------------------------
function DivisionsStep({ foundation, reload, onBack, onDone }) {
  const { eventId } = useParams()
  const { error: showError } = useToast()
  const enabled = Boolean(foundation?.event?.divisions_enabled)
  const divisions = foundation?.divisions ?? []
  const sharedRounds = (foundation?.rounds ?? []).filter((r) => !r.divisionId)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [expandedId, setExpandedId] = useState(null)

  const setEnabled = async (value) => {
    setBusy(true)
    try {
      await pageantService.setDivisionsEnabled(eventId, value)
      reload()
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to update divisions')
    } finally {
      setBusy(false)
    }
  }

  const addDivision = async () => {
    if (!name.trim()) return
    setBusy(true)
    try {
      await pageantService.createDivision(eventId, { name: name.trim(), description: '' })
      setName('')
      reload()
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to add division')
    } finally {
      setBusy(false)
    }
  }

  const removeDivision = async (divisionId) => {
    if (!window.confirm('Remove this division?')) return
    try {
      await pageantService.deleteDivision(eventId, divisionId)
      reload()
    } catch (err) {
      if (err.response?.status === 409) {
        showError('This division already has data, so it can only be deactivated.')
      } else {
        showError(err.response?.data?.message || 'Failed to remove division')
      }
    }
  }

  if (!enabled) {
    return (
      <div className="space-y-5">
        <StepHeader title="Do you need separate categories, like Men and Women?">
          Turn this on if different groups of contestants should never be compared against each
          other — each group gets its own ranking and its own winner. Skip it if everyone competes
          in one combined ranking.
        </StepHeader>
        <div className="v-card flex flex-wrap items-center justify-between gap-4 p-6">
          <p className="max-w-lg text-sm text-v-text-subtle">
            Most competitions don&apos;t need this. You can always turn it on later.
          </p>
          <button
            type="button"
            onClick={() => setEnabled(true)}
            disabled={busy}
            className="rounded-lg bg-v-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Yes, set up divisions
          </button>
        </div>
        <FooterNav
          onBack={onBack}
          backLabel="Back: Define Criteria"
          onNext={onDone}
          nextLabel="Skip: Set Scoring Rules"
        />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <StepHeader title="Which divisions does this competition have?">
        Each division is ranked separately and produces its own winner. Every division runs the
        rounds you already built, and can additionally run rounds of its own.
      </StepHeader>

      <div className="v-card space-y-3 p-6">
        {divisions.map((d) => {
          const own = (foundation?.rounds ?? []).filter((r) => r.divisionId === d.id)
          const expanded = expandedId === d.id
          // A division is ranked over the shared rounds plus its own, so that
          // combined set is what has to add up to 100%.
          const divisionTotal = sumWeights([...sharedRounds, ...own])
          return (
            <div key={d.id} className="rounded-xl border border-v-border">
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="font-medium text-v-text">{d.name}</p>
                  <p className="text-xs text-v-text-subtle">
                    {own.length
                      ? `Runs the shared rounds plus ${own.length} of its own`
                      : 'Runs the shared rounds only'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : d.id)}
                    className="rounded-lg border border-v-border px-3 py-1.5 text-xs text-v-text-muted hover:bg-v-surface-elevated"
                  >
                    {expanded ? 'Done' : own.length ? 'Edit its extra rounds' : 'Add rounds just for this division'}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeDivision(d.id)}
                    className="text-sm text-v-danger"
                  >
                    Remove
                  </button>
                </div>
              </div>

              {expanded && (
                <div className="space-y-3 border-t border-v-border px-4 py-4">
                  <p className="text-xs text-v-text-subtle">
                    Rounds added here run for {d.name} only, <strong>on top of</strong> the shared
                    rounds — so give the shared ones room by lowering their weights. Define what
                    judges score in them back on the Define Criteria step.
                  </p>
                  <RoundListEditor
                    eventId={eventId}
                    rounds={own}
                    categoryId={null}
                    divisionId={d.id}
                    reload={reload}
                    emptyHint={`No extra rounds for ${d.name} yet — it runs the shared ones as-is.`}
                  />
                  {own.length > 0 && (
                    <WeightNote total={divisionTotal} unit={`${d.name}'s rounds (shared + its own)`} />
                  )}
                </div>
              )}
            </div>
          )
        })}

        {divisions.length === 0 && (
          <p className="text-sm text-v-text-subtle">
            No divisions yet — add the first one below, e.g. Ms. and Mr.
          </p>
        )}

        <div className="grid gap-3 border-t border-dashed border-v-border pt-4 sm:grid-cols-[1fr_auto]">
          <input
            className={INPUT_CLASS}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Ms."
          />
          <button
            type="button"
            onClick={addDivision}
            disabled={busy || !name.trim()}
            className="rounded-lg border border-dashed border-v-border px-4 py-2 text-sm font-medium text-v-primary disabled:opacity-50"
          >
            + Add division
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setEnabled(false)}
        className="text-xs text-v-text-subtle underline hover:text-v-text-muted"
      >
        Actually, turn divisions off
      </button>

      <FooterNav
        onBack={onBack}
        backLabel="Back: Define Criteria"
        onNext={onDone}
        nextLabel="Next: Set Scoring Rules"
        nextDisabled={divisions.length === 0}
        nextTitle={divisions.length === 0 ? 'Add at least one division, or turn divisions off' : undefined}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 4 — Scoring rules
// ---------------------------------------------------------------------------
function ScoringRulesStep({ foundation, reload, onBack, onDone }) {
  const { eventId } = useParams()
  const { error: showError } = useToast()
  const config = foundation?.scoringConfig ?? {}
  const rounds = foundation?.rounds ?? []

  const [scoreType, setScoreType] = useState(config.scoreType ?? 'range_1_100')
  const [customMin, setCustomMin] = useState(config.customMin ?? 0)
  const [customMax, setCustomMax] = useState(config.customMax ?? 100)
  const [method, setMethod] = useState(config.calculationMethod ?? 'weighted_average')
  const [decimalPlaces, setDecimalPlaces] = useState(config.decimalPlaces ?? 2)
  const [dropHighest, setDropHighest] = useState(config.dropHighest ?? 0)
  const [dropLowest, setDropLowest] = useState(config.dropLowest ?? 0)
  const [tieBreaker, setTieBreaker] = useState(config.tieBreaker ?? 'none')
  const [tieBreakerRoundId, setTieBreakerRoundId] = useState(config.tieBreakerRoundId ?? '')
  const [busy, setBusy] = useState(false)

  const methodDesc = CALCULATION_METHODS.find((m) => m.value === method)?.desc
  const tieDesc = TIE_BREAKERS.find((t) => t.value === tieBreaker)?.desc

  const save = async () => {
    setBusy(true)
    try {
      await pageantService.setScoringConfig(eventId, {
        scoreType,
        calculationMethod: method,
        decimalPlaces: Number(decimalPlaces),
        customMin: Number(customMin),
        customMax: Number(customMax),
        dropHighest: Number(dropHighest),
        dropLowest: Number(dropLowest),
        tieBreaker,
        tieBreakerRoundId: tieBreaker === 'highest_round' ? tieBreakerRoundId || null : null,
      })
      reload()
      onDone()
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to save scoring rules')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <StepHeader title="How should this competition be scored?">
        These rules decide how judges&apos; individual numbers turn into one ranking.
      </StepHeader>

      <div className="v-card grid gap-5 p-6 sm:grid-cols-2">
        <div>
          <label className={LABEL_CLASS}>What scale will judges use?</label>
          <select className={INPUT_CLASS} value={scoreType} onChange={(e) => setScoreType(e.target.value)}>
            {SCORE_TYPES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          {scoreType === 'custom_range' && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL_CLASS}>Minimum</label>
                <input
                  type="number"
                  className={INPUT_CLASS}
                  value={customMin}
                  onChange={(e) => setCustomMin(e.target.value)}
                />
              </div>
              <div>
                <label className={LABEL_CLASS}>Maximum</label>
                <input
                  type="number"
                  className={INPUT_CLASS}
                  value={customMax}
                  onChange={(e) => setCustomMax(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        <div>
          <label className={LABEL_CLASS}>How are scores combined into a final number?</label>
          <select className={INPUT_CLASS} value={method} onChange={(e) => setMethod(e.target.value)}>
            {CALCULATION_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <p className="mt-2 rounded-lg border border-v-border bg-v-surface-elevated/40 px-3 py-2 text-xs leading-relaxed text-v-text-subtle">
            {methodDesc}
          </p>
        </div>

        {method === 'lowest_removal' && (
          <>
            <div>
              <label className={LABEL_CLASS}>How many highest scores to drop?</label>
              <input
                type="number"
                min={0}
                className={INPUT_CLASS}
                value={dropHighest}
                onChange={(e) => setDropHighest(e.target.value)}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>How many lowest scores to drop?</label>
              <input
                type="number"
                min={0}
                className={INPUT_CLASS}
                value={dropLowest}
                onChange={(e) => setDropLowest(e.target.value)}
              />
            </div>
          </>
        )}

        <div>
          <label className={LABEL_CLASS}>Round scores to how many decimal places?</label>
          <input
            type="number"
            min={0}
            max={6}
            className={INPUT_CLASS}
            value={decimalPlaces}
            onChange={(e) => setDecimalPlaces(e.target.value)}
          />
        </div>

        <div className="sm:col-span-2">
          <label className={LABEL_CLASS}>
            If two contestants end up on the exact same score, how is the tie broken?
          </label>
          <select
            className={INPUT_CLASS}
            value={tieBreaker}
            onChange={(e) => setTieBreaker(e.target.value)}
          >
            {TIE_BREAKERS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <p className="mt-2 rounded-lg border border-v-border bg-v-surface-elevated/40 px-3 py-2 text-xs leading-relaxed text-v-text-subtle">
            {tieDesc}
          </p>
          {tieBreaker === 'highest_round' && (
            <div className="mt-3">
              <label className={LABEL_CLASS}>Which round decides it?</label>
              <select
                className={INPUT_CLASS}
                value={tieBreakerRoundId}
                onChange={(e) => setTieBreakerRoundId(e.target.value)}
              >
                <option value="">Their single best round</option>
                {rounds.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      <FooterNav
        onBack={onBack}
        backLabel="Back: Set Up Divisions"
        onNext={save}
        nextLabel="Next: Review & Lock"
        busy={busy}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 5 — Review & Lock
// ---------------------------------------------------------------------------
function collectIssues(foundation) {
  const issues = []
  const stages = foundation?.categories ?? []
  const rounds = foundation?.rounds ?? []
  const criteria = foundation?.criteria ?? []
  const divisions = foundation?.divisions ?? []
  const judges = (foundation?.judges ?? []).filter((j) => j.isActive !== false)
  const contestants = foundation?.contestants ?? []

  if (!rounds.length) issues.push('No rounds have been set up yet.')

  if (stages.length) {
    const stageTotal = sumWeights(stages)
    if (!pct100(stageTotal)) {
      issues.push(`Your stages add up to ${pctShow(stageTotal)}%, not 100%.`)
    }
    for (const stage of stages) {
      const stageRounds = rounds.filter((r) => r.categoryId === stage.id)
      if (!stageRounds.length) {
        issues.push(`Stage "${stage.name}" has no rounds in it.`)
        continue
      }
      const total = sumWeights(stageRounds)
      if (!pct100(total)) {
        issues.push(`Stage "${stage.name}": its rounds add up to ${pctShow(total)}%, not 100%.`)
      }
    }
    const orphans = rounds.filter((r) => !r.categoryId && !r.divisionId)
    if (orphans.length) {
      issues.push(
        `${orphans.length} round${orphans.length === 1 ? ' is' : 's are'} not in any stage: ${orphans
          .map((r) => `"${r.name}"`)
          .join(', ')}.`,
      )
    }
  } else {
    const eventRounds = rounds.filter((r) => !r.divisionId)
    const total = sumWeights(eventRounds)
    if (eventRounds.length && !pct100(total)) {
      issues.push(`Your rounds add up to ${pctShow(total)}%, not 100%.`)
    }
  }

  // A division is ranked over the shared rounds plus its own, so that combined
  // set is what has to total 100% — matching how rankings are actually computed.
  const sharedRounds = rounds.filter((r) => !r.divisionId)
  for (const division of divisions) {
    const own = rounds.filter((r) => r.divisionId === division.id)
    if (!own.length) continue
    const total = sumWeights([...sharedRounds, ...own])
    if (!pct100(total)) {
      issues.push(
        `Division "${division.name}": the rounds it runs (shared plus its own) add up to ${pctShow(total)}%, not 100%.`,
      )
    }
  }

  for (const round of rounds) {
    const ids = round.criteriaIds ?? []
    if (!ids.length) {
      issues.push(`Round "${round.name}" has no criteria — judges wouldn't know what to score.`)
      continue
    }
    const total = sumPercentages(criteria.filter((c) => ids.includes(c.id)))
    if (!pct100(total)) {
      issues.push(`Round "${round.name}": its criteria add up to ${pctShow(total)}%, not 100%.`)
    }
  }

  if (!contestants.length) issues.push('No contestants have been added yet.')
  if (!judges.length) issues.push('No active judges have been added yet.')

  const weighted = judges.filter((j) => j.weight !== null && j.weight !== undefined)
  if (weighted.length) {
    const total = weighted.reduce((s, j) => s + Number(j.weight ?? 0), 0)
    if (weighted.length !== judges.length) {
      issues.push(
        `${weighted.length} of ${judges.length} judges have a score weight set — either weight all of them or none.`,
      )
    } else if (!pct100(total)) {
      issues.push(`Judge score weights add up to ${pctShow(total)}%, not 100%.`)
    }
  }

  return issues
}

function ReviewLockStep({ foundation, reload, onBack, onExit }) {
  const { eventId } = useParams()
  const { error: showError, success } = useToast()
  const [busy, setBusy] = useState(false)

  const issues = useMemo(() => collectIssues(foundation), [foundation])
  const stages = foundation?.categories ?? []
  const rounds = foundation?.rounds ?? []
  const divisions = foundation?.divisions ?? []
  const config = foundation?.scoringConfig ?? {}
  const methodLabel = CALCULATION_METHODS.find((m) => m.value === config.calculationMethod)?.label
  const tieLabel = TIE_BREAKERS.find((t) => t.value === (config.tieBreaker ?? 'none'))?.label

  const publish = async () => {
    setBusy(true)
    try {
      await pageantService.setScoring(eventId, true)
      success('Structure locked — scoring is now open.')
      reload()
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to publish')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <StepHeader title="Check everything, then lock it in">
        Locking publishes this setup and opens scoring. You can still unlock it afterwards, but
        changing the structure once judges have scored can invalidate what they submitted.
      </StepHeader>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="v-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-v-text-muted">
            How a contestant moves through this
          </p>
          <p className="mt-2 text-sm text-v-text">
            {stages.length
              ? stages
                  .map((s) => {
                    const stageRounds = rounds.filter((r) => r.categoryId === s.id)
                    const gate = stageRounds[stageRounds.length - 1]
                    const cut =
                      gate?.advancementType === 'top_n'
                        ? ` → top ${gate.advancementValue} move on`
                        : gate?.advancementType === 'top_percent'
                          ? ` → top ${gate.advancementValue}% move on`
                          : ''
                    return `${s.name} (${s.weight}%)${cut}`
                  })
                  .join(' → ')
              : rounds.map((r) => `${r.name} (${r.weight}%)`).join(' → ') || 'Nothing set up yet.'}
          </p>
        </div>

        <div className="v-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-v-text-muted">Scoring</p>
          <p className="mt-2 text-sm leading-relaxed text-v-text">
            Method: <strong>{methodLabel ?? '—'}</strong>
            <br />
            Tie-break: <strong>{tieLabel ?? '—'}</strong>
            <br />
            Divisions:{' '}
            <strong>
              {divisions.length ? divisions.map((d) => d.name).join(', ') : 'One combined ranking'}
            </strong>
          </p>
        </div>
      </div>

      {issues.length > 0 ? (
        <div className="rounded-lg border border-amber-400/40 bg-amber-500/10 p-5">
          <p className="text-sm font-semibold text-amber-500">
            Fix these before you can lock this setup:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-500">
            {issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="rounded-lg border border-v-success/30 bg-v-success-bg p-5 text-sm font-semibold text-v-success">
          Everything checks out — this is ready to lock.
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-v-border px-4 py-2 text-sm text-v-text-muted hover:bg-v-surface-elevated"
        >
          Back: Set Scoring Rules
        </button>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onExit}
            className="text-sm text-v-text-subtle underline hover:text-v-text-muted"
          >
            Finish without locking
          </button>
          <button
            type="button"
            onClick={publish}
            disabled={busy || issues.length > 0}
            title={issues.length > 0 ? 'Fix the issues above first' : 'Lock this setup and open scoring'}
            className="rounded-lg bg-v-primary px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Publishing…' : 'Publish & Lock This Setup'}
          </button>
        </div>
      </div>
    </div>
  )
}
