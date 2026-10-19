import {render,screen,fireEvent,within} from '@testing-library/react'
import {expect,test,vi} from 'vitest'
import CompetitionScoringForm from './CompetitionScoringForm'
const sheet={contestants:[{id:'a',name:'First',contestantNumber:1,lockedCriteria:[],open:true},{id:'b',name:'Second',contestantNumber:2,lockedCriteria:[],open:true}],criteria:[{id:'c',name:'Quality',percentage:100,minors:[{id:'m',name:'Skill',minScore:0,maxScore:10}],open:true}]}
test('criterion Lock requires every minor within frozen bounds and preserves entry identity',()=>{
 const lock=vi.fn();render(<CompetitionScoringForm sheet={sheet} scores={{'a:m':0,'b:m':11}} onScoreChange={()=>{}} onSubmitCriterion={lock} sessionState={{contestantOrder:['a','b']}}/>);
 const table=screen.getByRole('table'),buttons=within(table).getAllByRole('button',{name:/Quality, Skill Lock$/});
 expect(buttons[0]).toBeEnabled();expect(buttons[1]).toBeDisabled();fireEvent.click(buttons[0]);expect(lock).toHaveBeenCalledWith('a','c')
})
test('only the criterion being committed displays a loading state',()=>{
 render(<CompetitionScoringForm sheet={sheet} scores={{'a:m':8,'b:m':9}} onScoreChange={()=>{}} submittingKey="a:c"/>)
 const rows=screen.getByRole('table').querySelectorAll('tbody tr')
 const firstButton=within(rows[0]).getByRole('button',{name:'First: Quality, Skill Locking'})
 const secondButton=within(rows[1]).getByRole('button',{name:'Second: Quality, Skill Lock'})
 expect(firstButton).toBeDisabled();expect(firstButton.querySelector('.animate-spin')).toBeInTheDocument()
 expect(secondButton).toBeEnabled();expect(secondButton.querySelector('.animate-spin')).not.toBeInTheDocument()
})
test('stage order changes wait while an input owns focus',()=>{
 const props={sheet,scores:{'a:m':8,'b:m':9},onScoreChange:()=>{},sessionState:{contestantOrder:['a','b']}}
 const view=render(<CompetitionScoringForm {...props}/>),table=screen.getByRole('table');fireEvent.focus(within(table).getAllByRole('spinbutton')[0]);view.rerender(<CompetitionScoringForm {...props} sessionState={{contestantOrder:['b','a']}}/>);
 expect(table.querySelector('tbody tr').textContent).toContain('First');fireEvent.blur(within(table).getAllByRole('spinbutton')[0],{relatedTarget:null});expect(table.querySelector('tbody tr').textContent).toContain('Second')
})
test('submitted round and closed intersections disable inputs independently of reopened stage gates',()=>{
 render(<CompetitionScoringForm sheet={{...sheet,submission:{id:'s'}}} scores={{'a:m':8,'b:m':9}} onScoreChange={()=>{}}/>);expect(within(screen.getByRole('table')).getAllByRole('spinbutton').every(i=>i.disabled)).toBe(true)
})
test('one continuous grid uses actual division row colors/indicators without group rows or a total column',()=>{
 const configured={...sheet,divisionsEnabled:true,contestants:[{...sheet.contestants[0],divisionName:'MEN'},{...sheet.contestants[1],divisionName:'WOMEN'}]}
 render(<CompetitionScoringForm sheet={configured} scores={{}} onScoreChange={()=>{}} sessionState={{contestantOrder:['b','a']}}/>)
 const table=screen.getByRole('table'),rows=table.querySelectorAll('tbody tr')
 expect(rows).toHaveLength(2)
 expect(rows[0]).toHaveAttribute('data-contestant-id','b');expect(rows[0]).toHaveAttribute('data-division-tone','female')
 expect(rows[1]).toHaveAttribute('data-division-tone','male')
 expect(within(rows[0]).getByText('F')).toBeInTheDocument();expect(within(rows[1]).getByText('M')).toBeInTheDocument()
 expect(screen.queryByText('MEN')).not.toBeInTheDocument();expect(screen.queryByText('WOMEN')).not.toBeInTheDocument()
 expect(within(table).queryByRole('columnheader',{name:/total/i})).not.toBeInTheDocument()
 expect(table.querySelector('tbody td')).toHaveClass('v-judge-contestant')
 expect(screen.getByRole('region')).toHaveClass('v-judge-sheet-scroll')
})
test('closed criteria retain their configured percentage/range and do not expose an enabled lock',()=>{
 render(<CompetitionScoringForm sheet={{...sheet,criteria:[{...sheet.criteria[0],percentage:40,open:false}]}} scores={{'a:m':9}} onScoreChange={()=>{}}/>)
 expect(screen.getByText('40%')).toBeInTheDocument();expect(screen.getByText('0–10')).toBeInTheDocument()
 expect(within(screen.getByRole('table')).getAllByRole('spinbutton').every(input=>input.disabled)).toBe(true)
 expect(screen.queryByRole('button',{name:'Lock'})).not.toBeInTheDocument()
})
test('input changes and the one-per-major lock preserve configured target and contestant identities',()=>{
 const changed=vi.fn(),locked=vi.fn()
 const configured={...sheet,contestants:[sheet.contestants[0]],criteria:[{...sheet.criteria[0],minors:[sheet.criteria[0].minors[0],{id:'other',name:'Detail',minScore:1,maxScore:100}]}]}
 render(<CompetitionScoringForm sheet={configured} scores={{'a:m':7,'a:other':90}} onScoreChange={changed} onSubmitCriterion={locked}/>)
 fireEvent.change(screen.getByRole('spinbutton',{name:'First: Quality, Skill score'}),{target:{value:'8.5'}})
 expect(changed).toHaveBeenCalledWith('a','m','8.5')
 expect(screen.getAllByRole('button',{name:/First: Quality, .* Lock$/})).toHaveLength(2)
 fireEvent.click(screen.getByRole('button',{name:'First: Quality, Skill Lock'}));expect(locked).toHaveBeenCalledWith('a','c')
 expect(screen.getByRole('spinbutton',{name:'First: Quality, Detail score'})).toHaveAttribute('max','100')
})
test('native simplified scoresheet shows one Lock button per input, scoped to its major criterion',()=>{
 const configured={...sheet,contestants:[sheet.contestants[0]],criteria:[{...sheet.criteria[0],minors:[sheet.criteria[0].minors[0],{id:'detail',name:'Detail',minScore:0,maxScore:10}]}]}
 const view=render(<CompetitionScoringForm sheet={configured} scores={{'a:m':8,'a:detail':9}} onScoreChange={()=>{}} onSubmitCriterion={()=>{}} simplified/>)
 const table=screen.getByRole('table')
 expect(within(table).getAllByRole('button',{name:/First: Quality, .* Lock/})).toHaveLength(2)
 expect(within(table).queryByText('Not locked')).not.toBeInTheDocument()
 expect(within(table).queryByText('Locked',{selector:'.v-judge-cell-state'})).not.toBeInTheDocument()
 view.rerender(<CompetitionScoringForm sheet={{...configured,contestants:[{...configured.contestants[0],lockedCriteria:['c']}]}} scores={{'a:m':8,'a:detail':9}} onScoreChange={()=>{}} simplified/>)
 expect(within(table).getByRole('button',{name:'First: Quality, Skill locked'})).toHaveTextContent('Locked')
 expect(within(table).getByRole('button',{name:'First: Quality, Detail locked'})).toHaveTextContent('Locked')
 expect(within(table).getAllByRole('button',{name:/locked$/})).toHaveLength(2)
 expect(within(table).queryByText('Not locked')).not.toBeInTheDocument()
})
test('unknown custom divisions keep their identity rather than inferring gender from a name or photo',()=>{
 render(<CompetitionScoringForm sheet={{...sheet,contestants:[{...sheet.contestants[0],divisionName:'Open Class',rowColor:'#10b981'}]}} scores={{}} onScoreChange={()=>{}}/>)
 expect(screen.getByText('OC')).toBeInTheDocument();expect(screen.queryByText('M')).not.toBeInTheDocument();expect(screen.queryByText('F')).not.toBeInTheDocument()
 expect(screen.getByRole('table').querySelector('tbody tr')).toHaveAttribute('data-division-tone','neutral')
})

