// Phase 7 — Polling question type registry
//
// Pure helpers built on top of the database registry
// (system_poll_question_types + per-org poll_question_types). All answers
// are validated and serialized through these helpers — there is no
// hardcoded question-type list in application code.
//
// Resolution rule (mirrors the v_poll_question_types view):
//   1. Per-organization override (poll_question_types WHERE organization_id = ?)
//   2. Built-in (system_poll_question_types)
//
// Custom types can be added by inserting a row into poll_question_types.

const AUTO_OPTIONS_KEYS = new Set(['yes_no'])

export function isLikelyAutoOptionsType(type) {
  return AUTO_OPTIONS_KEYS.has(type)
}

// A registry row has this shape (after .mapTypeRow):
//   { key, label, description, answerFormat, configSchema, ui, sortOrder }
export function mapTypeRow(row) {
  if (!row) return null
  return {
    key: row.key,
    label: row.label,
    description: row.description,
    answerFormat: row.answer_format,
    configSchema: row.config_schema ?? {},
    ui: row.ui ?? {},
    sortOrder: row.sort_order ?? 0,
  }
}

// Resolve a single type by key for an organization. Returns null if neither
// the org override nor the system table has the key.
export function resolveType(registry, typeKey) {
  if (!typeKey || !Array.isArray(registry)) return null
  return registry.find((r) => r.key === typeKey) ?? null
}

// Validate a per-question type_config against the type's config_schema.
// We do a minimal hand-rolled validation here to avoid pulling in ajv.
export function validateTypeConfig(typeDef, typeConfig) {
  if (!typeDef) return typeConfig ?? {}
  const schema = typeDef.configSchema ?? {}
  const out = { ...(typeConfig ?? {}) }

  for (const [key, rule] of Object.entries(schema)) {
    const value = out[key]
    if (value === undefined) continue

    if (rule?.type === 'integer' || rule?.type === 'number') {
      const n = Number(value)
      if (Number.isNaN(n)) {
        throw new Error(`typeConfig.${key} must be a number`)
      }
      if (rule.minimum !== undefined && n < rule.minimum) {
        throw new Error(`typeConfig.${key} must be >= ${rule.minimum}`)
      }
      if (rule.maximum !== undefined && n > rule.maximum) {
        throw new Error(`typeConfig.${key} must be <= ${rule.maximum}`)
      }
      if (rule.enum && !rule.enum.includes(n)) {
        throw new Error(`typeConfig.${key} must be one of: ${rule.enum.join(', ')}`)
      }
      out[key] = n
    }

    if (rule?.type === 'string') {
      if (typeof value !== 'string') {
        throw new Error(`typeConfig.${key} must be a string`)
      }
      if (rule.default !== undefined && value === '') {
        out[key] = rule.default
      }
    }

    if (rule?.type === 'boolean') {
      out[key] = Boolean(value)
    }

    if (rule?.type === 'array') {
      if (!Array.isArray(value)) {
        throw new Error(`typeConfig.${key} must be an array`)
      }
      if (rule.minItems !== undefined && value.length < rule.minItems) {
        throw new Error(`typeConfig.${key} requires at least ${rule.minItems} items`)
      }
    }
  }

  return out
}

// ---------------------------------------------------------------------------
// Auto-option builders — produce the option labels a question needs when
// the type doesn't accept free-form options from the organizer.
// ---------------------------------------------------------------------------
export function buildAutoOptions(typeDef, typeConfig) {
  if (!typeDef) return []
  const fmt = typeDef.answerFormat ?? {}

  if (Array.isArray(fmt.autoOptions)) {
    return fmt.autoOptions.map((label) => ({ label }))
  }

  if (fmt.autoOptionsFromConfig) {
    // Likert
    const points = Number(typeConfig?.points ?? 5)
    const low = typeConfig?.lowLabel ?? 'Strongly disagree'
    const high = typeConfig?.highLabel ?? 'Strongly agree'
    if (points === 5) {
      return [
        { label: low },
        { label: 'Disagree' },
        { label: 'Neutral' },
        { label: 'Agree' },
        { label: high },
      ]
    }
    if (points === 3) {
      return [{ label: low }, { label: 'Neutral' }, { label: high }]
    }
    if (points === 7) {
      return [
        { label: low },
        { label: 'Strongly disagree' },
        { label: 'Disagree' },
        { label: 'Neutral' },
        { label: 'Agree' },
        { label: 'Strongly agree' },
        { label: high },
      ]
    }
    // Generic evenly-spaced label set
    const out = []
    for (let i = 0; i < points; i++) {
      out.push({ label: i === 0 ? low : i === points - 1 ? high : `Level ${i + 1}` })
    }
    return out
  }

  return []
}

