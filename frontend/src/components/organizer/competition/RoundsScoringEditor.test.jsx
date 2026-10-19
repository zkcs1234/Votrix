import {useState} from 'react'
import {render,screen,fireEvent,cleanup,within} from '@testing-library/react'
import {afterEach,expect,test,vi} from 'vitest'
import RoundsScoringEditor,{JudgePreview} from './RoundsScoringEditor'
const initial=()=>({structure:'single',rounds:[],criteria:[{id:'major',roundId:null,name:'Technique',percentage:100,minScore:0,maxScore:10,minorCriteria:[{id:'minor',name:'Execution',minScore:0,maxScore:10}]}],scoringConfig:{calculationMethod:'weighted_average',tiePolicy:'shared',decimalPlaces:2,inputDecimalPlaces:1,deductionRules:[]}})
function Editor({step='criteria',configuration=initial(),observe=()=>{}}){const [value,setValue]=useState(configuration);return <RoundsScoringEditor value={value} onChange={v=>{setValue(v);observe(v)}} step={step}/>}
afterEach(()=>{cleanup();vi.restoreAllMocks()})
test('single round converts to explicit rounds without deleting criterion or minor identities',()=>{
 const observe=vi.fn();render(<Editor step="structure" observe={observe}/>);fireEvent.click(screen.getByLabelText('Multiple Rounds'))
 const value=observe.mock.lastCall[0];expect(value.rounds).toHaveLength(1);expect(value.criteria[0].id).toBe('major');expect(value.criteria[0].roundId).toBe(value.rounds[0].id);expect(value.criteria[0].minorCriteria[0].id).toBe('minor')
 fireEvent.click(screen.getByText('+ Add Another Round'));expect(observe.mock.lastCall[0].rounds).toHaveLength(2);expect(observe.mock.lastCall[0].rounds[0].nextRoundId).toBe(observe.mock.lastCall[0].rounds[1].id)
})
test('major editor rejects duplicate names and over-allocation before changing saved criteria',()=>{
 const observe=vi.fn();render(<Editor observe={observe}/>);fireEvent.click(screen.getByRole('button',{name:'Add Criterion',exact:true}));fireEvent.change(screen.getByLabelText('Major criterion name'),{target:{value:' technique '}});fireEvent.change(screen.getByLabelText('Major criterion weight (%)'),{target:{value:'20'}});fireEvent.click(screen.getByRole('button',{name:'Save Criterion',exact:true}));expect(screen.getByRole('alert')).toHaveTextContent('already exists');expect(observe).not.toHaveBeenCalled()
 fireEvent.change(screen.getByLabelText('Major criterion name'),{target:{value:'Performance'}});fireEvent.click(screen.getByRole('button',{name:'Save Criterion',exact:true}));expect(screen.getByRole('alert')).toHaveTextContent('cannot exceed 100%')
})
test('points basis shows maximum possible total and point-specific criterion fields',()=>{
 const value=initial();value.criteria=[];value.scoringConfig.criterionBasis='percentage'
 const observe=vi.fn();render(<Editor configuration={value} observe={observe}/>)
 fireEvent.change(screen.getByLabelText('Criterion scoring basis'),{target:{value:'points'}})
 expect(observe.mock.lastCall[0].scoringConfig.calculationMethod).toBe('sum')
 fireEvent.click(screen.getByRole('button',{name:'Add Criterion',exact:true}))
 expect(screen.getByLabelText('Maximum Points')).toBeInTheDocument()
 expect(screen.queryByLabelText('Major criterion weight (%)')).not.toBeInTheDocument()
 fireEvent.change(screen.getByLabelText('Major criterion name'),{target:{value:'Technique'}})
 fireEvent.change(screen.getByLabelText('Maximum Points'),{target:{value:'10'}})
 fireEvent.click(screen.getByRole('button',{name:'Save Criterion',exact:true}))
 expect(screen.getByRole('status')).toHaveTextContent('Maximum: 10 points')
})
test('minor edit retains identity and removal requires confirmation',()=>{
 const observe=vi.fn();render(<Editor observe={observe}/>);fireEvent.click(screen.getByRole('button',{name:'Edit criterion Technique'}));fireEvent.click(screen.getByRole('button',{name:'Edit minor Execution'}));fireEvent.change(screen.getByLabelText('Technique minor criterion name'),{target:{value:'Timing'}});fireEvent.click(screen.getByRole('button',{name:'Update',exact:true}));fireEvent.click(screen.getByRole('button',{name:'Save Criterion'}));expect(observe.mock.lastCall[0].criteria[0].minorCriteria[0]).toMatchObject({id:'minor',name:'Timing',minScore:0,maxScore:10})
 vi.spyOn(window,'confirm').mockReturnValue(false);fireEvent.click(screen.getByRole('button',{name:'Edit criterion Technique'}));fireEvent.click(screen.getByLabelText('Remove minor Timing'));expect(observe).toHaveBeenCalledTimes(1)
})

