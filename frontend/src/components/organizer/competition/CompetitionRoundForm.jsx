import { useId, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import Button from '@/components/ui/Button'
import { INPUT_CLASS, LABEL_CLASS } from '@/utils/uiClasses'
import { getErrorMessage } from '@/utils/getErrorMessage'
import { contributionTotal, roundFormValues, ROUND_PURPOSES, ROUND_SCORE_USES, validateRoundForm } from '@/utils/competitionRoundForm'

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
  return <form noValidate onSubmit={submit} className={initialRound ? 'space-y-4' : 'v-card space-y-4 p-5 sm:p-6'} aria-label={initialRound ? `Edit ${initialRound.name}` : 'Create Round'}>
    <h4 className="text-base font-semibold text-v-text">{initialRound ? 'Round Details' : 'Create Round'}</h4>
    <fieldset disabled={readOnly || saving} className="min-w-0 space-y-4">
      <div>
        <label className="sr-only" htmlFor={`${prefix}-name`}>Round name</label>
        <input ref={inputRef} id={`${prefix}-name`} className={`${INPUT_CLASS} min-h-11 w-full`} value={values.name} required autoFocus={Boolean(initialRound)}
          data-modal-autofocus={Boolean(initialRound) || undefined}
          onChange={event => update('name', event.target.value)} placeholder="Round name, e.g. Preliminary"
          aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? `${prefix}-name-error` : undefined} />
        {errors.name && <p id={`${prefix}-name-error`} className="v-error-text mt-1">{errors.name}</p>}
      </div>
      {initialRound && <div><label className={LABEL_CLASS} htmlFor={`${prefix}-description`}>Description (optional)</label>
        <textarea id={`${prefix}-description`} rows={2} className={`${INPUT_CLASS} w-full`} value={values.description} onChange={event => update('description', event.target.value)} />
      </div>}
      <div><label className={LABEL_CLASS} htmlFor={`${prefix}-purpose`}>Round purpose</label>
        <select id={`${prefix}-purpose`} className={`${INPUT_CLASS} w-full`} value={values.purpose} onChange={event => update('purpose', event.target.value)} aria-describedby={`${prefix}-purpose-hint`}>
          {purposeOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select><p id={`${prefix}-purpose-hint`} className="mt-1.5 text-sm leading-relaxed text-v-text-subtle">{purposeOptions.find(option => option.value === values.purpose)?.description}</p>
      </div>
      {values.purpose === 'special' ? <p className="text-sm leading-relaxed text-v-text-subtle">Special awards are scored separately from the overall competition result.</p>
        : <div><label className={LABEL_CLASS} htmlFor={`${prefix}-scores`}>How are scores used?</label>
          <select id={`${prefix}-scores`} className={`${INPUT_CLASS} w-full`} value={values.progression} onChange={event => update('progression', event.target.value)} aria-describedby={`${prefix}-scores-hint`}>
            {scoreOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select><p id={`${prefix}-scores-hint`} className="mt-1.5 text-sm leading-relaxed text-v-text-subtle">{scoreOptions.find(option => option.value === values.progression)?.description}</p>
        </div>}
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
        <Button type="submit" loading={saving} className="min-h-11 w-full">
          {!initialRound && <Plus className="h-4 w-4" aria-hidden="true" />}{initialRound ? 'Save Round' : 'Create Round'}
        </Button>
      </div>
    </fieldset>
  </form>
}
