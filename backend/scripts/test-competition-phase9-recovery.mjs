// Workspace-only forward chain and restore rehearsal. Never reads .env.
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {createHash} from 'node:crypto'
import path from 'node:path'
import {performance} from 'node:perf_hooks'
const root=path.resolve(import.meta.dirname,'../..'),out=path.join(root,'audits/competition-phase9-2026-10-14'),bin='C:/Program Files/PostgreSQL/18/bin'
mkdirSync(out,{recursive:true})
const template='votrix_repairs_1791835055235',database=`votrix_phase9_chain_${Date.now()}`,restored=`${database}_restore`,env={...process.env,PGOPTIONS:'',PGCONNECT_TIMEOUT:'10'}
delete env.PGSERVICE;delete env.PGSERVICEFILE
const args=target=>['-w','-h','127.0.0.1','-p','55439','-U','postgres','-d',target]
function command(exe,params,input){const r=spawnSync(path.join(bin,exe),params,{input,encoding:'utf8',env,windowsHide:true,timeout:120000,maxBuffer:64*1024*1024});assert.equal(r.status,0,r.stderr||r.error?.message);return r.stdout.trim()}
function sql(source,target=database){assert.ok([database,restored,template,'postgres'].includes(target));if(target===template)assert.match(source,/^BEGIN TRANSACTION READ ONLY;/);return command('psql.exe',['-X','-q','-At',...args(target),'-v','ON_ERROR_STOP=1'],source)}
const catalog=readFileSync(path.join(root,'backend/src/database/scripts/competition-preflight-catalog.sql'),'utf8'),directory=sql('SHOW data_directory','postgres')
assert.equal(path.resolve(directory).toLowerCase(),path.resolve(root,'.tmp/competition-postgres-tests').toLowerCase())
const before=JSON.parse(sql(`BEGIN TRANSACTION READ ONLY;${catalog}ROLLBACK;`,template)),reviewed=JSON.parse(readFileSync(path.join(root,'audits/competition-phase1-2026-10-13/postgres-preflight-final.json')))
assert.equal(reviewed.target.database,template);assert.equal(reviewed.blockers,0)
// Later preflight additions may extend metadata fields; compare all original
// relation/constraint/trigger/function rows with the original reviewed evidence.
for(const [name,table] of Object.entries(reviewed.schema.tables))assert.deepEqual(before.tables[name],table)
assert.deepEqual(before.functions,reviewed.schema.functions)
assert.equal(before.tables.competitions,undefined,'103 must not already be applied')
sql(`CREATE DATABASE ${database} TEMPLATE ${template}`,'postgres')
const tables=Object.keys(before.tables).filter(t=>t!=='users')
const rows=target=>Object.fromEntries(tables.map(t=>[t,sql(`SELECT md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),'')) FROM public.${t} t`,target)]))
const original=rows(database),migrations=[]
for(const version of [103,104,105,106,107,108]){
 const filename={103:'103_competition_child_identity.sql',104:'104_competition_scoped_rules.sql',105:'105_competition_scoped_scoring.sql',106:'106_competition_scoped_tabulation.sql',107:'107_competition_scoped_results.sql',108:'108_competition_navigation_draft_tools.sql'}[version],source=readFileSync(path.join(root,'backend/src/database/migrations',filename),'utf8'),start=performance.now()
 sql(source);migrations.push({version,file:filename,sha256:createHash('sha256').update(source).digest('hex'),milliseconds:performance.now()-start});assert.deepEqual(rows(database),original)
}
const finalCatalog=JSON.parse(sql(`BEGIN TRANSACTION READ ONLY;${catalog}ROLLBACK;`)),startRerun=performance.now()
sql(readFileSync(path.join(root,'backend/src/database/migrations/108_competition_navigation_draft_tools.sql'),'utf8'));const rerunMs=performance.now()-startRerun;assert.deepEqual(JSON.parse(sql(`BEGIN TRANSACTION READ ONLY;${catalog}ROLLBACK;`)),finalCatalog)
const dump=path.join(root,'.tmp',`${database}.dump`),dumpStart=performance.now()
command('pg_dump.exe',[...args(database),'-Fc','-f',dump]);const dumpMs=performance.now()-dumpStart
sql(`CREATE DATABASE ${restored} TEMPLATE template0`,'postgres');const restoreStart=performance.now()
command('pg_restore.exe',[...args(restored),'--exit-on-error',dump]);const restoreMs=performance.now()-restoreStart
assert.deepEqual(rows(restored),original);assert.deepEqual(JSON.parse(sql(`BEGIN TRANSACTION READ ONLY;${catalog}ROLLBACK;`,restored)),finalCatalog)
assert.deepEqual(JSON.parse(sql(`BEGIN TRANSACTION READ ONLY;${catalog}ROLLBACK;`,template)),before)
const report={passed:true,database,restored,template,productionTouched:false,forwardChain:migrations,lastMigrationRerunMilliseconds:rerunMs,originalTableCount:tables.length,historicalPreserved:true,templateUnchanged:true,localRestore:{passed:true,dumpMilliseconds:dumpMs,restoreMilliseconds:restoreMs,wholeDatabaseDump:true,verified:'All original inventoried table hashes and competition catalog definitions/ACLs match',productionBackupValidated:false},deployedMigrationLedgerVerified:false}
writeFileSync(path.join(out,'chain-recovery.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report))
