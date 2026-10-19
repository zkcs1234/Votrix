// Small-fixture measurements, not a production capacity/load certification.
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {readFileSync,writeFileSync} from 'node:fs'
import path from 'node:path'
import {performance} from 'node:perf_hooks'
import {calculateNativeSnapshot} from '../src/modules/competition-native-tabulation.js'
import {nativeExportCsv} from '../src/modules/competition-native-exports.js'
const root=path.resolve(import.meta.dirname,'../..'),out=path.join(root,'audits/competition-phase7-2026-10-13'),database=JSON.parse(readFileSync(path.join(out,'results/postgres-integration.json'))).database
assert.match(database,/^votrix_publication_\d+$/)
const env={...process.env,PGOPTIONS:'',PGCONNECT_TIMEOUT:'10'};delete env.PGSERVICE;delete env.PGSERVICEFILE
function sql(s,d=database){assert.ok([database,'postgres'].includes(d));const r=spawnSync('C:/Program Files/PostgreSQL/18/bin/psql.exe',['-X','-w','-q','-At','-h','127.0.0.1','-p','55439','-U','postgres','-d',d,'-v','ON_ERROR_STOP=1'],{input:s,env,encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:64*1024*1024});assert.equal(r.status,0,r.stderr);return r.stdout.trim()}
assert.equal(path.resolve(sql('SHOW data_directory','postgres')).toLowerCase(),path.resolve(root,'.tmp/competition-postgres-tests').toLowerCase())
const read=s=>JSON.parse(sql(`BEGIN TRANSACTION READ ONLY;${s};ROLLBACK;`)),selected=read("SELECT to_jsonb(x) FROM(SELECT c.event_id,c.competition_id,c.created_by owner,c.round_id FROM competition_child_calculations c JOIN competitions child ON child.id=c.competition_id JOIN competition_child_configurations cfg ON cfg.competition_id=child.id WHERE cfg.configuration->'scoringConfig'->>'calculationMethod'='weighted_average' ORDER BY c.created_at DESC LIMIT 1)x")
const round=selected.round_id?`'${selected.round_id}'`:'NULL',statement=`SELECT competition_child_tabulation_snapshot('${selected.event_id}','${selected.competition_id}','${selected.owner}',${round},false)`,snapshot=read(statement)
assert.equal(snapshot.complete,true);const callMs=[]
for(let i=0;i<10;i++){const start=performance.now();read(statement);callMs.push(performance.now()-start)}
const plan=read(`EXPLAIN(ANALYZE,BUFFERS,FORMAT JSON) ${statement}`),engineMs=[]
for(let i=0;i<30;i++){const start=performance.now();calculateNativeSnapshot(snapshot);engineMs.push(performance.now()-start)}
const dataset=read(`SELECT competition_child_export_sources('${selected.event_id}','${selected.competition_id}','${selected.owner}',${round},'worksheets','${snapshot.sourceDigest}',NULL,NULL)`),bench={...dataset,rawRows:Array.from({length:10000},(_,i)=>dataset.rawRows[i%dataset.rawRows.length])},before=process.memoryUsage(),start=performance.now(),csv=nativeExportCsv(bench),csvMs=performance.now()-start,after=process.memoryUsage()
const stats=a=>({samples:a.length,min:Math.min(...a),max:Math.max(...a),mean:a.reduce((s,x)=>s+x,0)/a.length})
writeFileSync(path.join(out,'performance.json'),JSON.stringify({database,fixture:{eligibleEntries:snapshot.session.entry_ids.length,judges:snapshot.progress.length},tabulationReadPsqlProcessMilliseconds:stats(callMs),tabulationReadExplainServerMilliseconds:plan[0]['Execution Time'],engineAdapterMilliseconds:stats(engineMs),csvSerializerOnly:{syntheticRepeatedRows:bench.rawRows.length,milliseconds:csvMs,bytes:Buffer.byteLength(csv),heapUsedDeltaBytes:after.heapUsed-before.heapUsed,rssDeltaBytes:after.rss-before.rss,peakMemoryMeasured:false},productionVolumeCapacityVerified:false,largeActualRosterTested:false,lockContentionQuantified:false,networkLatencyMeasured:false},null,2));console.log('PASS actual small-fixture read/engine and 10,000-row serializer measurements recorded')
