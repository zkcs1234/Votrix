import { env } from '../config/env.js'
import { db } from '../foundation/db.js'
import { recordEmailAudit, getEmailUsageCounts } from './emailAudit.service.js'

const dailyUsage = new Map()
const monthlyUsage = new Map()
const dedupeCache = new Map()

const DEFAULT_DAILY_LIMIT = 50
const DEFAULT_MONTHLY_LIMIT = 1000
const DEFAULT_BULK_BATCH_LIMIT = 25
const DEFAULT_DEDUPE_WINDOW_MS = 300000

function parsePositiveInt(value, fallback) {
  const raw = Number.parseInt(value ?? '', 10)
  if (!Number.isFinite(raw) || raw <= 0) return fallback
  return raw
}

function getDateParts() {
  const now = new Date()
  const day = now.toISOString().slice(0, 10)
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
  return { day, month }
}

function pruneExpiredEntries() {
  const now = Date.now()
  const windowMs = getEmailQuotaSettings().dedupeWindowMs
  for (const [key, timestamp] of dedupeCache.entries()) {
    if (now - timestamp > windowMs) {
      dedupeCache.delete(key)
    }
  }
}

export function getEmailQuotaSettings() {
  return {
    dailyLimit: parsePositiveInt(env.resend.dailyLimit, DEFAULT_DAILY_LIMIT),
    monthlyLimit: parsePositiveInt(env.resend.monthlyLimit, DEFAULT_MONTHLY_LIMIT),
    bulkBatchLimit: parsePositiveInt(env.resend.bulkBatchLimit, DEFAULT_BULK_BATCH_LIMIT),
    dedupeWindowMs: parsePositiveInt(env.resend.dedupeWindowMs, DEFAULT_DEDUPE_WINDOW_MS),
  }
}

export function buildEmailDedupeKey({ to, subject, workflow, eventId, userId, template }) {
  const pieces = [
    workflow || 'general-email',
    eventId || 'global',
    userId || 'anonymous',
    String(to || '').trim().toLowerCase(),
    String(subject || '').trim(),
    String(template || '').trim(),
  ]

  return pieces.join(':')
}

async function checkDatabaseUsage({ dayKey, monthKey }) {
  try {
    const client = db()
    const now = new Date()
    const dayIso = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0)).toISOString()
    const monthIso = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)).toISOString()

    const [dailyRes, monthlyRes] = await Promise.all([
      client
        .from('email_delivery_logs')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', dayIso)
        .in('provider_status', ['queued', 'sent', 'delivered', 'delivery_delayed', 'bounced', 'complained', 'opened', 'clicked', 'failed']),
      client
        .from('email_delivery_logs')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', monthIso)
        .in('provider_status', ['queued', 'sent', 'delivered', 'delivery_delayed', 'bounced', 'complained', 'opened', 'clicked', 'failed']),
    ])

    if (dailyRes.error) throw dailyRes.error
    if (monthlyRes.error) throw monthlyRes.error

    return {
      dailyCount: dailyRes.count || 0,
      monthlyCount: monthlyRes.count || 0,
    }
  } catch (error) {
    return {
      dailyCount: dailyUsage.get(dayKey) || 0,
      monthlyCount: monthlyUsage.get(monthKey) || 0,
    }
  }
}

async function checkDatabaseDuplicate(normalizedKey, dedupeWindowMs) {
  try {
    const client = db()
    const windowStart = new Date(Date.now() - dedupeWindowMs).toISOString()
    const { data, error } = await client
      .from('email_delivery_logs')
      .select('id')
      .eq('dedupe_key', normalizedKey)
      .gte('created_at', windowStart)
      .limit(1)

    if (error) throw error
    return Boolean(data && data.length > 0)
  } catch (error) {
    return Boolean(dedupeCache.get(normalizedKey) && Date.now() - dedupeCache.get(normalizedKey) <= dedupeWindowMs)
  }
}

export async function checkAndRecordEmailSend({
  to,
  subject,
  workflow = 'general-email',
  eventId,
  userId,
  template,
  dedupeKey,
}) {
  const settings = getEmailQuotaSettings()
  pruneExpiredEntries()

  const normalizedKey = dedupeKey || buildEmailDedupeKey({ to, subject, workflow, eventId, userId, template })
  const duplicateFound = await checkDatabaseDuplicate(normalizedKey, settings.dedupeWindowMs)
  if (duplicateFound) {
    await recordEmailAudit({
      workflow,
      recipient: to,
      subject,
      eventId,
      userId,
      templateName: template || null,
      dedupeKey: normalizedKey,
      providerStatus: 'skipped_duplicate',
      providerError: 'Duplicate email request suppressed within the dedupe window.',
    })
    return {
      allowed: false,
      duplicate: true,
      reason: 'Duplicate email request suppressed within the dedupe window.',
      dedupeWindowMs: settings.dedupeWindowMs,
    }
  }

  const { day, month } = getDateParts()
  const metrics = await checkDatabaseUsage({ dayKey: day, monthKey: month })
  const dailyCount = metrics.dailyCount
  const monthlyCount = metrics.monthlyCount

  if (dailyCount + 1 > settings.dailyLimit) {
    await recordEmailAudit({
      workflow,
      recipient: to,
      subject,
      eventId,
      userId,
      templateName: template || null,
      dedupeKey: normalizedKey,
      providerStatus: 'skipped_quota',
      providerError: `Daily email quota exceeded (${settings.dailyLimit}).`,
    })
    return {
      allowed: false,
      duplicate: false,
      reason: `Daily email quota exceeded (${settings.dailyLimit}).`,
      quotaType: 'daily',
      limit: settings.dailyLimit,
    }
  }

  if (monthlyCount + 1 > settings.monthlyLimit) {
    await recordEmailAudit({
      workflow,
      recipient: to,
      subject,
      eventId,
      userId,
      templateName: template || null,
      dedupeKey: normalizedKey,
      providerStatus: 'skipped_quota',
      providerError: `Monthly email quota exceeded (${settings.monthlyLimit}).`,
    })
    return {
      allowed: false,
      duplicate: false,
      reason: `Monthly email quota exceeded (${settings.monthlyLimit}).`,
      quotaType: 'monthly',
      limit: settings.monthlyLimit,
    }
  }

  dedupeCache.set(normalizedKey, Date.now())
  dailyUsage.set(day, dailyCount + 1)
  monthlyUsage.set(month, monthlyCount + 1)

  try {
    await recordEmailAudit({
      workflow,
      recipient: to,
      subject,
      eventId,
      userId,
      templateName: template || null,
      dedupeKey: normalizedKey,
      providerStatus: 'queued',
    })
  } catch (error) {
    console.warn('[emailGuard] audit record failed:', error.message)
  }

  return {
    allowed: true,
    duplicate: false,
    reason: 'Email allowed.',
    dailyLimit: settings.dailyLimit,
    monthlyLimit: settings.monthlyLimit,
  }
}