test.each([['1-100',1,100,0],['1-10',1,10,0],['decimal',0,10,1]])('minor range preset %s configures judge bounds and precision', (preset,minScore,maxScore,decimalPlaces)=>{
 const observe=vi.fn();render(<Editor observe={observe}/>);fireEvent.click(screen.getByRole('button',{name:'Edit criterion Technique'}));fireEvent.click(screen.getByRole('button',{name:'Add minor criterion'}));fireEvent.change(screen.getByLabelText('Technique minor criterion name'),{target:{value:'Overall Impact'}});fireEvent.change(screen.getByLabelText('Technique minor score range'),{target:{value:preset}});fireEvent.click(screen.getByRole('button',{name:'Add',exact:true}));fireEvent.click(screen.getByRole('button',{name:'Save Criterion'}))
 expect(observe.mock.lastCall[0].criteria[0].minorCriteria[1]).toMatchObject({name:'Overall Impact',minScore,maxScore,decimalPlaces})
 fireEvent.click(screen.getByRole('button',{name:'Edit criterion Technique'}));expect(within(screen.getByText('Overall Impact').closest('.rs-minor-item')).getByText(`${minScore}–${maxScore}`)).toBeInTheDocument()
})

test('custom scales preserve configured bounds without displaying extra range or precision fields',()=>{
 const value=initial();value.criteria[0].minorCriteria[0]={...value.criteria[0].minorCriteria[0],minScore:2,maxScore:20,decimalPlaces:2}
 const observe=vi.fn();render(<Editor configuration={value} observe={observe}/>);fireEvent.click(screen.getByRole('button',{name:'Edit criterion Technique'}));fireEvent.click(screen.getByRole('button',{name:'Add minor criterion'}));fireEvent.change(screen.getByLabelText('Technique minor criterion name'),{target:{value:'Timing'}});fireEvent.change(screen.getByLabelText('Technique minor score range'),{target:{value:'1-10'}});fireEvent.change(screen.getByLabelText('Technique minor score range'),{target:{value:'custom'}})
 expect(screen.getByLabelText('Technique minor minimum')).toBeInTheDocument();expect(screen.getByLabelText('Technique minor maximum')).toBeInTheDocument();expect(screen.queryByLabelText('Technique minor input precision')).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'Add',exact:true}));fireEvent.click(screen.getByRole('button',{name:'Save Criterion'}));expect(observe.mock.lastCall[0].criteria[0].minorCriteria[1]).toMatchObject({minScore:2,maxScore:20,decimalPlaces:2});expect(observe.mock.lastCall[0].criteria[0].minorCriteria[0]).toEqual(value.criteria[0].minorCriteria[0])
})

test('overall minor weights are direct round shares and total the major percentage',()=>{
 const value=initial();value.criteria[0].percentage=30;value.scoringConfig.minorWeightBasis='overall'
 value.criteria[0].minorCriteria=[{id:'one',name:'Voice Projection',minScore:0,maxScore:10,percentage:10},{id:'two',name:'Audience Engagement',minScore:0,maxScore:10,percentage:10},{id:'three',name:'Motion Technique',minScore:0,maxScore:10,percentage:10}]
 const observe=vi.fn();render(<Editor configuration={value} observe={observe}/>)
 fireEvent.click(screen.getByRole('button',{name:'Edit criterion Technique'}))
 expect(screen.getByLabelText('Voice Projection minor weight (%)')).toHaveValue(10)
 expect(screen.getByLabelText('Voice Projection minor weight (%)').closest('label')).toHaveTextContent('% of round')
 expect(screen.getByText(/Minor weight total: 30% \/ 30% major weight/)).toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'Save Criterion'}))
 expect(observe.mock.lastCall[0].criteria[0].minorCriteria.reduce((sum,minor)=>sum+minor.percentage,0)).toBe(30)
})

