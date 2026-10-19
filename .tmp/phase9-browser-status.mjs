import {WebSocket} from '../backend/node_modules/ws/wrapper.mjs'
for(const target of await(await fetch('http://127.0.0.1:9337/json/list')).json()){
 if(!target.url.startsWith('http://127.0.0.1:5177/'))continue
 const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.once('open',r));const result=await new Promise(r=>{ws.once('message',b=>r(JSON.parse(b)));ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression:'document.body.innerText',returnByValue:true}}))});console.log(target.url.split('?')[1],result.result?.result?.value?.slice(-1000));ws.close()
}
