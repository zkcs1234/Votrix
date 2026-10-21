import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ChevronRight } from 'lucide-react'
import Button from '@/components/ui/Button'
import { INPUT_CLASS, LABEL_CLASS } from '@/utils/uiClasses'
import { getErrorMessage } from '@/utils/getErrorMessage'
import { contributionTotal, roundFormValues, validateRoundForm } from '@/utils/competitionRoundForm'
import CompetitionRoundForm from './CompetitionRoundForm'
import { DEDUCTION_LABELS, effectiveDeductionMode } from '../../../../../shared/competition-deductions.js'

function SettingsEntry({ title, description, onClick, to, disabled = false }) {
  const content = <><span className="min-w-0"><span className="block text-sm font-medium text-v-text">{title}</span>
    <span className="mt-1 block text-xs leading-relaxed text-v-text-subtle">{description}</span></span><ChevronRight className="h-4 w-4 shrink-0 text-v-text-subtle" aria-hidden="true" /></>
  const className = 'flex min-h-16 w-full items-center justify-between gap-3 rounded-lg px-3 py-3 text-left transition hover:bg-v-surface-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-v-primary disabled:cursor-not-allowed disabled:opacity-50'
  return to ? <Link aria-label={title} to={to} className={className}>{content}</Link>
    : <button type="button" aria-label={title} disabled={disabled} className={className} onClick={onClick}>{content}</button>
}

