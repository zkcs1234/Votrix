import { ApiError } from '../utils/ApiError.js'
import { requireQuestionType } from '../services/polling-registry.service.js'
import { validateTypeConfig } from '../modules/poll-question-types.js'

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

// Phase 7 — question validation is registry-driven. The list of valid
// types is no longer hardcoded here; instead we ask the registry.
export async function validateQuestion(body, organizationId) {
  if (!body?.question?.trim()) throw new ApiError(400, 'Question text is required')
  if (!body?.type) throw new ApiError(400, 'Question type is required')

  const typeDef = await requireQuestionType(organizationId, body.type)
  let typeConfig
  try {
    typeConfig = validateTypeConfig(typeDef, body.typeConfig)
  } catch (err) {
    throw new ApiError(400, err.message)
  }

  return {
    question: body.question.trim(),
    type: typeDef.key,
    sortOrder: Number(body.sortOrder ?? 0),
    required: body.required !== false,
    typeConfig,
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

// Phase 7 — custom type validators
export function validateCustomType(body) {
  if (!body?.key?.trim()) throw new ApiError(400, 'key is required')
  if (!body?.label?.trim()) throw new ApiError(400, 'label is required')
  if (!body?.answerFormat || typeof body.answerFormat !== 'object') {
    throw new ApiError(400, 'answerFormat is required')
  }
  return {
    key: body.key.trim(),
    label: body.label.trim(),
    description: body.description?.trim() || null,
    answerFormat: body.answerFormat,
    configSchema: body.configSchema ?? {},
    ui: body.ui ?? {},
    sortOrder: Number(body.sortOrder ?? 100),
    isActive: body.isActive !== false,
  }
}
