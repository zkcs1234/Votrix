import { db, wrap } from '../foundation/db.js'
import { DB_TABLES, EVENT_STATUS } from '../utils/constants.js'
import { getSystemSettings, saveSystemSetting } from './admin.service.js'

const ARCHIVAL_POLICY_KEY = 'event_archival_policy'

export const DEFAULT_ARCHIVAL_POLICY = {
  enabled: false,
  daysAfterCompletion: 90,
}

function sanitizePolicy(input) {
  const base = { ...DEFAULT_ARCHIVAL_POLICY, ...(input ?? {}) }
  return {
    enabled: Boolean(base.enabled),
    daysAfterCompletion: Math.min(
      Math.max(1, Number(base.daysAfterCompletion) || 90),
      3650,
    ),
  }
}

export async function getArchivalPolicy() {
  const settings = await getSystemSettings()
  const setting = settings.find((s) => s.setting_key === ARCHIVAL_POLICY_KEY)
  return sanitizePolicy(setting?.setting_value)
}

export async function updateArchivalPolicy(policy) {
  const sanitized = sanitizePolicy(policy)
  const saved = await saveSystemSetting(
    ARCHIVAL_POLICY_KEY,
    sanitized,
    'Event archival policy',
  )
  return sanitizePolicy(saved?.setting_value ?? sanitized)
}

export async function runArchivalNow() {
  const policy = await getArchivalPolicy()
  if (!policy.enabled) {
    return { archived: 0, message: 'Archival is disabled' }
  }

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - policy.daysAfterCompletion)

  const { data, error } = await db()
    .from(DB_TABLES.EVENTS)
    .update({
      status: EVENT_STATUS.ARCHIVED,
      archived_at: new Date().toISOString(),
    })
    .eq('status', EVENT_STATUS.COMPLETED)
    .lt('end_date', cutoff.toISOString())
    .select('id')

  if (error) {
    return { archived: 0, message: error.message }
  }
  const archived = data?.length ?? 0
  return { archived, message: `Archived ${archived} events older than ${policy.daysAfterCompletion} days` }
}
