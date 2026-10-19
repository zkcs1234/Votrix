import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { createServer } from 'node:http'
import WebSocket from 'ws'
import request from 'supertest'
const fixture=vi.hoisted(()=>({origin:'https://trusted.example',preview:'https://votrix-approved-preview.vercel.app'}))
vi.mock('../../src/config/env.js',()=>({isProduction:false,env:{nodeEnv:'test',clientUrl:fixture.origin,clientOrigins:[fixture.origin,fixture.preview],websocket:{maxConnectionsPerUser:3,maxConnections:100},jwt:{accessCookieName:'votrix_access',refreshCookieName:'votrix_refresh',accessSecret:'fixture-access',refreshSecret:'fixture-refresh',accessExpiresIn:'15m',refreshExpiresIn:'7d'},cookie:{sameSite:'none'},csrf:{cookieName:'votrix_csrf',headerName:'x-csrf-token',secret:'fixture-secret-longer-than-32-characters'},supabase:{},cloudinary:{},resend:{}}}))
vi.mock('../../src/config/database.js',()=>({getSupabase:()=>null,checkDatabaseConnection:async()=>({connected:false})}))
vi.mock('../../src/config/cloudinary.js',()=>({configureCloudinary:vi.fn(),cloudinary:{}}))
vi.mock('../../src/websocket/ws-authorization.js',()=>({socketIdentity:async(req,cookies)=>{
 req.cookies=cookies
 if(!cookies.fixture_user)throw new Error('Fixture unauthorized')
 return{id:cookies.fixture_user,role:'participant'}
},canSubscribeToRoom:async(user,room)=>!room.endsWith(':organizer')&&room===`user:${user.id}`}))
vi.mock('../../src/foundation/db.js',()=>({db:()=>({from:()=>{const q={select:()=>q,eq:()=>q,then:resolve=>resolve({data:[],error:null})};return q}})}))
import { createApp } from '../../src/app.js'
import { isTrustedOrigin, normalizeOrigin } from '../../src/config/trusted-origins.js'
import { attachWebSocketServer } from '../../src/websocket/ws-server.js'

describe('exact trusted deployments',()=>{
 test('canonicalizes exact origins but rejects arbitrary tenants, wildcard/path/credential origins',()=>{
  expect(normalizeOrigin('https://TRUSTED.example/')).toBe(fixture.origin)
  expect(isTrustedOrigin(fixture.preview,[fixture.origin,fixture.preview])).toBe(true)
  for(const origin of ['https://other.vercel.app','https://trusted.example.evil.test','https://trusted.example/path','null','https://user@trusted.example','https://*.vercel.app']) expect(isTrustedOrigin(origin,[fixture.origin,fixture.preview])).toBe(false)
 })
 test('actual HTTP CORS exposes CSRF only to named deployment origins',async()=>{
  const app=createApp()
  for(const origin of [fixture.origin,fixture.preview]){
   const response=await request(app).get('/api/auth/csrf').set('Origin',origin)
   expect(response.status).toBe(200);expect(response.headers['access-control-allow-origin']).toBe(origin);expect(response.headers['access-control-allow-credentials']).toBe('true')
  }
  const prior=process.env.ALLOW_VERCEL_PREVIEWS;process.env.ALLOW_VERCEL_PREVIEWS='true'
  try{
   const response=await request(app).get('/api/auth/csrf').set('Origin','https://other.vercel.app')
   expect(response.headers['access-control-allow-origin']).toBeUndefined()
   const mutation=await request(app).post('/api/auth/logout').set('Origin','https://other.vercel.app')
   expect(mutation.status).toBe(403)
  }finally{if(prior===undefined)delete process.env.ALLOW_VERCEL_PREVIEWS;else process.env.ALLOW_VERCEL_PREVIEWS=prior}
 })
})

describe('authenticated WebSocket capacity on a shared network',()=>{
 let http,wss,address
 const sockets=[]
 const open=(user,origin=fixture.origin)=>new Promise(resolve=>{
  const socket=new WebSocket(address,{headers:{Origin:origin,...(user?{Cookie:`fixture_user=${user}`}:{})}});sockets.push(socket)
  socket.once('open',()=>resolve({socket,status:101}))
  socket.once('unexpected-response',(_request,response)=>{response.resume();socket.terminate();resolve({socket,status:response.statusCode})})
  socket.on('error',()=>{})
 })
 beforeAll(async()=>{
  http=createServer((_req,res)=>{res.statusCode=404;res.end()});wss=attachWebSocketServer(http)
  await new Promise(resolve=>http.listen(0,'127.0.0.1',resolve));address=`ws://127.0.0.1:${http.address().port}/ws`
 })
 afterAll(async()=>{
  for(const socket of sockets)socket.terminate()
  for(const socket of wss.clients)socket.terminate()
  await new Promise(resolve=>wss.close(resolve));await new Promise(resolve=>http.close(resolve))
 })
 test('more than ten independent judges sharing the same peer address all connect',async()=>{
  const results=await Promise.all(Array.from({length:20},(_,index)=>open(`judge-${index}`)))
  expect(results.map(result=>result.status)).toEqual(Array(20).fill(101))
 })
 test('limits redundant tabs by authenticated user, releases capacity on close, and denies untrusted/unauthenticated requests',async()=>{
  const results=await Promise.all([open('one-user'),open('one-user'),open('one-user')]);expect(results.every(result=>result.status===101)).toBe(true)
  expect((await open('one-user')).status).toBe(429)
  const closed=new Promise(resolve=>results[0].socket.once('close',resolve));results[0].socket.close();await closed
  // The server's close accounting follows the peer close event.
  await new Promise(resolve=>setTimeout(resolve,20))
  expect((await open('one-user')).status).toBe(101)
  expect((await open('arbitrary','https://other.vercel.app')).status).toBe(403)
  expect((await open(null)).status).toBe(401)
 })
})
