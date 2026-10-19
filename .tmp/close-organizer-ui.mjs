import {WebSocket} from '../backend/node_modules/ws/wrapper.mjs'
const info=await(await fetch('http://127.0.0.1:9339/json/version')).json()
const ws=new WebSocket(info.webSocketDebuggerUrl)
await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject)})
ws.send(JSON.stringify({id:1,method:'Browser.close'}))
await new Promise(resolve=>{ws.once('close',resolve);setTimeout(resolve,3000)})
