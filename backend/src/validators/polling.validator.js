import { ApiError } from '../utils/ApiError.js'

const VALID_TYPES = ['multiple_choice', 'single_choice', 'checkbox', 'yes_no', 'text', 'rating']

export function validatePollEvent(body, isCreate = false) {
  if (isCreate && !body?.title?.trim()) {
    throw new ApiError(400, 'Poll title is required')
  }

  const payload = {}
  if (body.title !== undefined) payload.title = body.title.trim()
  if (body.description !== undefined) payload.description = body.description?.trim() || null
  if (body.pollAnonymous !== undefined) payload.pollAnonymous = Boolean(body.pollAnonymous)
  if (body.pollAllowMultipleSubmissions !== undefined) {
    payload.pollAllowMultipleSubmissions = Boolean(body.pollAllowMultipleSubmissions)
  }
  if (body.pollExpiresAt !== undefined) {
    payload.pollExpiresAt = body.pollExpiresAt || null
  }

  return payload
}

export function validateQuestion(body) {
  if (!body?.question?.trim()) throw new ApiError(400, 'Question text is required')
  if (!VALID_TYPES.includes(body.type)) {
    throw new ApiError(400, `Invalid type. Use: ${VALID_TYPES.join(', ')}`)
  }

  return {
    question: body.question.trim(),
    type: body.type,
    sortOrder: Number(body.sortOrder ?? 0),
    required: body.required !== false,
    options: body.options,
  }
}

export function validatePollAnswers(body) {
  const answers = body?.answers
  if (!answers || typeof answers !== 'object') {
    throw new ApiError(400, 'answers object is required')
  }
  return answers
}

export function validatePollToggle(body) {
  if (typeof body?.pollingEnabled !== 'boolean') {
    throw new ApiError(400, 'pollingEnabled must be a boolean')
  }
  return body.pollingEnabled
}
