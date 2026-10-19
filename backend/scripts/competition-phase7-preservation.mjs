import {readdirSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {createHash} from 'node:crypto'
import path from 'node:path'
const root=path.resolve(import.meta.dirname,'../..'),out=path.join(root,'audits/competition-phase7-2026-10-13')
mkdirSync(out,{recursive:true})
const inventory={}
function visit(dir){for(const item of readdirSync(path.join(root,dir),{withFileTypes:true})){const name=dir+'/'+item.name;if(item.isDirectory())visit(name);else inventory[name]=createHash('sha256').update(readFileSync(path.join(root,name))).digest('hex')}}
for(const dir of ['backend/src','backend/scripts','frontend/src','shared'])visit(dir)
const file=path.join(out,'source-before.json')
if(process.argv.includes('--compare')){
 const before=JSON.parse(readFileSync(file)),changed=Object.keys(before).filter(p=>before[p]!==inventory[p]),added=Object.keys(inventory).filter(p=>!before[p])
 const protectedPaths=Object.keys(before).filter(p=>/election|polling|scoring-engine|competition-calculation|CompetitionScoringForm|useJudgeScoreDrafts|csv-export/.test(p))
 const report={checked:Object.keys(before).length,changed,added,protectedCount:protectedPaths.length,protectedChanged:protectedPaths.filter(p=>before[p]!==inventory[p])}
 writeFileSync(path.join(out,'source-preservation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report))
}else{writeFileSync(file,JSON.stringify(inventory,null,2),{flag:'wx'});console.log('Baseline captured: '+Object.keys(inventory).length+' files')}
