import {readFileSync,writeFileSync} from 'node:fs'
let source=readFileSync('backend/scripts/test-competition-phase7-browser.mjs','utf8')
source=source.replaceAll('competition-phase7-2026-10-13','competition-phase8-2026-10-14').replaceAll('.tmp/phase7-browser','.tmp/phase8-browser').replace('database=`votrix_phase7_browser_${Date.now()}`','database=localDatabase')
source=source.replace("import assert from 'node:assert/strict'","import assert from 'node:assert/strict'\nimport {createClone,database as localDatabase,rpc as namedRpc} from './phase8-local-db.mjs'\nimport {extendApplicationFixture,startPostgrestFixture} from './phase8-postgrest-fixture.mjs'")
source=source.replace("assert.deepEqual(source,{tables:reviewed.schema.tables,functions:reviewed.schema.functions,metadata:reviewed.metadata});sql(`CREATE DATABASE ${database} TEMPLATE ${template}`,'postgres')","assert.deepEqual(source,{tables:reviewed.schema.tables,functions:reviewed.schema.functions,metadata:reviewed.metadata});createClone();extendApplicationFixture()")
const start=source.indexOf('const app=express()'),end=source.indexOf('const vite=await createServer')
const entry=source.slice(source.indexOf("writeFileSync(path.join(temp,'index.html')",start),end)
// Keep actual React workspaces and browser locators; replace the controller
// adapter with createApp and a strictly local SDK/PostgREST contract fixture.
const server=`
for(const [k,v] of Object.entries({NODE_ENV:'test',FRONTEND_URL:'http://127.0.0.1:5177',SUPABASE_URL:'http://127.0.0.1:5059',SUPABASE_SERVICE_ROLE_KEY:id()+id(),JWT_ACCESS_SECRET:id()+id(),JWT_REFRESH_SECRET:id()+id(),JWT_ACCESS_EXPIRES_IN:'2h',CSRF_SECRET:id()+id(),COMPETITION_CHILD_CONTEXTS_ENABLED:'true',COMPETITION_NATIVE_SETUP_ENABLED:'true',COMPETITION_NATIVE_SCORING_ENABLED:'true',COMPETITION_NATIVE_TABULATION_ENABLED:'true',COMPETITION_NATIVE_RESULTS_ENABLED:'true',COMPETITION_NATIVE_RATE_POLICY_ENABLED:'true'}))process.env[k]=v;
process.chdir(temp);
sql(\`UPDATE users SET first_name='Browser',last_name=id::text,email=id::text||'@fixture.invalid',organization_name='Fixture campus',organization_type_display='School',organizer_name='Browser owner',position='QA' WHERE id IN(\${actors.map(literal).join(',')});\`);
const proxy=startPostgrestFixture({key:process.env.SUPABASE_SERVICE_ROLE_KEY,actors});
const {createApp}=await import('../src/app.js'),{signAccessToken,verifyAccessToken}=await import('../src/utils/jwt.js'),{env}=await import('../src/config/env.js');
const actor=req=>{try{return verifyAccessToken(req.headers.cookie?.split(';').find(x=>x.trim().startsWith(env.jwt.accessCookieName+'='))?.trim().slice(env.jwt.accessCookieName.length+1)).sub}catch{return null}};
const app=express();app.get('/api/fixture/login',(req,res)=>{if(!actors.includes(req.query.actor))return res.sendStatus(403);res.cookie(env.jwt.accessCookieName,signAccessToken({sub:req.query.actor,role:req.query.actor===owner?'organizer':'participant',tokenVersion:0,accountStatus:'active'}),{httpOnly:true,sameSite:'strict'});res.redirect(\`/@fs/\${temp.replaceAll('\\\\','/')}/index.html?page=\${req.query.page??'setup'}\`)});
app.get('/api/fixture/me',(req,res)=>{const a=actor(req);if(!actors.includes(a))return res.sendStatus(401);res.json({id:a,role:a===owner?'organizer':'participant',event})});
app.use((req,_res,next)=>{requests.push({method:req.method,path:req.path});next()});app.use(createApp());
const server=app.listen(5057,'127.0.0.1'),{attachWebSocketServer}=await import('../src/websocket/ws-server.js'),wss=attachWebSocketServer(server);
`
source=source.slice(0,start)+server+entry+source.slice(end)
source=source.replace("define:{'import.meta.env.VITE_API_URL':JSON.stringify('/api')}","define:{'import.meta.env.VITE_API_URL':JSON.stringify('/api'),'import.meta.env.VITE_COMPETITION_NATIVE_SETUP_ENABLED':JSON.stringify('true'),'import.meta.env.VITE_COMPETITION_NATIVE_SCORING_ENABLED':JSON.stringify('true'),'import.meta.env.VITE_COMPETITION_NATIVE_TABULATION_ENABLED':JSON.stringify('true'),'import.meta.env.VITE_COMPETITION_NATIVE_RESULTS_ENABLED':JSON.stringify('true')}")
source=source.replace("Synthetic HTTP-only fixture cookie; NOT deployed JWT/CSRF controller","Synthetic signed JWT issuance; actual authenticate/account/CSRF/CORS/rate/resource middleware, NOT password login or hosted auth")
source=source.replace("Isolated contract adapter invoking real SQL RPCs, NOT production Express services/PostgREST","Actual createApp routes/controllers/services with a loopback SDK/PostgREST contract fixture and actual PostgreSQL RPCs; NOT hosted PostgREST")
source=source.replace('wss.close();server.close();await vite.close()','wss.close();server.close();proxy.server.close();await vite.close()')
writeFileSync('backend/scripts/test-competition-phase8-browser.mjs',source)
