// Called from the service layer after mutations.
import { broadcast,reconcileNativeUserRooms } from './ws-rooms.js'
import {createCompetitionHintBridge,safeNativeHint} from './competition-hint-transport.js'
let nativeBridge=null
export function configureCompetitionHintTransport({url,secret}={}){
 nativeBridge?.close();nativeBridge=null
 if(!url&&!secret)return null
 if(!url||!secret)throw new Error('Shared hint URL and secret must be configured together')
 nativeBridge=createCompetitionHintBridge({url,secret,onHint:(users,hint)=>{for(const user of new Set(users))broadcast(`user:${user}`,{type:'competition:native-invalidated',data:hint,ts:Date.now()})},onRecovered:reconcileNativeUserRooms})
 return nativeBridge
}

export function emitToEvent(eventId, type, data = {}) {
  // Provisional judge scores and standings are organizer-only.
  if (type === 'rankings:updated') return emitToEventOrganizer(eventId, type, data)
  broadcast(`event:${eventId}`, { type, data, ts: Date.now() })
}

export function emitToEventOrganizer(eventId, type, data = {}) {
  broadcast(`event:${eventId}:organizer`, { type, data, ts: Date.now() })
}

export function emitToEventVoters(eventId, type, data = {}) {
  broadcast(`event:${eventId}:voters`, { type, data, ts: Date.now() })
}

export function emitToUser(userId, type, data = {}) {
  if(type==='competition:native-invalidated'){
    const hint=safeNativeHint(data);if(!hint)return
    broadcast(`user:${userId}`,{type,data:hint,ts:Date.now()});nativeBridge?.publish(userId,hint);return
  }
  broadcast(`user:${userId}`, { type, data, ts: Date.now() })
}

export function emitToRole(role, type, data = {}) {
  broadcast(`role:${role}`, { type, data, ts: Date.now() })
}
