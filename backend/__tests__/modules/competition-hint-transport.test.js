import {expect,test} from 'vitest'
import {safeNativeHint,createCompetitionHintBridge} from '../../src/websocket/competition-hint-transport.js'
import {WebSocketServer} from 'ws'
const uuid='10000000-0000-4000-8000-000000000001',hint={eventId:uuid,competitionId:uuid,roundId:null}
test('a broker that upgrades but never becomes ready is disconnected and retried',async()=>{
 const server=new WebSocketServer({host:'127.0.0.1',port:0});await new Promise(resolve=>server.once('listening',resolve))
 let connections=0;server.on('connection',socket=>{connections++;socket.on('error',()=>{})})
 const bridge=createCompetitionHintBridge({url:`ws://127.0.0.1:${server.address().port}/native-hints`,secret:'a'.repeat(40),onHint:()=>{},readyTimeoutMs:60})
 try{const deadline=Date.now()+3000;while(connections<2&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,20));expect(connections).toBeGreaterThanOrEqual(2);expect(bridge.connected()).toBe(false)}
 finally{bridge.close();for(const client of server.clients)client.terminate();await new Promise(resolve=>server.close(resolve))}
})
test('only score-free scoped native hints and strong internal transport configuration are accepted',()=>{expect(safeNativeHint(hint)).toEqual(hint);expect(safeNativeHint({...hint,scores:{secret:90}})).toBeNull();expect(safeNativeHint({...hint,roundId:'other'})).toBeNull();expect(safeNativeHint(null)).toBeNull();const accessHint={...hint,sessionId:uuid,access:{kind:'entry',targetId:uuid,open:true},sessionRevision:2};expect(safeNativeHint(accessHint)).toEqual(accessHint);expect(safeNativeHint({...accessHint,access:{...accessHint.access,open:'yes'}})).toBeNull();expect(safeNativeHint({...accessHint,scores:{secret:90}})).toBeNull();expect(()=>createCompetitionHintBridge({url:'ws://remote.invalid/native-hints',secret:'a'.repeat(40)})).toThrow('WSS');expect(()=>createCompetitionHintBridge({url:'ws://127.0.0.1/native-hints',secret:'short'})).toThrow('32')})