test('Pageant keeps paired registration numbers and division highlights while filters preserve scoring identities',()=>{
 const contestants=[
  {id:'m2',name:'Man two',contestantNumber:4,registrationNumber:2,divisionId:'men',divisionName:'MEN',open:true},
  {id:'w1',name:'Woman one',contestantNumber:2,registrationNumber:1,divisionId:'women',divisionName:'WOMEN',open:true},
  {id:'m1',name:'Man one',contestantNumber:1,registrationNumber:1,divisionId:'men',divisionName:'MEN',open:true},
  {id:'w2',name:'Woman two',contestantNumber:3,registrationNumber:2,divisionId:'women',divisionName:'WOMEN',open:true},
 ]
 const changed=vi.fn(),props={sheet:{...sheet,contestants},scores:{'m1:m':8},onScoreChange:changed,simplified:true}
 const view=render(<CompetitionScoringForm {...props}/>),table=screen.getByRole('table')
 const ids=()=>[...table.querySelectorAll('tbody tr')].map(row=>row.dataset.contestantId)
 expect(ids()).toEqual(['m1','w1','m2','w2'])
 expect([...table.querySelectorAll('.v-judge-number > span')].map(span=>span.textContent)).toEqual(['#1','#1','#2','#2'])
 expect(table.querySelectorAll('.v-judge-division-label')).toHaveLength(4)
 const headers=table.querySelector('thead').innerHTML
 view.rerender(<CompetitionScoringForm {...props} divisionFilter="men"/>)
 expect(ids()).toEqual(['m1','m2'])
 fireEvent.change(screen.getByRole('spinbutton',{name:'Man one: Quality, Skill score'}),{target:{value:'9'}})
 expect(changed).toHaveBeenCalledWith('m1','m','9')
 view.rerender(<CompetitionScoringForm {...props} divisionFilter="women"/>)
 expect(ids()).toEqual(['w1','w2'])
 expect(table.querySelector('thead').innerHTML).toBe(headers)
 view.rerender(<CompetitionScoringForm {...props}/>)
 expect(screen.getByRole('spinbutton',{name:'Man one: Quality, Skill score'})).toHaveValue(8)
})

