import { db } from '../foundation/db.js'
import { collectRows } from '../foundation/collectRows.js'
import { assertOrganizerOwnsEvent } from './event.service.js'
import { ApiError } from '../utils/ApiError.js'
import { validateUUID } from '../utils/sanitize.js'
import { childCompetitionsEnabled, resolveLegacyCompetitionContext } from '../modules/competition-context.js'

export function childDatabaseError(error) {
  if (!error) return
  if (['42P01', '42703', 'PGRST202', 'PGRST204', 'PGRST205'].includes(error.code)) throw new ApiError(503, 'Competition child schema is unavailable. Complete reviewed migration 103 before enabling this feature.')
  if (error.code === '23505' || /CONFLICT|FROZEN|MAPPING_REQUIRES/.test(error.message ?? '')) throw new ApiError(409, 'Competition identity or participation conflicts with saved records')
  if (/FORBIDDEN/.test(error.message ?? '')) throw new ApiError(403, 'Competition or entry is outside the authorized event')
  if (['23503', '23514', '22P02', '22003'].includes(error.code) || /INVALID|REQUIRED|IMMUTABLE/.test(error.message ?? '')) throw new ApiError(400, 'Invalid child competition operation')
  throw new ApiError(503, 'Child competition operation is unavailable; no fallback context was selected')
}
function enabled() {
  if (!childCompetitionsEnabled()) throw new ApiError(503, 'Child competition foundation is disabled pending database deployment review')
}
async function own(eventId, actor) {
  enabled(); validateUUID(eventId, 'eventId')
  const event = await assertOrganizerOwnsEvent(eventId, actor)
  if (!['pageant', 'competition_scoring'].includes(event.event_type)) throw new ApiError(400, 'A competition event is required')
  return event
}
function text(value, field, max, nullable = false) {
  if (nullable && (value == null || value === '')) return null
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max || /[\u0000-\u001f]/.test(value)) throw new ApiError(400, `Invalid ${field}`)
  return value.trim()
}
async function children(eventId) {
  const { data, error } = await collectRows(() => db().from('competitions').select('*', { count: 'exact' }).eq('event_id', eventId).order('id'))
  childDatabaseError(error); return data ?? []
}
async function mapping(eventId) {
  const { data, error } = await db().from('competition_legacy_contexts').select('*').eq('event_id', eventId).maybeSingle()
  childDatabaseError(error); return data
}
export async function legacyContext(eventId) {
  if (!childCompetitionsEnabled()) return null
  const [contexts, legacy] = await Promise.all([children(eventId), mapping(eventId)])
  return resolveLegacyCompetitionContext(eventId, contexts, legacy)
}
export async function listChildCompetitions(eventId, actor) {
  await own(eventId, actor)
  const [competitions, legacyMapping] = await Promise.all([children(eventId), mapping(eventId)])
  return { competitions, legacyMapping }
}
export async function createChildCompetition(eventId, actor, body = {}) {
  await own(eventId, actor)
  const id = validateUUID(body.id, 'competition id')
  const name = text(body.name, 'competition name', 200)
  const type = text(body.competitionType, 'competition type', 100, true)
  const { data, error } = await db().rpc('competition_create_child', { p_event: eventId, p_actor: actor, p_id: id, p_name: name, p_type: type })
  childDatabaseError(error); return data
}
export async function mapLegacyCompetition(eventId, actor) {
  await own(eventId, actor)
  const { data, error } = await db().rpc('competition_map_legacy_event', { p_event: eventId, p_actor: actor })
  childDatabaseError(error); return data
}
export async function listCompetitionEntries(eventId, actor, competitionId) {
  await own(eventId, actor); validateUUID(competitionId, 'competitionId')
  const { data: child, error: childError } = await db().from('competitions').select('id').eq('event_id', eventId).eq('id', competitionId).maybeSingle()
  childDatabaseError(childError)
  if (!child) throw new ApiError(404, 'Competition not found in this event')
  const { data, error } = await collectRows(() => db().from('competition_entries').select('*', { count: 'exact' }).eq('event_id', eventId).eq('competition_id', competitionId).order('entry_number'))
  childDatabaseError(error); return data ?? []
}
export async function addCompetitionEntry(eventId, actor, competitionId, body = {}) {
  await own(eventId, actor); validateUUID(competitionId, 'competitionId'); validateUUID(body.contestantId, 'contestantId')
  if (body.entryNumber !== undefined && (!Number.isInteger(body.entryNumber) || body.entryNumber < 1 || body.entryNumber > 2147483647)) throw new ApiError(400, 'entryNumber must be a positive integer')
  const { data, error } = await db().rpc('competition_add_entry', { p_event: eventId, p_actor: actor, p_competition: competitionId, p_entry: body.contestantId, p_number: body.entryNumber ?? null })
  childDatabaseError(error); return data
}
