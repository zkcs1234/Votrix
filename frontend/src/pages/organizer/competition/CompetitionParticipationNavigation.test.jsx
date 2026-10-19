import {beforeEach,expect,test,vi} from 'vitest'
import {fireEvent,render,screen,within} from '@testing-library/react'
import {MemoryRouter,Outlet,Route,Routes,useLocation} from 'react-router-dom'
import CompetitionContestantsPage from './CompetitionContestantsPage'
import CompetitionWorkspacePage from './CompetitionWorkspacePage'
import {pageantService} from '@/services/pageant.service'

vi.mock('@/services/pageant.service',()=>({pageantService:{getFoundation:vi.fn(),getNextContestantNumber:vi.fn(),createContestant:vi.fn(),updateContestant:vi.fn(),deleteContestant:vi.fn(),uploadContestantPhoto:vi.fn(),addRoundContestant:vi.fn(),removeRoundContestant:vi.fn(),createRound:vi.fn(),updateRound:vi.fn(),deleteRound:vi.fn(),setScoringConfig:vi.fn(),createCriteria:vi.fn(),addRoundCriteria:vi.fn()}}))
vi.mock('@/services/competition-workflow.service',()=>({workflowService:{action:vi.fn(),createRoundCriterion:vi.fn()}}))
vi.mock('@/components/upload/ImageUploadField',()=>({default:()=>null}))
vi.mock('@/hooks/useToast',()=>({useToast:()=>({success:vi.fn(),error:vi.fn()})}))
vi.mock('@/hooks/useEventStatus',()=>({default:()=>({status:foundation.event.status,setupLocked:foundation.event.status!=='draft',loading:false})}))
let foundation
beforeEach(()=>{
  vi.clearAllMocks();localStorage.clear()
  foundation={event:{id:'event-one',status:'draft',divisions_enabled:false},rounds:[
    {id:'preliminary-saved-id',name:'Preliminary',purpose:'qualification',displayOrder:0,advancementType:'top_n',advancementValue:5,contestantIds:['a'],criteriaIds:[],progression:'back_to_zero',weight:0},
    {id:'final-saved-id',name:'Final',purpose:'final',displayOrder:1,contestantIds:[],criteriaIds:[],advancementType:'none',progression:'back_to_zero',weight:0},
  ],contestants:[{id:'a',name:'Alice',entryType:'individual',contestantNumber:1}],categories:[],criteria:[],minorCriteria:[],divisions:[],judges:[],assignments:[],advancementDecisions:[],eligibilityDecisions:[],scoringConfig:{deductionRules:[]}}
  pageantService.getFoundation.mockImplementation(async()=>({data:{foundation:structuredClone(foundation)}}))
  pageantService.getNextContestantNumber.mockResolvedValue({data:{nextContestantNumber:2}})
})
function Location(){const location=useLocation();return <output data-testid="current-location">{location.pathname}{location.search}</output>}
// These are sibling event routes under the same competition parent as production.
function open(path='/organizer/competition/events/event-one/contestants'){
  return render(<MemoryRouter initialEntries={[path]}><Location/><Routes>
    <Route path="/organizer/competition" element={<Outlet/>}>
      <Route path="events/:eventId/contestants" element={<CompetitionContestantsPage/>}/>
      <Route path="events/:eventId/workspace" element={<CompetitionWorkspacePage/>}/>
      <Route path="events/:eventId/tabulation" element={<h2>Tabulation destination</h2>}/>
      <Route path="*" element={<h2>Unmatched event route</h2>}/>
    </Route>
  </Routes></MemoryRouter>)
}
const rulePath='/organizer/competition/events/event-one/workspace?tab=rounds&section=advancement&roundId=preliminary-saved-id'
test('Final advancement link reaches the saved source round through production sibling routes',async()=>{
  open();await screen.findByRole('heading',{name:'Contestants & Entries'})
  fireEvent.click(screen.getByRole('button',{name:'Final'}))
  const link=screen.getByRole('link',{name:'View Advancement Rules'})
  expect(link).toHaveAttribute('href',rulePath)
  fireEvent.click(link)
  const dialog=await screen.findByRole('dialog',{name:/Preliminary.*Round Settings/})
  expect(screen.getByTestId('current-location')).toHaveTextContent(rulePath)
  expect(within(dialog).getByRole('heading',{name:'Advancement & Elimination'})).toBeInTheDocument()
  expect(within(dialog).getByLabelText('Number of entries advancing')).toHaveValue(5)
  expect(screen.queryByRole('heading',{name:'Unmatched event route'})).not.toBeInTheDocument()
  expect(pageantService.updateRound).not.toHaveBeenCalled()
})
test('a refreshed direct advancement URL opens the same saved round without writes',async()=>{
  open(rulePath)
  const dialog=await screen.findByRole('dialog',{name:/Preliminary.*Round Settings/})
  expect(within(dialog).getByLabelText('Who should proceed to the next round?')).toHaveValue('top_n')
  expect(within(dialog).getByLabelText('Number of entries advancing')).toHaveValue(5)
  expect(pageantService.updateRound).not.toHaveBeenCalled()
})
test('published direct settings stay readable and prevent setup mutations',async()=>{
  foundation.event.status='active';foundation.event.official_rules_id='rules-version'
  open(rulePath)
  const dialog=await screen.findByRole('dialog',{name:/Preliminary.*Round Settings/})
  expect(within(dialog).getByLabelText('Who should proceed to the next round?')).toBeDisabled()
  expect(within(dialog).getByLabelText('Number of entries advancing')).toBeDisabled()
  const save=within(dialog).getByRole('button',{name:'Save advancement'})
  expect(save).toBeDisabled();fireEvent.click(save)
  expect(pageantService.updateRound).not.toHaveBeenCalled()
})
test('the no-elimination progression link opens the source rule rather than a Final rule',async()=>{
  foundation.rounds[0].advancementType='none'
  open();await screen.findByRole('heading',{name:'Contestants & Entries'})
  fireEvent.click(screen.getByRole('button',{name:'Final'}))
  fireEvent.click(screen.getByRole('link',{name:'View Round Progression'}))
  const dialog=await screen.findByRole('dialog',{name:/Preliminary.*Round Settings/})
  expect(within(dialog).getByLabelText('Who should proceed to the next round?')).toHaveValue('none')
  expect(screen.getByTestId('current-location')).toHaveTextContent(rulePath)
})
