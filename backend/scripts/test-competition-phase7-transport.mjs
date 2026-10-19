// Demonstrates the current room registry's process boundary without new infra.
import {spawn} from 'node:child_process'
import {writeFileSync} from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {emitToUser} from '../src/websocket/ws-emitter.js'
const root=path.resolve(import.meta.dirname,'../..'),moduleUrl=new URL('../src/websocket/ws-rooms.js',import.meta.url).href
const child=spawn(process.execPath,['--input-type=module','-e',`import{joinRoom,broadcast}from${JSON.stringify(moduleUrl)};let delivered=0;joinRoom({readyState:1,send:()=>delivered++},'user:test-user');process.send({ready:true});process.on('message',m=>{if(m==='local')broadcast('user:test-user',{type:'competition:native-invalidated',data:{competitionId:'fixture-child'}});process.send({delivered});if(m==='finish')process.exit(0)});`],{stdio:['ignore','ignore','inherit','ipc'],windowsHide:true})
const next=()=>new Promise((resolve,reject)=>{child.once('message',resolve);child.once('error',reject)})
try{await next();const first=next();child.send('local');assert.equal((await first).delivered,1);emitToUser('test-user','competition:native-invalidated',{competitionId:'fixture-child'});const second=next();child.send('finish');assert.equal((await second).delivered,1);writeFileSync(path.join(root,'audits/competition-phase7-2026-10-13/transport-boundary.json'),JSON.stringify({singleProcessRoomDelivery:'PASSED',crossProcessDeliveryRequirement:'FAILED',sharedTransportInfrastructure:'BLOCKED',remoteProcessReceivedParentHint:false,confidentialScoresSent:false,conclusion:'Process-local registry does not reach a user room in another API process. Reconciliation is not shared delivery.'},null,2));console.log('Verified process-local delivery; cross-instance delivery requirement remains FAILED/BLOCKED')}finally{child.disconnect?.()}
