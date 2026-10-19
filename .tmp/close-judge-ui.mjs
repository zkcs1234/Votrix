import {WebSocket} from '../backend/node_modules/ws/wrapper.mjs'
const pages=await(await fetch('http://127.0.0.1:9338/json/list')).json()
const socket=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl)
await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject)})
socket.send(JSON.stringify({id:1,method:'Browser.close'}))
await new Promise(resolve=>socket.once('close',resolve))
console.log('Isolated judge UI browser closed')
