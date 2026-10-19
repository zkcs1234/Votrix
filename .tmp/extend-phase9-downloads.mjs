import {readFileSync,writeFileSync} from 'node:fs'
const file='backend/scripts/test-competition-phase9-browser-extended.mjs'
let s=readFileSync(file,'utf8')
s=s.replace("import {randomUUID} from 'node:crypto'","import {randomUUID,createHash} from 'node:crypto'\nimport csv from '../node_modules/csv-parser/index.js'\nimport {Readable} from 'node:stream'")
s=s.replace('const pending=new Map(),scenarios=[]','const pending=new Map(),scenarios=[],downloadEvents=[],downloadEvidence=[];const downloadDir=path.join(out,\'downloads\');mkdirSync(downloadDir,{recursive:true})')
s=s.replace('const m=JSON.parse(raw);if(m.id)',"const m=JSON.parse(raw);if(m.method?.startsWith('Browser.download'))downloadEvents.push(m);if(m.id)")
s=s.replace("const tab=async(a,page,selectedEvent=event)=>{const ctx=await call('Target.createBrowserContext'),target=", "const tab=async(a,page,selectedEvent=event)=>{const ctx=await call('Target.createBrowserContext');await call('Browser.setDownloadBehavior',{behavior:'allowAndName',downloadPath:downloadDir,eventsEnabled:true,browserContextId:ctx.browserContextId});const target=")
s=s.replace("await field(parent,'Event entrant name','Solo entrant')", "await field(parent,'Event entrant name','=SUM(1,2)')")
const old="await field(soloResults,'Export judge',judge);for(const text of ['Judge worksheet CSV','All worksheets CSV','Official tabulation CSV','Final results CSV'])await click(soloResults,text)"
const replacement=`await field(soloResults,'Export judge',judge);
 for(const text of ['Judge worksheet CSV','All worksheets CSV','Official tabulation CSV','Final results CSV']){
  const before=downloadEvents.length;await click(soloResults,text);let completion
  for(let n=0;n<300;n++){completion=downloadEvents.slice(before).find(e=>e.method==='Browser.downloadProgress'&&e.params.state==='completed');if(completion)break;await pause(100)}
  assert.ok(completion,'Browser must finish writing '+text);const bytes=readFileSync(path.join(downloadDir,completion.params.guid)),rows=[]
  await new Promise((resolve,reject)=>Readable.from([bytes]).pipe(csv()).on('data',r=>rows.push(r)).on('error',reject).on('end',resolve))
  assert.ok(rows.length);assert.ok(rows.every(r=>r.event_id===newEvent&&r.competition_id===solo.id));assert.ok(rows.some(r=>r.entry_name==="'=SUM(1,2)"),'Formula text must remain shielded in downloaded cells')
  assert.ok(rows.every(r=>!r.entry_name?.startsWith('=')));assert.ok(!bytes.toString().includes('accessToken'))
  if(text.includes('worksheet')){assert.equal(rows[0].raw_score_decimal_text,'88');assert.equal(rows[0].maximum_decimal_text,'100')}
  if(text==='Final results CSV')assert.equal(rows[0].final_score,'88')
  downloadEvidence.push({kind:text,file:completion.params.guid,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),rows:rows.length,scopeAndRawValues:true,formulaShielding:true})
 }
 writeFileSync(path.join(out,'browser-downloads.json'),JSON.stringify({passed:true,downloadEvidence,hosted:false},null,2))`
if(!s.includes(old))throw Error('Expected download block missing');s=s.replace(old,replacement)
s=s.replace('All four actual CSV download actions run through owner/source authorization and real export service','All four CSV files are saved by Chromium and parsed from disk; exact scope/raw values and formula shielding verified')
writeFileSync(file,s)
