import Button from '@/components/ui/Button'
import { deductionLimit } from '../../../../../shared/competition-deductions.js'

export default function JudgeDeductionControls({ rules, records, onChange, disabled, entryLocked }) {
  if (!rules.length) return null
  const locked = rule => disabled || !rule.criteriaId && entryLocked
  const controls = <>
    {rules.map(rule => <div key={rule.id} className="v-judge-deduction-rule">
      <div className="v-judge-deduction-option">
        <span>{rule.units === 'placements' ? '+' : '-'}{rule.amount} {rule.units === 'points' ? 'points' : 'placements'}</span>
      </div>
      <Button
        size="sm"
        variant="primary"
        className="v-judge-deduct-button"
        disabled={locked(rule) || records.filter(record => record.ruleId === rule.id).length >= deductionLimit(rule)}
        onClick={() => onChange([...records, { id: crypto.randomUUID(), ruleId: rule.id }])}
      >
        Deduct
      </Button>
    </div>)}
  </>
  return <div className="v-judge-deduction-controls">{controls}</div>
}
