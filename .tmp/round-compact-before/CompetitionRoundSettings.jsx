import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import Button from '@/components/ui/Button'
import { INPUT_CLASS, LABEL_CLASS } from '@/utils/uiClasses'
import { getErrorMessage } from '@/utils/getErrorMessage'
import { stagePath } from '@/utils/eventStages'
import { contributionTotal, roundFormValues, validateRoundForm } from '@/utils/competitionRoundForm'
import CompetitionRoundForm from './CompetitionRoundForm'

function SettingsRow({ title, description, children }) {
  return <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
    <div className="min-w-0"><h5 className="text-sm font-medium text-v-text">{title}</h5>
      <p className="mt-1 text-xs leading-relaxed text-v-text-subtle">{description}</p>
    </div><div className="shrink-0">{children}</div>
  </div>
}

function AdvancementForm({ round, onSave, onCancel, readOnly }) {
  const prefix = useId()
  const [type, setType] = useState(round.advancementType ?? 'none')
  const [amount, setAmount] = useState(round.advancementValue ?? '')
  const [policy, setPolicy] = useState(round.scorePolicy ?? 'independent')
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
  return <form onSubmit={save} noValidate className="space-y-4 rounded-lg border border-v-border p-4" aria-label="Advancement settings">
    <h5 className="font-medium text-v-text">Advancement &amp; Elimination</h5>
    <fieldset disabled={readOnly || busy} className="min-w-0 space-y-4">
      <div><label className={LABEL_CLASS} htmlFor={`${prefix}-type`}>Who should proceed to the next round?</label>
        <select id={`${prefix}-type`} autoFocus className={`${INPUT_CLASS} w-full`} value={type} onChange={event => { setType(event.target.value); setError('') }}>
          <option value="none">Everyone — no automatic elimination</option><option value="top_n">Highest-scoring entries — choose how many</option>
          <option value="top_percent">Highest-scoring percentage of entries</option><option value="threshold">Entries meeting a minimum score</option><option value="manual">Choose qualifiers manually</option>
        </select>
      </div>
      {needsAmount && <div><label className={LABEL_CLASS} htmlFor={`${prefix}-amount`}>
        {type === 'top_n' ? 'Number of entries advancing' : type === 'top_percent' ? 'Percentage of entries advancing' : 'Minimum score to qualify'}</label>
        <input id={`${prefix}-amount`} type="number" className={`${INPUT_CLASS} w-full sm:max-w-48`} value={amount}
          min={type === 'threshold' ? 0 : 1} max={type === 'top_percent' ? 100 : undefined} step={type === 'top_n' ? 1 : 'any'}
          onChange={event => { setAmount(event.target.value); setError('') }} aria-invalid={Boolean(error)} />
      </div>}
      <div><label className={LABEL_CLASS} htmlFor={`${prefix}-policy`}>Scores used to choose qualifiers</label>
        <select id={`${prefix}-policy`} className={`${INPUT_CLASS} w-full`} value={policy} onChange={event => setPolicy(event.target.value)}>
          <option value="independent">Use only this round’s scores</option><option value="cumulative">Add scores from earlier finalized rounds</option>
        </select>
      </div>
      <p className="text-xs leading-relaxed text-v-text-subtle">Saving this rule does not eliminate entries. Review and confirm qualifiers later in Tabulation.</p>
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
  const laterRounds = rounds.filter(item => Number(item.displayOrder) > Number(round.displayOrder))
  const combined = values.progression === 'weighted' && round.purpose !== 'special'
  const available = Math.max(0, 100 - contributionTotal(rounds, round.categoryId, round.id))
  const save = async event => {
    event.preventDefault()
    if (readOnly || busy) return
    const checked = validateRoundForm(values, rounds, round)
    if (checked.errors.weight) { setError(checked.errors.weight); return }
    const payload = { ...checked.payload }
    if ((values.nextRoundId || null) !== (round.nextRoundId ?? null)) payload.nextRoundId = values.nextRoundId || null
    setBusy(true); setError('')
    try { await onSave(payload); onCancel() } catch (failure) { setError(getErrorMessage(failure)) } finally { setBusy(false) }
  }
  return <form onSubmit={save} noValidate className="space-y-4 rounded-lg border border-v-border p-4" aria-label="Next round and score settings">
    <h5 className="font-medium text-v-text">Next Round / Back to Zero</h5>
    <fieldset disabled={readOnly || busy} className="min-w-0 space-y-4">
      <div><label className={LABEL_CLASS} htmlFor={`${prefix}-scores`}>How should this round's scores be used?</label>
        <select id={`${prefix}-scores`} autoFocus className={`${INPUT_CLASS} w-full`} value={values.progression} onChange={event => { setValues({ ...values, progression: event.target.value }); setError('') }}>
          <option value="back_to_zero">Count separately — Back to Zero</option><option value="weighted">Combine using round contributions</option><option value="carry_forward">Add earlier rounds’ scores</option>
        </select><p className="mt-1 text-xs leading-relaxed text-v-text-subtle">Back to Zero uses this round’s scores for its result. When this is the official final round, earlier rounds do not affect final placements.</p>
      </div>
      {combined && <div><label className={LABEL_CLASS} htmlFor={`${prefix}-contribution`}>Contribution to combined result (%)</label>
        <input id={`${prefix}-contribution`} type="number" step="0.01" min="0.01" max="100" className={`${INPUT_CLASS} w-full sm:max-w-48`} value={values.weight}
          onChange={event => { setValues({ ...values, weight: event.target.value }); setError('') }} />
        <p className="mt-1 text-xs text-v-text-subtle">{available.toFixed(2)}% available in {categories.find(category => category.id === round.categoryId)?.name || 'event-wide combined results'}.</p>
      </div>}
      {round.purpose !== 'final' && <div><label className={LABEL_CLASS} htmlFor={`${prefix}-next`}>Next round</label>
        <select id={`${prefix}-next`} className={`${INPUT_CLASS} w-full`} value={values.nextRoundId} onChange={event => setValues({ ...values, nextRoundId: event.target.value })}>
          <option value="">{laterRounds.length ? 'Next round in the saved order' : 'No later round yet'}</option>
          {laterRounds.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select><p className="mt-1 text-xs text-v-text-subtle">Confirmed qualifiers enter this round. Saving does not start live judging or advance entries.</p>
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
  const edit = key => onSectionChange(section === key ? null : key)
  const detailsForm = section === 'details' && <CompetitionRoundForm rounds={rounds} categories={foundation.categories} divisions={foundation.divisions}
    divisionsEnabled={foundation.event?.divisions_enabled} initialRound={round} readOnly={locked} onSave={async payload => { await onSave(payload); onSectionChange(null) }} onCancel={() => onSectionChange(null)} />
  return <section className="space-y-4 border-t border-v-border p-4 sm:p-5" aria-label={`${round.name} settings`}>
    <h4 className="font-semibold text-v-text">{round.name} — Settings</h4>
    <div className="divide-y divide-v-border">
      <div><SettingsRow title="Round Details" description="Update the name, purpose, score use, and optional division.">
        <Button variant="secondary" className="min-h-11" disabled={locked || busy} onClick={() => edit('details')}>Edit</Button>
      </SettingsRow>{detailsForm && <div className="pb-4">{detailsForm}</div>}</div>
      <SettingsRow title="Scoring Criteria" description={`${round.criteriaIds?.length ?? 0} criteria linked to this round. Use the existing criteria editor.`}>
        <Button variant="secondary" className="min-h-11" onClick={onConfigureCriteria}>Configure Criteria <ArrowRight className="h-4 w-4" aria-hidden="true" /></Button>
      </SettingsRow>
      {advance && <div><SettingsRow title="Advancement & Elimination" description="Choose how entries qualify. Review and confirm them after judging.">
        <Button variant="secondary" className="min-h-11" disabled={locked || busy} onClick={() => edit('advancement')}>Configure advancement</Button>
      </SettingsRow>{section === 'advancement' && <div className="pb-4"><AdvancementForm round={round} readOnly={locked} onSave={onSave} onCancel={() => onSectionChange(null)} /></div>}</div>}
      <SettingsRow title="Deductions & Penalties" description={penalties.length ? `${penalties.length} permitted rules. Define amounts and approval in Scoring rules.` : 'Disabled. Define permitted deductions in Scoring rules before publishing.'}>
        <Button variant="secondary" className="min-h-11" onClick={onConfigureDeductions}>{readOnly ? 'View penalty rules' : 'Configure penalties'}</Button>
      </SettingsRow>
      <SettingsRow title="Stage Lineup & Live Judging" description="Prepare lineups and control judging access in Live Control after publishing setup.">
        {foundation.event?.official_rules_id ? <Link to={stagePath('competition', 'live', eventId)} className="v-btn-secondary inline-flex min-h-11 items-center gap-2">Open Live Control <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
          : <Button variant="secondary" className="min-h-11" disabled>Available after publishing</Button>}
      </SettingsRow>
      {round.purpose !== 'special' && <div><SettingsRow title="Next Round / Back to Zero" description="Choose where qualifiers go and how earlier rounds affect this result.">
        <Button variant="secondary" className="min-h-11" disabled={locked || busy} onClick={() => edit('progression')}>Configure progression</Button>
      </SettingsRow>{section === 'progression' && <div className="pb-4"><ProgressionForm round={round} rounds={rounds} categories={foundation.categories ?? []} readOnly={locked} onSave={onSave} onCancel={() => onSectionChange(null)} /></div>}</div>}
    </div>
    {!locked && <div className="flex flex-wrap gap-2 border-t border-v-border pt-4">
      <Button variant="secondary" disabled={busy || index === 0} onClick={() => onMove(-1)}>Move earlier</Button>
      <Button variant="secondary" disabled={busy || index === rounds.length - 1} onClick={() => onMove(1)}>Move later</Button>
    </div>}
  </section>
}
