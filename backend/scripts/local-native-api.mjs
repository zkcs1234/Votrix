// Transparent Supabase REST prefix gateway to the REAL PostgREST executable.
// No mock results, SQL emulation, authentication bypass or hosted forwarding.
import {createServer,request} from 'node:http'
import {spawn,spawnSync} from 'node:child_process'
import {readFileSync,writeFileSync} from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import jwt from '../node_modules/jsonwebtoken/index.js'
const root=path.resolve(import.meta.dirname,'../..'),dir=path.join(root,'.tmp/votrix-native-dev'),identity=JSON.parse(readFileSync(path.join(dir,'identity.json'))),foundation=JSON.parse(readFileSync(path.join(root,'audits/native-local-activation-2026-10-14/foundation.json'))),bin='C:/Program Files/PostgreSQL/18/bin'
assert.equal(foundation.passed,true);assert.equal(foundation.database,identity.database);assert.equal(identity.port,55440);assert.match(identity.database,/^votrix_dev_\d+$/)
const env={...process.env,PGOPTIONS:'',PGCONNECT_TIMEOUT:'5',PATH:bin+';'+process.env.PATH};delete env.PGSERVICE;delete env.PGSERVICEFILE
for(const key of Object.keys(env))if(key.startsWith('PGRST_')||key.startsWith('SUPABASE_')||key==='DATABASE_URL')delete env[key]
const result=spawnSync(path.join(bin,'psql.exe'),['-X','-w','-q','-At','-h','127.0.0.1','-p','55440','-U','postgres','-d',identity.database,'-v','ON_ERROR_STOP=1'],{input:'SELECT public.votrix_local_identity()',env,encoding:'utf8',windowsHide:true});assert.equal(result.status,0,'Isolated database identity unavailable');const actual=JSON.parse(result.stdout);assert.equal(actual.nonce,identity.nonce);assert.equal(path.resolve(actual.dataDirectory).toLowerCase(),path.resolve(identity.dataDirectory).toLowerCase())
const serviceKey=jwt.sign({role:'service_role'},identity.postgrestSecret,{expiresIn:'30d'}),config=path.join(dir,'postgrest.conf')
writeFileSync(config,`db-uri = "postgresql://votrix_authenticator:${identity.authenticatorPassword}@127.0.0.1:55440/${identity.database}"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "${identity.postgrestSecret}"
server-host = "127.0.0.1"
server-port = 5058
db-pool = 10
`)
writeFileSync(path.join(dir,'api-client.json'),JSON.stringify({supabaseUrl:'http://127.0.0.1:5059',serviceKey,identityNonce:identity.nonce},null,2))
const postgrest=spawn(path.join(dir,'postgrest/postgrest.exe'),[config],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});postgrest.stdout.pipe(process.stdout);postgrest.stderr.pipe(process.stderr)
const gateway=createServer((req,res)=>{
 if(!req.url.startsWith('/rest/v1/')){res.writeHead(404);return res.end()}
 const upstream=request({host:'127.0.0.1',port:5058,path:req.url.slice('/rest/v1'.length),method:req.method,headers:{...req.headers,host:'127.0.0.1:5058'}},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res)})
 upstream.on('error',()=>{if(!res.headersSent)res.writeHead(503);res.end('Isolated PostgREST unavailable')});req.pipe(upstream)
})
gateway.listen(5059,'127.0.0.1',()=>console.log('Real isolated PostgREST gateway ready on loopback5059'))
postgrest.on('exit',code=>{gateway.close();process.exitCode=code??1})
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{gateway.close();postgrest.kill()})
