import api from '@/services/api'
const owned=(e,c)=>`/organizer/competition/events/${e}/competitions/${c}/results`
export const nativeResultsService={
 owned:(e,c,r)=>api.get(owned(e,c),{params:r==null?{}:{roundId:r}}),
 publish:(e,c,body)=>api.post(`${owned(e,c)}/publication`,body),
 export:(e,c,params)=>api.get(`${owned(e,c)}/export`,{params,responseType:'blob'}),
 public:(e,c,r)=>api.get(`/public/competition/events/${e}/competitions/${c}/results`,{params:r==null?{}:{roundId:r}}),
}
