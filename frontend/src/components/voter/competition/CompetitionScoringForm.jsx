import { judgeContestantNumber, judgeDivision } from '@/utils/judgeContestantDivisions'
import { useEffect, useState } from 'react'
import { CheckCircle, Clock, Lock } from 'lucide-react'
import Button from '@/components/ui/Button'
import ScoreInputBase from '@/components/ui/ScoreInput'
import './CompetitionScoringForm.css'
import {validScore} from '../../../../../shared/competition-score-input.js'
import { validJudgeDeductionRecords } from '../../../../../shared/competition-deductions.js'
import JudgeDeductionControls from './JudgeDeductionControls'

// Round-driven scoresheet. The whole round's field is on stage, so the judge
// scores every contestant from one table and commits each with "Submit & lock".
//
// Judges score MINOR criteria. Each criterion contributes one or more minor
// columns; each minor carries its own score type/bounds. A criterion with no
// minors (not-yet-migrated) falls back to a single column scored directly against
// the criterion, using the sheet's event scale.
export default function CompetitionScoringForm({
  sheet,
  scores,
  onScoreChange,
  deductionDrafts = {},
  onDeductionChange,
  submittingKey = null,
  onSubmitCriterion,
  sessionState = null,
  simplified = false,
  preview = false,
  divisionFilter = 'all',
}) {
  const { contestants, criteria } = sheet
  const [typing,setTyping]=useState(false)
  const [displayOrder,setDisplayOrder]=useState(sessionState?.contestantOrder??[])
  useEffect(()=>{if(!typing)setDisplayOrder(sessionState?.contestantOrder??[])},[typing,sessionState?.contestantOrder])
  const scaleBounds = sheet.scoreBounds ?? null
  const pointsBasis = sheet.criterionBasis === 'points'

  const critColumns = (criteria ?? []).map((crit) => {
    const minors =
      pointsBasis
        ? [{ id: crit.id, name: crit.name, minScore: crit.minScore, maxScore: crit.maxScore, decimalPlaces: crit.decimalPlaces }]
        : crit.minors && crit.minors.length
        ? crit.minors
        : [{ id: crit.id, name: crit.name, minScore: crit.minScore, maxScore: crit.maxScore, decimalPlaces:crit.decimalPlaces }]
    // #4 show-but-lock: a criterion the organizer hasn't opened renders disabled.
    return { crit, minors, open: crit.open !== false }
  })
  const judgeDeductionRules =
    sheet.deductionSettings?.mode === 'judge'
      ? (sheet.deductionSettings.rules ?? []).filter((rule) => rule.appliedBy === 'judge')
      : []
  const deductionRuleGroups = critColumns
    .map(({ crit, open }) => ({
      crit,
      open,
      rules: judgeDeductionRules.filter(
        (rule) => rule.anchorCriterionId === crit.id,
      ),
    }))
    .filter(({ rules }) => rules.length > 0)
  const showDeductionColumn = deductionRuleGroups.length > 0
  const deductionHeaderRules = deductionRuleGroups.flatMap(({ rules }) => rules)
  const statusBeforeCriteria = !simplified && showDeductionColumn
  const deductionsForContestant = (cont) =>
    deductionRuleGroups.flatMap(({ crit, rules }) =>
      (deductionDrafts[`${cont.id}:${crit.id}`] ?? []).flatMap((record) => {
        const rule = rules.find((item) => item.id === record.ruleId)
        return rule ? [{ crit, record, rule }] : []
      }),
    )
  const boundsFor = (minor) => ({
    min: minor.minScore ?? scaleBounds?.min ?? 1,
    max: minor.maxScore ?? scaleBounds?.max ?? 100,
  })
  const allCritIds = critColumns.map(({ crit }) => crit.id)

  // #6 per-criterion locking. Each criterion is committed on its own; a cell is
  // one of: LOCKED (already submitted), OPEN (scorable now), or WAITING (organizer
  // hasn't opened it / contestant not open). "Submit open criteria" commits only
  // the open, not-yet-locked criteria; the row is fully "Locked" once every
  // criterion is in.
  const lockedSetOf = (cont) => new Set(cont.lockedCriteria ?? [])
  const isCritLocked = (cont, critId) => lockedSetOf(cont).has(critId)
  const fullyLocked = (cont) =>
    Boolean(cont.hasSubmitted) ||
    (allCritIds.length > 0 && allCritIds.every((id) => lockedSetOf(cont).has(id)))

  // A criterion is "complete" (lockable) once every one of its minors has a
  // filled, in-range score for this contestant.
  const critMinorsComplete = (cont, minors) =>
    minors.length > 0 &&
    minors.every((m) => {
      const raw = scores[`${cont.id}:${m.id}`]
      if (raw === undefined || raw === '' || raw === null) return false
      const num = Number(raw)
      const b = boundsFor(m)
      return validScore(num,{minScore:b.min,maxScore:b.max,decimalPlaces:m.decimalPlaces})
    })

  const RowStatus = ({ cont }) => {
    const total = allCritIds.length
    const lockedCount = lockedSetOf(cont).size
    if (fullyLocked(cont)) return <span className="v-judge-status-badge" data-complete="true"><CheckCircle aria-hidden />Completed</span>
    if (cont.open === false || lockedCount === 0) return <span className="v-judge-status-badge"><Clock aria-hidden />Waiting</span>
    return <span className="v-judge-status-badge">{lockedCount}/{total} locked</span>
  }

  // Order contestants by the session's contestant order when available, else by
  // number. No "active" emphasis — the whole field is equal (round-driven).
  const baseOrdered = (() => {
    if (displayOrder.length) {
      const orderMap = new Map(displayOrder.map((id, index) => [id, index]))
      return [...contestants].sort(
        (a, b) => (orderMap.get(a.id) ?? Infinity) - (orderMap.get(b.id) ?? Infinity),
      )
    }
    return [...contestants].sort((a, b) => a.contestantNumber - b.contestantNumber)
  })()

  // Preserve the published order without inserting division section rows.
  const hasRegisteredDivisions = contestants.some(cont => cont.registrationNumber != null && judgeDivision(cont, sheet).id)
  const orderedContestants = (hasRegisteredDivisions ? [...baseOrdered].sort((a,b) => Number(judgeContestantNumber(a))-Number(judgeContestantNumber(b)) || judgeDivision(a,sheet).order-judgeDivision(b,sheet).order) : baseOrdered)
    .filter(cont => divisionFilter === 'all' || judgeDivision(cont, sheet).id === divisionFilter)

  // Per-criterion Lock control (#6). Each criterion commits on its own the moment
  // the judge finishes it, so scores can't be revisited (fairness). States:
  //   • Locked   — already committed (green chip).
  //   • Waiting  — contestant/criterion not open yet (nothing shown; input greyed).
  //   • Lockable — open + every minor filled in range → solid Lock button.
  //   • Incomplete — open but not all minors filled → disabled Lock button.
  const CritLock = ({ cont, crit, minors, critOpen, targetName }) => {
    if (isCritLocked(cont, crit.id)) {
      return (
        <Button
          size="sm"
          variant="secondary"
          disabled
          className="v-judge-lock-button is-locked"
          aria-label={`${cont.name}: ${crit.name}, ${targetName} locked`}
        >
          <CheckCircle className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          <span>Locked</span>
        </Button>
      )
    }
    if (cont.open === false || !critOpen) return null
    const busy = submittingKey === `${cont.id}:${crit.id}`
    const rules = judgeDeductionRules
    const entryWideRules = rules.filter(rule => !rule.criteriaId)
    const entryWideRecords = Object.entries(deductionDrafts).filter(([key]) => key.startsWith(`${cont.id}:`)).flatMap(([,records]) => records.filter(record => entryWideRules.some(rule => rule.id === record.ruleId)))
    const complete = critMinorsComplete(cont, minors) && validJudgeDeductionRecords(deductionDrafts[`${cont.id}:${crit.id}`] ?? [], rules) && validJudgeDeductionRecords(entryWideRecords, entryWideRules)
    return (
      <Button
        size="sm"
        variant={complete ? 'primary' : 'secondary'}
        onClick={() => onSubmitCriterion?.(cont.id, crit.id)}
        disabled={busy || !complete}
        loading={busy}
        className="v-judge-lock-button"
        aria-label={`${cont.name}: ${crit.name}, ${targetName} ${busy ? 'Locking' : 'Lock'}`}
        title={complete ? `Lock ${targetName}; this locks all scores for ${crit.name}` : `Complete every score for ${crit.name} before locking`}
      >
        <Lock className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        <span>{busy ? 'Locking…' : 'Lock'}</span>
      </Button>
    )
  }

  // Existing lock/completion state, presented as a compact read-only badge.
  return (
    <section className={`v-judge-sheet${preview ? ' v-judge-sheet-preview' : ''}`} onFocusCapture={() => setTyping(true)} onBlurCapture={e => { if (!e.currentTarget.contains(e.relatedTarget)) setTyping(false) }}>
      <div className="v-judge-sheet-scroll" role="region" aria-label="Judge scoresheet — scroll to view contestants, criteria, and deductions" tabIndex={0}>
        <table>
          <caption className="sr-only">Contestants, configured scoring criteria, and deductions. Lock each complete major criterion, then submit the completed round.</caption>
          {preview && <colgroup>
            <col className="v-judge-contestant-col" />
            {statusBeforeCriteria && <col className="v-judge-status-col" />}
            {critColumns.flatMap(({ minors }) => minors.map(m => <col key={m.id} />))}
            {!simplified && !showDeductionColumn && <col className="v-judge-status-col" />}
            {showDeductionColumn && <col className="v-judge-deduction-col" />}
          </colgroup>}
          <thead>
            <tr>
              <th className="v-judge-contestant" scope="col" rowSpan={2}>Contestant</th>
              {statusBeforeCriteria && <th className="v-judge-status" scope="col" rowSpan={2}>Status</th>}
              {critColumns.map(({ crit, minors, open }) => <th key={crit.id} colSpan={minors.length} scope="colgroup" className="v-judge-major">
                <span className="v-judge-major-name">{crit.name}</span>
                <span className="v-judge-major-weight">{pointsBasis ? `${crit.maxScore} pts` : `${crit.percentage}%`}</span>
                {!simplified && !open && <span className="v-judge-closed-label">Not open yet</span>}
              </th>)}
              {!simplified && !showDeductionColumn && <th className="v-judge-status" scope="col" rowSpan={2}>Status</th>}
              {showDeductionColumn && <th scope="colgroup" className="v-judge-major v-judge-deduction-major">DEDUCTION</th>}
            </tr>
            <tr>{critColumns.flatMap(({ minors }) => minors.map(m => {
              const bounds = boundsFor(m)
              const major=critColumns.find(column=>column.minors.includes(m))?.crit
              const label=simplified?(pointsBasis||m.id===major?.id?'Score':m.name):pointsBasis?major?.name:m.name
              return <th key={m.id} scope="col" className="v-judge-minor">{label}{!pointsBasis&&m.id!==major?.id&&m.percentage !== undefined && <span className="v-judge-range">{m.percentage}% of major criterion</span>}<span className="v-judge-range">{bounds.min}–{bounds.max}</span></th>
            }))}
              {showDeductionColumn && <th scope="col" className="v-judge-minor v-judge-deduction-minor">
                <span className="v-judge-deduction-header-list">
                  {deductionHeaderRules.map((rule) => (
                    <span key={rule.id} className="v-judge-deduction-header-item">
                      <strong>{rule.description}</strong>
                      <span className="v-judge-range">
                        / {rule.units === 'placements' ? '+' : '-'}{rule.amount} {rule.units === 'points' ? 'Points' : 'Placements'}
                      </span>
                    </span>
                  ))}
                </span>
              </th>}
            </tr>
          </thead>
          <tbody>{orderedContestants.length === 0 && <tr><td colSpan={1 + critColumns.reduce((count, column) => count + column.minors.length, 0) + (!simplified ? 1 : 0) + (showDeductionColumn ? 1 : 0)} className="v-judge-empty">No contestants in this division for the selected round.</td></tr>}{orderedContestants.map(cont => {
            const closed = cont.open === false || !!sheet.submission
            const presentation = contestantPresentation(cont, sheet)
            const entryDeductions = deductionsForContestant(cont)
            return <tr key={cont.id} data-contestant-id={cont.id} data-division-tone={presentation.tone} style={presentation.style}>
              <td className="v-judge-contestant">
                <div className="v-judge-identity">
                  <span className="v-judge-number" title={presentation.divisionName || undefined}>
                    <span>#{judgeContestantNumber(cont)}</span>{presentation.indicator && <small>{presentation.indicator}</small>}
                  </span>
                  {cont.photo && <img className="v-judge-photo" src={cont.photo} alt="" />}
                  <span className="v-judge-name">{cont.name}{presentation.divisionName && <small className="v-judge-division-label">{presentation.divisionName}</small>}</span>
                </div>
              </td>
              {statusBeforeCriteria && <td className="v-judge-status"><RowStatus cont={cont}/></td>}
              {critColumns.flatMap(({ crit, minors, open: critOpen }) => {
                const critLocked = isCritLocked(cont, crit.id) || cont.intersections?.[`${cont.id}:${crit.id}`] === 'deny'
                const busy = submittingKey === `${cont.id}:${crit.id}`
                return minors.map(m => <td key={m.id} className="v-judge-score-cell" title={!simplified&&!critOpen?'Not open yet':undefined}>
                  <div className="v-judge-score-stack">
                    <label><span className="sr-only">{cont.name}: {crit.name}, {m.name} score</span>
                      <ScoreInputComponent contestantId={cont.id} target={m} bounds={boundsFor(m)} scores={scores} onScoreChange={onScoreChange} disabled={critLocked || closed || !critOpen || busy} />
                    </label>
                    <CritLock cont={cont} crit={crit} minors={minors} critOpen={critOpen} targetName={m.name} />
                  </div>
                </td>)
              })}
              {!simplified && !showDeductionColumn && <td className="v-judge-status"><RowStatus cont={cont}/></td>}
              {showDeductionColumn && <td className="v-judge-deduction-cell">
                {onDeductionChange ? (
                  <div className="v-judge-deduction-controls">
                    {deductionRuleGroups.map(({ crit, rules, open }) => {
                      const deductionRecords = deductionDrafts[`${cont.id}:${crit.id}`] ?? []
                      const critLocked =
                        isCritLocked(cont, crit.id) ||
                        cont.intersections?.[`${cont.id}:${crit.id}`] === 'deny'
                      const busy = submittingKey === `${cont.id}:${crit.id}`
                      return (
                        <JudgeDeductionControls
                          key={crit.id}
                          rules={rules}
                          records={deductionRecords}
                          disabled={critLocked || closed || !open || busy}
                          entryLocked={!!cont.lockedCriteria?.length}
                          onChange={(records) => onDeductionChange(cont.id, crit.id, records)}
                        />
                      )
                    })}
                  </div>
                ) : entryDeductions.length ? (
                  <ul className="v-judge-deduction-readonly">
                    {entryDeductions.map(({ crit, record, rule }) => (
                      <li key={`${crit.id}:${record.id}`}>
                        <strong>{rule.description}</strong>
                        <span>{rule.units === 'placements' ? '+' : '-'}{rule.amount} {rule.units}</span>
                      </li>
                    ))}
                  </ul>
                ) : <span className="v-helper-text">No deductions</span>}
              </td>}
            </tr>
          })}</tbody>
        </table>
      </div>
      <p className="v-judge-sheet-help">{simplified?'Score each criterion, then lock it when complete. Lock Submission becomes available after every required criterion is locked.':'Scroll to view all criteria. Contestant identities and criteria headers stay visible. Lock commits one major criterion; Lock Submission sends the completed round.'}</p>
    </section>
  )
}

