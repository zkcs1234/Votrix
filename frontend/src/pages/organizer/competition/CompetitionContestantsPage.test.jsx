import {beforeEach,expect,test,vi} from 'vitest'
import {fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {MemoryRouter,Route,Routes} from 'react-router-dom'
import CompetitionContestantsPage from './CompetitionContestantsPage'
import {pageantService} from '@/services/pageant.service'
const toast=vi.hoisted(()=>({success:vi.fn(),error:vi.fn()}))
vi.mock('@/hooks/useToast',()=>({useToast:()=>toast}))
vi.mock('@/components/upload/ImageUploadField',()=>({default:()=>null}))
vi.mock('@/services/pageant.service',()=>({pageantService:{getFoundation:vi.fn(),getNextContestantNumber:vi.fn(),createContestant:vi.fn(),updateContestant:vi.fn(),deleteContestant:vi.fn(),uploadContestantPhoto:vi.fn(),addRoundContestant:vi.fn(),removeRoundContestant:vi.fn()}}))
let foundation
beforeEach(()=>{
  vi.clearAllMocks()
  foundation={event:{id:'e',status:'draft',divisions_enabled:false},rounds:[{id:'pre',name:'Preliminary',purpose:'qualification',displayOrder:0,advancementType:'top_n',advancementValue:5,contestantIds:['a']},{id:'final',name:'Final',purpose:'final',displayOrder:1,contestantIds:['a','b']}],contestants:[{id:'a',name:'Alice',contestantNumber:1,entryType:'individual'},{id:'b',name:'Dance Crew',contestantNumber:2,entryType:'group'}],divisions:[],advancementDecisions:[],eligibilityDecisions:[]}
  pageantService.getFoundation.mockImplementation(async()=>({data:{foundation:structuredClone(foundation)}}))
  pageantService.getNextContestantNumber.mockResolvedValue({data:{nextContestantNumber:3}})
  pageantService.createContestant.mockResolvedValue({data:{contestant:{id:'new'}}})
  pageantService.updateContestant.mockResolvedValue({data:{contestant:{id:'a'}}})
  pageantService.addRoundContestant.mockImplementation(async(e,r,id)=>{foundation.rounds.find(item=>item.id===r).contestantIds.push(id);return {data:{success:true}}})
  pageantService.removeRoundContestant.mockResolvedValue({data:{success:true}})
})
async function open(){render(<MemoryRouter initialEntries={['/organizer/competition/events/e/contestants']}><Routes><Route path="/organizer/competition/events/:eventId/contestants" element={<CompetitionContestantsPage/>}/></Routes></MemoryRouter>);await screen.findByRole('heading',{name:'Contestants & Entries'});await waitFor(()=>expect(screen.getByLabelText('Entry number')).toHaveValue(3));return within(screen.getByRole('table'))}
test('individual and group entry labels change while registration does not assign rounds',async()=>{
  await open();expect(screen.getByLabelText('Contestant full name')).toBeInTheDocument();expect(screen.queryByLabelText('Division')).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Entry type'),{target:{value:'group'}})
  fireEvent.change(screen.getByLabelText('Entry or group name'),{target:{value:'Rhythm Team'}})
  fireEvent.click(screen.getByRole('button',{name:'Register entry'}))
  await waitFor(()=>expect(pageantService.createContestant).toHaveBeenCalledWith('e',expect.objectContaining({name:'Rhythm Team',entryType:'group',divisionId:null})))
  expect(pageantService.addRoundContestant).not.toHaveBeenCalled()
})
test.each(['duo','other'])('%s uses an entry name and its existing compatible backend value',async type=>{
  await open();fireEvent.change(screen.getByLabelText('Entry type'),{target:{value:type}});expect(screen.getByLabelText('Entry or group name')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Entry or group name'),{target:{value:'Our Entry'}});fireEvent.click(screen.getByRole('button',{name:'Register entry'}))
  await waitFor(()=>expect(pageantService.createContestant).toHaveBeenCalledWith('e',expect.objectContaining({entryType:type})))
})
test('actual custom divisions are required and no division is autoassigned',async()=>{
  foundation.event.divisions_enabled=true;foundation.divisions=[{id:'junior',name:'Junior Ensemble'},{id:'senior',name:'Open Masters'}]
  await open();fireEvent.change(screen.getByLabelText('Contestant full name'),{target:{value:'Alice'}});fireEvent.click(screen.getByRole('button',{name:'Register entry'}))
  expect(await screen.findByRole('alert')).toHaveTextContent('Select a configured division');expect(pageantService.createContestant).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Division'),{target:{value:'junior'}});fireEvent.click(screen.getByRole('button',{name:'Register entry'}))
  await waitFor(()=>expect(pageantService.createContestant).toHaveBeenCalledWith('e',expect.objectContaining({divisionId:'junior'})))
  expect(screen.queryByRole('option',{name:'Male'})).not.toBeInTheDocument()
})
test('initial assignment operates on selected eligible entries, not every visible row',async()=>{
  const table=await open();fireEvent.click(table.getByRole('checkbox',{name:'Select Dance Crew'}));fireEvent.click(screen.getByRole('button',{name:'Assign Selected'}))
  await waitFor(()=>expect(pageantService.addRoundContestant).toHaveBeenCalledTimes(1))
  expect(pageantService.addRoundContestant).toHaveBeenCalledWith('e','pre','b')
})
test('a single round remains available for ordinary initial assignments',async()=>{
  foundation.rounds=[foundation.rounds[0]];const table=await open()
  expect(screen.getByText('Initial Round Assignment')).toBeInTheDocument();expect(screen.queryByRole('button',{name:'Final'})).not.toBeInTheDocument()
  fireEvent.click(table.getByRole('checkbox',{name:'Select Dance Crew'}));fireEvent.click(screen.getByRole('button',{name:'Assign Selected'}))
  await waitFor(()=>expect(pageantService.addRoundContestant).toHaveBeenCalledWith('e','pre','b'))
})
test('protected Final shows planned unqualified entries and exposes no ordinary assignments',async()=>{
  await open();fireEvent.click(screen.getByRole('button',{name:'Final'}));expect(screen.getByText('Awaiting Preliminary results',{exact:true})).toBeInTheDocument()
  expect(screen.getByText('View 2 saved planned entries — unqualified')).toBeInTheDocument()
  expect(screen.queryByRole('button',{name:'Assign Selected'})).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'Remove Selected'})).not.toBeInTheDocument()
  expect(within(screen.getByRole('table')).queryByText('Finalist',{exact:true})).not.toBeInTheDocument();expect(pageantService.addRoundContestant).not.toHaveBeenCalled()
})
test('confirmed qualifiers display provenance and eliminated entries retain their records',async()=>{
  foundation.event.official_rules_id='v';foundation.event.status='active'
  foundation.rounds[0].contestantIds=['a','b'];foundation.rounds[1].contestantIds=['a']
  foundation.advancementDecisions=[{rules_version:'v',round_id:'pre',next_round_id:'final',calculation_id:'calculation-v1',qualifiers:['a'],selection_basis:'automatic'}]
  render(<MemoryRouter initialEntries={['/organizer/competition/events/e/contestants']}><Routes><Route path="/organizer/competition/events/:eventId/contestants" element={<CompetitionContestantsPage/>}/></Routes></MemoryRouter>)
  await screen.findByRole('heading',{name:'Contestants & Entries'});fireEvent.click(screen.getByRole('button',{name:'Final'}))
  const table=within(screen.getByRole('table'));expect(table.getByText('Finalist',{exact:true})).toBeInTheDocument();expect(table.getByText('Eliminated',{exact:true})).toBeInTheDocument();expect(table.getByText(/Confirmed from Preliminary/)).toBeInTheDocument()
  expect(screen.queryByRole('button',{name:'Register entry'})).not.toBeInTheDocument()
})
test('editing preserves the stored group type and registration description',async()=>{
  foundation.contestants[1].entryLabel='Six dancers';const table=await open();fireEvent.click(table.getByRole('button',{name:'Edit Dance Crew'}))
  expect(screen.getByLabelText('Entry type')).toHaveValue('group');expect(screen.getByLabelText('Entry description (optional)')).toHaveValue('Six dancers')
  fireEvent.click(screen.getByRole('button',{name:'Save entry'}));await waitFor(()=>expect(pageantService.updateContestant).toHaveBeenCalledWith('e','b',expect.objectContaining({entryType:'group',entryLabel:'Six dancers'})))
})
test('failed refresh after assignment blocks further writes until saved data reloads',async()=>{
  const table=await open();pageantService.getFoundation.mockRejectedValueOnce(new Error('Refresh failed'))
  fireEvent.click(table.getByRole('checkbox',{name:'Select Dance Crew'}));fireEvent.click(screen.getByRole('button',{name:'Assign Selected'}))
  await screen.findByText('Could not load saved entries. Reload before making changes.');expect(screen.queryByRole('button',{name:'Assign Selected'})).not.toBeInTheDocument();expect(screen.getByRole('button',{name:'Register entry'})).toBeDisabled();expect(pageantService.addRoundContestant).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button',{name:'Reload saved entries'}));await waitFor(()=>expect(screen.queryByRole('alert')).not.toBeInTheDocument())
})
test('a draft with no session renders participation without inventing live scoring',async()=>{
  await open()
  expect(screen.getByText('Scoring status: Not yet open')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'Final'}))
  expect(screen.getByRole('status')).toHaveTextContent('Awaiting Preliminary results')
  expect(pageantService.addRoundContestant).not.toHaveBeenCalled()
})
test.each(['back_to_zero','carry_forward','weighted'])('no elimination derives Final participants independently of %s score use',async progression=>{
  foundation.rounds[0].advancementType='none'
  foundation.rounds[0].contestantIds=['a','b']
  foundation.rounds[1].contestantIds=[]
  foundation.rounds[1].progression=progression
  await open();fireEvent.click(screen.getByRole('button',{name:'Final'}))
  const panel=within(screen.getByRole('region',{name:'Round Participation'}))
  expect(panel.getByText('All eligible contestants continue')).toBeInTheDocument()
  expect(panel.getByText('2 planned entries')).toBeInTheDocument()
  expect(panel.queryByText(/qualifiers|finalists|Awaiting .* results/i)).not.toBeInTheDocument()
  expect(panel.getByRole('link',{name:'View Round Progression'})).toHaveAttribute('href','/organizer/competition/events/e/workspace?tab=rounds&section=advancement&roundId=pre')
  expect(panel.queryByRole('button',{name:'Assign Selected'})).not.toBeInTheDocument()
  expect(within(screen.getByRole('table')).getAllByText('Eligible — all continue')).toHaveLength(2)
  expect(pageantService.addRoundContestant).not.toHaveBeenCalled()
})
test.each([
  ['awaiting_results','Awaiting Preliminary results'],
  ['awaiting_tabulation','Awaiting tabulation'],
  ['awaiting_verification','Awaiting verification'],
  ['awaiting_approval','Awaiting advancement approval'],
  ['unavailable','Participation status unavailable'],
])('protected Final reflects saved backend phase %s with assignment blocked',async(phase,label)=>{
  foundation.event.status='scheduled';foundation.event.official_rules_id='v'
  foundation.participation={rounds:{final:{mode:'qualification',phase,plannedEntryIds:['a'],eligibleEntryIds:[],scoringStatus:'not_open',ruleLabel:'Top 5'}}}
  render(<MemoryRouter initialEntries={['/organizer/competition/events/e/contestants']}><Routes><Route path="/organizer/competition/events/:eventId/contestants" element={<CompetitionContestantsPage/>}/></Routes></MemoryRouter>)
  await screen.findByRole('heading',{name:'Contestants & Entries'});fireEvent.click(screen.getByRole('button',{name:'Final'}))
  expect(screen.getByRole('status')).toHaveTextContent(label)
  expect(screen.queryByRole('button',{name:'Assign Selected'})).not.toBeInTheDocument()
  expect(screen.queryByRole('button',{name:'Register entry'})).not.toBeInTheDocument()
  expect(pageantService.addRoundContestant).not.toHaveBeenCalled()
})
test('an initial participation read failure keeps recovery visible instead of crashing',async()=>{
  pageantService.getFoundation.mockRejectedValueOnce(new Error('Unavailable'))
  render(<MemoryRouter initialEntries={['/organizer/competition/events/e/contestants']}><Routes><Route path="/organizer/competition/events/:eventId/contestants" element={<CompetitionContestantsPage/>}/></Routes></MemoryRouter>)
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load saved entries')
  expect(screen.getByRole('status')).toHaveTextContent('Failed to load participation data')
  fireEvent.click(screen.getByRole('button',{name:'Reload saved entries'}))
  await screen.findByRole('button',{name:'Register entry'})
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
test('manual official scoring explains verified recorded placements without requiring numerical judge submissions',async()=>{
  foundation.scoringConfig={calculationMethod:'manual'}
  await open();fireEvent.click(screen.getByRole('button',{name:'Final'}))
  expect(screen.getByText(/recorded official placements are independently verified/)).toBeInTheDocument()
  expect(screen.queryByText(/after required judges submit/)).not.toBeInTheDocument()
})
