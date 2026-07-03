// Called from the service layer after mutations.
import { broadcast } from './ws-rooms.js'

export function emitToEvent(eventId, type, data = {}) {
  broadcast(`event:${eventId}`, { type, data, ts: Date.now() })
}

export function emitToEventOrganizer(eventId, type, data = {}) {
  broadcast(`event:${eventId}:organizer`, { type, data, ts: Date.now() })
}

export function emitToEventVoters(eventId, type, data = {}) {
  broadcast(`event:${eventId}:voters`, { type, data, ts: Date.now() })
}

export function emitToUser(userId, type, data = {}) {
  broadcast(`user:${userId}`, { type, data, ts: Date.now() })
}

export function emitToRole(role, type, data = {}) {
  broadcast(`role:${role}`, { type, data, ts: Date.now() })
}
