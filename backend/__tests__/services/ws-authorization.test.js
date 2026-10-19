import { expect,test,vi } from 'vitest'
const response=vi.hoisted(()=>({data:null,error:null}))
vi.mock('../../src/foundation/db.js',()=>({db:()=>({from:()=>{const chain={select:()=>chain,eq:()=>chain,maybeSingle:async()=>response};return chain}})}))
import { canSubscribeToRoom } from '../../src/websocket/ws-authorization.js'
const id='10000000-0000-0000-0000-000000000001',event='20000000-0000-0000-0000-000000000001'
test('personal rooms cannot be claimed across accounts',async()=>{expect(await canSubscribeToRoom({id,role:'participant'},`user:someone-else`)).toBe(false)})
test('participant requires active enrollment and cannot join organizer room',async()=>{
 response.data={id:'enrollment',is_active:true}
 expect(await canSubscribeToRoom({id,role:'participant'},`event:${event}:organizer`)).toBe(false)
 expect(await canSubscribeToRoom({id,role:'participant'},`event:${event}:voters`)).toBe(true)
 response.data={id:'enrollment',is_active:false};expect(await canSubscribeToRoom({id,role:'participant'},`event:${event}`)).toBe(false)
})
test('organizer cannot subscribe to another tenant',async()=>{response.data={organizations:{organizer_id:'other'}};expect(await canSubscribeToRoom({id,role:'organizer'},`event:${event}:organizer`)).toBe(false)})
