import { authenticate, requireActiveAccount, requirePasswordChanged } from '../middleware/auth.js'
import { db } from '../foundation/db.js'

const run = (middleware, req) => new Promise((resolve, reject) => middleware(req, {}, error => error ? reject(error) : resolve()))

export async function socketIdentity(req, cookies) {
  req.cookies = cookies
  await run(authenticate, req)
  await run(requireActiveAccount, req)
  await run(requirePasswordChanged, req)
  return req.user
}

export async function canSubscribeToRoom(user, room) {
  if (room === `user:${user.id}` || room === `role:${user.role}`) return true
  const match = /^event:([0-9a-f-]{36})(?::(organizer|voters))?$/i.exec(room)
  if (!match) return false
  const eventId = match[1]
  if (user.role === 'organizer') {
    const { data, error } = await db().from('events').select('organizations!inner(organizer_id)').eq('id', eventId).maybeSingle()
    return !error && data?.organizations?.organizer_id === user.id && match[2] !== 'voters'
  }
  if (['participant', 'voter'].includes(user.role) && match[2] !== 'organizer') {
    const { data, error } = await db().from('event_participants').select('id,is_active').eq('event_id', eventId).eq('user_id', user.id).maybeSingle()
    return !error && !!data && data.is_active !== false
  }
  return false
}
