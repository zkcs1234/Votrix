import { useEffect, useId, useState } from 'react'
import Button from '@/components/ui/Button'
import { DEDUCTION_LABELS, DEDUCTION_MODES, deductionConfigurationIssues, deductionLimit, deductionOwner, deductionStage, effectiveDeductionMode, hasDeductionModes, ruleDeductionMode, ruleRoundId } from '../../../../../shared/competition-deductions.js'

const noop = () => {}
const descriptions = {
  none: 'Hide deduction controls during scoring and tabulation.',
  organizer: 'The organizer records configured deductions in Official Tabulation after judges submit. New organizer rules apply directly.',
  judge: 'Assigned judges record configured deductions in their score sheets. Deductions lock and submit with their scores.',
}

export default function DeductionSettings({ configuration, onChange, scopeRoundId, readOnly = false, onPendingChange = noop }) {
  const prefix = useId()
  const [selection, setSelection] = useState('default')
  const [draft, setDraft] = useState(null)
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState('')
  const scope = scopeRoundId === undefined ? selection === 'default' ? null : selection : scopeRoundId
  const defaultScope = scopeRoundId === undefined && selection === 'default' || scopeRoundId === null
  const round = configuration.rounds.find(item => item.id === scope)
  const mode = effectiveDeductionMode(configuration, scope)
  const legacy = !hasDeductionModes(configuration) && !!configuration.scoringConfig.deductionRules?.length
  const inherited = !!round && round.deductionMode == null
  const allRules = configuration.scoringConfig.deductionRules ?? []
  const own = allRules.filter(rule => ruleRoundId(configuration, rule) === scope || round?.id === configuration.rounds.at(-1)?.id && ruleRoundId(configuration, rule) == null)
  const method = round?.calculationMethod ?? configuration.scoringConfig.calculationMethod
  const patchRules = rules => onChange({ ...configuration, scoringConfig: { ...configuration.scoringConfig, deductionRules: rules } })
  useEffect(() => { onPendingChange(`deduction:${scope ?? 'default'}`, !!draft); return () => onPendingChange(`deduction:${scope ?? 'default'}`, false) }, [scope, draft, onPendingChange])
  useEffect(() => { setDraft(null); setEditing(null); setError('') }, [scope])

  const changeMode = nextMode => {
    const next = structuredClone(configuration)
    if (round && !defaultScope) {
      const target = next.rounds.find(item => item.id === scope)
      if (nextMode === 'inherit') delete target.deductionMode
      else target.deductionMode = nextMode
      next.scoringConfig.deductionMode ??= effectiveDeductionMode(configuration, null)
    } else next.scoringConfig.deductionMode = nextMode
    const affected = rule => {
      const ruleScope = ruleRoundId(configuration, rule) ?? configuration.rounds.at(-1)?.id ?? null
      return round && !defaultScope ? ruleScope === scope : !configuration.rounds.find(item => item.id === ruleScope)?.deductionMode
    }
    const count = allRules.filter(rule => affected(rule) || !rule.appliedBy).length
    if (count && !window.confirm(`Update responsibility for ${count} rule(s) in this draft? Historical draft organizer rules will apply directly under the new settings. Rules in a No Deductions scope will be removed. Submitted and frozen rules stay unchanged.`)) return
    next.scoringConfig.deductionRules = allRules.flatMap(rule => {
      if (!affected(rule) && rule.appliedBy) return [rule]
      const owner = ruleDeductionMode(next, rule)
      return owner === 'none' ? [] : [{ ...rule, appliedBy: owner, perViolation: rule.perViolation ?? false, maxOccurrences: rule.maxOccurrences ?? 1 }]
    })
    setDraft(null); setError(''); onChange(next)
  }
  const start = rule => {
    setEditing(rule?.id ?? null)
    setDraft(rule ? { ...rule } : { description: '', amount: 2, units: 'points', roundId: scope, criteriaId: null, appliedBy: mode, perViolation: false, maxOccurrences: 1 })
    setError('')
  }
  const save = () => {
    const rule = { ...draft, id: editing ?? crypto.randomUUID(), description: draft.description.trim(), appliedBy: ruleDeductionMode(configuration, draft) }
    const rules = editing ? allRules.map(item => item.id === editing ? rule : item) : [...allRules, rule]
    const issues = deductionConfigurationIssues({ ...configuration, scoringConfig: { ...configuration.scoringConfig, deductionRules: rules } })
    if (issues.length) { setError(issues.join(' ')); return }
    patchRules(rules); setDraft(null); setEditing(null); setError('')
  }
  const switchScope = value => { if (draft && !window.confirm('Discard the unsaved deduction rule?')) return; setDraft(null); setSelection(value); setError('') }
  const scopeType = draft?.criteriaId ? 'criterion' : draft?.roundId ? 'round' : 'competition'
  const fieldsClass = 'v-input mt-1'

  return <section className="space-y-4" aria-label="Deduction Settings">
    <div><h3 className="rs-title">Deduction Settings</h3><p className="v-helper-text">Choose responsibility for each round. A round can inherit the competition default or use its own choice.</p></div>
    <fieldset disabled={readOnly} className="min-w-0 space-y-4">
      {scopeRoundId === undefined && configuration.rounds.length > 0 && <label className="block text-sm">Editing deduction settings
        <select className={fieldsClass} aria-label="Deduction settings scope" value={selection} onChange={event => switchScope(event.target.value)}><option value="default">Competition defaults / final-result rules</option>{configuration.rounds.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      </label>}
      {round && !defaultScope && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={inherited} onChange={event => changeMode(event.target.checked ? 'inherit' : mode)} />Use competition default ({DEDUCTION_LABELS[effectiveDeductionMode(configuration, null)]})</label>}
      <div className="space-y-2" role="radiogroup" aria-label="Who will apply deductions?">
        {DEDUCTION_MODES.map(value => <label key={value} className="flex items-start gap-3 rounded-lg border border-v-border p-3 text-sm">
          <input type="radio" className="mt-1" name={`${prefix}-mode`} checked={!legacy && mode === value || legacy && value === 'none' && !own.length} onChange={() => changeMode(value)} />
          <span><strong className="block">{DEDUCTION_LABELS[value]}</strong><span className="mt-1 block text-xs text-v-text-muted">{descriptions[value]}</span></span>
        </label>)}
      </div>
      {legacy && <p className="v-helper-text">Saved rules use the historical organizer proposal and independent approval workflow. Choose a responsibility option to change this draft explicitly.</p>}
      {!defaultScope && inherited && <p className="v-helper-text">This round currently inherits the competition default. Selecting an option above creates a round override.</p>}
      {defaultScope && configuration.rounds.length > 0 && <dl className="grid gap-2 sm:grid-cols-2">{configuration.rounds.map(item => <div key={item.id}><dt>{item.name}</dt><dd className="text-sm">{DEDUCTION_LABELS[effectiveDeductionMode(configuration, item.id)]}{item.deductionMode == null ? ' · Inherited' : ' · Round override'}</dd></div>)}</dl>}
      {mode !== 'none' && <>
        <Button variant="secondary" disabled={method === 'manual' || !hasDeductionModes(configuration)} onClick={() => start()}>Add Deduction Rule</Button>
        {method === 'manual' && <p className="v-helper-text">Manual placements do not support automatic deductions.</p>}
        {draft && <div className="rounded-lg border border-v-border p-3 space-y-3">
          <h4 className="font-semibold">{editing ? 'Edit deduction rule' : 'New deduction rule'}</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">Rule name<input aria-label="Deduction rule name" className={fieldsClass} maxLength={200} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} /></label>
            <label className="text-sm">Deduction value<input aria-label="Deduction value" className={fieldsClass} type="number" min="0.000001" max="1000000" step="any" value={draft.amount} onChange={event => setDraft({ ...draft, amount: event.target.value === '' ? '' : Number(event.target.value) })} /></label>
            <label className="text-sm">Deduction type<select aria-label="Deduction type" className={fieldsClass} value={draft.units} onChange={event => setDraft({ ...draft, units: event.target.value })}><option value="points">Score points</option>{method === 'rank_based' && !draft.criteriaId && <option value="placements">Placement penalty</option>}</select></label>
            <label className="text-sm">Apply to<select aria-label="Deduction scope" className={fieldsClass} value={scopeType} onChange={event => {
              const type = event.target.value, id = scope ?? configuration.rounds.at(-1)?.id ?? null
              setDraft({ ...draft, roundId: type === 'competition' ? null : id, criteriaId: type === 'criterion' ? configuration.criteria.find(item => (item.roundId ?? null) === id)?.id ?? null : null, units: type === 'criterion' ? 'points' : draft.units })
            }}><option value="competition" disabled={!!round && round.id !== configuration.rounds.at(-1)?.id}>Competition final result</option>{configuration.rounds.length > 0 && <option value="round">Round</option>}<option value="criterion" disabled={!configuration.criteria.some(item => (item.roundId ?? null) === (scope ?? configuration.rounds.at(-1)?.id ?? null))}>Criterion contribution</option></select></label>
            {scopeType !== 'competition' && configuration.rounds.length > 0 && <label className="text-sm">Applicable round<select aria-label="Applicable deduction round" className={fieldsClass} value={draft.roundId ?? ''} onChange={event => setDraft({ ...draft, roundId: event.target.value, criteriaId: scopeType === 'criterion' ? configuration.criteria.find(item => item.roundId === event.target.value)?.id ?? null : null })}>{configuration.rounds.filter(item => !round || item.id === round.id).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
            {scopeType === 'criterion' && <label className="text-sm">Applicable criterion<select aria-label="Applicable deduction criterion" className={fieldsClass} value={draft.criteriaId ?? ''} onChange={event => setDraft({ ...draft, criteriaId: event.target.value })}>{configuration.criteria.filter(item => (item.roundId ?? null) === (draft.roundId ?? null)).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.perViolation} onChange={event => setDraft({ ...draft, perViolation: event.target.checked, maxOccurrences: event.target.checked ? Math.max(2, draft.maxOccurrences) : 1 })} />Allow separate deductions for repeated violations</label>
          {draft.perViolation && <label className="block text-sm">Maximum occurrences per entry{deductionOwner(draft) === 'judge' ? ', per judge' : ''}<input aria-label="Maximum deduction occurrences" className={fieldsClass} type="number" min="2" max="100" step="1" value={draft.maxOccurrences} onChange={event => setDraft({ ...draft, maxOccurrences: Number(event.target.value) })} /></label>}
          <p className="v-helper-text">Responsible role: {DEDUCTION_LABELS[ruleDeductionMode(configuration, draft)]}. {deductionStage({ ...draft, appliedBy: ruleDeductionMode(configuration, draft) })}. A reason and a unique violation reference are required for every record.</p>
          {ruleDeductionMode(configuration, draft) === 'judge' && configuration.rounds.at(-1)?.progression && configuration.rounds.at(-1).progression !== 'back_to_zero' && configuration.scoringConfig.numericCarryBasis !== 'weighted_judge_average' && <p className="v-helper-text">For combined numeric rounds, choose a round or criterion scope so each deduction follows its round contribution.</p>}
          {draft.criteriaId && ruleDeductionMode(configuration, draft) === 'organizer' && <p className="v-helper-text">Criterion points affect every judge’s contribution. Total Score therefore includes the deduction once per judge.</p>}
          {error && <p role="alert" className="v-error-text">{error}</p>}
          <div className="flex flex-wrap gap-2"><Button onClick={save}>{editing ? 'Update deduction rule' : 'Save deduction rule'}</Button><Button variant="secondary" onClick={() => { setDraft(null); setEditing(null); setError('') }}>Cancel</Button></div>
        </div>}
        {own.map(rule => <article key={rule.id} className="rounded-lg border border-v-border p-3 space-y-2">
          <div><strong>{rule.description}</strong><p className="text-sm">{rule.amount} {rule.units} · {DEDUCTION_LABELS[deductionOwner(rule)]} · {rule.criteriaId ? configuration.criteria.find(item => item.id === rule.criteriaId)?.name : rule.roundId ? configuration.rounds.find(item => item.id === rule.roundId)?.name : 'Competition final result'}</p></div>
          <p className="v-helper-text">{deductionStage(rule)}. Maximum {deductionLimit(rule)} occurrence(s) per entry{deductionOwner(rule) === 'judge' ? ', per judge' : ''}.</p>
          <div className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => start(rule)}>Edit {rule.description}</Button><Button size="sm" variant="ghost" onClick={() => { if (window.confirm('Remove this deduction rule from the draft?')) patchRules(allRules.filter(item => item.id !== rule.id)) }}>Remove {rule.description}</Button></div>
        </article>)}
      </>}
    </fieldset>
  </section>
}
