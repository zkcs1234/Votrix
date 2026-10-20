import {beforeEach,expect,test,vi} from 'vitest'
import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import CompetitionTabulationWorkspace from './CompetitionTabulationWorkspace'
const mocks=vi.hoisted(()=>({tabulation:vi.fn(),latest:vi.fn(),preview:vi.fn(),calculate:vi.fn(),action:vi.fn()}))
vi.mock('@/services/competition-workflow.service',()=>({workflowService:{tabulation:mocks.tabulation,action:mocks.action}}))
vi.mock('@/services/competition-tabulation.service',()=>({competitionTabulationService:{getLatestCalculation:mocks.latest,calculate:mocks.calculate}}))
vi.mock('@/services/competition-session.service',()=>({competitionSessionService:{previewRoundAdvancement:mocks.preview}}))
const state={rules:{id:'rules',version:1,event:{id:'event'},scoringConfig:{calculationMethod:'weighted_average',deductionRules:[],independentApproval:true},judges:[],criteria:[],contestants:[{id:'entry',name:'Entry A'}],divisions:[],rounds:[{id:'round',name:'Qualification',displayOrder:0,advancementType:'top_n',advancementValue:1},{id:'final',name:'Final',purpose:'final',displayOrder:1,advancementType:'none'}]},session:{id:'session',submission_window:true},worksheets:[],submissions:[],lockedSources:[],missing:[],deductions:[],eligibility:[],ready:false}
beforeEach(()=>{vi.clearAllMocks();mocks.tabulation.mockResolvedValue({data:state});mocks.latest.mockResolvedValue({data:{calculation:null}})})
test('advancement preview reads the actual endpoint contract and displays qualifier overrides',async()=>{
 mocks.preview.mockResolvedValue({data:{roundId:'round',roundName:'Qualification',ready:true,standing:[{contestantId:'entry',contestantName:'Entry A',rank:1}],qualifiers:['entry']}})
 render(<MemoryRouter><CompetitionTabulationWorkspace eventId="event" initialSection="advancement"/></MemoryRouter>);await screen.findByRole('button',{name:'Preview qualifiers'});fireEvent.click(screen.getByRole('button',{name:'Preview qualifiers'}))
 await waitFor(()=>expect(screen.getByRole('checkbox')).toBeChecked());expect(mocks.preview).toHaveBeenCalledWith('event','round')
})
test('manual official results send placements and decision basis without manufactured numeric scores',async()=>{
 mocks.tabulation.mockResolvedValue({data:{...state,rules:{...state.rules,scoringConfig:{...state.rules.scoringConfig,calculationMethod:'manual',manualBasis:'Approved panel decision'}}}})
 mocks.calculate.mockResolvedValue({data:{calculation:{id:'calculation'}}})
 render(<MemoryRouter><CompetitionTabulationWorkspace eventId="event" initialSection="finalization"/></MemoryRouter>);await screen.findByLabelText('Entry A');fireEvent.change(screen.getByLabelText('Entry A'),{target:{value:'1'}});fireEvent.change(screen.getByPlaceholderText('Official decision reason'),{target:{value:'Panel confirmed placement'}});fireEvent.click(screen.getByRole('button',{name:'Save manual placements'}))
 await waitFor(()=>expect(mocks.calculate).toHaveBeenCalledWith('event',{roundId:null,results:[{contestantId:'entry',rank:1}],reason:'Panel confirmed placement'}))
})
test('the Advancement tab has no qualification mutations for a None source rule',async()=>{
 mocks.tabulation.mockResolvedValue({data:{...state,rules:{...state.rules,rounds:state.rules.rounds.map(r=>({...r,advancementType:'none'}))}}})
 render(<MemoryRouter><CompetitionTabulationWorkspace eventId="event" initialSection="advancement"/></MemoryRouter>);await screen.findByText('All eligible contestants continue')
 expect(screen.getByText('All eligible contestants continue')).toBeInTheDocument()
 expect(screen.getByRole('link',{name:'Activate Final in Live Control'})).toHaveAttribute('href','/organizer/competition/events/event/live')
 expect(screen.queryByRole('button',{name:'Preview qualifiers'})).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'Confirm advancement'})).not.toBeInTheDocument()
 expect(mocks.preview).not.toHaveBeenCalled();expect(mocks.action).not.toHaveBeenCalled()
})
test('a complete preview confirms through the existing advancement action with its verified source calculation',async()=>{
 mocks.latest.mockResolvedValue({data:{calculation:{id:'verified-calc',round_id:'round',rules_version:'rules',verified_at:'2026-10-12T01:00:00Z',status:'under_verification'}}})
 mocks.preview.mockResolvedValue({data:{roundId:'round',roundName:'Qualification',ready:true,standing:[{contestantId:'entry',contestantName:'Entry A',rank:1}],qualifiers:['entry']}})
 mocks.action.mockResolvedValue({data:{result:{id:'approved'}}})
 render(<MemoryRouter><CompetitionTabulationWorkspace eventId="event" initialSection="advancement"/></MemoryRouter>);await screen.findByRole('button',{name:'Preview qualifiers'});fireEvent.click(screen.getByRole('button',{name:'Preview qualifiers'}))
 await screen.findByRole('checkbox');fireEvent.click(screen.getByRole('button',{name:'Confirm advancement'}))
 await waitFor(()=>expect(mocks.action).toHaveBeenCalledWith('event','advancement',{roundId:'round',calculationId:'verified-calc',reason:''}))
})


test.each(['scoring','results'])('legacy %s renders its three sections together with one data load',async(workspace)=>{
 mocks.tabulation.mockResolvedValue({data:{...state,results:[],rules:{...state.rules,rounds:state.rules.rounds.map(round=>({...round,criteriaIds:[],contestantIds:['entry']}))}}})
 render(<MemoryRouter><CompetitionTabulationWorkspace eventId="event" workspace={workspace} initialSection={workspace==='scoring'?'submissions':'validation'}/></MemoryRouter>)
 await screen.findByRole('heading',{name:workspace==='scoring'?'Judge Submissions':'Validation'})
 const ids=[...document.querySelectorAll('.v-tabulation-page-section')].map(n=>n.id)
 expect(ids).toEqual(workspace==='scoring'?['tabulation-submissions','tabulation-matrix','tabulation-deductions']:['tabulation-validation','tabulation-results','tabulation-finalization'])
 expect(mocks.tabulation).toHaveBeenCalledTimes(1)
 expect(mocks.latest).toHaveBeenCalledTimes(1)
 if(workspace==='results')expect(screen.getByRole('button',{name:'Continue to Round Advancement'})).toBeDisabled()
})
