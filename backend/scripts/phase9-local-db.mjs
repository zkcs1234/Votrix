// Local-only PostgreSQL bridge used by Phase 9 tests; never loads .env.
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {readFileSync} from 'node:fs'
import path from 'node:path'
export const root=path.resolve(import.meta.dirname,'../..'),template='votrix_publication_1791898451572',database=process.env.PHASE9_USE_CAPACITY_FIXTURE==='true'?JSON.parse(readFileSync(path.join(root,'audits/competition-phase9-2026-10-14/capacity.json'))).database:process.env.PHASE9_USE_BROWSER_FIXTURE==='true'?JSON.parse(readFileSync(path.join(root,'audits/competition-phase9-2026-10-14/browser-integration.json'))).database:`votrix_hardening_${Date.now()}`
assert.match(database,/^votrix_hardening_\d+$/)
const env={...process.env,PGOPTIONS:'',PGCONNECT_TIMEOUT:'10'};delete env.PGSERVICE;delete env.PGSERVICEFILE
export const literal=v=>v==null?'NULL':`'${String(v).replaceAll("'","''")}'`,json=v=>`${literal(JSON.stringify(v))}::jsonb`
export function sql(source,target=database){assert.ok([database,template,'postgres'].includes(target));if(target===template)assert.match(source,/^BEGIN TRANSACTION READ ONLY;/);const r=spawnSync('C:/Program Files/PostgreSQL/18/bin/psql.exe',['-X','-w','-q','-At','-h','127.0.0.1','-p','55439','-U','postgres','-d',target,'-v','ON_ERROR_STOP=1'],{input:source,encoding:'utf8',windowsHide:true,env,timeout:60000,maxBuffer:64*1024*1024});if(r.status!==0)throw new Error(r.stderr||r.error?.message);return r.stdout.trim()}
export const read=source=>JSON.parse(sql(source)),rows=(table,condition='true')=>{assert.match(table,/^[a-z_]+$/);return read(`SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM ${table} t WHERE ${condition}`)}
export function rpcStatement(name,args){assert.match(name,/^competition_[a-z_]+$/);const terms=Object.entries(args).map(([key,v])=>{assert.match(key,/^p_[a-z_]+$/);return `${key}=>${v===null?'NULL':typeof v==='boolean'?String(v):typeof v==='number'?String(v):typeof v==='object'?json(v):literal(v)}`});return `SELECT coalesce(${name}(${terms.join(',')}),'null'::jsonb)`}
export function rpc(name,args){return read(rpcStatement(name,args))}
export function createClone(){
 assert.equal(path.resolve(sql('SHOW data_directory','postgres')).toLowerCase(),path.resolve(root,'.tmp/competition-postgres-tests').toLowerCase())
 const catalog=readFileSync(path.join(root,'backend/src/database/scripts/competition-preflight-catalog.sql'),'utf8'),actual=JSON.parse(sql(`BEGIN TRANSACTION READ ONLY;${catalog}ROLLBACK;`,template)),reviewed=JSON.parse(readFileSync(path.join(root,'audits/competition-phase6-2026-10-13/native-preflight-complete.json')))
 assert.deepEqual(actual,{tables:reviewed.schema.tables,functions:reviewed.schema.functions,metadata:reviewed.metadata});sql(`CREATE DATABASE ${database} TEMPLATE ${template}`,'postgres')
 const before=Object.fromEntries(Object.keys(reviewed.inventory).map(t=>[t,sql(`SELECT md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),'')) FROM ${t} t`)]))
 const migration=readFileSync(path.join(root,'backend/src/database/migrations/108_competition_navigation_draft_tools.sql'),'utf8');sql(migration);sql(migration)
 for(const [table,hash]of Object.entries(before))assert.equal(sql(`SELECT md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),'')) FROM ${table} t`),hash)
 return {actual,reviewed,before}
}
