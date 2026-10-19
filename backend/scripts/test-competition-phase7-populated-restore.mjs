// Restores a whole populated LOCAL fixture into a fresh LOCAL database.
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {readFileSync,writeFileSync} from 'node:fs'
import path from 'node:path'
import {performance} from 'node:perf_hooks'
const root=path.resolve(import.meta.dirname,'../..'),out=path.join(root,'audits/competition-phase7-2026-10-13'),bin='C:/Program Files/PostgreSQL/18/bin',source='votrix_publication_1791898451572',restored=`votrix_phase7_populated_restore_${Date.now()}`
const env={...process.env,PGOPTIONS:'',PGCONNECT_TIMEOUT:'10'};delete env.PGSERVICE;delete env.PGSERVICEFILE
const args=d=>['-w','-h','127.0.0.1','-p','55439','-U','postgres','-d',d]
function run(exe,params,input){const r=spawnSync(path.join(bin,exe),params,{input,env,windowsHide:true,encoding:'utf8',timeout:120000,maxBuffer:64*1024*1024});assert.equal(r.status,0,r.stderr||r.error?.message);return r.stdout.trim()}
function sql(s,d=source){assert.ok([source,restored,'postgres'].includes(d));if(d===source)assert.match(s,/^BEGIN TRANSACTION READ ONLY;/);return run('psql.exe',['-X','-q','-At',...args(d),'-v','ON_ERROR_STOP=1'],s)}
const directory=sql('SHOW data_directory','postgres');assert.equal(path.resolve(directory).toLowerCase(),path.resolve(root,'.tmp/competition-postgres-tests').toLowerCase())
const catalog=readFileSync(path.join(root,'backend/src/database/scripts/competition-preflight-catalog.sql'),'utf8'),before=JSON.parse(sql(`BEGIN TRANSACTION READ ONLY;${catalog}ROLLBACK;`)),reviewed=JSON.parse(readFileSync(path.join(root,'audits/competition-phase6-2026-10-13/native-preflight-complete.json')))
assert.deepEqual(before,{tables:reviewed.schema.tables,functions:reviewed.schema.functions,metadata:reviewed.metadata})
const tables=JSON.parse(sql("BEGIN TRANSACTION READ ONLY;SELECT coalesce(jsonb_agg(tablename ORDER BY tablename),'[]') FROM pg_tables WHERE schemaname='public';ROLLBACK;"))
const inventory=d=>JSON.parse(sql(`BEGIN TRANSACTION READ ONLY;SELECT jsonb_agg(to_jsonb(x) ORDER BY name) FROM (${tables.map(t=>{assert.match(t,/^[a-z_]+$/);return `SELECT '${t}' name,count(*) count,md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),'')) fingerprint FROM public.${t} t`}).join(' UNION ALL ')}) x;ROLLBACK;`,d))
const original=inventory(source),dump=path.join(root,'.tmp',`${restored}.dump`),dumpStart=performance.now();run('pg_dump.exe',[...args(source),'-Fc','-f',dump]);const dumpMs=performance.now()-dumpStart
sql(`CREATE DATABASE ${restored} TEMPLATE template0`,'postgres');const restoreStart=performance.now();run('pg_restore.exe',[...args(restored),'--exit-on-error',dump]);const restoreMs=performance.now()-restoreStart
assert.deepEqual(inventory(restored),original);assert.deepEqual(JSON.parse(sql(`BEGIN TRANSACTION READ ONLY;${catalog}ROLLBACK;`,restored)),before);assert.deepEqual(inventory(source),original)
writeFileSync(path.join(out,'populated-restore.json'),JSON.stringify({passed:true,source,restored,dumpMilliseconds:dumpMs,restoreMilliseconds:restoreMs,allPublicTables:original,sourceUnchanged:true,definitionAndPrivilegeMatch:true,productionBackupValidated:false,externalAssetsIncluded:false,roleDefinitionsIncluded:false},null,2));console.log('PASS populated local restore: '+tables.length+' public table inventories and competition definitions/ACLs match')
