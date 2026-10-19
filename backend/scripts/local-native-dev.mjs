// Verified local launch of the actual VOTRIX server or normal Vite application.
import {readFileSync,writeFileSync,existsSync} from 'node:fs'
import {randomBytes} from 'node:crypto'
import path from 'node:path'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
const root=path.resolve(import.meta.dirname,'../..'),dir=path.join(root,'.tmp/votrix-native-dev'),identity=JSON.parse(readFileSync(path.join(dir,'identity.json'))),api=JSON.parse(readFileSync(path.join(dir,'api-client.json'))),mode=process.argv[2]
assert.ok(['backend','frontend','verify','checks','build'].includes(mode));assert.equal(api.supabaseUrl,'http://127.0.0.1:5059');assert.match(identity.database,/^votrix_dev_\d+$/)
const response=await fetch(api.supabaseUrl+'/rest/v1/rpc/votrix_local_identity',{headers:{Authorization:'Bearer '+api.serviceKey},signal:AbortSignal.timeout(5000),redirect:'error'});assert.equal(response.status,200);const actual=await response.json();assert.equal(actual.database,identity.database);assert.equal(actual.nonce,identity.nonce);assert.equal(Number(actual.port),55440);assert.equal(path.resolve(actual.dataDirectory).toLowerCase(),path.join(dir,'pgdata').toLowerCase())
const secretFile=path.join(dir,'app-secrets.json'),secrets=existsSync(secretFile)?JSON.parse(readFileSync(secretFile)):{access:randomBytes(40).toString('hex'),refresh:randomBytes(40).toString('hex'),csrf:randomBytes(40).toString('hex')};if(!existsSync(secretFile))writeFileSync(secretFile,JSON.stringify(secrets),{flag:'wx'})
// Remove inherited providers/signing/database settings before loading the app.
for(const key of Object.keys(process.env))if(/^(SUPABASE_|PGRST_|PG|JWT_|CSRF_|CLIENT_|FRONTEND_|CLOUDINARY_|RESEND_|SMTP_|EMAIL_|VITE_|COMPETITION_HINT_)/.test(key)||key==='DATABASE_URL')delete process.env[key]
Object.assign(process.env,{NODE_ENV:'development',PORT:'5000',FRONTEND_URL:'http://localhost:5173',CLIENT_URL:'http://localhost:5173',SUPABASE_URL:api.supabaseUrl,SUPABASE_SERVICE_ROLE_KEY:api.serviceKey,JWT_ACCESS_SECRET:secrets.access,JWT_REFRESH_SECRET:secrets.refresh,CSRF_SECRET:secrets.csrf,COOKIE_SAME_SITE:'lax',VOTRIX_LOCAL_NATIVE_MODE:'true',VITE_API_URL:'http://localhost:5000/api',COMPETITION_CHILD_CONTEXTS_ENABLED:'true',COMPETITION_NATIVE_SETUP_ENABLED:'true',COMPETITION_NATIVE_SCORING_ENABLED:'true',COMPETITION_NATIVE_TABULATION_ENABLED:'true',COMPETITION_NATIVE_RESULTS_ENABLED:'true',COMPETITION_NATIVE_RATE_POLICY_ENABLED:'true',VITE_COMPETITION_NATIVE_SETUP_ENABLED:'true',VITE_COMPETITION_NATIVE_SCORING_ENABLED:'true',VITE_COMPETITION_NATIVE_TABULATION_ENABLED:'true',VITE_COMPETITION_NATIVE_RESULTS_ENABLED:'true'})
process.chdir(dir) // dotenv cannot load backend/.env or its production key.
if(mode==='verify'){console.log(JSON.stringify({verified:true,database:identity.database,port:55440,api:api.supabaseUrl,mode:'isolated',nativeFlags:true,hostedCredentialsLoaded:false}));process.exit(0)}
if(mode==='build'){
 const {build}=await import('../../frontend/node_modules/vite/dist/node/index.js')
 for(const profile of ['native','default']){
  for(const key of ['SETUP','SCORING','TABULATION','RESULTS'])process.env['VITE_COMPETITION_NATIVE_'+key+'_ENABLED']=String(profile==='native')
  await build({root:path.join(root,'frontend'),configFile:path.join(root,'frontend/vite.config.js'),envDir:dir,build:{outDir:path.join(dir,'build-'+profile),emptyOutDir:true}})
 }
 process.exit(0)
}
if(mode==='checks'){
 process.env.RUN_DB_INTEGRATION='false';process.env.VITE_LOCK_PARTICIPANTS_ON_ACTIVE='true';delete process.env.VOTRIX_LOCAL_NATIVE_MODE
 // Regression files select opt-in branches explicitly; their baseline must
 // retain default-off flags rather than inherit the running browser profile.
 for(const key of Object.keys(process.env))if(/^COMPETITION_(CHILD_CONTEXTS|NATIVE_).*ENABLED$/.test(key)||/^VITE_COMPETITION_NATIVE_.*ENABLED$/.test(key))process.env[key]='false'
 for(const area of ['backend','frontend']){
  const result=spawnSync(process.execPath,[path.join(root,area,'node_modules/vitest/vitest.mjs'),'run','--root',path.join(root,area),'--config',path.join(root,area,area==='backend'?'vitest.config.js':'vite.config.js'),'--maxWorkers','2'],{env:process.env,encoding:'utf8',windowsHide:true,maxBuffer:32*1024*1024})
  writeFileSync(path.join(root,'audits/native-local-activation-2026-10-14',area+'-tests.log'),result.stdout+'\n'+result.stderr);console.log(area+' tests exit '+result.status);if(result.status!==0)process.exit(result.status??1)
 }
 process.exit(0)
}
if(mode==='backend')await import('../src/server.js')
else{const {createServer}=await import('../../frontend/node_modules/vite/dist/node/index.js');const server=await createServer({root:path.join(root,'frontend'),configFile:path.join(root,'frontend/vite.config.js'),envDir:dir,cacheDir:path.join(dir,'vite-cache'),server:{host:'localhost',port:5173,strictPort:true,fs:{allow:[path.join(root,'frontend'),path.join(root,'shared')],deny:['.env','.env.*','**/.tmp/votrix-native-dev/**']}}});await server.listen();server.printUrls()}
