import { ApiError } from '../utils/ApiError.js'

export function validatePollEvent(body, isCreate = false) {
  if (isCreate && !body?.title?.trim()) {
    throw new ApiError(400, 'Poll title is required')
  }
  if (isCreate) {
    if (!body?.startDate) throw new ApiError(400, 'Start date is required')
    if (!body?.endDate) throw new ApiError(400, 'End date is required')
    if (body.startDate && body.endDate && new Date(body.endDate) < new Date(body.startDate)) {
      throw new ApiError(400, 'End date must be on or after start date')
    }
  }

  const payload = {}
  if (body.title !== undefined) payload.title = body.title.trim()
  if (body.description !== undefined) payload.description = body.description?.trim() || null
  if (body.startDate !== undefined) payload.startDate = body.startDate
  if (body.endDate !== undefined) payload.endDate = body.endDate
  if (body.pollAnonymous !== undefined) payload.pollAnonymous = Boolean(body.pollAnonymous)
  if (body.pollAllowMultipleSubmissions !== undefined) {
    payload.pollAllowMultipleSubmissions = Boolean(body.pollAllowMultipleSubmissions)
  }


  return payload
}

export function validatePollAnswers(body) {
  const answers = body?.answers
  if (answers === undefined || answers === null) {
    throw new ApiError(400, 'answers object is required')
  }

  const answerEntries = Array.isArray(answers) ? answers : Object.entries(answers)
  const totalEntries = Array.isArray(answers) ? answers.length : answerEntries.length
  if (totalEntries > 200) {
    throw new ApiError(400, 'Too many answers provided')
  }

  const values = Array.isArray(answers) ? answers : Object.values(answers)
  for (const value of values) {
    if (typeof value === 'string' && value.length > 10_000) {
      throw new ApiError(400, 'Answer value exceeds 10,000 characters')
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string' && item.length > 10_000) {
          throw new ApiError(400, 'Answer value exceeds 10,000 characters')
        }
      }
    }
  }

  return answers
}

// Basic question validation. Type/typeConfig are re-validated against the
// registry in the service layer (requireQuestionType + validateTypeConfig).
export function validatePollQuestion(body) {
  if (!body?.question?.trim()) {
    throw new ApiError(400, 'Question text is required')
  }
  if (!body?.type) {
    throw new ApiError(400, 'Question type is required')
  }

  return {
    question: body.question.trim(),
    type: body.type,
    sortOrder: Number(body.sortOrder ?? 0),
    required: body.required !== false,
    typeConfig: body.typeConfig ?? {},
    options: body.options,
    imageUrl: body.imageUrl?.trim() || null,
    imageAssetId: body.imageAssetId ?? null,
  }
}

// Phase 7 — custom type validators
const VALID_ANSWER_KINDS = new Set(['choice', 'numeric', 'text', 'ranking'])

// Validate an answerFormat object. A malformed kind here poisons the voter
// submit path (validateAnswer throws "Unsupported question kind") and the
// analytics path, so reject it at creation time rather than at a distance.
function assertValidAnswerFormat(answerFormat) {
  if (!answerFormat || typeof answerFormat !== 'object' || Array.isArray(answerFormat)) {
    throw new ApiError(400, 'answerFormat is required')
  }
  if (!VALID_ANSWER_KINDS.has(answerFormat.kind)) {
    throw new ApiError(
      400,
      `answerFormat.kind must be one of: ${[...VALID_ANSWER_KINDS].join(', ')}`,
    )
  }
  if (answerFormat.kind === 'choice' && !['one', 'many'].includes(answerFormat.cardinality)) {
    throw new ApiError(400, "A 'choice' answerFormat requires cardinality 'one' or 'many'")
  }
}

export function validateCustomType(body) {
  if (!body?.key?.trim()) throw new ApiError(400, 'key is required')
  if (!body?.label?.trim()) throw new ApiError(400, 'label is required')
  assertValidAnswerFormat(body.answerFormat)
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

// Partial validator for updates — only the provided fields are checked and
// returned, so callers can PATCH a single attribute.
export function validateCustomTypeUpdate(body) {
  const out = {}
  if (body?.label !== undefined) {
    if (!body.label?.trim()) throw new ApiError(400, 'label cannot be empty')
    out.label = body.label.trim()
  }
  if (body?.description !== undefined) out.description = body.description?.trim() || null
  if (body?.answerFormat !== undefined) {
    assertValidAnswerFormat(body.answerFormat)
    out.answerFormat = body.answerFormat
  }
  if (body?.configSchema !== undefined) out.configSchema = body.configSchema
  if (body?.ui !== undefined) out.ui = body.ui
  if (body?.sortOrder !== undefined) out.sortOrder = Number(body.sortOrder)
  if (body?.isActive !== undefined) out.isActive = Boolean(body.isActive)
  return out
}
