// Local serializer process peak, including module/runtime/input allocations.
// Two outputs overlap in memory; this is not simultaneous HTTP/SQL execution.
import {spawn,spawnSync} from 'node:child_process'
import {writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
import path from 'node:path'
const root=path.resolve(import.meta.dirname,'../..'),input=path.join(root,'.tmp/phase9-export-dataset.json'),module=new URL('../src/modules/competition-native-exports.js',import.meta.url).href
const source=`import{readFileSync}from'node:fs';import{nativeExportCsv}from${JSON.stringify(module)};const dataset=JSON.parse(readFileSync(${JSON.stringify(input)})),before=process.memoryUsage(),start=performance.now(),outputs=[nativeExportCsv(dataset),nativeExportCsv(dataset)],after=process.memoryUsage();process.send({bytes:outputs.map(x=>Buffer.byteLength(x)),milliseconds:performance.now()-start,before,after,rawTargets:dataset.rawRows.length});process.on('message',()=>process.exit(0));`
const child=spawn(process.execPath,['--input-type=module','-e',source],{windowsHide:true,stdio:['ignore','ignore','inherit','ipc']})
try{
 const sample=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Memory fixture timed out')),30000);child.once('message',m=>{clearTimeout(timer);resolve(m)});child.once('error',reject);child.once('exit',code=>{if(code!==0)reject(new Error('Memory child failed'))})})
 const peak=spawnSync('powershell.exe',['-NoProfile','-Command',`(Get-Process -Id ${child.pid}).PeakWorkingSet64`],{windowsHide:true,encoding:'utf8'});assert.equal(peak.status,0,peak.stderr);const peakWorkingSetBytes=Number(peak.stdout.trim());assert.ok(peakWorkingSetBytes>0);assert.equal(sample.rawTargets,3000)
 writeFileSync(path.join(root,'audits/competition-phase9-2026-10-14/export-memory.json'),JSON.stringify({passed:true,...sample,processPeakWorkingSetBytes:peakWorkingSetBytes,platform:process.platform,outputsRetained:2,includesRuntimeInputAndModules:true,simultaneousHttpExports:false,productionPeakVerified:false},null,2));console.log('PASS isolated export peak working set '+peakWorkingSetBytes+' bytes')
}finally{if(child.connected)child.send({stop:true});else child.kill()}