test('minor inputs appear only after Add minor criterion, and Cancel discards the unfinished form',()=>{
 const value=initial();value.criteria[0].minorCriteria=[];const observe=vi.fn();render(<Editor configuration={value} observe={observe}/>)
 fireEvent.click(screen.getByRole('button',{name:'Edit criterion Technique'}));expect(screen.queryByLabelText('Technique minor criterion name')).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'Add',exact:true})).not.toBeInTheDocument()
 fireEvent.click(screen.getByLabelText('Yes, add minor criteria'));fireEvent.click(screen.getByRole('button',{name:'Add minor criterion'}));fireEvent.change(screen.getByLabelText('Technique minor criterion name'),{target:{value:'Unfinished'}});fireEvent.click(screen.getAllByRole('button',{name:'Cancel',exact:true})[0]);expect(observe).not.toHaveBeenCalled();expect(screen.queryByLabelText('Technique minor criterion name')).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'Add minor criterion'}));expect(screen.getByLabelText('Technique minor criterion name')).toHaveValue('')
})
test('preview uses actual judge inputs and official normalization; invalid precision prevents locking',()=>{
 render(<JudgePreview value={initial()}/>);const input=screen.getByRole('spinbutton');fireEvent.change(input,{target:{value:'8.5'}});expect(screen.getByText('85.00 / 100')).toBeInTheDocument();expect(screen.getByRole('button',{name:'Preview Entry: Technique, Execution Lock',exact:true})).not.toBeDisabled()
 fireEvent.change(input,{target:{value:'8.55'}});expect(screen.getByText('Use at most 1 decimal places')).toBeInTheDocument();expect(screen.getByRole('button',{name:'Preview Entry: Technique, Execution Lock',exact:true})).toBeDisabled();expect(screen.getByText('Complete all inputs')).toBeInTheDocument()
 fireEvent.change(input,{target:{value:'9'}});fireEvent.click(screen.getByRole('button',{name:'Preview Entry: Technique, Execution Lock',exact:true}));expect(input).toBeDisabled();fireEvent.click(screen.getByText('Reset Preview'));expect(input).not.toBeDisabled()
})
test('preview normalizes unlike minor scales with configured weights',()=>{
 const value=initial();value.criteria[0].minorCriteria=[{id:'a',name:'Timing',minScore:1,maxScore:10,percentage:25},{id:'b',name:'Expression',minScore:0,maxScore:100,percentage:75}]
 render(<JudgePreview value={value}/>);const inputs=screen.getAllByRole('spinbutton');fireEvent.change(inputs[0],{target:{value:'8'}});fireEvent.change(inputs[1],{target:{value:'60'}});expect(screen.getByText('65.00 / 100')).toBeInTheDocument()
})
test('deductions are optional and disabling rules requires explicit consent',()=>{
 const value=initial(),observe=vi.fn();value.scoringConfig.deductionRules=[{id:'penalty',description:'Time limit',amount:2,units:'points',roundId:null,criteriaId:null}]
 render(<Editor step="deductions" configuration={value} observe={observe}/>);vi.spyOn(window,'confirm').mockReturnValue(false);fireEvent.click(screen.getByRole('radio',{name:/^No Deductions/}));expect(observe).not.toHaveBeenCalled()
 window.confirm.mockReturnValue(true);fireEvent.click(screen.getByRole('radio',{name:/^No Deductions/}));expect(observe.mock.lastCall[0].scoringConfig.deductionRules).toEqual([])
 fireEvent.click(screen.getByRole('button',{name:'Preview Score Sheet'}));expect(within(screen.getByRole('region',{name:'Judge score sheet preview'})).getByText('Preview only')).toBeInTheDocument()
})
