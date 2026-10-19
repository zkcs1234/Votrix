import {spawn} from 'node:child_process'
import {writeFileSync} from 'node:fs'
import path from 'node:path'
const root=path.resolve(import.meta.dirname,'../..'),out=path.join(root,'audits/competition-phase9-2026-10-14')
for(const name of ['extended','methods','carry','large-roster']){
 const env={...process.env};delete env.PHASE9_USE_BROWSER_FIXTURE;delete env.PHASE9_USE_CAPACITY_FIXTURE
 if(name==='extended'||name==='carry')env.PHASE9_USE_BROWSER_FIXTURE='true';if(name==='large-roster')env.PHASE9_USE_CAPACITY_FIXTURE='true'
 console.log('Running local browser '+name)
 await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[path.join(import.meta.dirname,'test-competition-phase9-browser-'+name+'.mjs')],{cwd:root,env,windowsHide:true});let log='';child.stdout.on('data',b=>{log+=b;process.stdout.write(b)});child.stderr.on('data',b=>{log+=b;process.stderr.write(b)});child.once('error',reject);child.once('close',code=>{writeFileSync(path.join(out,'browser-'+name+'.log'),log);code===0?resolve():reject(new Error('Browser '+name+' failed with '+code))})})
}
