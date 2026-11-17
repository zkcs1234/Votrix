import { authenticate, requireActiveAccount, requirePasswordChanged } from '../middleware/auth.js'
import { db } from '../foundation/db.js'
import { findActiveOfficership } from '../services/organization-officer.service.js'
import { assertPlatformAvailableFor } from '../services/platform-settings.service.js'

const run = (middleware, req) => new Promise((resolve, reject) => middleware(req, {}, error => error ? reject(error) : resolve()))

export async function socketIdentity(req, cookies) {
  req.cookies = cookies
  await run(authenticate, req)
  await run(requireActiveAccount, req)
  await run(requirePasswordChanged, req)
  // Maintenance mode: non-admin sockets are refused, and (because the heartbeat
  // re-runs this) existing ones are closed shortly after maintenance starts.
  await assertPlatformAvailableFor(req.user.role)
  return req.user
}

// The organizer whose events this socket user may follow in the organizer
// channel: themselves for an organizer, or — for a student — the owner of their
// ACTIVE officership. Re-read at every subscribe (no cache), so a deactivated
// officer is refused on the next subscribe.
async function organizerIdFor(user) {
  if (user.role === 'organizer') return user.id
  if (!['participant', 'voter'].includes(user.role)) return null
  const officership = await findActiveOfficership(user.id).catch(() => null)
  // Guard against an unexpected row shape: only a real active row for THIS user counts.
  if (!officership || officership.student_id !== user.id || officership.status !== 'active') return null
  return officership.organizer_id
}

export async function canSubscribeToRoom(user, room) {
  if (room === `user:${user.id}` || room === `role:${user.role}`) return true
  const match = /^event:([0-9a-f-]{36})(?::(organizer|voters))?$/i.exec(room)
  if (!match) return false
  const eventId = match[1]
  const channel = match[2]

  if (user.role === 'organizer') {
    const { data, error } = await db().from('events').select('organizations!inner(organizer_id)').eq('id', eventId).maybeSingle()
    return !error && data?.organizations?.organizer_id === user.id && channel !== 'voters'
  }

  if (['participant', 'voter'].includes(user.role)) {
    // Ordinary participant access: an active enrollment (never the organizer channel).
    if (channel !== 'organizer') {
      const { data, error } = await db().from('event_participants').select('id,is_active').eq('event_id', eventId).eq('user_id', user.id).maybeSingle()
      if (!error && !!data && data.is_active !== false) return true
    }
    // Student officer: may follow the owner organization's events in the
    // organizer view (the voters channel stays a participant-only channel).
    if (channel !== 'voters') {
      const ownerId = await organizerIdFor(user)
      if (ownerId) {
        const { data, error } = await db().from('events').select('organizations!inner(organizer_id)').eq('id', eventId).maybeSingle()
        return !error && data?.organizations?.organizer_id === ownerId
      }
    }
    return false
  }
  return false
}
