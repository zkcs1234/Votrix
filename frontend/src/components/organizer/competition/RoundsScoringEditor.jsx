import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Calculator, Check, ChevronRight, Circle, CircleAlert, CircleMinus, FileText, Flag, Keyboard, Layers, MoreHorizontal, Plus, Scale, Settings2, Target, Trash2, X } from 'lucide-react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import CompetitionScoringForm from '@/components/voter/competition/CompetitionScoringForm'
import CalculationPreview from './CalculationPreview'
import ScoringPenaltyRules from './ScoringPenaltyRules'
import { DEDUCTION_LABELS, effectiveDeductionMode } from '../../../../../shared/competition-deductions.js'
import { INPUT_CLASS } from '@/utils/uiClasses'
import { getScoringMethodOptions } from '../../../../../shared/competition-rule-configuration.js'
import { calculateOfficial, combineOfficialContributions } from '../../../../../shared/competition-calculation.js'
import { setupReadiness } from '../../../../../shared/competition-setup-readiness.js'
import { roundScoringReadiness } from '@/utils/competitionRoundReadiness'
import './RoundsScoringEditor.css'

const uuid = () => crypto.randomUUID()
const ignorePending = () => {}
const scopesOf = value => value.structure === 'single' ? [{id:null,name:value.scoringConfig.singleRoundName || 'Single Round'}] : value.rounds
const rearrange = rounds => rounds.map((r,i) => {
  const next = {...r,displayOrder:i}
  delete next.nextRoundId
  if (i < rounds.length-1) {next.nextRoundId=rounds[i+1].id;next.advancementType ??= 'none'}
  else {delete next.advancementType;delete next.advancementValue}
  return next
})
const appendRound = value => {
  const weighted=value.rounds.some(r=>r.progression==='weighted')
  return rearrange([...value.rounds,{id:uuid(),name:'',progression:value.rounds.at(-1)?.progression??'back_to_zero',...(weighted?{weight:0}:{})}])
}
const scoringMethodOptions = (method, criterionBasis) => getScoringMethodOptions(method).map(option =>
  option.id === 'weighted_average' && criterionBasis !== 'points'
    ? { ...option, name: 'Weighted Mean' }
    : option,
)
function Field({label,displayLabel=label,value,onChange,type='text',invalid=false,...props}) {
  return <label className="rs-field">{displayLabel}<input className={INPUT_CLASS} aria-label={label} aria-invalid={invalid||undefined} value={value ?? ''} type={type} onChange={e => onChange(type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)} {...props}/></label>
}
function Select({label,displayLabel=label,value,onChange,children,invalid=false,...props}) {
  return <label className="rs-field">{displayLabel}<select className={INPUT_CLASS} aria-label={label} aria-invalid={invalid||undefined} value={value ?? ''} onChange={e => onChange(e.target.value)} {...props}>{children}</select></label>
}
function OrderButtons({name,index,items,onChange}) {
  const move = delta => {const next=[...items];[next[index],next[index+delta]]=[next[index+delta],next[index]];onChange(next)}
  return <span className="rs-actions"><Button variant="ghost" size="sm" aria-label={`Move ${name} earlier`} disabled={!index} onClick={() => move(-1)}><ArrowUp size={15}/></Button><Button variant="ghost" size="sm" aria-label={`Move ${name} later`} disabled={index===items.length-1} onClick={() => move(1)}><ArrowDown size={15}/></Button></span>
}

export default function RoundsScoringEditor({value,onChange,entries=[],step='structure',onPendingChange=ignorePending,hasPendingForm=false,draft=false,competitionName='',activeRoundId,onRoundChange}) {
  const patch = fields => onChange({...value,...fields})
  const score = fields => patch({scoringConfig:{...value.scoringConfig,...fields}})
  return <div className="rs-editor">
    {step==='configuration' && <Configuration value={value} patch={patch} score={score} entries={entries} onPendingChange={onPendingChange} hasPendingForm={hasPendingForm} draft={draft} competitionName={competitionName} activeRoundId={activeRoundId} onRoundChange={onRoundChange}/>}
    {step==='round-configuration' && <Configuration value={value} patch={patch} score={score} entries={entries} onPendingChange={onPendingChange} hasPendingForm={hasPendingForm} draft={draft} competitionName={competitionName} activeRoundId={activeRoundId} onRoundChange={onRoundChange} roundOnly/>}
    {step==='structure' && <Structure value={value} patch={patch} score={score} entries={entries}/>}
    {step==='criteria' && <Criteria key={value.structure} value={value} patch={patch} onPendingChange={onPendingChange} hasPendingForm={hasPendingForm} draft={draft}/>}
    {step==='score-sheet' && <div className="space-y-5"><OtherSettings value={value} patch={patch} score={score} scope={scopesOf(value)[0]} onPendingChange={onPendingChange}/><ScoreSheet value={value} competitionName={competitionName}/></div>}
    {step==='deductions' && <Deductions value={value} score={score} patch={patch} onPendingChange={onPendingChange}/>}
  </div>
}

