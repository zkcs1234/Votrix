import { db, wrap } from '../foundation/db.js'
import { DB_TABLES, USER_ROLES } from '../utils/constants.js'

function escapeIlike(term) {
  return term.replace(/[\\%_]/g, (ch) => `\\${ch}`)
}

export async function searchOrganizers(query, limit = 20) {
  const term = escapeIlike(query)
  const pattern = `%${term}%`
  const result = await db()
    .from(DB_TABLES.USERS)
    .select('id, email, organization_name, organizer_name, role, account_status, created_at')
    .eq('role', USER_ROLES.ORGANIZER)
    .or(`email.ilike.${pattern},organization_name.ilike.${pattern},organizer_name.ilike.${pattern}`)
    .order('created_at', { ascending: false })
    .limit(limit)
  return wrap(result, { context: 'search.searchOrganizers' }) ?? []
}

export async function searchEvents(query, limit = 20) {
  const term = escapeIlike(query)
  const pattern = `%${term}%`
  const result = await db()
    .from(DB_TABLES.EVENTS)
    .select(
      `id, title, event_type, status, start_date, end_date, created_at, organization_id,
       organizations ( organization_name )`,
    )
    .ilike('title', pattern)
    .order('created_at', { ascending: false })
    .limit(limit)
  return wrap(result, { context: 'search.searchEvents' }) ?? []
}

export async function platformSearch(query, { type = 'all', limit = 20 } = {}) {
  const trimmed = String(query ?? '').trim()
  if (!trimmed) {
    return { organizers: [], events: [] }
  }
  const safeLimit = Math.min(Math.max(1, Number(limit) || 20), 50)
  const result = { organizers: [], events: [] }
  if (type === 'all' || type === 'organizer') {
    result.organizers = await searchOrganizers(trimmed, safeLimit)
  }
  if (type === 'all' || type === 'event') {
    result.events = await searchEvents(trimmed, safeLimit)
  }
  return result
}
