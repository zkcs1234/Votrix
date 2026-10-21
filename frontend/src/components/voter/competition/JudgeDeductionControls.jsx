import Button from '@/components/ui/Button'
import { deductionLimit } from '../../../../../shared/competition-deductions.js'

export default function JudgeDeductionControls({ rules, records, onChange, disabled, disabledReason, entryLocked }) {
  if (!rules.length) return null
  const controls = <>
    {rules.map(rule => {
      const count=records.filter(record=>record.ruleId===rule.id).length,limit=deductionLimit(rule)
      const reason=disabled?(disabledReason||'Deductions are locked with these scores.'):!rule.criteriaId&&entryLocked?'Apply round deductions before locking any criterion.':count>=limit?'Configured deduction limit reached.':''
      return <div key={rule.id} className="v-judge-deduction-rule">
      <div className="v-judge-deduction-option">
        <span>{rule.units === 'placements' ? '+' : '-'}{rule.amount} {rule.units === 'points' ? 'points' : 'placements'}</span>
      </div>
      <Button
        size="sm"
        variant="primary"
        className="v-judge-deduct-button"
        disabled={!!reason}
        title={reason||`Apply ${rule.description}`}
        onClick={() => onChange([...records, { id: crypto.randomUUID(), ruleId: rule.id }])}
      >
        Deduct
      </Button>
      {(count>0||reason)&&<span className="v-judge-deduction-feedback" role="status">{count>0&&`Applied ${count} of ${limit}. `}{reason}</span>}
    </div>})}
  </>
  return <div className="v-judge-deduction-controls">{controls}</div>
}
