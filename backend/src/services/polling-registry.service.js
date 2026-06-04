import { getSupabase } from '../config/database.js'
import { ApiError } from '../utils/ApiError.js'
import { DB_TABLES } from '../utils/constants.js'

// Phase 7 — Registry loader.
// Returns the effective list of question types for a given organizer (or
// for an admin who does not pass an organization). Built-ins are always
// included; per-organization overrides shadow built-ins with the same key.

function getClient() {
  const client = getSupabase()
  if (!client) throw new ApiError(503, 'Database is not configured')
  return client
}

const BUILTIN_FALLBACKS = [
  // The engine falls back to a minimal built-in list if the registry table
  // is empty for some reason (e.g. a fresh DB with the migration not yet
  // applied). This keeps the API usable rather than 500ing.
  {
    key: 'single_choice',
    label: 'Single Choice',
    description: 'Respondents pick exactly one option.',
    answerFormat: { kind: 'choice', cardinality: 'one', value: 'option_id' },
    configSchema: {},
    ui: { input: 'radio', optionEditor: 'options' },
    sortOrder: 10,
  },
  {
    key: 'checkbox',
    label: 'Multiple Selection',
    description: 'Respondents can pick any number of options.',
    answerFormat: { kind: 'choice', cardinality: 'many', value: 'option_ids' },
    configSchema: {},
    ui: { input: 'checkbox', optionEditor: 'options' },
    sortOrder: 30,
  },
  {
    key: 'yes_no',
    label: 'Yes / No',
    description: 'A binary question.',
    answerFormat: {
      kind: 'choice',
      cardinality: 'one',
      value: 'option_id',
      autoOptions: ['Yes', 'No'],
    },
    configSchema: {},
    ui: { input: 'radio', autoOptions: true },
    sortOrder: 40,
  },
  {
    key: 'rating',
    label: 'Rating Scale',
    description: 'Numeric rating. Default 1–5.',
    answerFormat: { kind: 'numeric', min: 1, max: 5, step: 1 },
    configSchema: {},
    ui: { input: 'rating' },
    sortOrder: 50,
  },
  {
    key: 'open_text',
    label: 'Open Text',
    description: 'Free-form text answer.',
    answerFormat: { kind: 'text', maxLength: 4000 },
    configSchema: {},
    ui: { input: 'textarea' },
    sortOrder: 70,
  },
]

function mapRow(row) {
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

export async function loadQuestionTypeRegistry(organizationId = null) {
  const [{ data: system, error: sysErr }, { data: custom, error: custErr }] = await Promise.all([
    getClient()
      .from(DB_TABLES.SYSTEM_POLL_QUESTION_TYPES)
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
    organizationId
      ? getClient()
          .from(DB_TABLES.POLL_QUESTION_TYPES_REGISTRY)
          .select('*')
          .or(`organization_id.is.null,organization_id.eq.${organizationId}`)
          .eq('is_active', true)
          .order('sort_order', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ])

  if (sysErr) throw new ApiError(500, sysErr.message)
  if (custErr) throw new ApiError(500, custErr.message)

  const byKey = new Map()
  for (const row of system ?? []) byKey.set(row.key, mapRow(row))
  for (const row of custom ?? []) byKey.set(row.key, mapRow(row)) // overrides win

  let list = Array.from(byKey.values())
  if (list.length === 0) list = BUILTIN_FALLBACKS.slice()
  list.sort((a, b) => a.sortOrder - b.sortOrder)
  return list
}

export async function findQuestionType(organizationId, key) {
  const registry = await loadQuestionTypeRegistry(organizationId)
  return registry.find((r) => r.key === key) ?? null
}

export async function requireQuestionType(organizationId, key) {
  const t = await findQuestionType(organizationId, key)
  if (!t) throw new ApiError(400, `Unknown question type: ${key}`)
  return t
}

// Custom-type admin endpoints (organizer-scoped).
export async function listCustomTypes(organizationId) {
  if (!organizationId) return []
  const { data, error } = await getClient()
    .from(DB_TABLES.POLL_QUESTION_TYPES_REGISTRY)
    .select('*')
    .eq('organization_id', organizationId)
    .order('sort_order', { ascending: true })
  if (error) throw new ApiError(500, error.message)
  return (data ?? []).map(mapRow)
}

export async function createCustomType(organizationId, payload) {
  if (!organizationId) throw new ApiError(400, 'organizationId is required')
  const { data, error } = await getClient()
    .from(DB_TABLES.POLL_QUESTION_TYPES_REGISTRY)
    .insert({
      organization_id: organizationId,
      key: payload.key,
      label: payload.label,
      description: payload.description ?? null,
      answer_format: payload.answerFormat,
      config_schema: payload.configSchema ?? {},
      ui: payload.ui ?? {},
      sort_order: payload.sortOrder ?? 100,
      is_active: payload.isActive !== false,
    })
    .select('*')
    .single()
  if (error) {
    if (error.code === '23505') {
      throw new ApiError(409, 'A custom type with this key already exists for this organization')
    }
    throw new ApiError(500, error.message)
  }
  return mapRow(data)
}

export async function updateCustomType(organizationId, id, payload) {
  const updates = {}
  if (payload.label !== undefined) updates.label = payload.label
  if (payload.description !== undefined) updates.description = payload.description
  if (payload.answerFormat !== undefined) updates.answer_format = payload.answerFormat
  if (payload.configSchema !== undefined) updates.config_schema = payload.configSchema
  if (payload.ui !== undefined) updates.ui = payload.ui
  if (payload.sortOrder !== undefined) updates.sort_order = payload.sortOrder
  if (payload.isActive !== undefined) updates.is_active = payload.isActive

  const { data, error } = await getClient()
    .from(DB_TABLES.POLL_QUESTION_TYPES_REGISTRY)
    .update(updates)
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select('*')
    .single()
  if (error) throw new ApiError(500, error.message)
  if (!data) throw new ApiError(404, 'Custom type not found')
  return mapRow(data)
}

export async function deleteCustomType(organizationId, id) {
  const { error } = await getClient()
    .from(DB_TABLES.POLL_QUESTION_TYPES_REGISTRY)
    .delete()
    .eq('id', id)
    .eq('organization_id', organizationId)
  if (error) throw new ApiError(500, error.message)
}
