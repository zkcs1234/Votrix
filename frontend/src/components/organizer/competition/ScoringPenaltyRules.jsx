import { useEffect, useRef, useState } from 'react'
import Button from '@/components/ui/Button'
import { INPUT_CLASS, LABEL_CLASS } from '@/utils/uiClasses'
import DeductionSettings from './DeductionSettings'

export default function ScoringPenaltyRules(props) {
  if (props.configuration && props.onConfigurationChange) return <DeductionSettings configuration={props.configuration} onChange={props.onConfigurationChange} scopeRoundId={props.scopeRoundId} readOnly={props.readOnly} onPendingChange={props.onPendingChange} />
  return <HistoricalPenaltyRules {...props} />
}

// Mapped historical events retain their existing proposal/approval contract.
// New native round setup uses the shared ownership editor above.
function HistoricalPenaltyRules({ config, foundation, update, readOnly, initialSection }) {
  const rules = config.deductionRules ?? []
  const [enabled, setEnabled] = useState(rules.length > 0)
  const [removeRequested, setRemoveRequested] = useState(false)
  const detailsRef = useRef(null)
  useEffect(() => { if (rules.length) setEnabled(true) }, [rules.length])
  useEffect(() => {
    if (initialSection !== 'deductions' || !detailsRef.current) return
    detailsRef.current.open = true
    detailsRef.current.scrollIntoView?.({ block: 'nearest' })
  }, [initialSection])
  const change = (id, values) => update('deductionRules', rules.map(rule => rule.id === id ? { ...rule, ...values } : rule))
  const units = config.calculationMethod === 'rank_based' ? 'placements' : 'points'
  return <div className="space-y-3 border-t border-v-border pt-4">
    <div><h4 className="text-sm font-semibold text-v-text">Deductions and penalties</h4><p className="mt-1 text-sm text-v-text-muted">Apply official point deductions only if the competition rules allow them.</p></div>
    {config.calculationMethod === 'manual' && <p className="text-sm text-v-text-muted">Manual placements use the documented approval procedure. Automatic point deductions are unavailable.</p>}
    <label className="flex items-start gap-2 text-sm text-v-text"><input type="checkbox" className="mt-1 accent-v-primary" checked={enabled} disabled={readOnly || config.calculationMethod === 'manual' && !rules.length}
      onChange={event => { if (!event.target.checked && rules.length) setRemoveRequested(true); else setEnabled(event.target.checked) }} />Allow deductions defined by the competition rules</label>
    {!enabled && <p className="text-xs text-v-text-subtle">Penalties are off. No deduction rules are configured.</p>}
    {enabled && !rules.length && <p className="text-xs text-v-text-subtle">Add a permitted rule to enable deductions in the saved configuration.</p>}
    {removeRequested && <div className="rounded-lg border border-v-border bg-v-surface-elevated p-3 text-sm"><p>Remove all {rules.length} penalty rules from this draft? Saved rules stay unchanged until you save.</p><div className="mt-2 flex flex-wrap gap-2"><Button variant="danger" size="sm" onClick={() => { update('deductionRules', []); setEnabled(false); setRemoveRequested(false) }}>Remove rules from draft</Button><Button variant="secondary" size="sm" onClick={() => setRemoveRequested(false)}>Keep rules</Button></div></div>}
    <details ref={detailsRef} className="scroll-mt-24 rounded-lg border border-v-border bg-v-surface p-3">
      <summary className="cursor-pointer text-sm font-medium text-v-text">Configure Penalty Rules{rules.length ? ` (${rules.length})` : ''}</summary>
      <div className="mt-3 space-y-3">
        <p className="text-xs leading-relaxed text-v-text-muted">Amounts use {units === 'placements' ? 'placement points added to the rank sum' : 'score points subtracted after judge totals are combined'}. An organizer reports an offense; the appointed reviewer approves it. Original judge scores stay unchanged.</p>
        {!enabled && <p className="text-sm text-v-text-muted">Enable deductions above to add a rule.</p>}
        {rules.map((rule, index) => {
          const prefix = `penalty-rule-${index}`
          const roundAvailable = !rule.roundId || foundation.rounds?.some(r => r.id === rule.roundId)
          const applicableCriteria = (foundation.criteria ?? []).filter(c => !rule.roundId || foundation.rounds?.find(r => r.id === rule.roundId)?.criteriaIds?.includes(c.id))
          return <fieldset key={rule.id} className="min-w-0 space-y-3 rounded-lg border border-v-border bg-v-surface-elevated/40 p-3"><legend className="px-1 text-xs font-semibold text-v-text">Rule {index + 1}</legend>
            <div><label htmlFor={`${prefix}-description`} className={LABEL_CLASS}>Offense or rule description</label><input id={`${prefix}-description`} className={`${INPUT_CLASS} w-full`} placeholder="Describe the official offense" value={rule.description ?? ''} onChange={e => change(rule.id, { description: e.target.value })} /></div>
            <div className="grid gap-3 sm:grid-cols-2"><div><label htmlFor={`${prefix}-amount`} className={LABEL_CLASS}>Deduction amount</label><input id={`${prefix}-amount`} className={`${INPUT_CLASS} w-full`} type="number" min="0.01" step="0.01" placeholder="Enter the approved amount" value={rule.amount ?? ''} onChange={e => change(rule.id, { amount: e.target.value === '' ? null : Number(e.target.value) })} /></div>
              <div><label htmlFor={`${prefix}-units`} className={LABEL_CLASS}>Amount units</label><select id={`${prefix}-units`} className={`${INPUT_CLASS} w-full`} value={rule.units} onChange={e => change(rule.id, { units: e.target.value })}><option value="points">Score points</option><option value="placements">Placement points</option></select></div></div>
            <div className="grid gap-3 sm:grid-cols-2"><div><label htmlFor={`${prefix}-round`} className={LABEL_CLASS}>Where does this deduction apply?</label><select id={`${prefix}-round`} className={`${INPUT_CLASS} w-full`} value={rule.roundId ?? ''} onChange={e => change(rule.id, { roundId: e.target.value || null, criteriaId: null })}><option value="">Overall event result</option>{!roundAvailable && <option value={rule.roundId}>Saved round — currently unavailable</option>}{(foundation.rounds ?? []).map(round => <option key={round.id} value={round.id}>{round.name}</option>)}</select></div>
              <div><label htmlFor={`${prefix}-criterion`} className={LABEL_CLASS}>Related criterion (optional)</label><select id={`${prefix}-criterion`} className={`${INPUT_CLASS} w-full`} value={rule.criteriaId ?? ''} onChange={e => change(rule.id, { criteriaId: e.target.value || null })}><option value="">Whole scoring scope</option>{rule.criteriaId && !applicableCriteria.some(c => c.id === rule.criteriaId) && <option value={rule.criteriaId}>Saved criterion — currently unavailable</option>}{applicableCriteria.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div></div>
            <Button variant="secondary" size="sm" onClick={() => update('deductionRules', rules.filter(r => r.id !== rule.id))}>Remove rule {index + 1}</Button>
          </fieldset>
        })}
        {enabled && config.calculationMethod !== 'manual' && <Button variant="secondary" disabled={readOnly} onClick={() => update('deductionRules', [...rules, { id: crypto.randomUUID(), description: '', amount: null, units, roundId: null, criteriaId: null }])}>Add penalty rule</Button>}
      </div>
    </details>
  </div>
}
