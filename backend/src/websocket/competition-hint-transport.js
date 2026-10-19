import {createServer} from 'node:http'
import {createHmac,randomUUID,timingSafeEqual} from 'node:crypto'
import {WebSocket,WebSocketServer} from 'ws'
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
export function safeNativeHint(raw){
 if(!raw||Object.keys(raw).some(k=>!['eventId','competitionId','roundId','sessionId','affectedRoundIds','access','sessionRevision'].includes(k))||!uuid(raw.eventId)||!uuid(raw.competitionId)||raw.roundId!==null&&!uuid(raw.roundId))return null
 if(raw.sessionId!=null&&!uuid(raw.sessionId))return null
 if(raw.affectedRoundIds!==undefined&&(!Array.isArray(raw.affectedRoundIds)||raw.affectedRoundIds.length>100||raw.affectedRoundIds.some(v=>v!==null&&!uuid(v))))return null
 if(raw.access!==undefined&&(!raw.access||Object.keys(raw.access).some(k=>!['kind','targetId','open'].includes(k))||!['entry','criterion'].includes(raw.access.kind)||!uuid(raw.access.targetId)||typeof raw.access.open!=='boolean'||!Number.isSafeInteger(raw.sessionRevision)||raw.sessionRevision<1||!uuid(raw.sessionId)))return null
 if(raw.access===undefined&&raw.sessionRevision!==undefined)return null
 return {eventId:raw.eventId,competitionId:raw.competitionId,roundId:raw.roundId,...(raw.sessionId!==undefined?{sessionId:raw.sessionId}:{}),...(raw.affectedRoundIds?{affectedRoundIds:[...new Set(raw.affectedRoundIds)]}: {}),...(raw.access?{access:{kind:raw.access.kind,targetId:raw.access.targetId,open:raw.access.open},sessionRevision:raw.sessionRevision}:{})}
}
const mac=(secret,text)=>createHmac('sha256',secret).update(text).digest('hex')
const secretCheck=secret=>{if(typeof secret!=='string'||secret.length<32)throw new Error('Shared native hint secret must have at least 32 characters')}
function boundedSeen(map,id,ttl=120000){const now=Date.now();for(const [key,at]of map)if(now-at>ttl)map.delete(key);if(map.has(id))return true;if(map.size>=5000)map.delete(map.keys().next().value);map.set(id,now);return false}
export function createCompetitionHintBroker({secret,host='127.0.0.1',port=0}){
 secretCheck(secret)
 const server=createServer((_req,res)=>{res.writeHead(404);res.end()}),wss=new WebSocketServer({noServer:true,maxPayload:65536}),nonces=new Map(),frames=new Map()
 server.on('upgrade',(req,socket,head)=>{
  const origin=req.headers['x-votrix-instance'],nonce=req.headers['x-votrix-nonce'],at=req.headers['x-votrix-time'],signature=req.headers['x-votrix-mac'],expected=mac(secret,`${origin}:${nonce}:${at}`)
  if(req.url!=='/native-hints'||wss.clients.size>=64||!uuid(origin)||!uuid(nonce)||!Number.isFinite(Number(at))||Math.abs(Date.now()-Number(at))>30000||typeof signature!=='string'||!/^[a-f0-9]{64}$/.test(signature)||!timingSafeEqual(Buffer.from(signature),Buffer.from(expected))||boundedSeen(nonces,nonce)){socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');return}
  wss.handleUpgrade(req,socket,head,ws=>{
   ws.send(JSON.stringify({type:'ready'}));let minute=Date.now(),count=0
   ws.on('message',data=>{
    if(Date.now()-minute>=60000){minute=Date.now();count=0}if(++count>6000){ws.close(1008);return}
    let frame;try{frame=JSON.parse(data)}catch{return ws.close(1008)}
    if(!frame||typeof frame!=='object'||Array.isArray(frame)||Object.keys(frame).some(k=>!['id','origin','sentAt','recipients','hint'].includes(k))||frame.origin!==origin||!uuid(frame.id)||!Number.isSafeInteger(frame.sentAt)||Math.abs(Date.now()-frame.sentAt)>120000||!Array.isArray(frame.recipients)||!frame.recipients.length||frame.recipients.length>512||frame.recipients.some(u=>!uuid(u))||!safeNativeHint(frame.hint)){ws.close(1008);return}
    if(boundedSeen(frames,frame.id))return
    const body=JSON.stringify({...frame,hint:safeNativeHint(frame.hint)})
    for(const peer of wss.clients)if(peer!==ws&&peer.readyState===WebSocket.OPEN){if(peer.bufferedAmount>1024*1024){peer.close(1013);continue}peer.send(body)}
   })
  })
 })
 return {listen:()=>new Promise(r=>server.listen(port,host,()=>r(server.address()))),close:()=>{for(const ws of wss.clients)ws.terminate();wss.close();return new Promise(r=>server.close(r))}}
}
export function createCompetitionHintBridge({url,secret,onHint,onRecovered=()=>{},onState=()=>{},instanceId=randomUUID(),readyTimeoutMs=10000}){
 secretCheck(secret);const target=new URL(url)
 if(!Number.isSafeInteger(readyTimeoutMs)||readyTimeoutMs<50||readyTimeoutMs>30000)throw new Error('Shared hint readiness timeout must be between 50 and 30000 ms')
 if(!['ws:','wss:'].includes(target.protocol)||target.username||target.password||target.pathname!=='/native-hints'||target.protocol==='ws:'&&!['127.0.0.1','localhost','[::1]'].includes(target.hostname))throw new Error('Shared hints require WSS or a loopback test broker')
 let socket,timer,flushTimer,readyTimer,closed=false,connected=false,delay=200,wasConnected=false;const queue=new Map(),seen=new Map()
 const connect=()=>{
  const nonce=randomUUID(),at=String(Date.now());socket=new WebSocket(url,{headers:{'x-votrix-instance':instanceId,'x-votrix-nonce':nonce,'x-votrix-time':at,'x-votrix-mac':mac(secret,`${instanceId}:${nonce}:${at}`)},maxPayload:65536,handshakeTimeout:readyTimeoutMs})
  const opening=socket;readyTimer=setTimeout(()=>opening.terminate(),readyTimeoutMs);readyTimer.unref?.()
  socket.on('message',raw=>{
   let message;try{message=JSON.parse(raw)}catch{return}
   if(!message||typeof message!=='object'||Array.isArray(message))return
   if(message.type==='ready'){clearTimeout(readyTimer);connected=true;delay=200;onState(true);if(wasConnected)onRecovered();wasConnected=true;flush();return}
   if(!message||message.origin===instanceId||!uuid(message.id)||!uuid(message.origin)||!Number.isSafeInteger(message.sentAt)||Math.abs(Date.now()-message.sentAt)>120000||!Array.isArray(message.recipients)||message.recipients.length>512||message.recipients.some(u=>!uuid(u))||!safeNativeHint(message.hint)||boundedSeen(seen,message.id))return
   onHint(message.recipients,safeNativeHint(message.hint))
  })
  socket.on('error',()=>{})
  socket.on('close',()=>{clearTimeout(readyTimer);connected=false;onState(false);if(!closed){timer=setTimeout(connect,delay);timer.unref?.();delay=Math.min(delay*2,5000)}})
 }
 const flush=()=>{
  clearTimeout(flushTimer);if(!connected||socket.readyState!==WebSocket.OPEN)return
  for(const [key,job]of queue){if(socket.bufferedAmount>1024*1024)break;socket.send(JSON.stringify({id:randomUUID(),origin:instanceId,sentAt:Date.now(),recipients:[...job.users],hint:job.hint}));queue.delete(key)}
  if(queue.size){flushTimer=setTimeout(flush,50);flushTimer.unref?.()}
 }
 connect()
 return {publish(userId,raw){const hint=safeNativeHint(raw);if(!uuid(userId)||!hint||closed)return false;const key=JSON.stringify(hint);if(!queue.has(key)){if(queue.size>=1024)queue.delete(queue.keys().next().value);queue.set(key,{hint,users:new Set()})}const job=queue.get(key);if(job.users.size<512)job.users.add(userId);clearTimeout(flushTimer);flushTimer=setTimeout(flush,50);flushTimer.unref?.();return true},close(){closed=true;clearTimeout(timer);clearTimeout(flushTimer);clearTimeout(readyTimer);socket?.terminate()},connected:()=>connected}
}
