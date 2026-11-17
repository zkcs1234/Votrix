// Live validation for the poll question builder. Pure (no React) so it can be
// tested directly. The server remains authoritative: it re-validates the type
// config against the type's configSchema (backend/src/modules/poll-question-types.js)
// and requires at least two options for choice / ranking questions.

/**
 * Which per-type setting fields the builder shows (mirrors the type's
 * answerFormat). Kept here so the page and the validator agree.
 */
export function configFieldFor(typeDef) {
  if (!typeDef) return []
  switch (typeDef.answerFormat?.kind) {
    case 'numeric':
      return [
        { key: 'min', label: 'Min', kind: 'number' },
        { key: 'max', label: 'Max', kind: 'number' },
        { key: 'step', label: 'Step', kind: 'number' },
      ]
    case 'text':
      return [
        { key: 'maxLength', label: 'Max length', kind: 'number' },
        { key: 'multiline', label: 'Multiline', kind: 'boolean' },
      ]
    case 'ranking':
      return [
        { key: 'allowTies', label: 'Allow ties', kind: 'boolean' },
        { key: 'minItems', label: 'Min items to rank', kind: 'number' },
      ]
    default:
      return []
  }
}

/** Whether the type is built from options the organizer types in. */
export function needsFreeOptions(typeDef) {
  if (!typeDef) return true
  const input = typeDef.ui?.input
  return input === 'radio' || input === 'checkbox' || input === 'ranking'
}

const WHOLE_NUMBER_FIELDS = new Set(['maxLength', 'minItems'])

/**
 * @returns {{ question?: string, config: Record<string,string>, options?: string, optionLabels: Record<number,string> }}
 *   Messages keyed by field. Empty objects/undefined mean "no problem".
 */
export function validateQuestionForm(form, typeDef) {
  const errors = { config: {}, optionLabels: {} }

  if (!form.question.trim()) errors.question = 'Question text is required'

  const schema = typeDef?.configSchema ?? {}
  for (const field of configFieldFor(typeDef)) {
    if (field.kind !== 'number') continue
    const value = form.typeConfig?.[field.key]
    if (value === undefined || value === null || value === '') continue // optional
    if (!Number.isFinite(value)) {
      errors.config[field.key] = `${field.label} must be a number`
      continue
    }
    if (WHOLE_NUMBER_FIELDS.has(field.key) && !Number.isInteger(value)) {
      errors.config[field.key] = `${field.label} must be a whole number`
      continue
    }
    if (field.key === 'step' && value <= 0) {
      errors.config[field.key] = 'Step must be greater than 0'
      continue
    }
    const rule = schema[field.key]
    if (rule?.minimum !== undefined && value < rule.minimum) {
      errors.config[field.key] = `${field.label} must be at least ${rule.minimum}`
    } else if (rule?.maximum !== undefined && value > rule.maximum) {
      errors.config[field.key] = `${field.label} must be at most ${rule.maximum}`
    }
  }

  const { min, max } = form.typeConfig ?? {}
  if (
    typeDef?.answerFormat?.kind === 'numeric' &&
    Number.isFinite(min) && Number.isFinite(max) && min > max &&
    !errors.config.min
  ) {
    errors.config.min = 'Min cannot be greater than Max'
  }

  if (needsFreeOptions(typeDef)) {
    const seen = new Map()
    let filled = 0
    form.options.forEach((option, index) => {
      const label = option.label.trim()
      if (!label) return
      filled += 1
      const key = label.toLowerCase()
      if (seen.has(key)) errors.optionLabels[index] = 'This option is already listed'
      else seen.set(key, index)
    })
    if (filled < 2) errors.options = 'Add at least two options'
  }

  return errors
}

export function hasQuestionErrors(errors) {
  return Boolean(
    errors.question ||
      errors.options ||
      Object.keys(errors.config).length ||
      Object.keys(errors.optionLabels).length,
  )
}
