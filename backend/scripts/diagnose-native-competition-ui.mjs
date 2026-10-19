// Read-only diagnosis: filesystem/configuration, existing Vite modules, and
// optionally Supabase GET metadata. Never import/start the app or execute RPCs.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs'
import path from 'node:path'
import {parse} from 'dotenv'
import {createConnection} from 'node:net'
const root=path.resolve(import.meta.dirname,'../..'),out=path.join(root,'audits/competition-localhost-integration-2026-10-14');mkdirSync(out,{recursive:true})
const fileEnv=file=>existsSync(path.join(root,file))?parse(readFileSync(path.join(root,file))):{},backend=fileEnv('backend/.env'),frontFiles=['frontend/.env','frontend/.env.local','frontend/.env.development','frontend/.env.development.local']
const frontLayers=frontFiles.map(file=>({file,values:fileEnv(file)})),front=Object.assign({},...frontLayers.map(l=>l.values))
const frontNames=['VITE_COMPETITION_NATIVE_SETUP_ENABLED','VITE_COMPETITION_NATIVE_SCORING_ENABLED','VITE_COMPETITION_NATIVE_TABULATION_ENABLED','VITE_COMPETITION_NATIVE_RESULTS_ENABLED'],backendNames=['COMPETITION_CHILD_CONTEXTS_ENABLED','COMPETITION_NATIVE_SETUP_ENABLED','COMPETITION_NATIVE_SCORING_ENABLED','COMPETITION_NATIVE_TABULATION_ENABLED','COMPETITION_NATIVE_RESULTS_ENABLED','COMPETITION_NATIVE_RATE_POLICY_ENABLED']
const flags=(names,values,layers)=>names.map(name=>({name,present:process.env[name]!==undefined||values[name]!==undefined,value:process.env[name]??values[name]??null,enabled:(process.env[name]??values[name])==='true',source:process.env[name]!==undefined?'current diagnostic process environment':layers.findLast(l=>l.values[name]!==undefined)?.file??'absent; default disabled',runningProcessIndependentlyVerified:false}))
const probe=(port,host)=>new Promise(resolve=>{const socket=createConnection({host,port});socket.setTimeout(1200);socket.once('connect',()=>{socket.destroy();resolve({host,port,listening:true})});socket.once('error',e=>resolve({host,port,listening:false,code:e.code}));socket.once('timeout',()=>{socket.destroy();resolve({host,port,listening:null,code:'timeout'})})})
const listeners=await Promise.all([5173,5174,5175,5176,5000,55439].flatMap(port=>['127.0.0.1','localhost'].map(host=>probe(port,host)))),vite=[]
for(const listener of listeners.filter(p=>p.listening&&p.port>=5173&&p.port<=5176)){
 const url=`http://${listener.host}:${listener.port}`
 try{const response=await fetch(url+'/src/components/organizer/competition/NativeSetupWorkspace.jsx',{signal:AbortSignal.timeout(5000),redirect:'error'});const text=await response.text();if(!response.ok||!text.includes('NativeSetupBoundary')){vite.push({url,status:response.status,votrixNativeModule:false});continue}
  const match=text.match(/import\.meta\.env\s*=\s*(\{[^\n]+\})/);let env={};if(match)try{env=JSON.parse(match[1])}catch{}
  vite.push({url,status:response.status,votrixNativeModule:true,servedFlags:frontNames.map(name=>({name,value:env[name]??null,enabled:env[name]==='true'})),flagInjectionParsed:!!match,authenticatedOrganizerRenderVerified:false})
 }catch{vite.push({url,readFailed:true})}
}
const supabase=process.env.SUPABASE_URL??backend.SUPABASE_URL;let database={classification:'UNIDENTIFIED',writes:false}
try{const u=new URL(supabase);database.classification=['127.0.0.1','localhost','[::1]'].includes(u.hostname)?'LOOPBACK_UNVERIFIED':'HOSTED_PRODUCTION_SENSITIVE'}catch{}
const hosted={executed:false,directCatalogVerified:false}
if(process.argv.includes('--read-only-schema')){
 const u=new URL(supabase);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||!u.hostname.endsWith('.supabase.co'))throw new Error('Configured target cannot be identified as the user-authorized hosted Supabase project; no request made')
 const credential=process.env.SUPABASE_SERVICE_ROLE_KEY??backend.SUPABASE_SERVICE_ROLE_KEY;if(!credential)throw new Error('Read-only credential unavailable')
 const headers={apikey:credential,Authorization:'Bearer '+credential};const response=await fetch(new URL('/rest/v1/',u),{headers:{...headers,Accept:'application/openapi+json'},signal:AbortSignal.timeout(15000),redirect:'error'})
 hosted.executed=true;hosted.schemaStatus=response.status
 if(response.ok){const schema=await response.json(),defs=schema.definitions??{},paths=schema.paths??{};const requiredTables=['competitions','competition_entries','competition_legacy_contexts','competition_child_configurations','competition_child_rounds','competition_child_criteria','competition_child_minors','competition_child_judge_assignments'];const requiredRpcs=['competition_create_child','competition_native_foundation','competition_save_native_configuration','competition_freeze_native_rules','competition_child_scoring_choices','competition_child_live_view','competition_child_score_write','competition_child_tabulation_snapshot','competition_child_official_calculate','competition_child_confirm_qualification','competition_child_owned_results','competition_child_publication_action','competition_child_judge_navigation'];hosted.tables=requiredTables.map(name=>({name,restExposed:!!defs[name]}));hosted.rpcs=requiredRpcs.map(name=>({name,restExposed:!!paths['/rpc/'+name]}));
  const table=await fetch(new URL('/rest/v1/competitions?select=id,event_id,origin&limit=0',u),{headers,signal:AbortSignal.timeout(15000),redirect:'error'});hosted.childIdentityStatus=table.status;hosted.childIdentityOperational=table.ok;hosted.nativeBackendUsable=table.ok&&paths['/rpc/competition_create_child']!==undefined&&paths['/rpc/competition_native_foundation']!==undefined
 }
 hosted.note='GET-only REST exposure/zero-row capability check; not proof of SQL catalog or migration ledger. No event/score/account records requested.'
 writeFileSync(path.join(out,'hosted-schema-read-only.json'),JSON.stringify({checkedAt:new Date().toISOString(),...hosted},null,2))
}
const api=process.env.VITE_API_URL??front.VITE_API_URL??'/api';let apiOrigin;try{apiOrigin=new URL(api).origin}catch{apiOrigin='relative same-origin /api'}
const report={checkedAt:new Date().toISOString(),frontendFlags:flags(frontNames,front,frontLayers),backendFlags:flags(backendNames,backend,[{file:'backend/.env',values:backend}]),listeners,vite,configuredApiOrigin:apiOrigin,database,hosted,backendStarted:false,backendApiRequestsMade:false,realLoginVerified:false,eventContext:'NO_EVENT_CONTEXT: module landing route has no eventId',productConfigurationChanged:false,codeRootCause:'NativeSetupBoundary returns Legacy when VITE_COMPETITION_NATIVE_SETUP_ENABLED is not the string true',status:'PARTIALLY INTEGRATED: source routes connected, configured workflow blocked'}
writeFileSync(path.join(out,'diagnosis.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({frontendFlags:report.frontendFlags,backendFlags:report.backendFlags,listeners,vite,apiOrigin,database,hosted},null,2))

