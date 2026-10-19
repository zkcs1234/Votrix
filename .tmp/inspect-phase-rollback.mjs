import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
const hash=b=>createHash('sha256').update(b).digest('hex')
const baseline=Object.fromEntries(Object.entries(JSON.parse(fs.readFileSync('.tmp/competition-phase1/source-before.json'))).map(([p,h])=>[p.replaceAll('\\','/'),h]))
const changed=[]
for(const [p,h] of Object.entries(baseline)) {
 if(!fs.existsSync(p)||hash(fs.readFileSync(p))===h)continue
 const git=spawnSync('git',['show',`HEAD:${p}`],{windowsHide:true,maxBuffer:10000000})
 changed.push({path:p,headMatches:git.status===0&&hash(git.stdout)===h})
}
const phaseFiles=[]
for(const dir of fs.readdirSync('audits').filter(d=>/^competition-phase[1-9]-/.test(d))) {
 const file=`audits/${dir}/source-preservation.json`
 if(fs.existsSync(file)){const j=JSON.parse(fs.readFileSync(file));phaseFiles.push({phase:dir,changed:j.changed??j.changedExistingFiles??[],added:j.added??[]})}
}
fs.writeFileSync('.tmp/phase-rollback-inventory.json',JSON.stringify({baseline,changed,phaseFiles},null,2))
console.log(JSON.stringify({changed,phaseFiles},null,2))
