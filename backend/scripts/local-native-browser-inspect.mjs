import {WebSocket} from '../node_modules/ws/wrapper.mjs'
const port=process.argv[2]??'9340';if(!['9340','9341'].includes(port))throw new Error('Owned test-browser port required')
const targets=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()
for(const target of targets.filter(t=>t.url.startsWith('http://localhost:5173'))){
 const socket=new WebSocket(target.webSocketDebuggerUrl)
 await new Promise(r=>socket.once('open',r));socket.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression:`JSON.stringify({url:location.pathname,inputs:[...document.querySelectorAll('input')].map(n=>({type:n.type,checked:n.checked,disabled:n.matches(':disabled'),label:n.getAttribute('aria-label')})),text:document.body.innerText})`,returnByValue:true}}))
 await new Promise(r=>socket.on('message',raw=>{const m=JSON.parse(raw);if(m.id){console.log(m.result?.result?.value);socket.close();r()}}))
}
