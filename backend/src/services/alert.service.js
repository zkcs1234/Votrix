import { getSystemSettings, saveSystemSetting } from './admin.service.js'
import { recordAudit } from '../foundation/audit.js'
import { db } from '../foundation/db.js'
import { DB_TABLES } from '../utils/constants.js'
import { ApiError } from '../utils/ApiError.js'
import { createAdminAlert } from './notification.service.js'

const ALERT_CONFIG_KEY = 'admin_alert_config'
const ALERT_WINDOW_MINUTES = 15

export const DEFAULT_ALERT_CONFIG = {
  failedEmailDelivery: { enabled: true, threshold: 5 },
  eventCompletion: { enabled: false },
  suspiciousActivity: { enabled: true, failedLoginThreshold: 10 },
}

function validateThreshold(value, label) {
  if (!Number.isInteger(value) || value < 1 || value > 100000) {
    throw new ApiError(400, `${label} must be an integer between 1 and 100000`)
  }
  return value
}

function normalizeAlertConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new ApiError(400, 'Alert configuration must be an object')
  }

  const unknownKeys = Object.keys(config).filter((key) => !(key in DEFAULT_ALERT_CONFIG))
  if (unknownKeys.length > 0) {
    throw new ApiError(400, `Unknown alert configuration: ${unknownKeys.join(', ')}`)
  }

  const merged = {}
  for (const [key, defaults] of Object.entries(DEFAULT_ALERT_CONFIG)) {
    const entry = config[key] ?? {}
    if (typeof entry !== 'object' || Array.isArray(entry) || typeof entry.enabled !== 'boolean') {
      throw new ApiError(400, `${key} must include an enabled boolean`)
    }

    const normalized = { enabled: entry.enabled }
    for (const thresholdKey of Object.keys(defaults).filter((name) => name !== 'enabled')) {
      const value = entry[thresholdKey] ?? defaults[thresholdKey]
      normalized[thresholdKey] = validateThreshold(value, `${key}.${thresholdKey}`)
    }
    merged[key] = normalized
  }

  return merged
}

export async function getAlertConfig() {
  const settings = await getSystemSettings()
  const setting = settings.find((s) => s.setting_key === ALERT_CONFIG_KEY)
  const storedConfig = setting?.setting_value ?? {}

  return Object.fromEntries(
    Object.entries(DEFAULT_ALERT_CONFIG).map(([key, defaults]) => [
      key,
      { ...defaults, ...(storedConfig[key] ?? {}) },
    ]),
  )
}

export async function updateAlertConfig(config) {
  const normalized = normalizeAlertConfig(config)
  await saveSystemSetting(ALERT_CONFIG_KEY, normalized, 'Admin alert configuration')
  return normalized
}

export async function notifyAdminsOfFailedLoginThreshold(email) {
  const alertConfig = (await getAlertConfig()).suspiciousActivity
  if (!alertConfig?.enabled) return null

  const threshold = alertConfig.failedLoginThreshold ?? DEFAULT_ALERT_CONFIG.suspiciousActivity.failedLoginThreshold
  const windowStart = new Date(Date.now() - ALERT_WINDOW_MINUTES * 60_000).toISOString()
  const { count, error } = await db()
    .from(DB_TABLES.AUDIT_LOGS)
    .select('id', { count: 'exact', head: true })
    .eq('action', 'LOGIN_FAILED')
    .gte('created_at', windowStart)
    .contains('details', { email })

  if (error) throw error
  if (count !== threshold) return null

  return createAdminAlert({
    type: 'security.suspicious_activity',
    title: 'Repeated failed login attempts',
    message: `${threshold} failed login attempts were recorded for ${email} within ${ALERT_WINDOW_MINUTES} minutes.`,
    actionUrl: '/admin/audit-logs',
    entity: 'users',
    metadata: { email, failedLoginCount: threshold, windowMinutes: ALERT_WINDOW_MINUTES },
  })
}

export async function notifyAdminsOfFailedEmailDelivery({ recipient }) {
  const alertConfig = (await getAlertConfig()).failedEmailDelivery
  if (!alertConfig?.enabled) return null

  const auditEntry = await recordAudit({
    action: 'EMAIL_DELIVERY_FAILED',
    entity: 'email',
    details: { recipient },
  })
  if (!auditEntry) return null

  const threshold = alertConfig.threshold ?? DEFAULT_ALERT_CONFIG.failedEmailDelivery.threshold
  const windowStart = new Date(Date.now() - ALERT_WINDOW_MINUTES * 60_000).toISOString()
  const { count, error } = await db()
    .from(DB_TABLES.AUDIT_LOGS)
    .select('id', { count: 'exact', head: true })
    .eq('action', 'EMAIL_DELIVERY_FAILED')
    .gte('created_at', windowStart)

  if (error) throw error
  if (count !== threshold) return null

  return createAdminAlert({
    type: 'system.email_delivery_failure',
    title: 'Repeated email delivery failures',
    message: `${threshold} outbound emails failed to send within ${ALERT_WINDOW_MINUTES} minutes.`,
    actionUrl: '/admin/audit-logs',
    entity: 'email',
    metadata: { failedDeliveryCount: threshold, windowMinutes: ALERT_WINDOW_MINUTES },
  })
}

export async function notifyAdminsOfEventCompletion(eventId) {
  const alertConfig = (await getAlertConfig()).eventCompletion
  if (!alertConfig?.enabled) return null

  const { data: event, error } = await db()
    .from(DB_TABLES.EVENTS)
    .select('title, event_type')
    .eq('id', eventId)
    .maybeSingle()

  if (error) throw error

  const title = event?.title || 'An event'
  return createAdminAlert({
    type: 'event.completed',
    title: 'Event completed',
    message: `"${title}" has completed.`,
    actionUrl: '/admin/events',
    entity: 'events',
    entityId: eventId,
    metadata: { eventType: event?.event_type ?? null },
  })
}
