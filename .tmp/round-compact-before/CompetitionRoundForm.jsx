import { useId, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import Button from '@/components/ui/Button'
import { INPUT_CLASS, LABEL_CLASS } from '@/utils/uiClasses'
import { getErrorMessage } from '@/utils/getErrorMessage'
import { contributionTotal, roundFormValues, ROUND_PURPOSES, ROUND_SCORE_USES, validateRoundForm } from '@/utils/competitionRoundForm'

export function RoundRadioCards({ legend, options, value, onChange, name }) {
  const prefix = useId()
  return <fieldset className="space-y-2">
    <legend className={`${LABEL_CLASS} mb-2`}>{legend}</legend>
    {options.map(option => <label key={option.value} htmlFor={`${prefix}-${option.value}`}
      className={`flex min-h-16 cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition focus-within:ring-2 focus-within:ring-v-primary ${value === option.value ? 'border-v-primary bg-v-primary-soft' : 'border-v-border bg-v-surface hover:border-v-border-strong'}`}>
      <input id={`${prefix}-${option.value}`} type="radio" name={name || prefix} value={option.value} checked={value === option.value}
        onChange={() => onChange(option.value)} aria-describedby={`${prefix}-${option.value}-description`} className="mt-1 h-4 w-4 shrink-0 accent-v-primary" />
      <span className="min-w-0"><span className="block font-medium text-v-text">{option.label}</span>
        <span id={`${prefix}-${option.value}-description`} className="mt-1 block leading-relaxed text-v-text-subtle">{option.description}</span>
      </span>
    </label>)}
  </fieldset>
}

export default function CompetitionRoundForm({ rounds, categories = [], divisions = [], divisionsEnabled = false,
  initialRound = null, onSave, onCancel, readOnly = false, nameInputRef }) {
  const prefix = useId()
  const localNameRef = useRef(null)
  const inputRef = nameInputRef || localNameRef
  const [values, setValues] = useState(() => roundFormValues(initialRound))
  const [errors, setErrors] = useState({})
  const [requestError, setRequestError] = useState('')
  const [saving, setSaving] = useState(false)
  const combined = values.progression === 'weighted' && values.purpose !== 'special'
  const total = contributionTotal(rounds, values.categoryId, initialRound?.id)
  const groupName = categories.find(category => category.id === values.categoryId)?.name || 'event-wide combined results'
  const purposeOptions = values.purpose === 'special' || initialRound?.purpose === 'special'
    ? [...ROUND_PURPOSES, { value: 'special', label: 'Special award', description: 'Keep this award separate from the overall competition result.' }] : ROUND_PURPOSES
  const scoreOptions = values.progression === 'carry_forward' || initialRound?.progression === 'carry_forward'
    ? [...ROUND_SCORE_USES, { value: 'carry_forward', label: 'Add earlier rounds’ scores', description: 'Keep the saved setting that adds earlier round scores to this result.' }] : ROUND_SCORE_USES
  const update = (key, value) => {
    setValues(current => ({ ...current, [key]: value }))
    setErrors(current => ({ ...current, [key]: undefined, ...(key === 'categoryId' || key === 'progression' ? { weight: undefined } : {}) }))
    setRequestError('')
  }
  const submit = async event => {
    event.preventDefault()
    if (readOnly || saving) return
    const checked = validateRoundForm(values, rounds, initialRound)
    setErrors(checked.errors)
    if (Object.keys(checked.errors).length) {
      if (checked.errors.name) inputRef.current?.focus()
      return
    }
    setSaving(true)
    setRequestError('')
    try {
      await onSave(checked.payload)
      if (!initialRound) setValues(roundFormValues(null))
    } catch (error) {
      setRequestError(getErrorMessage(error))
    } finally { setSaving(false) }
  }
  return <form noValidate onSubmit={submit} className={initialRound ? 'space-y-5' : 'v-card space-y-5 p-4 sm:p-6'} aria-label={initialRound ? `Edit ${initialRound.name}` : 'Create a Round'}>
    <h4 className="text-lg font-semibold text-v-text">{initialRound ? 'Edit Round' : 'Create a Round'}</h4>
    <fieldset disabled={readOnly || saving} className="min-w-0 space-y-5">
      <div>
        <label className={LABEL_CLASS} htmlFor={`${prefix}-name`}>What is the name of this round?</label>
        <input ref={inputRef} id={`${prefix}-name`} className={`${INPUT_CLASS} w-full`} value={values.name} required autoFocus={Boolean(initialRound)}
          onChange={event => update('name', event.target.value)} placeholder="e.g. Preliminary, Final, Talent Performance"
          aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? `${prefix}-name-error` : undefined} />
        {errors.name && <p id={`${prefix}-name-error`} className="v-error-text mt-1">{errors.name}</p>}
      </div>
      {initialRound && <div><label className={LABEL_CLASS} htmlFor={`${prefix}-description`}>Description (optional)</label>
        <textarea id={`${prefix}-description`} rows={2} className={`${INPUT_CLASS} w-full`} value={values.description} onChange={event => update('description', event.target.value)} />
      </div>}
      <RoundRadioCards legend="What is this round for?" options={purposeOptions} value={values.purpose} onChange={value => update('purpose', value)} />
      {values.purpose === 'special' ? <p className="text-sm leading-relaxed text-v-text-subtle">Special awards are scored separately from the overall competition result.</p>
        : <RoundRadioCards legend="How should this round's scores be used?" options={scoreOptions} value={values.progression} onChange={value => update('progression', value)} />}
      {categories.length > 0 && <div><label className={LABEL_CLASS} htmlFor={`${prefix}-category`}>Scoring group (optional)</label>
        <select id={`${prefix}-category`} className={`${INPUT_CLASS} w-full`} value={values.categoryId} onChange={event => update('categoryId', event.target.value)}>
          <option value="">Event-wide</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select><p className="mt-1 text-xs text-v-text-subtle">Use an existing category when these rounds share a combined result.</p>
      </div>}
      {combined && <div>
        <label className={LABEL_CLASS} htmlFor={`${prefix}-weight`}>Contribution to combined result (%)</label>
        <input id={`${prefix}-weight`} type="number" step="0.01" min="0.01" max="100" required className={`${INPUT_CLASS} w-full sm:max-w-48`}
          value={values.weight} onChange={event => update('weight', event.target.value)} aria-invalid={Boolean(errors.weight)} aria-describedby={`${prefix}-weight-hint${errors.weight ? ` ${prefix}-weight-error` : ''}`} />
        <p id={`${prefix}-weight-hint`} className="mt-1 text-xs leading-relaxed text-v-text-subtle">
          {total.toFixed(2)}% already assigned · {Math.max(0, 100 - total).toFixed(2)}% available for {groupName}. Final totals are checked before publication.
        </p>{errors.weight && <p id={`${prefix}-weight-error`} className="v-error-text mt-1">{errors.weight}</p>}
      </div>}
      {divisionsEnabled && divisions.length > 0 && <div><label className={LABEL_CLASS} htmlFor={`${prefix}-division`}>Division (optional)</label>
        <select id={`${prefix}-division`} className={`${INPUT_CLASS} w-full`} value={values.divisionId} onChange={event => update('divisionId', event.target.value)}>
          <option value="">All divisions</option>{divisions.map(division => <option key={division.id} value={division.id}>{division.name}</option>)}
        </select>
      </div>}
      {requestError && <p role="alert" className="v-error-text">{requestError}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        {onCancel && <Button variant="secondary" className="min-h-11" onClick={onCancel}>Cancel</Button>}
        <Button type="submit" loading={saving} className="min-h-11 w-full sm:w-auto">
          {!initialRound && <Plus className="h-4 w-4" aria-hidden="true" />}{initialRound ? 'Save Round' : 'Create Round'}
        </Button>
      </div>
    </fieldset>
  </form>
}
