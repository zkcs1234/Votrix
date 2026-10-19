import {readdirSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import path from 'node:path'
const root=path.resolve(import.meta.dirname,'../..'),out=path.join(root,'audits/competition-phase10-2026-10-14')
mkdirSync(out,{recursive:true})
const inventory={},hash=b=>createHash('sha256').update(b).digest('hex')
function visit(dir){for(const item of readdirSync(path.join(root,dir),{withFileTypes:true})){const name=dir+'/'+item.name;if(item.isDirectory())visit(name);else inventory[name]=hash(readFileSync(path.join(root,name)))}}
for(const dir of ['backend/src','backend/scripts','backend/__tests__','frontend/src','shared'])visit(dir)
for(const file of ['backend/package.json','backend/package-lock.json','frontend/package.json','frontend/package-lock.json','render.yaml','frontend/vite.config.js','AGENTS.md'])inventory[file]=hash(readFileSync(path.join(root,file)))
const file=path.join(out,'source-before.json')
if(process.argv.includes('--compare')){
 const before=JSON.parse(readFileSync(file)),protectedPaths=Object.keys(before).filter(p=>/election|polling|scoring-engine|competition-calculation|CompetitionScoringForm|useJudgeScoreDrafts|csv-export/.test(p))
 const report={checked:Object.keys(before).length,changed:Object.keys(before).filter(p=>before[p]!==inventory[p]),added:Object.keys(inventory).filter(p=>!before[p]),protectedCount:protectedPaths.length,protectedChanged:protectedPaths.filter(p=>before[p]!==inventory[p])}
 writeFileSync(path.join(out,'source-preservation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(report.protectedChanged.length)process.exitCode=1
}else{
 writeFileSync(file,JSON.stringify(inventory,null,2),{flag:'wx'})
 writeFileSync(path.join(out,'git-status-before.txt'),spawnSync('git',['status','--short'],{cwd:root,encoding:'utf8',windowsHide:true}).stdout,{flag:'wx'})
 const docs={};for(let p=1;p<=9;p++){const dir=`audits/competition-phase${p}-${p>=8?'2026-10-14':'2026-10-13'}`,f=`${dir}/PHASE_${p}.md`;const text=readFileSync(path.join(root,f),'utf8');docs[f]={sha256:hash(text),characters:text.length,headings:text.split(/\r?\n/).filter(l=>l.startsWith('#'))}}
 for(const f of ['audits/competition-phase8-2026-10-14/RELEASE_REQUIREMENTS.md','audits/competition-phase7-2026-10-13/DEPLOYMENT_REQUIREMENTS.md','audits/competition-phase7-2026-10-13/RECOVERY_RUNBOOK.md'])docs[f]={sha256:hash(readFileSync(path.join(root,f)))}
 const migrations=Object.keys(inventory).filter(p=>/migrations\/(10[0-8])_/.test(p)).map(p=>({file:p,sha256:inventory[p],bytes:readFileSync(path.join(root,p)).length}))
 const flags=[...new Set(Object.keys(inventory).filter(p=>/\.(js|jsx|mjs)$/.test(p)).flatMap(p=>readFileSync(path.join(root,p),'utf8').match(/(?:VITE_)?COMPETITION_[A-Z_]+/g)||[]))].sort()
 writeFileSync(path.join(out,'baseline.json'),JSON.stringify({capturedAt:new Date().toISOString(),files:Object.keys(inventory).length,documents:docs,migrations,flagIdentifiers:flags,release:'NO-GO',productionAccessUnconfirmed:true},null,2))
 console.log('Baseline captured: '+Object.keys(inventory).length+' files')
}