function AdvancementForm({ round, onSave, onCancel, readOnly }) {
  const prefix = useId()
  const [type, setType] = useState(round.advancementType ?? 'none')
  const [amount, setAmount] = useState(round.advancementValue ?? '')
  const policy = round.scorePolicy ?? 'independent'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const needsAmount = ['top_n', 'top_percent', 'threshold'].includes(type)
  const save = async event => {
    event.preventDefault()
    if (readOnly || busy) return
    const value = Number(amount)
    if (needsAmount && (amount === '' || !Number.isFinite(value) || (type === 'top_n' && (!Number.isInteger(value) || value < 1))
      || (type === 'top_percent' && (value <= 0 || value > 100)) || (type === 'threshold' && value < 0))) {
      setError(type === 'top_n' ? 'Enter a whole number of entries greater than 0.' : type === 'top_percent' ? 'Enter a percentage greater than 0 and no more than 100.' : 'Enter a valid minimum score of 0 or more.')
      return
    }
    setBusy(true); setError('')
    try { await onSave({ advancementType: type, advancementValue: needsAmount ? value : null, scorePolicy: policy }); onCancel() }
    catch (failure) { setError(getErrorMessage(failure)) }
    finally { setBusy(false) }
  }
  return <form onSubmit={save} noValidate className="space-y-4" aria-label="Advancement settings">
    <h5 tabIndex={-1} data-modal-autofocus={readOnly || undefined} className="font-medium text-v-text">Advancement &amp; Elimination</h5>
    <fieldset disabled={readOnly || busy} className="min-w-0 space-y-4">
      <div><label className={LABEL_CLASS} htmlFor={`${prefix}-type`}>Who should proceed to the next round?</label>
        <select id={`${prefix}-type`} autoFocus data-modal-autofocus className={`${INPUT_CLASS} w-full`} value={type} onChange={event => { setType(event.target.value); setError('') }}>
          <option value="none">None — all eligible entries continue</option><option value="top_n">Top N — highest-scoring entries</option>
          <option value="top_percent">Highest-scoring percentage of entries</option><option value="threshold">Entries meeting a minimum score</option><option value="manual">Choose qualifiers manually</option>
        </select>
      </div>
      {needsAmount && <div><label className={LABEL_CLASS} htmlFor={`${prefix}-amount`}>
        {type === 'top_n' ? 'Number of entries advancing' : type === 'top_percent' ? 'Percentage of entries advancing' : 'Minimum score to qualify'}</label>
        <input id={`${prefix}-amount`} type="number" className={`${INPUT_CLASS} w-full sm:max-w-48`} value={amount}
          min={type === 'threshold' ? 0 : 1} max={type === 'top_percent' ? 100 : undefined} step={type === 'top_n' ? 1 : 'any'}
          onChange={event => { setAmount(event.target.value); setError('') }} aria-invalid={Boolean(error)} />
      </div>}
      <p className="text-xs leading-relaxed text-v-text-subtle">{type==='none'?'No elimination: eligible entries continue to the next main round without a qualification decision. Live Control activates judging separately.':'Review and finalize round standings, then confirm qualifiers in Tabulation before opening the next round in Live Control.'}</p>
      {['top_n','top_percent'].includes(type)&&<p className="text-xs text-v-text-subtle">Published shared cutoff ties advance together, so the approved count can exceed the requested number.</p>}
      <p className="text-xs leading-relaxed text-v-text-subtle">Entry eligibility is separate from Back to Zero, carry-forward, and weighted score combination. Configure score use in Next Round / Back to Zero.</p>
      {error && <p role="alert" className="v-error-text">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" onClick={onCancel}>Cancel</Button><Button type="submit" loading={busy}>Save advancement</Button></div>
    </fieldset>
  </form>
}

function ProgressionForm({ round, rounds, categories, onSave, onCancel, readOnly }) {
  const prefix = useId()
  const [values, setValues] = useState(() => ({ ...roundFormValues(round), nextRoundId: round.nextRoundId ?? '' }))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const laterRounds = rounds.filter(item => item.purpose!=='special' && Number(item.displayOrder) > Number(round.displayOrder))
  const savedDestinationMissing = values.nextRoundId && !laterRounds.some(item => item.id === values.nextRoundId)
  const combined = values.progression === 'weighted' && round.purpose !== 'special'
  const available = Math.max(0, 100 - contributionTotal(rounds, round.categoryId, round.id))
  const save = async event => {
    event.preventDefault()
    if (readOnly || busy) return
    const checked = validateRoundForm(values, rounds, round)
    if (checked.errors.weight) { setError(checked.errors.weight); return }
    if (values.nextRoundId && values.nextRoundId !== (round.nextRoundId ?? '') && !laterRounds.some(item => item.id === values.nextRoundId)) { setError('Choose a later round in this competition.'); return }
    const payload = { ...checked.payload }
    if ((values.nextRoundId || null) !== (round.nextRoundId ?? null)) payload.nextRoundId = values.nextRoundId || null
    setBusy(true); setError('')
    try { await onSave(payload); onCancel() } catch (failure) { setError(getErrorMessage(failure)) } finally { setBusy(false) }
  }
  return <form onSubmit={save} noValidate className="space-y-4" aria-label="Next round and score settings">
    <h5 className="font-medium text-v-text">Next Round / Back to Zero</h5>
    <fieldset disabled={readOnly || busy} className="min-w-0 space-y-4">
      <div><label className={LABEL_CLASS} htmlFor={`${prefix}-scores`}>How should this round's scores be used?</label>
        <select id={`${prefix}-scores`} autoFocus data-modal-autofocus className={`${INPUT_CLASS} w-full`} value={values.progression} onChange={event => { setValues({ ...values, progression: event.target.value }); setError('') }}>
          <option value="back_to_zero">Count separately — Back to Zero</option><option value="weighted">Combine using round contributions</option><option value="carry_forward">Add earlier rounds’ scores</option>
        </select><p className="mt-1 text-xs leading-relaxed text-v-text-subtle">Back to Zero uses this round’s scores for its result. When this is the official final round, earlier rounds do not affect final placements.</p>
      </div>
      {combined && <div><label className={LABEL_CLASS} htmlFor={`${prefix}-contribution`}>Contribution to combined result (%)</label>
        <input id={`${prefix}-contribution`} type="number" step="0.01" min="0.01" max="100" className={`${INPUT_CLASS} w-full sm:max-w-48`} value={values.weight}
          onChange={event => { setValues({ ...values, weight: event.target.value }); setError('') }} />
        <p className="mt-1 text-xs text-v-text-subtle">{available.toFixed(2)}% available in {categories.find(category => category.id === round.categoryId)?.name || 'event-wide combined results'}.</p>
      </div>}
      {(round.purpose !== 'final'||values.nextRoundId) && <div><label className={LABEL_CLASS} htmlFor={`${prefix}-next`}>Next round</label>
        <select id={`${prefix}-next`} disabled={!laterRounds.length && !values.nextRoundId} className={`${INPUT_CLASS} w-full`} value={values.nextRoundId} onChange={event => setValues({ ...values, nextRoundId: event.target.value })}>
          <option value="">{laterRounds.length ? 'Next round in the saved order' : 'No later round yet'}</option>
          {savedDestinationMissing && <option value={values.nextRoundId}>Saved destination — no longer a later round</option>}
          {laterRounds.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select><p className="mt-1 text-xs text-v-text-subtle">{savedDestinationMissing ? 'The saved destination is unavailable or is an independent special award. Review and explicitly save a later main round; the historical choice stays visible.' : laterRounds.length ? 'All eligible entries continue when no elimination is configured; other rules require approved qualifiers. Live Control activates the destination separately.' : 'Create a later main round first, then return here to choose its source.'}</p>
      </div>}
      {error && <p role="alert" className="v-error-text">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" onClick={onCancel}>Cancel</Button><Button type="submit" loading={busy}>Save progression</Button></div>
    </fieldset>
  </form>
}

export default function CompetitionRoundSettings({ eventId, round, rounds, foundation, section, onSectionChange,
  onConfigureCriteria, onConfigureDeductions, onSave, onMove, readOnly, busy }) {
  const index = rounds.findIndex(item => item.id === round.id)
  const penalties = (foundation.scoringConfig?.deductionRules ?? []).filter(rule => !rule.roundId || rule.roundId === round.id)
  const advance = round.purpose === 'qualification' || (round.advancementType && round.advancementType !== 'none')
  const locked = readOnly || Boolean(round.finalizedAt)
  const menuRef = useRef(null)
  useEffect(() => {
    if (!section) menuRef.current?.querySelector('button:not(:disabled)')?.focus({ preventScroll: true })
  }, [section])
  const returnToSettings = () => onSectionChange(null)
  if (section) return <div className="space-y-4">
    <Button variant="ghost" size="sm" disabled={busy} onClick={returnToSettings}><ArrowLeft className="h-4 w-4" aria-hidden="true" />Round settings</Button>
    {section === 'details' && <CompetitionRoundForm rounds={rounds} categories={foundation.categories} divisions={foundation.divisions}
      divisionsEnabled={foundation.event?.divisions_enabled} initialRound={round} readOnly={locked}
      onSave={async payload => { await onSave(payload); returnToSettings() }} onCancel={returnToSettings} />}
    {section === 'advancement' && <AdvancementForm round={round} readOnly={locked} onSave={onSave} onCancel={returnToSettings} />}
    {section === 'progression' && <ProgressionForm round={round} rounds={rounds} categories={foundation.categories ?? []} readOnly={locked} onSave={onSave} onCancel={returnToSettings} />}
    {section === 'order' && <div className="space-y-4"><h4 className="font-semibold text-v-text">Round order</h4>
      <p className="text-sm leading-relaxed text-v-text-subtle">Move this round earlier or later in the competition. The saved order determines the automatic next-round destination.</p>
      <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={locked || busy || index === 0} onClick={() => onMove(-1)}>Move earlier</Button>
        <Button variant="secondary" disabled={locked || busy || index === rounds.length - 1} onClick={() => onMove(1)}>Move later</Button></div>
    </div>}
  </div>
  return <div ref={menuRef} className="space-y-1">
    <p className="mb-3 text-sm text-v-text-subtle">Choose one setting to view or configure.</p>
    <SettingsEntry title="Round Details" description="Name, purpose, score use, and optional division." disabled={busy} onClick={() => onSectionChange('details')} />
    <SettingsEntry title="Scoring Criteria" description={`${round.criteriaIds?.length ?? 0} linked criteria. Open the existing editor.`} onClick={onConfigureCriteria} />
    {advance && <SettingsEntry title="Advancement & Elimination" description="Choose how entries qualify for the next round." disabled={locked || busy} onClick={() => onSectionChange('advancement')} />}
    <SettingsEntry title="Deductions & Penalties" description={`${DEDUCTION_LABELS[effectiveDeductionMode({rounds,criteria:foundation.criteria,scoringConfig:foundation.scoringConfig},round.id)]} · ${penalties.length} permitted rules. Configure in Rounds & Scoring.`} onClick={onConfigureDeductions} />
    <SettingsEntry title="Stage Lineup & Live Scoring" description={foundation.event?.official_rules_id || foundation.event?.officialRulesId ? 'Prepare lineups and manage judging access in Live Control.' : 'Open Live Control to view event operations.'}
      to={`/organizer/competition/events/${eventId}/live`} />
    {round.purpose !== 'special' && <SettingsEntry title="Next Round / Back to Zero" description="Choose the next round and how earlier scores are used." disabled={locked || busy} onClick={() => onSectionChange('progression')} />}
  </div>
}
