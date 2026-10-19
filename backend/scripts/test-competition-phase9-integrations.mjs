// Replay reviewed local scenarios in NEW clones and NEW evidence paths only.
import {readFileSync,writeFileSync,mkdirSync,unlinkSync} from 'node:fs'
import {spawn} from 'node:child_process'
import path from 'node:path'
import assert from 'node:assert/strict'
const root=path.resolve(import.meta.dirname,'../..'),out=path.join(root,'audits/competition-phase9-2026-10-14')
for(const [label,filename,oldPhase] of [['tabulation','test-competition-native-tabulation.mjs',5],['results','test-competition-native-results.mjs',6]]){
 const dir=path.join(out,label);mkdirSync(dir,{recursive:true})
 const original=readFileSync(path.join(import.meta.dirname,filename),'utf8'),replacement=`output=path.join(root,'audits/competition-phase9-2026-10-14/${label}')`,needle=`output=path.join(root,'audits/competition-phase${oldPhase}-2026-10-13')`
 assert.ok(original.includes(needle))
 const file=path.join(import.meta.dirname,`phase7-generated-${label}-${Date.now()}.mjs`)
 writeFileSync(file,original.replace(needle,replacement),{flag:'wx'})
 try{await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[file],{cwd:root,windowsHide:true});let log='';child.stdout.on('data',b=>{log+=b;process.stdout.write(b)});child.stderr.on('data',b=>{log+=b;process.stderr.write(b)});child.on('error',reject);child.on('close',code=>{writeFileSync(path.join(dir,'test.log'),log);code===0?resolve():reject(new Error(`${label} failed with ${code}`))})})}finally{unlinkSync(file)}
}