function Structure({value,patch,score,entries,compact=false}) {
  const structureRef=useRef(null),newRoundRef=useRef(null)
  useEffect(()=>{
    if(!newRoundRef.current)return
    const input=[...structureRef.current.querySelectorAll('input[data-round-id]')].find(input=>input.dataset.roundId===newRoundRef.current)
    input?.focus();newRoundRef.current=null
  },[value.rounds])
  const config=value.scoringConfig, weighted=value.rounds.some(r=>r.progression==='weighted')
  const changeRound=(id,fields)=>patch({rounds:value.rounds.map(r=>r.id===id?{...r,...fields}:r)})
  const structure=mode=>{
    if(mode===value.structure)return
    if(mode==='multiple') {
      const id=uuid()
      patch({structure:mode,rounds:[{id,name:config.singleRoundName||'',displayOrder:0,progression:'back_to_zero'}],criteria:value.criteria.map(c=>({...c,roundId:id}))})
    } else {
      if(value.rounds.length>1 && !window.confirm('Keep the first round as the single round? Other rounds, their criteria and round-specific judge assignments will be removed only when you save.'))return
      const first=value.rounds[0]
      patch({structure:mode,rounds:[],criteria:value.criteria.filter(c=>c.roundId===first?.id).map(c=>({...c,roundId:null})),scoringConfig:{...config,singleRoundName:first?.name||undefined,numericCarryBasis:undefined}})
    }
  }
  return <div className="rs-structure" ref={structureRef}>
    <section className="rs-section rs-setup-card" aria-label="Round setup">
    <div className="rs-section-heading"><span className="rs-section-icon"><Flag size={24} aria-hidden="true"/></span><div><h3 className="rs-title">Round Setup</h3><p>Choose how competitors move through this scoring configuration.</p></div></div>
    <fieldset className="rs-arrangement"><legend className="sr-only">How is this competition organized?</legend>{[
      {id:'single',label:'Single Round',description:'One scoring phase determines the final result.',Icon:Circle},
      {id:'multiple',label:'Multiple Rounds',description:'Use sequential phases such as qualifying rounds and a final.',Icon:Layers},
    ].map(({id,label,description,Icon})=><label key={id} className="rs-arrangement-option" data-selected={value.structure===id}><input className="sr-only" type="radio" name="round-arrangement" aria-label={label} checked={value.structure===id} onChange={()=>structure(id)}/><span className="rs-arrangement-icon"><Icon size={24} aria-hidden="true"/></span><span className="rs-arrangement-copy"><strong>{label}</strong><span>{description}</span></span><span className="rs-arrangement-check" aria-hidden="true">{value.structure===id&&<Check size={17}/>}</span></label>)}</fieldset>
    </section>
    <section className="rs-section rs-rounds-card" aria-label="Your rounds">
    <div className="rs-section-heading rs-rounds-heading"><div><h3 className="rs-title">Your Rounds</h3><p>{value.structure==='single'?'Name the scoring phase judges will use.':'Name, order, and configure each phase of the competition.'}</p></div>{value.structure==='multiple'&&<span className="rs-count-badge">{value.rounds.length} {value.rounds.length===1?'round':'rounds'}</span>}</div>
    {value.structure==='single' ? <article className="rs-round-card"><div className="rs-round-heading"><span className="rs-round-number" aria-label="Round 1">01</span><Field label="Single round name" displayLabel={<span className="sr-only">Single round name</span>} placeholder="Round name, e.g. Final" className={`${INPUT_CLASS} min-h-11 w-full`} value={config.singleRoundName??'Single Round'} onChange={singleRoundName=>score({singleRoundName})} maxLength={200}/></div></article> : <>
      {!compact && value.rounds.length>1 && <Select label="Round scoring model" value={weighted?'weighted':value.rounds.at(-1)?.progression??'back_to_zero'} onChange={policy=>patch({rounds:value.rounds.map(r=>{const next={...r,progression:policy};if(policy==='weighted')next.weight=r.weight??100/value.rounds.length;else delete next.weight;return next}),scoringConfig:{...config,numericCarryBasis:policy==='weighted'&&config.calculationMethod==='rank_based'?'weighted_judge_average':undefined}})}><option value="back_to_zero">Independent / qualification — start each round at zero</option><option value="carry_forward" disabled={['rank_based','manual'].includes(config.calculationMethod)}>Carry previous scores forward</option><option value="weighted" disabled={config.calculationMethod==='manual'}>Combine weighted round scores</option></Select>}
      {value.rounds.map((r,i)=><article key={r.id} className="rs-round-card" data-incomplete={!r.name.trim()}>
        <div className="rs-round-heading"><span className="rs-round-number" aria-label={`Round ${i+1}`}>{String(i+1).padStart(2,'0')}</span><Field label={`Round ${i+1} name`} displayLabel={<span className="sr-only">Round {i+1} name</span>} placeholder="Round name, e.g. Preliminary" className={`${INPUT_CLASS} min-h-11 w-full`} data-round-id={r.id} value={r.name} onChange={name=>changeRound(r.id,{name})} maxLength={200}/><div className="rs-round-actions"><OrderButtons name={r.name||`Round ${i+1}`} index={i} items={value.rounds} onChange={rounds=>{if(window.confirm('Reorder draft rounds and update their qualification destinations? Review qualification settings before saving.'))patch({rounds:rearrange(rounds)})}}/><Button size="sm" variant="ghost" className="rs-remove-round" aria-label={`Remove ${r.name||`Round ${i+1}`}`} onClick={()=>{if(window.confirm('Remove this round, its criteria and its round-specific judge assignments when saving?'))patch({rounds:rearrange(value.rounds.filter(x=>x.id!==r.id)),criteria:value.criteria.filter(c=>c.roundId!==r.id)})}}><Trash2 size={15}/></Button></div></div>
        {!r.name.trim()&&<p className="rs-round-name-hint"><CircleAlert size={14} aria-hidden="true"/>Enter a round name to continue.</p>}
        {(r.description||weighted)&&<p className="v-helper-text rs-round-description">{r.description}{weighted&&<span className="rs-round-contribution">{Number(r.weight)||0}% of final score</span>}</p>}
        {(!compact||!!entries.length)&&<details className="rs-round-settings"><summary>Round settings</summary>
        {!compact&&<div className="rs-grid mt-3"><Select label={`Round ${i+1} calculation method`} value={r.calculationMethod??config.calculationMethod} onChange={calculationMethod=>changeRound(r.id,{calculationMethod})}>{scoringMethodOptions(r.calculationMethod??config.calculationMethod,config.criterionBasis).map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</Select>{weighted&&<Field label={`${r.name} contribution percentage`} type="number" min={0} max={100} step="any" value={r.weight} onChange={weight=>changeRound(r.id,{weight})}/>}</div>}
        {!compact&&i<value.rounds.length-1 && <div className="rs-grid"><Select label={`Round ${i+1} qualification`} value={r.advancementType??'none'} onChange={advancementType=>{const next={...r,advancementType};if(['none','manual'].includes(advancementType))delete next.advancementValue;patch({rounds:value.rounds.map(x=>x.id===r.id?next:x)})}}>{[['none','All continue'],['top_n','Top number of entries'],['top_percent','Top percentage'],['threshold','Minimum score'],['manual','Reviewed manual selection']].map(([id,label])=><option key={id} value={id}>{label}</option>)}</Select>{['top_n','top_percent','threshold'].includes(r.advancementType)&&<Field label={`Round ${i+1} qualification value`} type="number" min={0} step={r.advancementType==='top_n'?1:'any'} value={r.advancementValue} onChange={advancementValue=>changeRound(r.id,{advancementValue})}/>}</div>}
        {!!entries.length&&<details><summary>Planned entrants ({r.entryIds?.length??entries.length})</summary><p className="v-helper-text">Later rounds also require confirmed qualification.</p>{entries.map(e=><label key={e.id} className="block"><input type="checkbox" checked={r.entryIds===undefined||r.entryIds.includes(e.id)} onChange={ev=>{const ids=r.entryIds??entries.map(x=>x.id);changeRound(r.id,{entryIds:ev.target.checked?[...ids,e.id]:ids.filter(id=>id!==e.id)})}}/> Entry #{e.entry_number}</label>)}<Button size="sm" variant="secondary" onClick={()=>{const next={...r};delete next.entryIds;patch({rounds:value.rounds.map(x=>x.id===r.id?next:x)})}}>Use all entrants</Button></details>}</details>}
      </article>)}
      <Button variant="secondary" className="rs-add-round" onClick={()=>{const rounds=appendRound(value);newRoundRef.current=rounds.at(-1).id;patch({rounds})}}>+ Add Round</Button>
      {!compact&&(weighted?<p role="status">Total round weight: {value.rounds.reduce((s,r)=>s+(Number(r.weight)||0),0)}% {Math.abs(value.rounds.reduce((s,r)=>s+(Number(r.weight)||0),0)-100)<0.001?'✓':'— must total 100%'}</p>:<p className="v-helper-text">Round weights are not used for this model. Qualification and score carry are separate decisions.</p>)}
    </>}
    </section>
  </div>
}

function Criteria({value,patch,score,onPendingChange,hasPendingForm,draft,selectedRound}) {
  const basisDescriptionId=useId()
  const points=value.scoringConfig.criterionBasis==='points'
  const updateScoringConfig=score??(fields=>patch({scoringConfig:{...value.scoringConfig,...fields}}))
  const scopes=scopesOf(value),[roundId,setRound]=useState(scopes[0]?.id??null)
  const scope=scopes.find(s=>s.id===(selectedRound===undefined?roundId:selectedRound))??scopes[0]
  const own=value.criteria.filter(c=>c.roundId===scope?.id),total=own.reduce((sum,c)=>sum+(Number(c.percentage)||0),0),maximumPoints=own.reduce((sum,c)=>sum+(Number(c.maxScore)||0),0)
  const weightComplete=Math.abs(total-100)<=0.001,weightProgress=Math.min(100,Math.max(0,total))
  const [criterion,setCriterion]=useState(null),[editing,setEditing]=useState(false),[error,setError]=useState(''),[validationAttempted,setValidationAttempted]=useState(false),[copying,setCopying]=useState(false),[minorPending,setMinorPending]=useState({})
  const trackMinor=useCallback((key,pending)=>setMinorPending(current=>current[key]===pending?current:{...current,[key]:pending}),[])
  const open=!!criterion
  useEffect(()=>{onPendingChange('major',open);return()=>onPendingChange('major',false)},[onPendingChange,open])
  const reset=()=>{setCriterion(null);setEditing(false);setError('');setValidationAttempted(false);setMinorPending({})}
  const begin=c=>{setEditing(!!c);setCriterion(c?structuredClone(c):{id:uuid(),roundId:scope.id,name:'',percentage:points?undefined:'',minScore:1,maxScore:10,minorCriteria:[]});setError('');setValidationAttempted(false);setMinorPending({})}
  const change=fields=>{setCriterion(current=>({...current,...fields}));setError('')}
  const duplicateName=!!criterion&&own.some(item=>item.id!==criterion.id&&item.name.trim().toLowerCase()===criterion.name.trim().toLowerCase())
  const criterionNameInvalid=validationAttempted&&!!criterion&&(!criterion.name.trim()||duplicateName)
  const criterionWeightInvalid=validationAttempted&&!!criterion&&!points&&(
    !Number.isFinite(Number(criterion.percentage))||Number(criterion.percentage)<=0||Number(criterion.percentage)>100||
    total-(own.find(item=>item.id===criterion.id)?.percentage??0)+Number(criterion.percentage)>100.001||
    (criterion.minorCriteria.length>0&&criterion.minorCriteria.some(item=>item.percentage!==undefined)&&(
      criterion.minorCriteria.some(item=>!(item.percentage>0))||
      Math.abs(criterion.minorCriteria.reduce((sum,item)=>sum+(Number(item.percentage)||0),0)-
        (value.scoringConfig.minorWeightBasis==='overall'?Number(criterion.percentage):100))>0.001
    ))
  )
  const criterionPointsInvalid=validationAttempted&&!!criterion&&points&&(!Number.isFinite(Number(criterion.maxScore))||Number(criterion.maxScore)<=0)
  const criterionRangeInvalid=validationAttempted&&!!criterion&&(!Number.isFinite(criterion.minScore)||!Number.isFinite(criterion.maxScore)||criterion.maxScore<=0||criterion.maxScore<=criterion.minScore)
  const save=()=>{
    setValidationAttempted(true)
    const c=criterion,weight=Number(c.percentage)
    if(!c.name.trim()||(!points&&(!Number.isFinite(weight)||weight<=0||weight>100))){setError(points?'Enter a criterion name and maximum points.':'Enter a name and a weight greater than zero, up to 100%.');return}
    if(own.some(x=>x.id!==c.id&&x.name.trim().toLowerCase()===c.name.trim().toLowerCase())){setError('A major criterion with this name already exists in this round.');return}
    if(!points&&total-(own.find(x=>x.id===c.id)?.percentage??0)+weight>100.001){setError('Major criterion weights cannot exceed 100%.');return}
    if(!Number.isFinite(c.minScore)||!Number.isFinite(c.maxScore)||c.maxScore<=0||c.maxScore<=c.minScore){setError('Enter a valid score range with a maximum greater than the minimum and zero.');return}
    const expectedMinorTotal=value.scoringConfig.minorWeightBasis==='overall'?weight:100
    const minorWeightsInvalid=!points&&c.minorCriteria.length>0&&c.minorCriteria.some(m=>m.percentage!==undefined)&&
      (c.minorCriteria.some(m=>!(m.percentage>0))||Math.abs(c.minorCriteria.reduce((sum,m)=>sum+(Number(m.percentage)||0),0)-expectedMinorTotal)>0.001)
    if(minorWeightsInvalid){
      setError(`Minor criterion weights must be positive and total ${expectedMinorTotal}%${value.scoringConfig.minorWeightBasis==='overall'?' to match the major criterion':''}.`);return
    }
    const saved={...c,name:c.name.trim(),...(points?{percentage:undefined}:{percentage:weight})}
    patch({criteria:editing?value.criteria.map(x=>x.id===c.id?saved:x):[...value.criteria,saved]});reset()
  }
  const changeBasis=criterionBasis=>{
    if (criterionBasis===value.scoringConfig.criterionBasis) return
    if (value.criteria.length&&!window.confirm('Changing the criterion scoring basis changes how existing values are interpreted. Existing criteria will be preserved; review their weights or maximum points before saving. Continue?')) return
    updateScoringConfig({criterionBasis,...(!value.criteria.length&&criterionBasis==='points'&&value.scoringConfig.calculationMethod==='weighted_average'?{calculationMethod:'sum'}:{})})
  }
  const reorder=items=>{let i=0;patch({criteria:value.criteria.map(c=>c.roundId===scope.id?items[i++]:c)})}
  if(!scope)return <p>Add a round in Round Setup first.</p>
  return <section className="rs-criteria space-y-4" aria-label="Scoring criteria">
    <div className="rs-criteria-heading"><div><h3>Scoring criteria</h3><p>Define the criteria judges will score in this round.</p></div><div role="status" className="rs-criteria-total" data-complete={points||weightComplete}><strong>{points?'Total points':'Total weight'}: {points?`${Number(maximumPoints.toFixed(3))} pts`:`${Number(total.toFixed(3))}%`}</strong><span>{points?'Each judge enters one score per major criterion.':weightComplete?(draft?'Weights total 100%; save to apply.':'Weights complete'):total<100?`Add ${Number((100-total).toFixed(3))}% before continuing.`:'Reduce weights to 100% before continuing.'}</span></div></div>
    {!points&&<div className="rs-weight-allocation" aria-label="Weight allocation">
      <div className="rs-weight-caption"><span>{weightComplete?'Allocation complete':total>100?'Over allocated':'Weight allocated'}</span><strong>{Number(total.toFixed(3))}% <span>/ 100%</span></strong></div>
      <div className="rs-weight-track" role="progressbar" aria-label="Criterion weight allocation" aria-valuemin="0" aria-valuemax="100" aria-valuenow={weightProgress} aria-valuetext={`${Number(total.toFixed(3))}% of 100% allocated`}><span style={{width:`${weightProgress}%`}} data-over={total>100}/></div>
    </div>}
    <div className="rs-basis-select">
      <Select label="Select a scoring basis" value={points?'points':'percentage'} onChange={changeBasis} aria-describedby={basisDescriptionId}>
        <option value="percentage">Percentage (%) — weights add up to 100%</option>
        <option value="points">Points — maximum score per criterion</option>
      </Select>
      <p id={basisDescriptionId} className="v-helper-text rs-basis-description">{points?'Major criteria use maximum point allocations. Judges enter one score per major criterion.':'Major criteria use percentage weights. Minor criterion scores are normalized and averaged within each major criterion.'}</p>
    </div>
    {selectedRound===undefined&&scopes.length>1&&<Select label="Criteria round" value={scope.id} onChange={id=>{if(hasPendingForm&&!window.confirm('Discard the unfinished criterion form before changing selection?'))return;setRound(id);reset()}}>{scopes.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</Select>}
    {!own.length?<div className="rs-empty-state"><span className="rs-empty-icon"><FileText size={24}/></span><strong>No scoring criteria yet</strong><p>Add criteria that describe what judges should evaluate for {scope.name}.</p><Button variant="primary" aria-label="Add Criterion" className="rs-add-criterion" onClick={()=>begin()}><Plus size={16}/>Add criterion</Button>{scopes.length>1&&<Button variant="secondary" onClick={()=>setCopying(true)}>Copy Criteria From...</Button>}</div>:<div className="rs-criteria-table-wrap"><table className="rs-criteria-table"><thead><tr><th scope="col">No.</th><th scope="col">Criterion</th><th scope="col">{points?'Maximum score':'Score range'}</th><th scope="col">{points?'Guidelines':'Weight'}</th><th scope="col">Actions</th></tr></thead><tbody>
      {own.map((c,i)=><tr key={c.id}>
        <td><span className="rs-row-number">{String(i+1).padStart(2,'0')}</span></td>
        <td><button type="button" className="rs-criterion-name" aria-label={`Edit criterion ${c.name}`} onClick={()=>begin(c)}><span><strong>{c.name}</strong><small>{c.minorCriteria?.length?`${c.minorCriteria.length} ${points?'evaluation guidelines':'minor criteria'} · ${points?`Maximum: ${c.maxScore}`:c.minorCriteria.some(m=>m.minScore!==c.minorCriteria[0].minScore||m.maxScore!==c.minorCriteria[0].maxScore)?'Custom ranges':`Range: ${c.minorCriteria[0].minScore}–${c.minorCriteria[0].maxScore}`}`:`Range: ${c.minScore}–${c.maxScore}`}</small></span></button></td>
        <td><span className="rs-criterion-value">{points?`${c.maxScore} pts`:`${c.minScore}–${c.maxScore}`}</span></td>
        <td><span className="rs-weight-pill" data-points={points}>{points?`${c.minorCriteria?.length??0} guidelines`:`${c.percentage}%`}</span></td>
        <td><div className="rs-row-tools"><OrderButtons name={c.name} index={i} items={own} onChange={reorder}/><Button size="sm" variant="ghost" className="text-v-danger" aria-label={`Remove criterion ${c.name}`} onClick={()=>{if(window.confirm('Remove this major criterion and its minor criteria from the draft?'))patch({criteria:value.criteria.filter(x=>x.id!==c.id)})}}><Trash2 size={16}/></Button></div></td>
      </tr>)}
    </tbody></table>
      {!points&&<div className="rs-criteria-table-footer">
        <div className="rs-table-total"><div><span>Total weight</span><strong>{Number(total.toFixed(3))}% / 100%</strong></div><div className="rs-table-progress" aria-hidden="true"><span style={{width:`${weightProgress}%`}} data-over={total>100}/></div></div>
        <span className="rs-table-remaining" data-complete={weightComplete}>{weightComplete?'Weight fully assigned':total>100?`${Number((total-100).toFixed(3))}% over allocated`:`${Number((100-total).toFixed(3))}% left to assign`}</span>
        <div className="rs-table-actions"><Button variant="primary" aria-label="Add Criterion" className="rs-add-criterion" onClick={()=>begin()}><Plus size={16}/>Add criterion</Button>{scopes.length>1&&<Button variant="secondary" onClick={()=>setCopying(true)}>Copy criteria from...</Button>}</div>
      </div>}
      {points&&<div className="rs-criteria-table-footer rs-points-table-footer"><strong>Total maximum points</strong><span>{Number(maximumPoints.toFixed(3))} pts</span><div className="rs-table-actions"><Button variant="primary" aria-label="Add Criterion" className="rs-add-criterion" onClick={()=>begin()}><Plus size={16}/>Add criterion</Button>{scopes.length>1&&<Button variant="secondary" onClick={()=>setCopying(true)}>Copy criteria from...</Button>}</div></div>}
    </div>}
    <Modal open={open} onClose={reset} id="criterion-dialog" title={editing?'Edit Criterion':'Add Criterion'} footer={<div className="rs-dialog-actions"><Button variant="secondary" onClick={reset}>Cancel</Button><Button disabled={Object.values(minorPending).some(Boolean)} onClick={save}>Save Criterion</Button></div>}>
      {criterion&&<div className="rs-criteria-form rs-criterion-dialog"><div className="rs-criterion-basics"><Field label="Major criterion name" displayLabel={<span className="sr-only">Criterion Name</span>} placeholder="Criterion name, e.g. Execution & Technique" value={criterion.name} onChange={name=>change({name})} invalid={criterionNameInvalid} maxLength={200}/><div className="rs-criterion-weight">{points?<Field label="Maximum Points" displayLabel="Maximum Points" placeholder="10" type="number" min={0} step="any" value={criterion.maxScore} onChange={maxScore=>change({maxScore})} invalid={criterionPointsInvalid}/>:<><Field label="Major criterion weight (%)" displayLabel={<span className="sr-only">Weight (%)</span>} placeholder="30" type="number" min={0} max={100} step="any" value={criterion.percentage} onChange={percentage=>change({percentage})} invalid={criterionWeightInvalid}/><span aria-hidden="true">%</span></>}</div></div>
      <MinorCriteria key={criterion.id} criterion={criterion} points={points} minorWeightBasis={value.scoringConfig.minorWeightBasis} showValidation={validationAttempted} scoreRangeInvalid={criterionRangeInvalid} onChange={change} onPendingChange={trackMinor}/>
      {error&&<p role="alert" className="v-error-text">{error}</p>}</div>}
    </Modal>
    <Modal open={copying} onClose={()=>setCopying(false)} title="Copy Criteria From" footer={<Button variant="secondary" onClick={()=>setCopying(false)}>Cancel</Button>}><p className="v-helper-text mb-4">Copy criteria into {scope.name}. Each round keeps an independent copy.</p><Select label={`Copy criteria into ${scope.name}`} value="" onChange={id=>{if(!id)return;if(own.length&&!window.confirm('Replace this round’s draft criteria with independent copies? Saved data changes only when you save.'))return;patch({criteria:[...value.criteria.filter(c=>c.roundId!==scope.id),...value.criteria.filter(c=>c.roundId===id).map(c=>({...structuredClone(c),id:uuid(),roundId:scope.id,minorCriteria:(c.minorCriteria??[]).map(m=>({...m,id:uuid()}))}))]});setCopying(false)}}><option value="">Choose a round</option>{scopes.filter(s=>s.id!==scope.id).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</Select></Modal>
  </section>
}

const rangePreset = target => {
  if(target.minScore===1&&target.maxScore===100)return '1-100'
  if(target.minScore===1&&target.maxScore===10)return '1-10'
  if(target.minScore===0&&target.maxScore===10)return 'decimal'
  return 'custom'
}
function MinorCriteria({criterion:c,points=false,minorWeightBasis,showValidation=false,scoreRangeInvalid=false,onChange,onPendingChange}) {
  const minors=c.minorCriteria??[]
  const [useMinors,setUseMinors]=useState(()=>minors.length>0),[weightMode,setWeightMode]=useState(()=>minors.some(m=>m.percentage!==undefined))
  const [directPreset,setDirectPreset]=useState(()=>rangePreset(c))
  const weighted=weightMode,minorTotal=minors.reduce((sum,m)=>sum+(Number(m.percentage)||0),0)
  const [initialRange]=useState(()=>{const target=minors.at(-1)??c;return {minScore:target.minScore,maxScore:target.maxScore}})
  const initial=()=>({...initialRange})
  const [adding,setAdding]=useState(false),[name,setName]=useState(''),[editing,setEditing]=useState(null),[error,setError]=useState(''),[validationAttempted,setValidationAttempted]=useState(false),[range,setRange]=useState(initial),[preset,setPreset]=useState(()=>rangePreset(initial()))
  const original=minors.find(m=>m.id===editing),baseline=original??initial()
  const pending=adding||(useMinors&&!minors.length)
  useEffect(()=>{const key=`minor:${c.id}`;onPendingChange(key,pending);return()=>onPendingChange(key,false)},[onPendingChange,pending,c.id])
  const reset=()=>{setAdding(false);setName('');setEditing(null);setError('');setValidationAttempted(false);setRange(initial());setPreset(rangePreset(initial()))}
  const selectRange=choice=>{setPreset(choice);if(choice==='1-100')setRange({minScore:1,maxScore:100});if(choice==='1-10')setRange({minScore:1,maxScore:10});if(choice==='decimal')setRange({minScore:0,maxScore:10});if(choice==='custom')setRange({minScore:baseline.minScore,maxScore:baseline.maxScore})}
  const setMinorMode=enabled=>{
    if(enabled===useMinors)return
    if(!enabled&&minors.length&&!window.confirm('Remove the minor criteria from this draft and score this major criterion directly?'))return
    setUseMinors(enabled)
    if(!enabled){onChange({minorCriteria:[]});setWeightMode(false);reset()}
  }
  const setWeights=mode=>{
    setWeightMode(mode)
    if(mode&&minors.length)onChange({minorCriteria:minors.map(m=>({...m,percentage:m.percentage??(minorWeightBasis==='overall'?Number(c.percentage)/minors.length:0)}))})
    if(!mode&&minors.some(m=>m.percentage!==undefined))onChange({minorCriteria:minors.map(m=>{const next={...m};delete next.percentage;return next})})
  }
  const update=()=>{
    setValidationAttempted(true)
    if(!name.trim()||minors.some(m=>m.id!==editing&&m.name.trim().toLowerCase()===name.trim().toLowerCase())){setError('Enter a unique minor criterion name.');return}
    if(!points&&(!Number.isFinite(range.minScore)||!Number.isFinite(range.maxScore)||range.maxScore<=0||range.maxScore<=range.minScore)){setError('Enter a valid range with a maximum greater than the minimum and zero.');return}
    onChange({minorCriteria:editing?minors.map(m=>m.id===editing?{...m,name:name.trim(),...(points?{}:range)}:m):[...minors,points?{id:uuid(),name:name.trim()}:{id:uuid(),name:name.trim(),...range,...(weighted?{percentage:0}:{})}]})
    reset()
  }
  const duplicateMinorName=minors.some(m=>m.id!==editing&&m.name.trim().toLowerCase()===name.trim().toLowerCase())
  const minorNameInvalid=(validationAttempted||showValidation)&&(!name.trim()||duplicateMinorName)
  const minorRangeInvalid=(validationAttempted||showValidation)&&!points&&(!Number.isFinite(range.minScore)||!Number.isFinite(range.maxScore)||range.maxScore<=0||range.maxScore<=range.minScore)
  const targetMinorWeight=minorWeightBasis==='overall'?Number(c.percentage):100
  const totalMinorWeightInvalid=!points&&weighted&&(
    minors.some(m=>!(Number(m.percentage)>0))||
    Math.abs(minorTotal-targetMinorWeight)>0.001
  )
  const minorWeightInvalid=(validationAttempted||showValidation)&&totalMinorWeightInvalid
  return <div className="rs-minor-panel">
    <fieldset className="rs-minor-choice"><legend>Does this criterion use minor criteria?</legend><label><input type="radio" name={`minor-mode-${c.id}`} checked={!useMinors} onChange={()=>setMinorMode(false)}/>No minor criteria</label><label><input type="radio" name={`minor-mode-${c.id}`} checked={useMinors} onChange={()=>setMinorMode(true)}/>Yes, add minor criteria</label></fieldset>
    {!useMinors&&!points&&<div className="rs-direct-range"><Select label={`${c.name} score range`} displayLabel="Score Range" value={directPreset} onChange={choice=>{setDirectPreset(choice);if(choice==='1-100')onChange({minScore:1,maxScore:100});if(choice==='1-10')onChange({minScore:1,maxScore:10});if(choice==='decimal')onChange({minScore:0,maxScore:10})}} invalid={scoreRangeInvalid}><option value="1-10">Default (1–10)</option><option value="1-100">1–100</option><option value="decimal">0–10</option><option value="custom">Custom</option></Select>{directPreset==='custom'&&<div className="rs-grid mt-3"><Field label={`${c.name} minimum`} displayLabel="Minimum" type="number" step="any" value={c.minScore} onChange={minScore=>onChange({minScore})} invalid={scoreRangeInvalid}/><Field label={`${c.name} maximum`} displayLabel="Maximum" type="number" step="any" value={c.maxScore} onChange={maxScore=>onChange({maxScore})} invalid={scoreRangeInvalid}/></div>}</div>}
    {useMinors&&<><h5 className="rs-kicker">MINOR CRITERIA — {points?'EVALUATION GUIDELINES':'JUDGES SCORE THESE'}</h5>
    {!points&&<fieldset className="rs-minor-choice"><legend>Minor criterion weighting</legend><label><input type="radio" name={`minor-weight-${c.id}`} checked={!weightMode} onChange={()=>setWeights(false)}/>No weights</label><label><input type="radio" name={`minor-weight-${c.id}`} checked={weightMode} onChange={()=>setWeights(true)}/>Use weights</label></fieldset>}
    {!minors.length&&!adding&&<p className="rs-minor-empty">Add minor criteria so judges can score this major criterion.</p>}
    {minors.map((m,i)=><div key={m.id} className="rs-minor-item"><div className="rs-minor-row"><button type="button" className="rs-minor-name rs-name-button" aria-label={`Edit minor ${m.name}`} title="Edit minor criterion" onClick={()=>{setAdding(true);setError('');setValidationAttempted(false);setName(m.name);setEditing(m.id);setRange({minScore:m.minScore,maxScore:m.maxScore});setPreset(rangePreset(m))}}>{m.name}</button>{!points&&weighted&&<Field label={`${m.name} minor weight (%)`} displayLabel={minorWeightBasis==='overall'?'% of round':'% of major'} value={m.percentage} type="number" min={0} max={100} step="any" invalid={minorWeightInvalid} onChange={percentage=>onChange({minorCriteria:minors.map(x=>x.id===m.id?{...x,percentage}:x)})}/>} {!points&&<span className="rs-range-badge">{m.minScore}–{m.maxScore}</span>}<Button size="sm" variant="ghost" className="rs-delete" aria-label={`Remove minor ${m.name}`} onClick={()=>{if(window.confirm('Remove this minor criterion from the draft?')){onChange({minorCriteria:minors.filter(x=>x.id!==m.id)});if(editing===m.id)reset()}}}><X size={20} strokeWidth={1.5}/></Button></div><details className="rs-minor-options"><summary aria-label={`Options for ${m.name}`} title="Minor criterion options"><MoreHorizontal size={18}/></summary><div className="rs-actions"><OrderButtons name={m.name} index={i} items={minors} onChange={minorCriteria=>onChange({minorCriteria})}/></div></details></div>)}
    {!adding?<Button variant="secondary" className="rs-add-minor" onClick={()=>{setAdding(true);setError('');setValidationAttempted(false)}}><Plus size={16} strokeWidth={1.5}/>Add minor criterion</Button>:<div className="rs-minor-form"><Field label={`${c.name} minor criterion name`} displayLabel={<span className="sr-only">Minor criterion name</span>} value={name} onChange={setName} invalid={minorNameInvalid} maxLength={200} placeholder="Minor criterion name" autoFocus/>{!points&&<div><Select label={`${c.name} minor score range`} displayLabel={<span className="sr-only">Score range</span>} value={preset} onChange={selectRange} invalid={minorRangeInvalid}><option value="1-100">1–100</option><option value="1-10">1–10</option><option value="decimal">0–10</option><option value="custom">Custom range</option></Select>
      {preset==='custom'&&<div className="rs-grid"><Field label={`${c.name} minor minimum`} type="number" step="any" value={range.minScore} onChange={minScore=>setRange({...range,minScore})} invalid={minorRangeInvalid}/><Field label={`${c.name} minor maximum`} type="number" step="any" value={range.maxScore} onChange={maxScore=>setRange({...range,maxScore})} invalid={minorRangeInvalid}/></div>}</div>}
      {error&&<p role="alert" className="v-error-text">{error}</p>}<div className="rs-minor-form-actions"><Button onClick={update}>{editing?'Update':'Add'}</Button><Button variant="secondary" onClick={reset}>Cancel</Button></div>
    </div>}
    {!!minors.length&&<p className="v-helper-text">{points?'These names guide evaluation; judges enter one score for the major criterion.':weighted?minorWeightBasis==='overall'?`Minor weights are direct shares of the round and must total the ${c.percentage}% major criterion weight.`:'Minor weights are relative shares and must total 100% within this major criterion.':'Minor criteria are averaged equally within this major criterion.'}</p>}
    {!points&&weighted&&<p role="status" className="rs-weight-status" data-complete={Math.abs(minorTotal-(minorWeightBasis==='overall'?Number(c.percentage):100))<=0.001}>Minor weight total: {Number(minorTotal.toFixed(3))}% / {minorWeightBasis==='overall'?`${c.percentage}% major weight`:'100%'} {Math.abs(minorTotal-(minorWeightBasis==='overall'?Number(c.percentage):100))<=0.001?'Complete.':''}</p>}</>}
  </div>
}

function Configuration({value,patch,score,entries,onPendingChange,hasPendingForm,draft,competitionName,activeRoundId,onRoundChange,roundOnly=false}) {
  const scopes=scopesOf(value),[localRound,setLocalRound]=useState(scopes[0]?.id??null)
  const selectedRound=scopes.some(scope=>scope.id===activeRoundId)?activeRoundId:scopes.some(scope=>scope.id===localRound)?localRound:scopes[0]?.id??null
  const scope=scopes.find(s=>s.id===selectedRound)??scopes[0]
  const selectRound=id=>{setLocalRound(id);onRoundChange?.(id)}
  const canChangeRound=()=>!hasPendingForm||window.confirm('Discard the unfinished form before changing rounds?')
  return <div className="rs-configuration space-y-6">
    {!roundOnly&&<Structure value={value} patch={patch} score={score} entries={entries} compact/>}
    {!roundOnly&&!!scopes.length&&<section className="rs-section rs-active-round" aria-label="Select round">
      <div className="rs-section-heading"><span className="rs-section-icon"><Target size={26} aria-hidden="true"/></span><div><h3 className="rs-title">Select Round</h3><p>Scoring criteria and round settings below apply to <strong>{scope?.name||'this round'}</strong>.</p></div><span className="rs-count-badge">Round {scopes.indexOf(scope)+1} of {scopes.length}</span></div>
      <div className="rs-round-selector" role="group" aria-label="Select Round">
        {scopes.map((r,index)=><button key={r.id??'single'} type="button" className="rs-round-chip" aria-label={`Select round ${String(index+1).padStart(2,'0')}: ${r.name||'Unnamed round'}`} aria-pressed={scope?.id===r.id} onClick={()=>{if(scope?.id!==r.id&&canChangeRound())selectRound(r.id)}}><span className="rs-round-number">{String(index+1).padStart(2,'0')}</span><span>{r.name||'Unnamed round'}</span>{scope?.id===r.id&&<span className="rs-round-chip-check"><Check size={13} aria-hidden="true"/></span>}</button>)}
      </div>
    </section>}
    {scope&&<><Criteria key={scope.id??'single'} value={value} patch={patch} score={score} selectedRound={scope.id} onPendingChange={onPendingChange} hasPendingForm={hasPendingForm} draft={draft}/>
    <OtherSettings key={`settings:${scope.id}`} value={value} patch={patch} score={score} scope={scope} onPendingChange={onPendingChange}/>
    <ScoreSheet value={value} competitionName={competitionName} selectedRound={scope.id}/></>}
  </div>
}

export function RoundConfigurationList({value,savedConfiguration,onConfigure,onEditStructure,readOnly=false,busy=false}) {
  const scopes=scopesOf(value)
  const readyCount=scopes.filter(round=>roundScoringReadiness(savedConfiguration,round.id).ready).length
  return <section className="rs-round-overview" aria-label="Rounds & Scoring">
    <div className="rs-card-heading"><div><h3 className="rs-title">Your Rounds</h3><p className="v-helper-text">Configure the scoring criteria for each round.</p></div><Button variant="secondary" size="sm" disabled={readOnly||busy} onClick={onEditStructure}>Edit round structure</Button></div>
    <ol className="rs-round-list">{scopes.map((round,index)=>{
      const ready=roundScoringReadiness(savedConfiguration,round.id).ready
      return <li key={round.id??'single'} className="rs-round-list-row" data-configured={ready}><span className="rs-round-number">{String(index+1).padStart(2,'0')}</span><strong>{round.name||'Unnamed round'}</strong><span className="rs-round-saved-status" data-ready={ready}>{ready?<><Check size={14} aria-hidden="true"/>Configured</>:'Not configured'}</span><Button variant="secondary" size="sm" disabled={busy} aria-label={`${ready?'Edit':'Configure'} ${round.name||'round'} scoring criteria`} onClick={()=>onConfigure(round.id)}>{ready?'Edit':'Configure'}</Button></li>
    })}</ol>
    <p className="rs-round-completion" role="status">{readyCount===scopes.length&&scopes.length>0?<><Check size={16} aria-hidden="true"/>All rounds configured</>:`${readyCount} of ${scopes.length} rounds configured`}</p>
  </section>
}

function Setting({title,description,summary,children,Icon=Settings2,tone='primary'}) {
  return <details className="rs-setting" data-tone={tone}><summary><span className="rs-setting-icon"><Icon size={21} aria-hidden="true"/></span><span className="rs-setting-copy"><strong>{title}</strong><span>{description}</span></span><span className="rs-setting-action"><span className="rs-setting-edit-label">Edit</span><span className="rs-setting-close-label">Close</span><ChevronRight size={17} aria-hidden="true"/></span><span className="rs-setting-value">{summary}</span></summary><div className="rs-setting-body space-y-4">{children}</div></details>
}

function OtherSettings({value,patch,score,scope,onPendingChange=ignorePending}) {
  const config=value.scoringConfig,round=value.rounds.find(r=>r.id===scope?.id)
  const next=round&&value.rounds.find(r=>r.id===(round.nextRoundId??value.rounds[value.rounds.indexOf(round)+1]?.id))
  const method=round?.calculationMethod??config.calculationMethod,weighted=value.rounds.some(r=>r.progression==='weighted')
  const methodOptions=scoringMethodOptions(config.calculationMethod,config.criterionBasis)
  const roundMethodOptions=scoringMethodOptions(method,config.criterionBasis)
  const hasInputOverrides=value.criteria.some(c=>c.decimalPlaces!=null||(c.minorCriteria??[]).some(m=>m.decimalPlaces!=null))
  const changeInputPrecision=inputDecimalPlaces=>{
    const inherit=target=>{const next={...target};delete next.decimalPlaces;return next}
    patch({scoringConfig:{...config,inputDecimalPlaces},criteria:value.criteria.map(c=>({...inherit(c),...(c.minorCriteria?{minorCriteria:c.minorCriteria.map(inherit)}:{})}))})
  }
  const changeRound=fields=>patch({rounds:value.rounds.map(r=>r.id===round.id?{...r,...fields}:r)})
  const changeMethod=calculationMethod=>score({calculationMethod,tiePolicy:calculationMethod==='rank_based'?'shared':config.tiePolicy,numericCarryBasis:calculationMethod==='rank_based'&&weighted?'weighted_judge_average':undefined})
  const carry=policy=>patch({rounds:value.rounds.map(r=>{const result={...r,progression:policy};if(policy==='weighted')result.weight=r.weight??0;else delete result.weight;return result}),scoringConfig:{...config,numericCarryBasis:policy==='weighted'&&config.calculationMethod==='rank_based'?'weighted_judge_average':undefined}})
  const ownRules=(config.deductionRules??[]).filter(r=>r.roundId===(scope?.id??null))
  return <section className="rs-other-settings" aria-label="Other settings">
    <div className="rs-other-settings-heading"><span className="rs-other-settings-icon"><Settings2 size={23} aria-hidden="true"/></span><div><h3 className="rs-title">Other Settings</h3><p className="v-helper-text mt-1">Open a setting to review or change it.</p></div></div>
    <div className="rs-settings-list">
    <Setting tone="danger" Icon={CircleMinus} title="Deductions" description="Allow or add deductions for this round." summary={`${DEDUCTION_LABELS[effectiveDeductionMode(value,scope?.id??null)]} - ${ownRules.length} rule(s)`}><Deductions value={value} score={score} patch={patch} onPendingChange={onPendingChange} selectedRound={scope?.id??null} preview={false}/></Setting>

    <Setting tone="info" Icon={Scale} title="Tie Rules" description="How tied results are handled across this competition." summary={config.tiePolicy==='highest_criterion'?'Highest criterion':'Shared rank'}><Select label="Tie policy" displayLabel="When contestants have the same result" value={config.tiePolicy??'shared'} onChange={tiePolicy=>score({tiePolicy})}><option value="shared">Shared standard competition ranks</option><option value="highest_criterion" disabled={config.calculationMethod==='rank_based'||value.rounds.some(r=>r.calculationMethod==='rank_based')}>Highest criterion</option></Select><p className="v-helper-text">{config.tiePolicy==='highest_criterion'?'Compare the highest-weight criterion to resolve a tie.':'Example: 1st, 2nd, 2nd, 4th.'}</p></Setting>
    <Setting tone="success" Icon={Calculator} title="Scoring Method" description={round?'How results are calculated for this round.':'How results are calculated across this competition.'} summary={roundMethodOptions.find(m=>m.id===method)?.name??'Choose a method'}><div className="rs-grid"><Select label="Calculation method" displayLabel="How should competition results be calculated?" value={config.calculationMethod} onChange={changeMethod}>{methodOptions.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</Select><Field label="Result decimal places" type="number" min={0} max={6} value={config.decimalPlaces??2} onChange={decimalPlaces=>score({decimalPlaces})}/></div>
      {round?.calculationMethod&&<p className="v-helper-text">{round.name} uses a custom method. Changes to the competition method apply to rounds that inherit it. Edit the custom calculation below to change this round.</p>}
      {round&&<details><summary>Custom calculation for {round.name}</summary><div className="space-y-3 mt-3"><Select label="Round calculation method" value={round.calculationMethod??''} onChange={calculationMethod=>{const updated={...round};if(calculationMethod)updated.calculationMethod=calculationMethod;else delete updated.calculationMethod;patch({rounds:value.rounds.map(r=>r.id===round.id?updated:r)})}}><option value="">Use competition method</option>{scoringMethodOptions(round.calculationMethod,config.criterionBasis).map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</Select><p className="v-helper-text">Different round methods require independent rounds without deductions.</p></div></details>}
      {(method==='lowest_removal'||config.calculationMethod==='lowest_removal')&&<div className="rs-grid"><Field label="Remove highest judges" type="number" min={0} value={config.dropHighest??0} onChange={dropHighest=>score({dropHighest})}/><Field label="Remove lowest judges" type="number" min={0} value={config.dropLowest??0} onChange={dropLowest=>score({dropLowest})}/></div>}
      {config.calculationMethod==='manual'&&<Field label="Manual decision basis" value={config.manualBasis??''} onChange={manualBasis=>score({manualBasis})}/>}
      <CalculationPreview method={method}/>
    </Setting>
    <Setting tone="warning" Icon={Keyboard} title="Score Input" description="How judges enter numeric scores across this competition." summary={hasInputOverrides?'Criterion-specific precision':config.inputDecimalPlaces===0?'Whole numbers':config.inputDecimalPlaces===undefined?'Choose precision':`Up to ${config.inputDecimalPlaces} decimal places`}>
      <Select label="Input decimal places" value={!hasInputOverrides&&[0,1,2].includes(config.inputDecimalPlaces)?config.inputDecimalPlaces:''} onChange={v=>changeInputPrecision(Number(v))}>
        <option value="" disabled hidden>{hasInputOverrides?'Choose precision for all criteria':'Select input decimal places'}</option>
        <option value={0}>Whole numbers</option><option value={1}>1</option><option value={2}>2</option>
      </Select>
      <p className="v-helper-text">Choose whole numbers or allow up to 1 or 2 decimal places. Set score ranges in Scoring Criteria.</p>
      {hasInputOverrides&&<p className="v-helper-text">Saved criteria have individual decimal limits. Choosing a value replaces those limits for all criteria and rounds when you save.</p>}
    </Setting>
    {round&&(config.deductionRules??[]).some(r=>r.roundId==null)&&<Setting title="Competition Final Deductions" description="Existing rules applied to the competition final result." summary={`${config.deductionRules.filter(r=>r.roundId==null).length} rules`}><Deductions value={value} score={score} patch={patch} onPendingChange={onPendingChange} selectedRound={null} preview={false}/></Setting>}
    {next&&<><Setting title="Round Advancement" description={`What happens after ${round.name}?`} summary={round.advancementType==='top_n'?`Top ${round.advancementValue??'...'} advance`:round.advancementType==='manual'?'Manual selection':round.advancementType==='top_percent'?`Top ${round.advancementValue??'...'}%`:round.advancementType==='threshold'?'Minimum score':'All entries advance'}><p className="v-helper-text">Advance to {next.name}. This chooses contestants, not the score contribution. Top percentage means a percentage of the eligible contestants; cutoff ties advance together.</p><Select label="Advancement method" value={round.advancementType??'none'} onChange={advancementType=>{const updated={...round,advancementType};if(['none','manual'].includes(advancementType))delete updated.advancementValue;patch({rounds:value.rounds.map(r=>r.id===round.id?updated:r)})}}><option value="none">All entries advance</option><option value="top_n">Top-ranked entries</option><option value="top_percent">Top percentage</option><option value="threshold" disabled={['rank_based','manual'].includes(method)}>Minimum score</option><option value="manual">Organizer manually selects qualifiers</option></Select>{['top_n','top_percent','threshold'].includes(round.advancementType)&&<Field label="Advance value" displayLabel={round.advancementType==='top_n'?'Number of entries':round.advancementType==='top_percent'?'Percentage':'Minimum score'} type="number" min={round.advancementType==='top_n'?1:0} step={round.advancementType==='top_n'?1:'any'} value={round.advancementValue} onChange={advancementValue=>changeRound({advancementValue})}/>}</Setting>
    <Setting title="Next Round Score Handling" description={`${round.name} → ${next.name}`} summary={weighted?'Combine weighted scores':value.rounds.at(-1)?.progression==='carry_forward'?'Carry forward':'Back to zero'}><Select label="Round scoring model" displayLabel={`How will scores carry into ${next.name}?`} value={weighted?'weighted':value.rounds.at(-1)?.progression??'back_to_zero'} onChange={carry}><option value="back_to_zero">Back to Zero</option><option value="carry_forward" disabled={['rank_based','manual'].includes(config.calculationMethod)}>Carry Forward Previous Scores</option><option value="weighted" disabled={config.calculationMethod==='manual'}>Combine Previous and Current Scores</option></Select><p className="v-helper-text">The score handling model applies across this competition’s rounds. Contributions below determine each round’s share of the combined score; they do not select qualifiers. For example, Preliminary 30% and Final 70% is separate from advancing the top 30% of contestants.</p>{weighted&&<><div className="rs-grid">{value.rounds.map(r=><Field key={r.id} label={`${r.name} contribution percentage`} type="number" min={0} max={100} step="any" value={r.weight} onChange={weight=>patch({rounds:value.rounds.map(x=>x.id===r.id?{...x,weight}:x)})}/>)}</div><p role="status">Total: {value.rounds.reduce((s,r)=>s+(Number(r.weight)||0),0)}% — must total 100%.</p></>}</Setting></>}
  </div></section>
}

function ScoreSheet({value,competitionName,selectedRound}) {
  const [previewOpen,setPreviewOpen]=useState(false)
  const previewAnchorRef=useRef(null)
  return <section ref={previewAnchorRef} className="v-card rs-preview-card p-5"><FileText className="text-v-primary" size={32}/><div><h3 className="rs-title">Judge Score Sheet</h3><p className="v-helper-text mt-1">Preview how judges will enter scores for this competition.</p></div><Button onClick={()=>setPreviewOpen(true)}>Preview Score Sheet</Button><p className="rs-preview-note">Preview only. Scores entered in the preview are not saved.</p>
    <Modal constrainToRef={previewAnchorRef} id="judge-score-sheet-preview" open={previewOpen} onClose={()=>setPreviewOpen(false)} title="Judge Score Sheet Preview" size="lg" footer={<Button variant="secondary" onClick={()=>setPreviewOpen(false)}>Close Preview</Button>}><div className="rs-modal-intro"><p className="font-semibold text-v-text">{competitionName || 'Current competition'}</p></div><div className="rs-preview-scroll">{previewOpen&&<JudgePreview key={JSON.stringify(value)} value={value} initialRoundId={selectedRound}/>}</div></Modal>
  </section>
}

export function JudgePreview({value,deductionPreview=false,initialRoundId}) {
  const scopes=scopesOf(value),[roundId,setRound]=useState(initialRoundId??scopes[0]?.id??null),[scores,setScores]=useState({}),[locks,setLocks]=useState([]),[notice,setNotice]=useState('')
  const scope=scopes.find(s=>s.id===roundId)??scopes[0],criteria=value.criteria.filter(c=>c.roundId===scope?.id)
  const sheet={contestants:[{id:'preview-entry',name:'Preview Entry',contestantNumber:'01',open:true,lockedCriteria:locks}],criteria:criteria.map(c=>({...c,open:true,minors:(c.minorCriteria??[]).map(m=>({...m,decimalPlaces:m.decimalPlaces??value.scoringConfig.inputDecimalPlaces})),decimalPlaces:c.decimalPlaces??value.scoringConfig.inputDecimalPlaces}))}
  let total=null
  const ready=setupReadiness({...value,structure:'single',rounds:[],criteria:criteria.map(c=>({...c,roundId:null}))}).ready.criteria
  if(ready&&criteria.length) {
    try {
      const rules={id:'preview',event:{id:'preview-event'},rounds:[],contestants:[{id:'preview-entry'}],judges:[{judgeId:'preview-judge',isActive:true,role:'judge',assignments:[{scope:'event',scopeId:'preview-event'}]}],criteria:criteria.map(c=>({...c,isActive:true,minorCriteria:c.minorCriteria??[]})),categories:[],scoringConfig:{...value.scoringConfig,calculationMethod:'weighted_average'}}
      const output=calculateOfficial(rules,[{id:'preview-submission',judge_id:'preview-judge',rules_version:'preview',status:'submitted',round_id:null,sources:[{contestantId:'preview-entry',scores:Object.fromEntries(Object.entries(scores).map(([k,v])=>[k.slice('preview-entry:'.length),v]))}]}])
      if(output.ready)total=output.results[0]?.finalScore
    } catch { /* Incomplete configuration or input is shown below. */ }
  }
  const deductions=(value.scoringConfig.deductionRules??[]).filter(r=>r.units==='points'&&(r.roundId==null||r.roundId===scope?.id))
  const dp=value.scoringConfig.decimalPlaces??2
  const penalty=deductionPreview?combineOfficialContributions(deductions.map(r=>({score:Number(r.amount)||0,weight:100})),dp):0
  return <section className="v-card p-4 space-y-4" aria-label="Judge score sheet preview"><div className="rs-card-heading"><h3 className="rs-title">Try the score sheet</h3><span className="rs-preview-badge">Preview only</span></div><p className="v-helper-text">Try sample scores for your configured criteria. Scores and locks entered here are discarded when you close the preview.</p>
    {scopes.length>1&&<Select label="Preview round" value={scope?.id} onChange={id=>{setRound(id);setScores({});setLocks([]);setNotice('')}}>{scopes.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</Select>}<p className="text-sm">Round: {scope?.name??'No round configured'}</p>
    {criteria.length?<CompetitionScoringForm preview sheet={sheet} scores={scores} onScoreChange={(id,target,v)=>setScores(s=>({...s,[`${id}:${target}`]:v}))} onSubmitCriterion={(_id,id)=>{setLocks(s=>[...s,id]);setNotice('Preview criterion locked locally.')}}/>:<p>Add criteria to preview judge inputs.</p>}
    <dl className="rs-totals"><div><dt>Weighted score</dt><dd>{total==null?'Complete all inputs':`${total.toFixed(dp)} / 100`}</dd></div>{deductionPreview&&<><div><dt>Example deductions (one violation per applicable point rule)</dt><dd>−{penalty.toFixed(dp)}</dd></div><div><dt>Final score preview</dt><dd>{total==null?'—':combineOfficialContributions([{score:total,weight:100},{score:-penalty,weight:100}],dp).toFixed(dp)}</dd></div></>}</dl>
    {deductionPreview&&<p className="v-helper-text">Placement penalties apply after ranking and cannot be demonstrated with one preview entrant.</p>}
    <div className="rs-actions"><Button variant="secondary" size="sm" onClick={()=>setNotice('Preview draft retained on this screen only.')}>Save Preview Draft</Button><Button variant="secondary" size="sm" disabled={total==null} onClick={()=>{setLocks(criteria.map(c=>c.id));setNotice('Preview inputs locked locally.')}}>Lock Preview Scores</Button><Button variant="ghost" size="sm" onClick={()=>{setScores({});setLocks([]);setNotice('Preview reset.')}}>Reset Preview</Button></div>{notice&&<p role="status" className="text-sm">{notice}</p>}
  </section>
}

function Deductions({value,score,patch,onPendingChange,selectedRound,preview=true}) {
  return <div className="space-y-4"><ScoringPenaltyRules configuration={value} onConfigurationChange={next=>patch?patch(next):score(next.scoringConfig)} scopeRoundId={selectedRound} onPendingChange={onPendingChange}/>{preview&&<ScoreSheet value={value}/>}</div>
}