// ---------------------------------------------------------------------------
// Answer validation + serialization
// ---------------------------------------------------------------------------
//
// validateAnswer(typeDef, typeConfig, options, raw) — throws Error on bad data
// serializeAnswer(typeDef, typeConfig, options, raw) — returns the string stored
// in poll_answers.answer.
//
// `options` is the array of poll_options rows for the question
// (id, label, sortOrder).
//
export function validateAnswer(typeDef, typeConfig, options, raw, { required }) {
  if (!typeDef) throw new Error('Unknown question type')

  const fmt = typeDef.answerFormat ?? {}
  const isEmpty =
    raw === undefined ||
    raw === null ||
    raw === '' ||
    (Array.isArray(raw) && raw.length === 0)

  if (isEmpty) {
    if (required) throw new Error('Answer is required')
    return null
  }

  switch (fmt.kind) {
    case 'choice': {
      if (fmt.cardinality === 'one') {
        if (typeof raw !== 'string') throw new Error('Expected a single option id')
        const valid = (options ?? []).some((o) => o.id === raw)
        if (!valid) throw new Error('Invalid option selected')
        return raw
      }
      if (fmt.cardinality === 'many') {
        const arr = Array.isArray(raw) ? raw : [raw]
        if (!arr.length) {
          if (required) throw new Error('Select at least one option')
          return null
        }
        const validIds = new Set((options ?? []).map((o) => o.id))
        for (const id of arr) {
          if (!validIds.has(id)) throw new Error('Invalid option selected')
        }
        if (typeConfig?.minSelected !== undefined && arr.length < typeConfig.minSelected) {
          throw new Error(`Select at least ${typeConfig.minSelected} option(s)`)
        }
        if (typeConfig?.maxSelected !== undefined && arr.length > typeConfig.maxSelected) {
          throw new Error(`Select at most ${typeConfig.maxSelected} option(s)`)
        }
        return arr
      }
      throw new Error('Unknown choice cardinality')
    }

    case 'numeric': {
      const num = Number(raw)
      if (Number.isNaN(num)) throw new Error('Expected a number')
      const min = typeConfig?.min ?? fmt.min ?? 0
      const max = typeConfig?.max ?? fmt.max ?? 5
      const step = typeConfig?.step ?? fmt.step ?? 1
      if (num < min || num > max) throw new Error(`Must be between ${min} and ${max}`)
      if (step !== 0) {
        const ratio = (num - min) / step
        // Allow 0.001 tolerance for floating-point noise.
        if (Math.abs(ratio - Math.round(ratio)) > 0.001) {
          throw new Error(`Step must be a multiple of ${step}`)
        }
      }
      return num
    }

    case 'text': {
      if (typeof raw !== 'string') throw new Error('Expected text')
      const max = typeConfig?.maxLength ?? fmt.maxLength ?? 4000
      if (raw.length > max) throw new Error(`Answer is too long (max ${max})`)
      return raw
    }

    case 'ranking': {
      // raw shape: { [optionId]: rank } — ranks are 1-based, ties allowed.
      if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error('Ranking must be a map of optionId → rank')
      }
      const ids = (options ?? []).map((o) => o.id)
      const valid = new Set(ids)
      const ranks = []
      for (const [id, rank] of Object.entries(raw)) {
        if (!valid.has(id)) throw new Error(`Invalid option: ${id}`)
        const n = Number(rank)
        if (Number.isNaN(n) || n < 1) throw new Error('Ranks must be 1 or higher')
        ranks.push(n)
      }
      if (ids.length && Object.keys(raw).length !== ids.length) {
        throw new Error('Every option must be ranked')
      }
      if (typeConfig?.allowTies === false) {
        const set = new Set(ranks)
        if (set.size !== ranks.length) throw new Error('Ties are not allowed')
      }
      if (typeConfig?.minItems !== undefined && ranks.length < typeConfig.minItems) {
        throw new Error(`Rank at least ${typeConfig.minItems} items`)
      }
      return raw
    }

    default:
      throw new Error(`Unsupported question kind: ${fmt.kind}`)
  }
}