test('configured deduction names and amounts replace the generic minor header',()=>{
 const rule={id:'late',description:'Time Limit Violation',amount:2,units:'points',criteriaId:null,appliedBy:'judge',anchorCriterionId:'c'}
 const configured={...sheet,deductionSettings:{mode:'judge',rules:[rule]}}
 const changed=vi.fn()
 const initialDrafts={'a:c':[{id:'a-late',ruleId:'late',offenseKey:'late-a',reason:'Started late'}]}
 const view=render(<CompetitionScoringForm sheet={configured} scores={{}} deductionDrafts={initialDrafts} onDeductionChange={changed} onScoreChange={()=>{}} simplified/>)
 const table=screen.getByRole('table'),rows=table.querySelectorAll('tbody tr')
 expect(table.closest('.v-judge-sheet-scroll')).toContainElement(rows[0])
 expect(table.querySelectorAll('tbody tr')).toHaveLength(2)
 expect(within(table).getByRole('columnheader',{name:'DEDUCTION'})).toBeInTheDocument()
 const deductionHeader=within(table).getByRole('columnheader',{name:'Time Limit Violation/ -2 Points'})
 expect(deductionHeader).toBeInTheDocument()
 expect(within(deductionHeader).queryByText('Deduction Name')).not.toBeInTheDocument()
 expect(within(deductionHeader).queryByText('Reason / Points')).not.toBeInTheDocument()
 expect([...rows].every(row=>row.querySelectorAll('.v-judge-deduction-cell').length===1)).toBe(true)
 expect(within(rows[0]).getByText('-2 points')).toBeInTheDocument()
 expect(within(rows[0]).queryByLabelText(/reason|reference/i)).not.toBeInTheDocument()
 expect(within(rows[0]).queryByText('+ Add deduction')).not.toBeInTheDocument()
 expect(within(rows[1]).queryByText('+ Add deduction')).not.toBeInTheDocument()
 expect(within(rows[1]).getByRole('button',{name:'Deduct'})).toBeInTheDocument()
 const deductButton=within(rows[1]).getByRole('button',{name:'Deduct'})
 expect(deductButton).toHaveClass('v-judge-deduct-button')
 expect(deductButton).toHaveTextContent(/^Deduct$/)
 const deductionAction=deductButton.closest('.v-judge-deduction-rule')
 expect(within(deductionAction).getByText('-2 points')).toBeInTheDocument()
 expect(within(deductionAction).queryByText('Time Limit Violation')).not.toBeInTheDocument()
 expect(deductionAction.querySelector('.v-judge-deduction-option')).toContainElement(within(deductionAction).getByText('-2 points'))
 fireEvent.click(deductButton)
 expect(changed).toHaveBeenCalledWith('b','c',[expect.objectContaining({ruleId:'late'})])
 view.rerender(<CompetitionScoringForm sheet={configured} scores={{}} deductionDrafts={{...initialDrafts,'b:c':changed.mock.calls.at(-1)[2]}} onDeductionChange={changed} onScoreChange={()=>{}} simplified/>)
 expect(within(rows[1]).getByRole('button',{name:'Deduct'})).toBeDisabled()
})

