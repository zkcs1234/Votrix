function isAnswerEmpty(value) {
  if (value === undefined || value === null || value === '') return true
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') return Object.keys(value).length === 0
  return false
}

export function validatePollAnswers(questions, answers) {
  for (const question of questions) {
    const value = answers[question.id]

    if (question.required && isAnswerEmpty(value)) {
      return `${question.question}: answer is required`
    }

    if (question.typeDef?.answerFormat?.kind === 'ranking' && question.options?.length) {
      const ranked =
        value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value).length : 0
      if (question.required && ranked !== question.options.length) {
        return `${question.question}: rank every option`
      }
    }
  }

  return null
}
