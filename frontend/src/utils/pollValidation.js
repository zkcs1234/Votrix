function isAnswerEmpty(value) {
  if (value === undefined || value === null || value === '') return true
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') return Object.keys(value).length === 0
  return false
}

/**
 * Problems with the current answers, keyed by question id. Only questions that
 * have a problem appear in the result, so an empty object means "ready to submit".
 */
export function pollAnswerErrors(questions, answers) {
  const errors = {}

  for (const question of questions) {
    const value = answers[question.id]

    if (question.required && isAnswerEmpty(value)) {
      errors[question.id] = 'This question is required.'
      continue
    }

    if (question.typeDef?.answerFormat?.kind === 'ranking' && question.options?.length) {
      const ranked =
        value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value).length : 0
      if (question.required && ranked !== question.options.length) {
        errors[question.id] = 'Rank every option.'
      }
    }
  }

  return errors
}

/** First problem as a single sentence, or null. Kept for callers that want one message. */
export function validatePollAnswers(questions, answers) {
  const errors = pollAnswerErrors(questions, answers)
  const first = questions.find((question) => errors[question.id])
  if (!first) return null
  return errors[first.id] === 'Rank every option.'
    ? `${first.question}: rank every option`
    : `${first.question}: answer is required`
}