test('multiple saved deductions stay compact inside their contestant cell without showing audit metadata',()=>{
 const rules=[
  {id:'late',description:'Late start',amount:2,units:'points',criteriaId:null,appliedBy:'judge',anchorCriterionId:'c'},
  {id:'costume',description:'Costume issue',amount:1,units:'points',criteriaId:null,appliedBy:'judge',anchorCriterionId:'c'},
 ]
 const configured={...sheet,deductionSettings:{mode:'judge',rules}}
 const records=[
  {id:'late-b',ruleId:'late',offenseKey:'late-b',reason:'Started late'},
  {id:'costume-b',ruleId:'costume',offenseKey:'costume-b',reason:'Missing costume'},
 ]
 const changed=vi.fn()
 render(<CompetitionScoringForm sheet={configured} scores={{}} deductionDrafts={{'b:c':records}} onDeductionChange={changed} onScoreChange={()=>{}} simplified/>)
 const table=screen.getByRole('table'),rows=table.querySelectorAll('tbody tr')
 expect(within(rows[1]).getByText('-2 points')).toBeInTheDocument()
 expect(within(rows[1]).getByText('-1 points')).toBeInTheDocument()
 expect(within(rows[1]).queryByLabelText(/reason|reference/i)).not.toBeInTheDocument()
 expect(within(rows[1]).queryByRole('button',{name:/Remove/})).not.toBeInTheDocument()
 expect(within(rows[1]).getAllByRole('button',{name:'Deduct'})).toHaveLength(2)
 expect(within(rows[0]).queryByText('+ Add deduction')).not.toBeInTheDocument()
})

