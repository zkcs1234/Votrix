import api from '@/services/api'
const base=(eventId,competitionId,reviewer=false)=>`/${reviewer?'participant':'organizer'}/competition/events/${eventId}/competitions/${competitionId}/tabulation`
export const nativeTabulationService={
 reviewerChoices:eventId=>api.get(`/participant/competition/events/${eventId}/competitions/reviewer-contexts`),
 snapshot:(eventId,competitionId,roundId,reviewer=false)=>api.get(`${base(eventId,competitionId,reviewer)}${reviewer?'/reviewer':''}`,{params:roundId==null?{}:{roundId}}),
 appoint:(eventId,competitionId,participantId)=>api.post(`${base(eventId,competitionId)}/reviewer`,{participantId}),
 calculate:(eventId,competitionId,body)=>api.post(`${base(eventId,competitionId)}/calculate`,body),
 transition:(eventId,competitionId,body,reviewer=false)=>api.post(`${base(eventId,competitionId,reviewer)}/${reviewer?'verify':'finalize'}`,body),
 deduction:(eventId,competitionId,body,reviewer=false)=>api.post(`${base(eventId,competitionId,reviewer)}/deductions`,body),
 qualification:(eventId,competitionId,body,confirm=false)=>api.post(`${base(eventId,competitionId)}/qualification${confirm?'/confirm':''}`,body),
}