export function serializeAnswer(validated) {
  if (validated === null || validated === undefined) return null
  if (typeof validated === 'object') return JSON.stringify(validated)
  return String(validated)
}

// ---------------------------------------------------------------------------
// Analytics — given a list of { question, answers, options, typeDef, typeConfig },
// compute the per-question stats. This is the registry-driven equivalent of
// buildQuestionStats in polling.service.js.
// ---------------------------------------------------------------------------
export function buildAnalytics({ question, answers, options, typeDef, typeConfig, anonymous }) {
  const fmt = typeDef?.answerFormat ?? { kind: 'text' }

  if (fmt.kind === 'text') {
    return {
      kind: 'text',
      responses: answers.map((a) => ({
        text: a.answer,
        respondent: anonymous ? null : a.voter_id,
      })),
    }
  }

  if (fmt.kind === 'numeric') {
    const dist = {}
    const min = typeConfig?.min ?? fmt.min ?? 1
    const max = typeConfig?.max ?? fmt.max ?? 5
    for (let n = min; n <= max; n += typeConfig?.step ?? fmt.step ?? 1) {
      dist[n] = 0
    }
    for (const a of answers) {
      const n = Number(a.answer)
      if (dist[n] !== undefined) dist[n]++
    }
    const total = answers.length
    return {
      kind: 'numeric',
      distribution: Object.entries(dist).map(([k, count]) => ({
        value: Number(k),
        count,
        percentage: total ? Math.round((count / total) * 10000) / 100 : 0,
      })),
      average: total
        ? Math.round((answers.reduce((s, a) => s + Number(a.answer), 0) / total) * 100) / 100
        : 0,
    }
  }

  if (fmt.kind === 'ranking') {
    // For each option, compute the average rank.
    const ranks = new Map()
    for (const o of options ?? []) ranks.set(o.id, [])
    for (const a of answers) {
      let parsed
      try {
        parsed = typeof a.answer === 'string' ? JSON.parse(a.answer) : a.answer
      } catch {
        continue
      }
      if (!parsed || typeof parsed !== 'object') continue
      for (const [id, rank] of Object.entries(parsed)) {
        if (ranks.has(id)) ranks.get(id).push(Number(rank))
      }
    }
    return {
      kind: 'ranking',
      options: (options ?? []).map((o) => {
        const list = ranks.get(o.id) ?? []
        const avg = list.length ? list.reduce((s, n) => s + n, 0) / list.length : null
        return { optionId: o.id, label: o.label, averageRank: avg, rankedCount: list.length }
      }),
    }
  }

  if (fmt.kind === 'choice') {
    const counts = new Map((options ?? []).map((o) => [o.id, 0]))
    for (const a of answers) {
      if (fmt.cardinality === 'many') {
        let list
        try {
          list = typeof a.answer === 'string' ? JSON.parse(a.answer) : a.answer
        } catch {
          list = [a.answer]
        }
        if (!Array.isArray(list)) list = [list]
        for (const id of list) {
          if (counts.has(id)) counts.set(id, counts.get(id) + 1)
        }
      } else {
        if (counts.has(a.answer)) counts.set(a.answer, counts.get(a.answer) + 1)
      }
    }
    const total = answers.length
    return {
      kind: 'choice',
      cardinality: fmt.cardinality,
      options: (options ?? []).map((o) => {
        const count = counts.get(o.id) ?? 0
        return {
          optionId: o.id,
          label: o.label,
          count,
          percentage: total ? Math.round((count / total) * 10000) / 100 : 0,
        }
      }),
      totalResponses: total,
    }
  }

  return { kind: fmt.kind, responseCount: answers.length }
}
