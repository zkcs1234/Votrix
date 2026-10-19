import {createConnection} from 'node:net'
import {readFileSync,writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
const out='audits/competition-phase9-2026-10-14/',ports=[5057,5059,5177,9337,55439]
const observations=await Promise.all(ports.map(port=>new Promise(resolve=>{const socket=createConnection({host:'127.0.0.1',port});socket.setTimeout(1500);socket.once('connect',()=>{socket.destroy();resolve({port,state:'OPEN'})});socket.once('error',error=>resolve({port,state:error.code==='ECONNREFUSED'?'CLOSED':'UNVERIFIED',code:error.code}));socket.once('timeout',()=>{socket.destroy();resolve({port,state:'UNVERIFIED',code:'TIMEOUT'})})})))
assert.ok(observations.every(x=>x.state==='CLOSED'),JSON.stringify(observations));writeFileSync(out+'cleanup.json',JSON.stringify({checkedAt:new Date().toISOString(),observations,sourceTemplatesRetained:true},null,2))
const verification=JSON.parse(readFileSync(out+'verification.json'));verification.testListeners=observations;writeFileSync(out+'verification.json',JSON.stringify(verification,null,2));console.log('All Phase 9 browser/API/fixture/PostgreSQL test listeners are closed')
