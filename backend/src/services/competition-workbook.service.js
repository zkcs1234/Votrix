import XLSX from 'xlsx'
import { ApiError } from '../utils/ApiError.js'
import { tabulationData, rulesFor } from './competition-workflow.service.js'
import { db } from '../foundation/db.js'
import { recordAudit } from '../foundation/audit.js'
import { scopeAllows } from '../../../shared/competition-calculation.js'

export const WORKBOOK_VERSION='VOTRIX-competition-2'
const sheet=(workbook,name,rows)=>XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet(rows),name)
const rowColor = (rules, divisionId) => {
 const division=rules.divisions.find(d=>d.id===divisionId),name=division?.name?.toLowerCase()
 return (division?.rowColor??division?.row_color??(name==='male'?'#DCEBFA':name==='female'?'#F7DCEC':'#FFFFFF')).replace('#','')
}
function appendGroupedWorksheets(book,state) {
 const rounds=state.rules.rounds.length?state.rules.rounds:[{id:null,name:'Overall'}]
 const judges=state.rules.judges??[...new Set(state.worksheets.map(w=>w.judgeId))].map(judgeId=>({judgeId,role:'judge'}))
 let sequence=0
 for(const round of rounds)for(const judge of judges.filter(j=>j.role!=='score_reviewer')){
   const worksheets=state.worksheets.filter(w=>w.roundId===round.id&&w.judgeId===judge.judgeId)
   const parents=state.rules.criteria.length?state.rules.criteria.filter(c=>!round.id||round.criteriaIds?.includes(c.id)):worksheets[0]?.criteria.map(c=>({...c,id:c.criteriaId,minorCriteria:c.minors}))??[]
   const entries=(state.rules.contestants??state.results.map(e=>({...e,id:e.contestantId,name:e.contestantName}))).filter(e=>(!round.id||round.contestantIds?.includes(e.id))&&scopeAllows(judge,e,round,state.rules.event.id))
   if(!entries.length)continue
   const headers=['Entry'],minorHeaders=['Name / number'],merges=[]
   for(const parent of parents){const start=headers.length,targets=parent.minorCriteria.length?parent.minorCriteria:[parent];headers.push(...targets.map(()=>`${parent.name} (${parent.percentage}%)`),'Lock');minorHeaders.push(...targets.map(m=>m.name??m.id),'Source revision');merges.push({s:{r:1,c:start},e:{r:1,c:headers.length-1}})}
   const totalColumn=headers.length;headers.push('Judge total','Round submission','Entry ID');minorHeaders.push('Weighted / rounded','Version','Stable identity')
   const rows=[['Judge ID',judge.judgeId,'Round ID',round.id,'Rule version',state.rules.id],headers,minorHeaders]
   for(const entry of entries){
     const source=state.lockedSources?.find(s=>s.round_id===round.id&&s.judge_id===judge.judgeId&&s.contestant_id===entry.id)
     const w=worksheets.find(w=>w.entryId===entry.id),values=[`#${entry.contestantNumber??''} ${entry.name}`]
     for(const parent of parents){const targets=parent.minorCriteria.length?parent.minorCriteria:[parent];values.push(...targets.map(m=>source?.scores[m.id]??w?.criteria.find(c=>c.criteriaId===parent.id)?.minors.find(v=>v.id===m.id)?.raw??'Missing'),source?.locked_criteria.includes(parent.id)?source.lock_versions?.[parent.id]?.version??source.revision:w?.complete?'Submitted source':'Incomplete')}
     rows.push([...values,w?.total??'Missing',w?.submissionId??'Not submitted',entry.id])
   }
   const name=`Judge Sheet ${++sequence}`;sheet(book,name,rows);const target=book.Sheets[name];target['!merges']=merges;target['!cols']=[{wch:32},...headers.slice(1).map(()=>({wch:18}))]
   entries.forEach((entry,index)=>{
     const w=worksheets.find(w=>w.entryId===entry.id),summary=state.worksheets.indexOf(w)+2
     for(let column=0;column<headers.length;column++){const cell=target[XLSX.utils.encode_cell({r:index+3,c:column})];if(cell)cell.s={fill:{fgColor:{rgb:rowColor(state.rules,entry.divisionId)}}}}
     const total=target[XLSX.utils.encode_cell({r:index+3,c:totalColumn})]
     if(w?.complete)total.f=`'Judge Worksheets'!F${summary}`
     if(total.t==='n')total.z=state.rules.scoringConfig.decimalPlaces?`0.${'0'.repeat(state.rules.scoringConfig.decimalPlaces)}`:'0'
   })
 }
}
export function writeStyledWorkbook(book) {
 const colors=new Map(book.SheetNames.flatMap(name=>Object.entries(book.Sheets[name]).filter(([,cell])=>cell?.s?.fill?.fgColor?.rgb).map(([address,cell])=>[`${name}:${address}`,cell.s.fill.fgColor.rgb])))
 const archive=XLSX.CFB.read(XLSX.write(book,{type:'buffer',bookType:'xlsx'}),{type:'buffer'})
 const styles=XLSX.CFB.find(archive,'/xl/styles.xml')
 let xml=Buffer.from(styles.content).toString('utf8')
 const fillBlock=/<fills count="(\d+)">([\s\S]*?)<\/fills>/.exec(xml),xfBlock=/<cellXfs count="(\d+)">([\s\S]*?)<\/cellXfs>/.exec(xml)
 const xfs=xfBlock[2].match(/<xf\b[^>]*(?:\/>|>[\s\S]*?<\/xf>)/g),fills=[],newXfs=[],map=new Map()
 book.SheetNames.forEach((name,index)=>{
   const part=XLSX.CFB.find(archive,`/xl/worksheets/sheet${index+1}.xml`)
   let sheetXml=Buffer.from(part.content).toString('utf8')
   sheetXml=sheetXml.replace(/<c\b([^>]*)>/g,(tag,attrs)=>{
     const address=/\br="([^"]+)"/.exec(attrs)?.[1],color=colors.get(`${name}:${address}`)
     if(!color)return tag
     const original=Number(/\bs="(\d+)"/.exec(attrs)?.[1]??0),key=`${color}:${original}`
     if(!map.has(key)){
       const fill=Number(fillBlock[1])+fills.length;fills.push(`<fill><patternFill patternType="solid"><fgColor rgb="FF${color}"/><bgColor indexed="64"/></patternFill></fill>`)
       const base=xfs[original]??xfs[0]
       newXfs.push(base.replace(/fillId="\d+"/,`fillId="${fill}"`).replace(/applyFill="[^"]*"/,'').replace('<xf ', '<xf applyFill="1" '))
       map.set(key,Number(xfBlock[1])+newXfs.length-1)
     }
     return `<c ${attrs.replace(/\bs="\d+"/,'')} s="${map.get(key)}">`
   })
   part.content=Buffer.from(sheetXml);part.size=part.content.length
 })
 xml=xml.replace(fillBlock[0],`<fills count="${Number(fillBlock[1])+fills.length}">${fillBlock[2]}${fills.join('')}</fills>`).replace(xfBlock[0],`<cellXfs count="${Number(xfBlock[1])+newXfs.length}">${xfBlock[2]}${newXfs.join('')}</cellXfs>`)
 styles.content=Buffer.from(xml);styles.size=styles.content.length
 return XLSX.CFB.write(archive,{type:'buffer',fileType:'zip',compression:true})
}
export function buildWorkbook(state,calculation=null) {
 const book=XLSX.utils.book_new(),rule=state.rules,dp=rule.scoringConfig.decimalPlaces??2
 const displayResults=rule.scoringConfig.calculationMethod==='manual'?calculation?.result_snapshot??[]:state.results
 const status=calculation?.status==='published'&&calculation.rules_version===state.rules.id&&calculation.source_digest===state.sourceDigest?'PUBLISHED':state.ready?'READY FOR VERIFICATION':'PROVISIONAL'
 sheet(book,'Competition Info',[['Template',WORKBOOK_VERSION],['Competition ID',rule.event.id],['Round ID',calculation?.round_id??'overall'],['Configuration ID',rule.id],['Calculation ID',calculation?.id??'provisional'],['Status',status],['Title',rule.event.title],['Precision',dp],['Rounding','Half up; each weighted judge total, then aggregation/final total']])
 sheet(book,'Official Scoring Rules',[['Method',rule.scoringConfig.calculationMethod],['Version',rule.version],['Rule JSON',JSON.stringify(rule)]])
 const raw=[['Event ID','Session ID','Round ID','Judge ID','Entry ID','Major ID','Minor ID','Raw score','Minimum','Maximum','Normalized','Major weight (%)','Minor weight (%)','Weighted contribution (percentage points)']]
 const judgeRows=[['Round ID','Judge ID','Entry ID','Submission ID','Status','Judge total']]
 for(const w of state.worksheets){
   const refs=[]
   for(const c of w.criteria)for(const m of c.minors){raw.push([rule.event.id,state.session?.id,w.roundId,w.judgeId,w.entryId,c.criteriaId,m.id,m.raw,m.minScore,m.maxScore,Number(m.raw)/m.maxScore*100,c.percentage,m.percentage??'','']);refs.push(`'Raw Scores'!N${raw.length}`)}
   judgeRows.push([w.roundId,w.judgeId,w.entryId,w.submissionId,w.complete?'Submitted':'Missing / Incomplete',w.total])
   judgeRows[judgeRows.length-1].formula=w.complete?`ROUND(SUM(${refs.join(',')}),${dp})`:null
 }
 sheet(book,'Raw Scores',raw)
 for(let n=2;n<=raw.length;n++){
  book.Sheets['Raw Scores'][`K${n}`].f=`H${n}/J${n}*100`
  const worksheet=state.worksheets.find(w=>w.entryId===raw[n-1][4]&&w.judgeId===raw[n-1][3]&&w.roundId===raw[n-1][2])
  const criterion=worksheet?.criteria.find(c=>c.criteriaId===raw[n-1][5]),count=criterion?.minors.length??1
  const directWeights=rule.scoringConfig.minorWeightBasis==='overall'
  const weightedMinors=criterion?.minors.some(minor=>minor.percentage!==undefined)
  book.Sheets['Raw Scores'][`N${n}`].f=directWeights&&weightedMinors?`K${n}*M${n}/100`:weightedMinors?`K${n}*L${n}*M${n}/10000`:`K${n}*L${n}/100/${count}`
 }
 sheet(book,'Judge Worksheets',judgeRows)
 for(let n=2;n<=judgeRows.length;n++)if(judgeRows[n-1].formula)book.Sheets['Judge Worksheets'][`F${n}`].f=judgeRows[n-1].formula
 sheet(book,'Computation Breakdown',[['Round','Entry','Judge','Major','Minor inputs','Percent','Average','Contribution'],...state.worksheets.flatMap(w=>w.criteria.map(c=>[w.roundId,w.entryId,w.judgeId,c.criteriaId,JSON.stringify(c.minors),c.percentage,c.average,c.contribution]))])
 sheet(book,'Score Matrix',[['Entry ID','Name','Division ID','Judge totals','Base score','Deductions','Final score','Rank','Status'],...displayResults.map(r=>[r.contestantId,r.contestantName,r.divisionId,JSON.stringify(r.judgeTotals??[]),r.baseScore,r.deductionTotal,r.finalScore,r.rank,r.status])])
 sheet(book,'Approved Penalties',[['ID','Entry ID','Round ID','Rule ID','Amount','Status','Reason','Evidence'],...state.deductions.map(d=>[d.id,d.contestant_id,d.round_id,d.rule_id,d.amount,d.decision_status,d.reason,d.evidence])])
 sheet(book,'Rankings',[['Entry ID','Name','Final score','Rank','Status'],...displayResults.map(r=>[r.contestantId,r.contestantName,r.finalScore,r.rank,r.status])])
 sheet(book,'Advancement',[['Round ID','Purpose','Progression','Next round','Advancement rule','Value'],...rule.rounds.map(r=>[r.id,r.purpose,r.progression,r.nextRoundId,r.advancementType,r.advancementValue])])
 sheet(book,'Final Results',[['Calculation ID','Publication status','Entry ID','Rank','Official score'],...(calculation?.result_snapshot??[]).map(r=>[calculation.id,calculation.status,r.contestantId,r.rank,r.finalScore])])
 sheet(book,'Audit Verification',[['Configuration ID',rule.id],['Source versions',JSON.stringify(state.sourceVersions)],['Source digest',state.sourceDigest],['Verified by',calculation?.verified_by],['Verified at',calculation?.verified_at],['Published by',calculation?.published_by],['Published at',calculation?.published_at]])
 appendGroupedWorksheets(book,state)
 // The application and spreadsheet use the same saved values and rounding
 // policy. Cell colors are preserved as optional OOXML style metadata.
 for(const [index,row]of displayResults.entries()){
   const color=rowColor(rule,row.divisionId)
   for(let column=0;column<9;column++){const cell=book.Sheets['Score Matrix'][XLSX.utils.encode_cell({r:index+1,c:column})];if(cell)cell.s={fill:{fgColor:{rgb:color}},numFmt:`0.${'0'.repeat(dp)}`}}
 }
 for(const name of ['Score Matrix','Judge Worksheets','Computation Breakdown','Final Results'])for(const[address,cell]of Object.entries(book.Sheets[name]))if(!address.startsWith('!')&&cell.t==='n')cell.z=dp?`0.${'0'.repeat(dp)}`:'0'
 return book
}
function checkZip(buffer) {
 if(buffer.length<4||buffer.length>5*1024*1024||buffer.readUInt16LE(0)!==0x4b50)throw new ApiError(400,'A .xlsx file up to 5 MB is required')
 let expanded=0
 for(let i=0;i<buffer.length-46;i++)if(buffer.readUInt32LE(i)===0x02014b50){expanded+=buffer.readUInt32LE(i+24);if(expanded>50*1024*1024)throw new ApiError(400,'Workbook is too large when expanded')}
}
export function compareWorkbook(expected,received) {
 const matches=[],mismatches=[],missing=[],invalid=[]
 for(const name of expected.SheetNames){
   if(!received.Sheets[name]){missing.push({sheet:name,reason:'Missing sheet'});continue}
   for(const [address,cell]of Object.entries(expected.Sheets[name])){
     if(address.startsWith('!'))continue
     const actual=received.Sheets[name][address]
     if(!actual){missing.push({sheet:name,address});continue}
     if(actual.f!==cell.f){invalid.push({sheet:name,address,reason:'Formula changed or external formula'});continue}
     if(!(cell.f&&typeof actual.v==='number'&&typeof cell.v==='number'&&Math.abs(actual.v-cell.v)<=1e-10)&&String(actual.v??'')!==String(cell.v??''))mismatches.push({sheet:name,address,expected:cell.v,actual:actual.v})
     else matches.push({sheet:name,address})
   }
 }
 const raw=XLSX.utils.sheet_to_json(received.Sheets['Raw Scores']??{}, {header:1})
 const expectedRaw=XLSX.utils.sheet_to_json(expected.Sheets['Raw Scores'],{header:1})
 const identities=new Set(expectedRaw.slice(1).map(r=>[r[2],r[3],r[4],r[5],r[6]].join(':')))
 const seen=new Set()
 for(const row of raw.slice(1)){const key=[row[2],row[3],row[4],row[5],row[6]].join(':');if(!identities.has(key))invalid.push({reason:'Unknown score identity',key});if(seen.has(key))invalid.push({reason:'Duplicate score identity',key});seen.add(key);if(!Number.isFinite(Number(row[7]))||Number(row[7])<Number(row[8])||Number(row[7])>Number(row[9]))invalid.push({key,reason:'Score out of bounds'})}
 const meta=XLSX.utils.sheet_to_json(received.Sheets['Competition Info']??{}, {header:1}),wanted=XLSX.utils.sheet_to_json(expected.Sheets['Competition Info'], {header:1})
 const conflicts=wanted.slice(0,5).filter((r,i)=>String(r[1]??'')!==String(meta[i]?.[1]??'')).map(r=>({field:r[0],reason:'Template, competition, round, configuration or calculation version conflict'}))
 return{matches,mismatches,missing,invalid,versionConflicts:conflicts,verified:!mismatches.length&&!missing.length&&!invalid.length&&!conflicts.length,verificationOnly:true}
}
export async function exportWorkbook(eventId,actor,options={}) {
 const state=await tabulationData(eventId,actor,options)
 const {data:calculation,error}=await db().from('competition_result_calculations').select('*').eq('event_id',eventId).filter('round_id',options.roundId?'eq':'is',options.roundId??null).order('created_at',{ascending:false}).limit(1).maybeSingle()
 if(error)throw new ApiError(503,'Calculation lookup unavailable')
 await recordAudit({userId:actor,action:'competition.excel.export',entity:'events',entityId:eventId,details:{rulesVersion:state.rules.id,sourceDigest:state.sourceDigest}})
 return writeStyledWorkbook(buildWorkbook(state,calculation))
}
export async function verifyWorkbook(eventId,actor,file,options={}) {
 if(!file?.buffer||!file.originalname?.toLowerCase().endsWith('.xlsx'))throw new ApiError(400,'Upload the VOTRIX .xlsx template')
 checkZip(file.buffer)
 let received;try{received=XLSX.read(file.buffer,{type:'buffer',cellFormula:true,bookVBA:false,cellStyles:false})}catch{throw new ApiError(400,'Invalid XLSX workbook')}
 const state=await tabulationData(eventId,actor,options),rules=await rulesFor(eventId)
 const {data:calculation}=await db().from('competition_result_calculations').select('*').eq('event_id',eventId).filter('round_id',options.roundId?'eq':'is',options.roundId??null).order('created_at',{ascending:false}).limit(1).maybeSingle()
 const result=compareWorkbook(buildWorkbook(state,calculation),received)
 await recordAudit({userId:actor,action:'competition.excel.verify',entity:'events',entityId:eventId,details:{rulesVersion:rules.id,verified:result.verified,mismatches:result.mismatches.length}})
 return result
}
