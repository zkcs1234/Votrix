import { db } from '../foundation/db.js'
import { ApiError } from '../utils/ApiError.js'

export async function listEmailDeliveryLogs({
  page = 1,
  limit = 50,
  search = '',
  workflow = '',
  providerStatus = '',
  startDate = '',
  endDate = '',
}) {
  const client = db()
  const offset = (page - 1) * limit
  const columns = [
    'id',
    'workflow',
    'recipient',
    'subject',
    'event_id',
    'user_id',
    'template_name',
    'provider_status',
    'provider_message_id',
    'provider_error',
    'retryable',
    'created_at',
    'updated_at',
  ].join(', ')

  let countQuery = client.from('email_delivery_logs').select('id', { count: 'exact', head: true })
  let rowsQuery = client
    .from('email_delivery_logs')
    .select(columns)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (search) {
    const pattern = `%${search.replace(/[%_,]/g, ' ').trim()}%`
    countQuery = countQuery.ilike('recipient', pattern)
    rowsQuery = rowsQuery.ilike('recipient', pattern)
  }
  if (workflow) {
    countQuery = countQuery.eq('workflow', workflow)
    rowsQuery = rowsQuery.eq('workflow', workflow)
  }
  if (providerStatus) {
    countQuery = countQuery.eq('provider_status', providerStatus)
    rowsQuery = rowsQuery.eq('provider_status', providerStatus)
  }
  if (startDate) {
    countQuery = countQuery.gte('created_at', startDate)
    rowsQuery = rowsQuery.gte('created_at', startDate)
  }
  if (endDate) {
    countQuery = countQuery.lte('created_at', endDate)
    rowsQuery = rowsQuery.lte('created_at', endDate)
  }

  const [{ count, error: countError }, { data, error: rowsError }] = await Promise.all([
    countQuery,
    rowsQuery,
  ])
  if (countError) throw new ApiError(500, `Failed to count email delivery logs: ${countError.message}`)
  if (rowsError) throw new ApiError(500, `Failed to load email delivery logs: ${rowsError.message}`)

  return { logs: data ?? [], total: count ?? 0 }
}

export async function recordEmailAudit({
  workflow,
  recipient,
  subject,
  eventId,
  userId,
  templateName,
  dedupeKey,
  providerStatus = 'queued',
  providerMessageId = null,
  providerError = null,
  retryable = false,
  rawPayload = null,
}) {
  try {
    const client = db()
    const { error } = await client.from('email_delivery_logs').insert({
      workflow,
      recipient,
      subject,
      event_id: eventId || null,
      user_id: userId || null,
      template_name: templateName || null,
      dedupe_key: dedupeKey || null,
      provider_status: providerStatus,
      provider_message_id: providerMessageId || null,
      provider_error: providerError || null,
      retryable,
      raw_payload: rawPayload || null,
    })

    if (error) {
      console.warn('[emailAudit] failed to insert delivery log:', error.message)
    }
  } catch (error) {
    console.warn('[emailAudit] database unavailable for delivery log:', error.message)
  }
}

export async function updateEmailAuditStatus({
  dedupeKey,
  workflow,
  lookupProviderMessageId,
  providerStatus,
  providerMessageId = null,
  providerError = null,
  retryable = false,
}) {
  if (!dedupeKey && !workflow && !lookupProviderMessageId) return

  try {
    const client = db()
    let query = client.from('email_delivery_logs').select('id').order('created_at', { ascending: false }).limit(1)

    if (dedupeKey) {
      query = query.eq('dedupe_key', dedupeKey)
    }

    if (workflow) {
      query = query.eq('workflow', workflow)
    }
    if (lookupProviderMessageId) {
      query = query.eq('provider_message_id', lookupProviderMessageId)
    }

    const { data, error } = await query
    if (error || !data || data.length === 0) return

    const [{ id }] = data
    const { error: updateError } = await client
      .from('email_delivery_logs')
      .update({
        provider_status: providerStatus,
        provider_message_id: providerMessageId || lookupProviderMessageId || null,
        provider_error: providerError || null,
        retryable,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (updateError) {
      console.warn('[emailAudit] failed to update delivery log status:', updateError.message)
    }
  } catch (error) {
    console.warn('[emailAudit] database unavailable while updating status:', error.message)
  }
}

export async function getEmailUsageCounts({ workflow = null, sinceIso = null }) {
  try {
    const client = db()
    let query = client.from('email_delivery_logs').select('id', { count: 'exact', head: true })

    if (workflow) {
      query = query.eq('workflow', workflow)
    }

    if (sinceIso) {
      query = query.gte('created_at', sinceIso)
    }

    const { count, error } = await query
    if (error) throw error

    return { total: count || 0 }
  } catch (error) {
    console.warn('[emailAudit] usage lookup failed:', error.message)
    return { total: 0 }
  }
}