test('multiple configured deduction options each appear in the deduction header',()=>{
 const rules=[
  {id:'late',description:'Time Limit Violation',amount:2,units:'points',criteriaId:null,appliedBy:'judge',anchorCriterionId:'c'},
  {id:'costume',description:'Costume Violation',amount:1,units:'points',criteriaId:null,appliedBy:'judge',anchorCriterionId:'c'},
 ]
 const configured={...sheet,deductionSettings:{mode:'judge',rules}}
 render(<CompetitionScoringForm sheet={configured} scores={{}} deductionDrafts={{}} onDeductionChange={()=>{}} onScoreChange={()=>{}} simplified/>)
 const header=screen.getByRole('columnheader',{name:/Time Limit Violation.*Costume Violation/})
 expect(within(header).getByText('Time Limit Violation')).toBeInTheDocument()
 expect(within(header).getByText('/ -2 Points')).toBeInTheDocument()
 expect(within(header).getByText('Costume Violation')).toBeInTheDocument()
 expect(within(header).getByText('/ -1 Points')).toBeInTheDocument()
})

test('long contestant lists keep every deduction cell in the single shared scrolling table',()=>{
 const contestants=Array.from({length:30},(_,index)=>({id:`entry-${index}`,name:`Contestant ${index}`,contestantNumber:index+1,lockedCriteria:[],open:true}))
 const configured={...sheet,contestants,deductionSettings:{mode:'judge',rules:[{id:'late',description:'Late start',amount:2,units:'points',criteriaId:null,appliedBy:'judge',anchorCriterionId:'c'}]}}
 render(<CompetitionScoringForm sheet={configured} scores={{}} deductionDrafts={{}} onDeductionChange={()=>{}} onScoreChange={()=>{}} simplified/>)
 const region=screen.getByRole('region',{name:/contestants, criteria, and deductions/i})
 const table=within(region).getByRole('table'),rows=table.querySelectorAll('tbody tr')
 expect(region.querySelectorAll('table')).toHaveLength(1)
 expect(rows).toHaveLength(contestants.length)
 expect([...rows].every((row,index)=>row.getAttribute('data-contestant-id')===contestants[index].id&&row.querySelectorAll('.v-judge-deduction-cell').length===1)).toBe(true)
 expect(region.querySelectorAll('.v-judge-deduction-cell')).toHaveLength(contestants.length)
})

test.each(['none','organizer'])('the deduction column is hidden when round responsibility is %s',mode=>{
 const configured={...sheet,deductionSettings:{mode,rules:[{id:'late',description:'Late start',amount:2,units:'points',appliedBy:'judge',anchorCriterionId:'c'}]}}
 render(<CompetitionScoringForm sheet={configured} scores={{}} deductionDrafts={{}} onDeductionChange={()=>{}} onScoreChange={()=>{}} simplified/>)
 expect(screen.queryByRole('columnheader',{name:'DEDUCTION'})).not.toBeInTheDocument()
 expect(screen.queryByText('+ Add deduction')).not.toBeInTheDocument()
 expect(screen.queryByRole('button',{name:'Deduct'})).not.toBeInTheDocument()
})

test('judge mode displays only judge-owned configured rules',()=>{
 const configured={...sheet,deductionSettings:{mode:'judge',rules:[
  {id:'late',description:'Late start',amount:2,units:'points',appliedBy:'judge',anchorCriterionId:'c'},
  {id:'organizer-rule',description:'Organizer-only issue',amount:3,units:'points',appliedBy:'organizer',anchorCriterionId:'c'},
 ]}}
 render(<CompetitionScoringForm sheet={configured} scores={{}} deductionDrafts={{}} onDeductionChange={()=>{}} onScoreChange={()=>{}} simplified/>)
 const cell=screen.getByRole('row',{name:/First/}).querySelector('.v-judge-deduction-cell')
 expect(screen.getByRole('columnheader',{name:'DEDUCTION'})).toBeInTheDocument()
 expect(within(cell).getByRole('button',{name:'Deduct'})).toBeInTheDocument()
 expect(within(cell).queryByRole('button',{name:/Organizer-only issue/})).not.toBeInTheDocument()
})