// Presentation only: actual division/gender labels determine M/F. Unknown
// divisions keep their own initials/color; names and photos never infer gender.
function contestantPresentation(contestant, sheet) {
  const division = judgeDivision(contestant, sheet)
  const divisionName = division.label || division.name
  const { tone } = division
  const accent = tone === 'female' ? '#db2777' : tone === 'male' ? '#2563eb' : division.color
  const indicator = tone === 'female' ? 'F' : tone === 'male' ? 'M' : divisionName.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('').toUpperCase()
  return { tone, indicator, divisionName, style: accent ? { '--judge-accent': accent, '--judge-row-bg': `color-mix(in srgb, ${accent} 6%, var(--v-surface))` } : undefined }
}

// `target` is the thing being scored — a minor criterion (normal path) or, for a
// not-yet-migrated criterion, the criterion itself. It carries id + bounds, and
// scores are keyed `${contestantId}:${target.id}`.
function ScoreInputComponent({ contestantId, target, bounds, scores, onScoreChange, disabled, size = 'sm' }) {
  const key = `${contestantId}:${target.id}`
  const currentValue = scores[key] ?? ''
  const min = bounds?.min ?? target.minScore ?? 1
  const max = bounds?.max ?? target.maxScore ?? 100

  return (
    <ScoreInputBase
      min={min}
      max={max}
      step={target.decimalPlaces == null ? 'any' : 10 ** -target.decimalPlaces}
      decimalPlaces={target.decimalPlaces}
      value={currentValue}
      onChange={(val) => onScoreChange(contestantId, target.id, val)}
      disabled={disabled}
      size={size}
      className="v-judge-score-input"
    />
  )
}

// Re-export the inner component for backwards compatibility
export { ScoreInputComponent as ScoreInput }
