import {render,screen,fireEvent,waitFor,cleanup,within,act} from '@testing-library/react'
import {MemoryRouter,Routes,Route} from 'react-router-dom'
import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest'
import NativeSetupWorkspace,{NativeSetupBoundary} from './NativeSetupWorkspace'
import {nativeCompetitionService as service} from '@/services/competition-native.service'
import {pageantService} from '@/services/pageant.service'
vi.mock('@/services/competition-native.service',()=>({nativeCompetitionService:Object.fromEntries(['list','create','entries','addEntry','removeEntry','foundation','configure','assign','freeze','enrollments','pool','enroll','role'].map(k=>[k,vi.fn()]))}))
vi.mock('@/services/pageant.service',()=>({pageantService:{getEvent:vi.fn(),listContestants:vi.fn(),getNextContestantNumber:vi.fn(),createContestant:vi.fn(),uploadContestantPhoto:vi.fn(),listDivisions:vi.fn(),setDivisionsEnabled:vi.fn(),createDivision:vi.fn(),deleteDivision:vi.fn()}}))
const children=Array.from({length:5},(_,i)=>({id:`child-${i}`,event_id:'event',name:['Hip-Hop','Contemporary','Ballet','Ballroom','Folk'][i],origin:'native'}))
const config={structure:'single',rounds:[],criteria:[{id:'criterion',roundId:null,name:'Technique',percentage:100,minScore:0,maxScore:100,minorCriteria:[]}],scoringConfig:{calculationMethod:'weighted_average',tiePolicy:'shared'}}
const foundation=c=>({competition:{...c,setup_revision:8,input_revision:9,official_child_rules_id:null},configuration:structuredClone(config),assignments:[{id:'grant',participant_id:'enrollment',round_id:null}],criteriaReadiness:{allReady:true}})
beforeEach(()=>{
 vi.resetAllMocks();service.list.mockResolvedValue({data:{competitions:children}});pageantService.getEvent.mockResolvedValue({data:{event:{status:'draft'}}});pageantService.listContestants.mockResolvedValue({data:{contestants:[{id:'master',name:'Shared entrant'}]}});pageantService.getNextContestantNumber.mockResolvedValue({data:{nextContestantNumber:1}});pageantService.listDivisions.mockResolvedValue({data:{divisions:[]}});pageantService.setDivisionsEnabled.mockResolvedValue({data:{}});pageantService.createDivision.mockResolvedValue({data:{}});pageantService.deleteDivision.mockResolvedValue({data:{}})
 service.entries.mockResolvedValue({data:{entries:[{id:'participation',contestant_id:'master',entry_number:1}]}});service.enrollments.mockResolvedValue({data:{judges:[{id:'enrollment',displayName:'Judge One',role:'judge',isActive:true,accountStatus:'active'}]}});service.pool.mockResolvedValue({data:{judges:[]}})
 service.foundation.mockImplementation((_event,id)=>Promise.resolve({data:foundation(children.find(c=>c.id===id))}));service.configure.mockResolvedValue({data:{}});service.freeze.mockResolvedValue({data:{}})
})
afterEach(()=>{cleanup();vi.unstubAllEnvs()})
const openCriterion=async()=>{fireEvent.click(await screen.findByRole('button',{name:'Criteria',exact:true}));fireEvent.click((await screen.findAllByRole('button',{name:/^Edit criterion /}))[0]);return screen.getByLabelText('Major criterion name')}
const show=()=>render(<MemoryRouter><NativeSetupWorkspace eventId="event" initialChildren={children}/></MemoryRouter>)
describe('Native organizer setup connections',()=>{
 it('starts with a competition list, opens one configuration, and returns after saving',async()=>{
  render(<MemoryRouter><NativeSetupWorkspace eventId="event" initialChildren={children} stage="workspace"/></MemoryRouter>)
  expect(await screen.findByText('Selected Competitions')).toBeInTheDocument()
  await waitFor(()=>expect(screen.getByRole('button',{name:'Edit Configuration Hip-Hop'})).not.toBeDisabled())
  expect(screen.queryByLabelText('Single round name')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'Edit Configuration Hip-Hop'}))
  expect(await screen.findByLabelText('Single round name')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Single round name'),{target:{value:'Dance Round'}})
  fireEvent.click(screen.getByRole('button',{name:'Save & Return to Competitions'}))
  await waitFor(()=>expect(service.configure).toHaveBeenCalledWith('event','child-0',expect.objectContaining({configuration:expect.objectContaining({scoringConfig:expect.objectContaining({singleRoundName:'Dance Round'})}),expectedSetupRevision:8})))
  expect(await screen.findByText('Selected Competitions')).toBeInTheDocument()
  expect(screen.queryByLabelText('Single round name')).not.toBeInTheDocument()
 })
 it('shows Pageant as one configured competition with its actual divisions',async()=>{
  const pageant={id:'pageant-child',event_id:'event',name:'Pageant',competition_type:'pageant',origin:'native'}
  const previousWomen={id:'women-child',event_id:'event',name:'Women',competition_type:'pageant',origin:'native'}
  const previousMen={id:'men-child',event_id:'event',name:'Men',competition_type:'pageant',origin:'native'}
  const pageantChildren=[previousWomen,previousMen,pageant]
  pageantService.getEvent.mockResolvedValue({data:{event:{status:'draft',competitionType:'pageant'}}})
  pageantService.listDivisions.mockResolvedValue({data:{divisions:[{id:'women',name:'Women'},{id:'men',name:'Men'}]}})
  service.foundation.mockImplementation(async(_event,id)=>({data:foundation(pageantChildren.find(child=>child.id===id))}))
  render(<MemoryRouter><NativeSetupWorkspace eventId="event" initialChildren={pageantChildren} stage="workspace"/></MemoryRouter>)
  expect(await screen.findByText('pageant · 2 divisions · 1 round')).toBeInTheDocument()
  expect(screen.getByText('1 of 1 configured')).toBeInTheDocument()
  expect(screen.queryByRole('button',{name:/Configuration (Women|Men)/})).not.toBeInTheDocument()
  expect(screen.getByRole('button',{name:'Edit Configuration Pageant'})).toBeEnabled()
  fireEvent.click(screen.getByRole('button',{name:'Edit Configuration Pageant'}))
  expect(await screen.findByRole('heading',{name:'Pageant divisions'})).toBeInTheDocument()
  expect(screen.getByText('Women')).toBeInTheDocument()
  expect(screen.getByText('Men')).toBeInTheDocument()
  expect(screen.getByLabelText('New division name')).toBeInTheDocument()
 })
 it('does not let hidden legacy Pageant category children block the next setup step',async()=>{
  const pageant={id:'pageant-child',event_id:'event',name:'Pageant',competition_type:'pageant',origin:'native'}
  const women={id:'women-child',event_id:'event',name:'Women',competition_type:'pageant',origin:'native'}
  const men={id:'men-child',event_id:'event',name:'Men',competition_type:'pageant',origin:'native'}
  pageantService.getEvent.mockResolvedValue({data:{event:{status:'draft',competitionType:'pageant'}}})
  pageantService.listDivisions.mockResolvedValue({data:{divisions:[{id:'women',name:'Women'},{id:'men',name:'Men'}]}})
  service.foundation.mockImplementation(async(_event,id)=>{
   const child=[pageant,women,men].find(item=>item.id===id)
   return {data:child.id==='pageant-child'?foundation(pageant):{...foundation(child),configuration:null,criteriaReadiness:{allReady:false}}}
  })
  render(<MemoryRouter><NativeSetupWorkspace eventId="event" initialChildren={[women,men,pageant]} stage="workspace"/></MemoryRouter>)

  expect(await screen.findByText('1 of 1 configured')).toBeInTheDocument()
  expect(screen.queryByText('Complete this step for every selected competition before continuing.')).not.toBeInTheDocument()
  expect(screen.getByRole('button',{name:/Next: Contestants/})).toBeEnabled()
 })
 it('guides Pageant setup from one scoring round to the next before returning',async()=>{
  const pageant={id:'pageant-child',event_id:'event',name:'Pageant',competition_type:'pageant',origin:'native'}
  const multiRoundConfig={
   ...structuredClone(config),
   structure:'multiple',
   rounds:[
    {id:'preliminary',name:'Preliminary',displayOrder:0,progression:'back_to_zero',nextRoundId:'final',advancementType:'none'},
    {id:'final',name:'Final',displayOrder:1},
   ],
   criteria:[
    {...structuredClone(config.criteria[0]),id:'preliminary-criterion',roundId:'preliminary'},
    {...structuredClone(config.criteria[0]),id:'final-criterion',roundId:'final'},
   ],
  }
  pageantService.getEvent.mockResolvedValue({data:{event:{status:'draft',competitionType:'pageant'}}})
  service.list.mockResolvedValue({data:{competitions:[pageant]}})
  service.foundation.mockResolvedValue({data:{...foundation(pageant),configuration:multiRoundConfig}})
  render(<MemoryRouter initialEntries={['/?competitionId=pageant-child']}><NativeSetupWorkspace eventId="event" initialChildren={[pageant]} stage="workspace"/></MemoryRouter>)

  expect(await screen.findByLabelText('Select Round')).toHaveValue('preliminary')
  expect(screen.getByRole('button',{name:'Proceed to Final →'})).toBeInTheDocument()
  expect(screen.getByText('Round 1 of 2 · Changes are saved after the final round.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'Proceed to Final →'}))

  expect(screen.getByLabelText('Select Round')).toHaveValue('final')
  expect(screen.getByRole('button',{name:'Save & Return to Competitions'})).toBeInTheDocument()
  expect(screen.queryByRole('button',{name:'Proceed to Final →'})).not.toBeInTheDocument()
 })
 it('keeps the existing return action for multi-round non-Pageant competitions',async()=>{
  const multiRoundConfig={...structuredClone(config),structure:'multiple',rounds:[
   {id:'preliminary',name:'Preliminary',displayOrder:0,progression:'back_to_zero',nextRoundId:'final',advancementType:'none'},
   {id:'final',name:'Final',displayOrder:1},
  ],criteria:[]}
  service.foundation.mockResolvedValue({data:{...foundation(children[0]),configuration:multiRoundConfig}})
  render(<MemoryRouter initialEntries={['/?competitionId=child-0']}><NativeSetupWorkspace eventId="event" initialChildren={[children[0]]} stage="workspace"/></MemoryRouter>)

  expect(await screen.findByRole('button',{name:'Save & Return to Competitions'})).toBeInTheDocument()
  expect(screen.queryByRole('button',{name:/Proceed to/})).not.toBeInTheDocument()
 })
 it('loads Step 6 without judge-only requests or duplicate selected-competition reads',async()=>{
  render(<MemoryRouter><NativeSetupWorkspace eventId="event" initialChildren={children} stage="contestants"/></MemoryRouter>)
  await screen.findByText('Selected Competitions')
  expect(service.enrollments).not.toHaveBeenCalled()
  expect(service.pool).not.toHaveBeenCalled()
  expect(service.foundation).toHaveBeenCalledTimes(children.length)
  expect(service.entries).toHaveBeenCalledTimes(children.length)
 })
 it('reuses the boundary competition list instead of fetching it again on first render',async()=>{
  vi.stubEnv('VITE_COMPETITION_NATIVE_SETUP_ENABLED','true')
  service.list.mockResolvedValue({data:{competitions:children.slice(0,2)}})
  render(<MemoryRouter initialEntries={['/events/event/contestants']}><Routes><Route path="/events/:eventId/contestants" element={<NativeSetupBoundary Legacy={()=>null}/>}/></Routes></MemoryRouter>)
  await screen.findByText('Selected Competitions')
  expect(service.list).toHaveBeenCalledTimes(1)
 })
 it('saves one child and opens a newly added competition without carrying over its rules',async()=>{
  const saved={ 'child-0':structuredClone(config) }
  service.foundation.mockImplementation((_event,id)=>Promise.resolve({data:{...foundation(children.find(c=>c.id===id)),configuration:structuredClone(saved[id]??null),criteriaReadiness:{allReady:!!saved[id]}}}))
  service.configure.mockImplementation((_event,id,body)=>{saved[id]=structuredClone(body.configuration);return Promise.resolve({data:{}})})
  render(<MemoryRouter><NativeSetupWorkspace eventId="event" initialChildren={children} stage="workspace"/></MemoryRouter>)
  await waitFor(()=>expect(screen.getByRole('button',{name:'Edit Configuration Hip-Hop'})).not.toBeDisabled())
  fireEvent.click(screen.getByRole('button',{name:'Edit Configuration Hip-Hop'}));fireEvent.click(await screen.findByRole('button',{name:'Edit criterion Technique'}))
  fireEvent.change(screen.getByLabelText('Major criterion name'),{target:{value:'Hip-Hop Technique'}});fireEvent.click(screen.getByRole('button',{name:'Save Criterion'}))
  fireEvent.click(screen.getByRole('button',{name:'Save & Return to Competitions'}))
  await screen.findByText('Selected Competitions');fireEvent.click(screen.getByRole('button',{name:'Configure Contemporary'}))
  await screen.findByLabelText('Single round name')
  expect(screen.queryByRole('button',{name:'Edit criterion Hip-Hop Technique'})).not.toBeInTheDocument()
  expect(saved['child-0'].criteria[0].name).toBe('Hip-Hop Technique');expect(saved['child-1']).toBeUndefined()
  expect(service.configure).toHaveBeenCalledTimes(1)
 })
 it('retains the current configuration when Save and Return is rejected',async()=>{
  service.configure.mockRejectedValueOnce(new Error('Revision changed. Reload before saving.'))
  render(<MemoryRouter initialEntries={['/?competitionId=child-0']}><NativeSetupWorkspace eventId="event" initialChildren={children} stage="workspace"/></MemoryRouter>)
  const input=await screen.findByLabelText('Single round name');fireEvent.change(input,{target:{value:'My Round'}})
  fireEvent.click(screen.getByRole('button',{name:'Save & Return to Competitions'}))
  expect(await screen.findByRole('alert')).toHaveTextContent('Revision changed')
  expect(screen.getByLabelText('Single round name')).toHaveValue('My Round');expect(screen.queryByText('Selected Competitions')).not.toBeInTheDocument()
 })
 it('guards unfinished criterion dialogs and blocks incomplete configuration saves',async()=>{
  const confirmation=vi.spyOn(window,'confirm').mockReturnValue(false)
  render(<MemoryRouter initialEntries={['/?competitionId=child-0']}><NativeSetupWorkspace eventId="event" initialChildren={children} stage="workspace"/></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button',{name:'Add Criterion',exact:true}))
  fireEvent.change(screen.getByLabelText('Major criterion name'),{target:{value:'Unfinished'}})
  expect(screen.getByRole('button',{name:'Save & Return to Competitions'})).toBeDisabled()
  fireEvent.click(screen.getByRole('button',{name:'Back to Competitions'}));expect(confirmation).toHaveBeenCalled()
  expect(screen.getByLabelText('Major criterion name')).toHaveValue('Unfinished')
  fireEvent.click(screen.getByRole('button',{name:'Cancel',exact:true}))
  fireEvent.click(screen.getByLabelText('Remove criterion Technique'));expect(confirmation).toHaveBeenCalled()
  confirmation.mockReturnValue(true);fireEvent.click(screen.getByLabelText('Remove criterion Technique'))
  fireEvent.click(screen.getByRole('button',{name:'Save & Return to Competitions'}))
  expect(await screen.findByRole('alert')).toHaveTextContent('Complete the following')
  expect(service.configure).not.toHaveBeenCalled();confirmation.mockRestore()
 })
 it('restores the selected competition from old substep URLs while keeping settings collapsed',async()=>{
  render(<MemoryRouter initialEntries={['/?competitionId=child-1&scoringStep=score-sheet']}><NativeSetupWorkspace eventId="event" initialChildren={children} stage="workspace"/></MemoryRouter>)
  await screen.findByRole('button',{name:'Preview Score Sheet'})
  expect(screen.getByLabelText('Setup competition')).toHaveValue('child-1')
  expect(screen.getByText('Score Input').closest('details')).not.toHaveAttribute('open')
  expect(screen.queryByRole('region',{name:'Judge score sheet preview'})).not.toBeInTheDocument()
 })
 it('keeps rejected scoring edits available for correction instead of forcing a discard',async()=>{
  service.configure.mockRejectedValueOnce({response:{data:{message:'Minor criterion weights must total 100%'}}})
  show();await openCriterion();fireEvent.change(screen.getByLabelText('Major criterion name'),{target:{value:'Correctable criterion'}});fireEvent.click(screen.getByRole('button',{name:'Save Criterion'}));fireEvent.click(screen.getByText('Save competition configuration'))
  await screen.findByText('Minor criterion weights must total 100%');expect(await openCriterion()).toHaveValue('Correctable criterion');expect(screen.getByLabelText('Major criterion name')).not.toBeDisabled();fireEvent.click(screen.getByRole('button',{name:'Cancel',exact:true}));expect(screen.getByText('Save competition configuration')).not.toBeDisabled()
 })
 it('blocks the scoring Next action until every selected competition is configured',async()=>{
  service.foundation.mockImplementation((_event,id)=>Promise.resolve({data:{...foundation(children.find(c=>c.id===id)),criteriaReadiness:{allReady:id!=='child-1'}}}))
  render(<MemoryRouter initialEntries={['/?competitionId=child-0']}><NativeSetupWorkspace eventId="event" initialChildren={children} stage="workspace"/></MemoryRouter>)
  await screen.findByLabelText('Single round name');expect(screen.getByRole('button',{name:/Next: Contestants/})).toBeDisabled();expect(screen.getByText('Complete this step for every selected competition before continuing.')).toBeInTheDocument()
 })
 it('choosing the already selected competition while loading does not invalidate its pending foundation',async()=>{
  let resolve;service.foundation.mockImplementationOnce(()=>new Promise(r=>{resolve=r}));show();await waitFor(()=>expect(service.foundation).toHaveBeenCalled())
  fireEvent.change(screen.getByLabelText('Setup competition'),{target:{value:'child-0'}})
  resolve({data:foundation(children[0])});expect(await openCriterion()).toHaveValue('Technique')
 })
 it('removes only the selected draft participation with both observed child revisions',async()=>{const confirmation=vi.spyOn(window,'confirm').mockReturnValue(true);show();fireEvent.click(await screen.findByRole('button',{name:'Remove draft participation #1'}));await waitFor(()=>expect(service.removeEntry).toHaveBeenCalledWith('event','child-0','participation',{expectedSetupRevision:8,expectedInputRevision:9}));confirmation.mockRestore()})
 it('uses the configured participation format when registering a new entry',async()=>{
  const competition={...children[0],participation_format:'group'}
  service.list.mockResolvedValue({data:{competitions:[competition]}})
  service.foundation.mockResolvedValue({data:foundation(competition)})
  pageantService.createContestant.mockResolvedValue({data:{contestant:{id:'new-entry'}}})
  render(<MemoryRouter><NativeSetupWorkspace eventId="event" initialChildren={[competition]} stage="contestants"/></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button',{name:'Manage Entries Hip-Hop'}))
  fireEvent.change(await screen.findByLabelText('Entry name'),{target:{value:'Red Phoenix'}})
  fireEvent.click(screen.getByRole('button',{name:'Save & Add Next'}))
  await waitFor(()=>expect(pageantService.createContestant).toHaveBeenCalledWith('event',expect.objectContaining({name:'Red Phoenix',entryType:'group'})))
  expect(service.addEntry).toHaveBeenCalledWith('event','child-0',{contestantId:'new-entry'})
 })
 it('requires and submits a configured Pageant division when creating a contestant',async()=>{
  const pageant={id:'pageant-child',event_id:'event',name:'Pageant',competition_type:'pageant',origin:'native'}
  pageantService.getEvent.mockResolvedValue({data:{event:{status:'draft',eventType:'competition_scoring',competitionType:'pageant'}}})
  pageantService.listDivisions.mockResolvedValue({data:{divisions:[{id:'women-division',name:'Women'},{id:'men-division',name:'Men'}]}})
  service.list.mockResolvedValue({data:{competitions:[pageant]}})
  service.foundation.mockResolvedValue({data:foundation(pageant)})
  pageantService.createContestant.mockResolvedValue({data:{contestant:{id:'new-contestant'}}})
  render(<MemoryRouter><NativeSetupWorkspace eventId="event" initialChildren={[pageant]} stage="contestants"/></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button',{name:'Manage Entries Pageant'}))

  const division=await screen.findByLabelText('Division / Category')
  expect(division).toBeRequired()
  expect(within(division).getByRole('option',{name:'Women'})).toHaveValue('women-division')
  const nameInput=screen.getByLabelText('Contestant Name')
  const photoInput=screen.getByLabelText('Contestant photo (optional)')
  expect(screen.getByText('Add a photo to help identify this contestant. JPG, PNG, or WebP.')).toBeInTheDocument()
  expect(nameInput.closest('label').parentElement).toBe(photoInput.closest('label').parentElement)
  expect(nameInput.closest('label')).not.toHaveClass('md:col-span-2')
  expect(photoInput.closest('label')).not.toHaveClass('md:col-span-2')
  fireEvent.change(division,{target:{value:'women-division'}})
  await waitFor(()=>expect(screen.getByLabelText('Contestant number')).toHaveValue('1'))
  fireEvent.change(nameInput,{target:{value:'Avery Contestant'}})
  const photoFile=new File(['photo'], 'avery.png', {type:'image/png'})
  fireEvent.change(photoInput,{target:{files:[photoFile]}})
  expect(screen.getByText('Selected: avery.png')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'Save & Add Next'}))

  await waitFor(()=>expect(pageantService.createContestant).toHaveBeenCalledWith('event',expect.objectContaining({
   name:'Avery Contestant',
   divisionId:'women-division',
  })))
  expect(pageantService.uploadContestantPhoto).toHaveBeenCalledWith('event','new-contestant',photoFile)
  expect(service.addEntry).toHaveBeenCalledWith('event','pageant-child',{contestantId:'new-contestant'})
 })
 it('loads the next contestant number separately for each Pageant division',async()=>{
  const pageant={id:'pageant-child',event_id:'event',name:'Pageant',competition_type:'pageant',origin:'native'}
  pageantService.getEvent.mockResolvedValue({data:{event:{status:'draft',eventType:'competition_scoring',competitionType:'pageant'}}})
  pageantService.listDivisions.mockResolvedValue({data:{divisions:[{id:'women-division',name:'Women'},{id:'men-division',name:'Men'}]}})
  pageantService.getNextContestantNumber.mockImplementation(async(_event,divisionId)=>({data:{nextContestantNumber:divisionId==='women-division'?2:1}}))
  service.list.mockResolvedValue({data:{competitions:[pageant]}})
  service.foundation.mockResolvedValue({data:foundation(pageant)})
  render(<MemoryRouter><NativeSetupWorkspace eventId="event" initialChildren={[pageant]} stage="contestants"/></MemoryRouter>)
  const manage=await screen.findByRole('button',{name:'Manage Entries Pageant'})
  await waitFor(()=>expect(manage).toBeEnabled())
  fireEvent.click(manage)

  const division=await screen.findByLabelText('Division / Category')
  const contestantNumber=screen.getByLabelText('Contestant number')
  fireEvent.change(division,{target:{value:'women-division'}})
  await waitFor(()=>expect(contestantNumber).toHaveValue('2'))
  fireEvent.change(division,{target:{value:'men-division'}})
  await waitFor(()=>expect(contestantNumber).toHaveValue('1'))
  expect(pageantService.getNextContestantNumber).toHaveBeenNthCalledWith(1,'event','women-division')
  expect(pageantService.getNextContestantNumber).toHaveBeenNthCalledWith(2,'event','men-division')
 })
 it('ignores an outdated number response after switching Pageant divisions',async()=>{
  const pageant={id:'pageant-child',event_id:'event',name:'Pageant',competition_type:'pageant',origin:'native'}
  const responses={}
  pageantService.getEvent.mockResolvedValue({data:{event:{status:'draft',eventType:'competition_scoring',competitionType:'pageant'}}})
  pageantService.listDivisions.mockResolvedValue({data:{divisions:[{id:'women-division',name:'Women'},{id:'men-division',name:'Men'}]}})
  pageantService.getNextContestantNumber.mockImplementation((_event,divisionId)=>new Promise(resolve=>{responses[divisionId]=resolve}))
  service.list.mockResolvedValue({data:{competitions:[pageant]}})
  service.foundation.mockResolvedValue({data:foundation(pageant)})
  render(<MemoryRouter><NativeSetupWorkspace eventId="event" initialChildren={[pageant]} stage="contestants"/></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button',{name:'Manage Entries Pageant'}))

  const division=await screen.findByLabelText('Division / Category')
  const contestantNumber=screen.getByLabelText('Contestant number')
  fireEvent.change(division,{target:{value:'women-division'}})
  fireEvent.change(division,{target:{value:'men-division'}})
  await waitFor(()=>expect(pageantService.getNextContestantNumber).toHaveBeenCalledTimes(2))
  await act(async()=>responses['men-division']({data:{nextContestantNumber:1}}))
  await waitFor(()=>expect(contestantNumber).toHaveValue('1'))
  await act(async()=>responses['women-division']({data:{nextContestantNumber:2}}))
  expect(contestantNumber).toHaveValue('1')
 })
 it('shows Pageant contestant numbers alongside their divisions, retaining entry numbering for other competitions',async()=>{
  const pageant={id:'pageant-child',event_id:'event',name:'Pageant',competition_type:'pageant',origin:'native'}
  pageantService.getEvent.mockResolvedValue({data:{event:{status:'draft',eventType:'competition_scoring',competitionType:'pageant'}}})
  pageantService.listDivisions.mockResolvedValue({data:{divisions:[{id:'women-division',name:'Women'},{id:'men-division',name:'Men'}]}})
  pageantService.listContestants.mockResolvedValue({data:{contestants:[
   {id:'women-entry',name:'Avery',contestantNumber:1,divisionId:'women-division'},
   {id:'women-entry-3',name:'Chloe',contestantNumber:3,divisionId:'women-division'},
   {id:'men-entry',name:'Jordan',contestantNumber:1,divisionId:'men-division'},
   {id:'men-entry-2',name:'Liam',contestantNumber:2,divisionId:'men-division'},
  ]}})
  service.entries.mockResolvedValue({data:{entries:[
   {id:'women-registration',contestant_id:'women-entry',entry_number:4},
   {id:'men-registration',contestant_id:'men-entry',entry_number:5},
   {id:'women-registration-3',contestant_id:'women-entry-3',entry_number:6},
   {id:'men-registration-2',contestant_id:'men-entry-2',entry_number:7},
  ]}})
  service.list.mockResolvedValue({data:{competitions:[pageant]}})
  service.foundation.mockResolvedValue({data:foundation(pageant)})
  render(<MemoryRouter><NativeSetupWorkspace eventId="event" initialChildren={[pageant]} stage="contestants"/></MemoryRouter>)
  const manage=await screen.findByRole('button',{name:'Manage Entries Pageant'})
  await waitFor(()=>expect(manage).toBeEnabled())
  fireEvent.click(manage)

  const table=await screen.findByRole('table')
  expect(within(table).getByText('Contestant #')).toBeInTheDocument()
  const rows=within(table).getAllByRole('row')
  expect(within(rows[1]).getByText('Women')).toBeInTheDocument()
  expect(within(rows[1]).getByText('Avery')).toBeInTheDocument()
  expect(within(rows[2]).getByText('Men')).toBeInTheDocument()
  expect(within(rows[2]).getByText('Jordan')).toBeInTheDocument()
  expect(within(rows[3]).getByText('2')).toBeInTheDocument()
  expect(within(rows[3]).getByText('Men')).toBeInTheDocument()
  expect(within(rows[3]).getByText('Liam')).toBeInTheDocument()
  expect(within(rows[4]).getByText('3')).toBeInTheDocument()
  expect(within(rows[4]).getByText('Women')).toBeInTheDocument()
  expect(within(rows[4]).getByText('Chloe')).toBeInTheDocument()
 })
 it('keeps association numbering for non-Pageant competitions',async()=>{
  pageantService.listContestants.mockResolvedValue({data:{contestants:[{id:'master',name:'Shared entrant',contestantNumber:99}]}})
  service.entries.mockResolvedValue({data:{entries:[{id:'participation',contestant_id:'master',entry_number:7}]}})
  render(<MemoryRouter><NativeSetupWorkspace eventId="event" initialChildren={[children[0]]} stage="contestants"/></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button',{name:'Manage Entries Hip-Hop'}))

  const table=await screen.findByRole('table')
  expect(within(table).getByText('No.')).toBeInTheDocument()
  expect(within(table).getByText('7')).toBeInTheDocument()
  expect(within(table).queryByText('Contestant #')).not.toBeInTheDocument()
 })
 it('shows a saved contestant photo in the registered entries list',async()=>{
  pageantService.listContestants.mockResolvedValue({data:{contestants:[{
   id:'master',
   name:'Shared entrant',
   photo:'https://images.example.test/contestants/shared-entrant.jpg',
  }]}})
  render(<MemoryRouter><NativeSetupWorkspace eventId="event" initialChildren={[children[0]]} stage="contestants"/></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button',{name:'Manage Entries Hip-Hop'}))

  const photo=await screen.findByRole('img',{name:'Shared entrant photo'})
  expect(photo).toHaveAttribute('src','https://images.example.test/contestants/shared-entrant.jpg')
 })
 it('opens a competition from the Step 6 list and saves back to the list',async()=>{
  render(<MemoryRouter><NativeSetupWorkspace eventId="event" initialChildren={children} stage="contestants"/></MemoryRouter>)
  expect(await screen.findByText('Selected Competitions')).toBeInTheDocument()
  expect(screen.queryByText('Registered Entries')).not.toBeInTheDocument()
  expect(screen.queryByRole('button',{name:'Save & Add Next'})).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'Manage Entries Hip-Hop'}))
  expect(await screen.findByText('Registered Entries')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'Save & Return to Competitions →'}))
  await waitFor(()=>expect(screen.getByText('Selected Competitions')).toBeInTheDocument())
 })
 it('keeps each completed competition configured after sequential saves and refresh',async()=>{
  const savedEntries=new Set()
  service.list.mockResolvedValue({data:{competitions:children.slice(0,2)}})
  service.entries.mockImplementation((_event,id)=>Promise.resolve({data:{entries:savedEntries.has(id)?[{id:`${id}-entry`,contestant_id:'master',entry_number:1}]:[]}}))
  service.addEntry.mockImplementation((_event,id)=>{savedEntries.add(id);return Promise.resolve({data:{}})})
  pageantService.createContestant.mockResolvedValue({data:{contestant:{id:'new-entry'}}})
  const renderStep=()=>render(<MemoryRouter><NativeSetupWorkspace eventId="event" initialChildren={children.slice(0,2)} stage="contestants"/></MemoryRouter>)
  renderStep()
  fireEvent.click(await screen.findByRole('button',{name:'Manage Entries Hip-Hop'}))
  fireEvent.change(await screen.findByLabelText('Entry name'),{target:{value:'Hip-Hop Entry'}})
  fireEvent.click(screen.getByRole('button',{name:'Save & Add Next'}))
  await waitFor(()=>expect(screen.getByRole('button',{name:'Save & Return to Competitions →'})).not.toBeDisabled())
  fireEvent.click(await screen.findByRole('button',{name:'Save & Return to Competitions →'}))
  await waitFor(()=>expect(screen.getAllByText('Configured').length).toBe(1))
  fireEvent.click(screen.getByRole('button',{name:'Manage Entries Contemporary'}))
  fireEvent.change(await screen.findByLabelText('Entry name'),{target:{value:'Contemporary Entry'}})
  fireEvent.click(screen.getByRole('button',{name:'Save & Add Next'}))
  await waitFor(()=>expect(screen.getByRole('button',{name:'Save & Return to Competitions →'})).not.toBeDisabled())
  fireEvent.click(await screen.findByRole('button',{name:'Save & Return to Competitions →'}))
  await waitFor(()=>expect(screen.getAllByText('Configured').length).toBe(2))
  cleanup()
  renderStep()
  await waitFor(()=>expect(screen.getAllByText('Configured').length).toBe(2))
  expect(screen.getByRole('button',{name:/Next: Judges/})).not.toBeDisabled()
 })
 it('reuses an entry per competition without duplicating or deleting the shared record',async()=>{
  const confirmation=vi.spyOn(window,'confirm').mockReturnValue(true)
  const competitionEntries={};const reusable={id:'reusable',name:'Red Phoenix',entry_type:'group'}
  service.list.mockResolvedValue({data:{competitions:children.slice(0,2)}})
  service.entries.mockImplementation((_event,id)=>Promise.resolve({data:{entries:competitionEntries[id]??[]}}))
  service.addEntry.mockImplementation((_event,id,{contestantId})=>{const current=competitionEntries[id]??[];if(!current.some(entry=>entry.contestant_id===contestantId))competitionEntries[id]=[...current,{id:`${id}-registration`,contestant_id:contestantId,entry_number:current.length+1}];return Promise.resolve({data:{}})})
  service.removeEntry.mockImplementation((_event,id)=>{competitionEntries[id]=[];return Promise.resolve({data:{}})})
  service.foundation.mockImplementation((_event,id)=>Promise.resolve({data:foundation(children.find(c=>c.id===id))}))
  pageantService.listContestants.mockResolvedValue({data:{contestants:[reusable]}})
  const renderStep=()=>render(<MemoryRouter><NativeSetupWorkspace eventId="event" initialChildren={children.slice(0,2)} stage="contestants"/></MemoryRouter>)
  renderStep()
  fireEvent.click(await screen.findByRole('button',{name:'Manage Entries Hip-Hop'}))
  fireEvent.click(await screen.findByRole('button',{name:'Select Existing Entries'}))
  fireEvent.click(await screen.findByRole('checkbox'))
  fireEvent.click(screen.getByRole('button',{name:'Add Selected Entries'}))
  await waitFor(()=>expect(service.addEntry).toHaveBeenCalledWith('event','child-0',{contestantId:'reusable'}))
  expect(await screen.findByText('Red Phoenix')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'Select Existing Entries'}))
  expect(await screen.findByText('No reusable entries found.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'Cancel'}))
  fireEvent.click(screen.getByRole('button',{name:'Save & Return to Competitions →'}))
  await waitFor(()=>expect(screen.getByText('Configured')).toBeInTheDocument())
  fireEvent.click(screen.getByRole('button',{name:'Manage Entries Contemporary'}))
  fireEvent.click(await screen.findByRole('button',{name:'Select Existing Entries'}))
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.click(screen.getByRole('button',{name:'Add Selected Entries'}))
  await waitFor(()=>expect(service.addEntry).toHaveBeenCalledWith('event','child-1',{contestantId:'reusable'}))
  expect(competitionEntries['child-0']).toHaveLength(1)
  fireEvent.click(screen.getByRole('button',{name:'Remove draft participation #1'}))
  await waitFor(()=>expect(service.removeEntry).toHaveBeenCalledWith('event','child-1', 'child-1-registration',expect.any(Object)))
  expect(competitionEntries['child-0']).toHaveLength(1)
  confirmation.mockRestore()
 })
 it('reorders draft rounds while retaining identities and clearing outgoing controls on the new last round',async()=>{const confirmation=vi.spyOn(window,'confirm').mockReturnValue(true);service.foundation.mockResolvedValue({data:{...foundation(children[0]),configuration:{...config,structure:'multiple',rounds:[{id:'pre',name:'Preliminary',displayOrder:0,nextRoundId:'final',advancementType:'top_n',advancementValue:1},{id:'final',name:'Final',displayOrder:1}],criteria:[{...config.criteria[0],roundId:'pre'},{...config.criteria[0],id:'last',roundId:'final'}]}}});show();await screen.findByLabelText('Move Final earlier');fireEvent.click(screen.getByLabelText('Move Final earlier'));fireEvent.click(screen.getByText('Save competition configuration'));await waitFor(()=>expect(service.configure).toHaveBeenCalled());expect(service.configure.mock.calls[0][2].configuration.rounds.map(r=>r.id)).toEqual(['final','pre']);expect(service.configure.mock.calls[0][2].configuration.rounds[1].nextRoundId).toBeUndefined();confirmation.mockRestore()})
 it('disabled setup keeps the legacy page without native requests',()=>{vi.stubEnv('VITE_COMPETITION_NATIVE_SETUP_ENABLED','false');render(<MemoryRouter><NativeSetupBoundary Legacy={()=> <p>Legacy setup</p>}/></MemoryRouter>);expect(screen.getByText('Legacy setup')).toBeInTheDocument();expect(service.list).not.toHaveBeenCalled()})
 it('mapped single legacy setup retains the existing page when native dispatch is enabled',async()=>{vi.stubEnv('VITE_COMPETITION_NATIVE_SETUP_ENABLED','true');service.list.mockResolvedValue({data:{competitions:[{id:'legacy',origin:'legacy'}],legacyMapping:{competition_id:'legacy'}}});render(<MemoryRouter initialEntries={['/events/event']}><Routes><Route path="/events/:eventId" element={<NativeSetupBoundary Legacy={()=> <p>Mapped legacy setup</p>}/>}/></Routes></MemoryRouter>);expect(await screen.findByText('Mapped legacy setup')).toBeInTheDocument();expect(service.foundation).not.toHaveBeenCalled()})
 it('enabled native setup fails closed on schema errors and offers retry',async()=>{vi.stubEnv('VITE_COMPETITION_NATIVE_SETUP_ENABLED','true');service.list.mockRejectedValue(new Error('Reviewed schema unavailable'));render(<MemoryRouter><NativeSetupBoundary Legacy={()=> <p>Legacy setup</p>}/></MemoryRouter>);expect(await screen.findByRole('alert')).toHaveTextContent('Reviewed schema unavailable');expect(screen.getByText('Retry setup')).toBeInTheDocument();expect(screen.queryByText('Legacy setup')).not.toBeInTheDocument()})
 it('offers five children and saves only the selected child with its observed revision',async()=>{
  show();await openCriterion();fireEvent.click(screen.getByRole('button',{name:'Cancel',exact:true}));fireEvent.change(screen.getByLabelText('Setup competition'),{target:{value:'child-1'}});await waitFor(()=>expect(service.foundation).toHaveBeenLastCalledWith('event','child-1'))
  await openCriterion();fireEvent.change(screen.getByLabelText('Major criterion name'),{target:{value:'Contemporary technique'}});fireEvent.click(screen.getByRole('button',{name:'Save Criterion'}));fireEvent.click(screen.getByText('Save competition configuration'))
  await waitFor(()=>expect(service.configure).toHaveBeenCalledWith('event','child-1',{configuration:expect.objectContaining({criteria:[expect.objectContaining({name:'Contemporary technique'})]}),expectedSetupRevision:8}))
  expect(service.configure).toHaveBeenCalledTimes(1)
 })
 it('freeze uses both child revisions, requires acknowledgment and never publishes or starts scoring',async()=>{
  show();await screen.findByLabelText('Acknowledge competition rules');expect(screen.getByText('Freeze competition rules')).toBeDisabled();fireEvent.click(screen.getByLabelText('Acknowledge competition rules'));fireEvent.click(screen.getByText('Freeze competition rules'))
  await waitFor(()=>expect(service.freeze).toHaveBeenCalledWith('event','child-0',{acknowledged:true,expectedSetupRevision:8,expectedInputRevision:9}))
 })
 it('frozen rules disable ordinary editing and show stale dependencies explicitly',async()=>{
  service.foundation.mockResolvedValue({data:{...foundation(children[0]),competition:{...children[0],official_child_rules_id:'frozen'},rulesCurrent:false}});show();await screen.findByText(/Frozen rules are stale/);expect(screen.getByLabelText('Single round name')).toBeDisabled();expect(screen.queryByLabelText('Assigned judge')).not.toBeInTheDocument()
 })
 it('switching children rejects a delayed foundation and clears prior configuration',async()=>{
  let resolve;service.foundation.mockImplementation((_e,id)=>id==='child-0'?new Promise(r=>{resolve=r}):Promise.resolve({data:foundation(children[1])}));show();await waitFor(()=>expect(service.foundation).toHaveBeenCalled());fireEvent.change(screen.getByLabelText('Setup competition'),{target:{value:'child-1'}});await openCriterion();resolve({data:{...foundation(children[0]),configuration:{...config,criteria:[{...config.criteria[0],name:'Late Hip-Hop'}]}}});await new Promise(r=>setTimeout(r,0));expect(screen.getByLabelText('Major criterion name')).toHaveValue('Technique')
 })
 it('assigns explicit enrollment and NULL single-phase grant without event-wide fallback',async()=>{
  service.enrollments.mockResolvedValue({data:{judges:[
   {id:'enrollment',displayName:'Judge One',role:'judge',isActive:true,accountStatus:'active'},
   {id:'enrollment-2',displayName:'Judge Two',role:'judge',isActive:true,accountStatus:'active'},
  ]}})
  service.foundation.mockImplementation((_event,id)=>Promise.resolve({data:{...foundation(children.find(c=>c.id===id)),assignments:[]}}))
  render(<MemoryRouter><NativeSetupWorkspace eventId="event" initialChildren={children} stage="judges"/></MemoryRouter>)
  expect(await screen.findByRole('heading',{name:'Competition Coverage'})).toBeInTheDocument()
  const coverageRow=await screen.findByRole('row',{name:/Hip-Hop.*Needs judge/})
  expect(within(coverageRow).getByText('0')).toBeInTheDocument()
  fireEvent.click(within(coverageRow).getByRole('button',{name:'Assign Judge'}))
  fireEvent.change(await screen.findByLabelText('Coverage judge'),{target:{value:'enrollment'}})
  fireEvent.click(screen.getByRole('button',{name:'Assign Competition'}))
  await waitFor(()=>expect(service.assign).toHaveBeenCalledWith('event','child-0',{participantId:'enrollment',roundId:null}))
  expect(service.enroll).not.toHaveBeenCalled()
 })
 it('offers one Pageant competition for judge assignment, not its legacy division children',async()=>{
  const pageant={id:'pageant-child',event_id:'event',name:'Pageant',competition_type:'pageant',origin:'native'}
  const women={id:'women-child',event_id:'event',name:'Women',competition_type:'pageant',origin:'native'}
  const men={id:'men-child',event_id:'event',name:'Men',competition_type:'pageant',origin:'native'}
  pageantService.getEvent.mockResolvedValue({data:{event:{status:'draft',competitionType:'pageant'}}})
  service.list.mockResolvedValue({data:{competitions:[women,men,pageant]}})
  service.foundation.mockImplementation(async(_event,id)=>{
   const competition=[women,men,pageant].find(item=>item.id===id)
   const saved=foundation(competition)
   return {data:{...saved,assignments:competition.id==='pageant-child'?[]:[{id:`grant-${id}`,participant_id:'enrollment',round_id:null}]}}
  })
  render(<MemoryRouter><NativeSetupWorkspace eventId="event" initialChildren={[women,men,pageant]} stage="judges"/></MemoryRouter>)

  const coverage=await screen.findByRole('region',{name:'Competition Coverage'})
  const rows=within(coverage).getAllByRole('row')
  expect(rows).toHaveLength(2)
  expect(within(rows[1]).getByText('Pageant')).toBeInTheDocument()
  expect(within(rows[1]).queryByText('Women')).not.toBeInTheDocument()
  expect(within(rows[1]).queryByText('Men')).not.toBeInTheDocument()
  fireEvent.click(within(rows[1]).getByRole('button',{name:'Assign Judge'}))

  expect(await screen.findByRole('heading',{name:'Assign Judge'})).toBeInTheDocument()
  expect(screen.getByRole('button',{name:/Pageant/})).toBeInTheDocument()
  expect(screen.queryByRole('button',{name:/Women/})).not.toBeInTheDocument()
  expect(screen.queryByRole('button',{name:/Men/})).not.toBeInTheDocument()
 })
 it('keeps judges who are only in the available pool out of assignment choices',async()=>{
  service.pool.mockResolvedValue({data:{judges:[{id:'pool-user',firstName:'Pool-only',lastName:'Judge',email:'pool@example.com',enrolled:false}]}})
  render(<MemoryRouter><NativeSetupWorkspace eventId="event" initialChildren={children} stage="judges"/></MemoryRouter>)
  expect((await screen.findAllByRole('row',{name:/Judge One/})).length).toBeGreaterThan(0)
  expect(screen.queryByRole('row',{name:/Pool-only Judge/})).not.toBeInTheDocument()
 })
 it('lists live assignments below competition coverage and filters them by competition',async()=>{
  render(<MemoryRouter><NativeSetupWorkspace eventId="event" initialChildren={children} stage="judges"/></MemoryRouter>)
  const assignments=await screen.findByRole('region',{name:'Current Assignments'})
  expect(within(assignments).queryByText('Assigned Date')).not.toBeInTheDocument()
  expect(within(assignments).getByRole('row',{name:/Judge One.*Hip-Hop/})).toBeInTheDocument()
  fireEvent.change(within(assignments).getByLabelText('Filter assignments by competition'),{target:{value:'child-1'}})
  expect(within(assignments).queryByRole('row',{name:/Judge One.*Hip-Hop/})).not.toBeInTheDocument()
  expect(within(assignments).getByRole('row',{name:/Judge One.*Contemporary/})).toBeInTheDocument()
 })
 it('opens the assigned-judge summary from Competition Coverage and allows managing each assignment',async()=>{
  render(<MemoryRouter><NativeSetupWorkspace eventId="event" initialChildren={children} stage="judges"/></MemoryRouter>)
  const coverage=await screen.findByRole('region',{name:'Competition Coverage'})
  const hipHop=within(coverage).getByRole('row',{name:/Hip-Hop.*Covered/})
  fireEvent.click(within(hipHop).getByRole('button',{name:'Manage'}))
  const summary=await screen.findByRole('dialog',{name:'Assigned Judges'})
  expect(summary).toHaveTextContent('Hip-Hop')
  expect(summary).toHaveTextContent('Judge One')
  expect(within(summary).getByRole('button',{name:/Edit/})).toBeInTheDocument()
  expect(within(summary).getByRole('button',{name:/Remove/})).toBeInTheDocument()
  fireEvent.click(within(summary).getByRole('button',{name:'+ Add Judge'}))
  expect(screen.queryByRole('dialog',{name:'Assigned Judges'})).not.toBeInTheDocument()
  expect(screen.getByLabelText('Coverage judge')).toBeInTheDocument()
 })
 it('shows all organizer-assigned judges, supports multi-select, and prevents re-enrolling enrolled judges',async()=>{
  service.pool.mockResolvedValue({data:{judges:[
   {id:'judge-1',firstName:'Judge',lastName:'One',enrolled:true},
   {id:'judge-2',firstName:'Judge',lastName:'Two',enrolled:true},
   {id:'judge-3',firstName:'Judge',lastName:'Three',enrolled:false},
   {id:'judge-4',firstName:'Judge',lastName:'Four',enrolled:false},
  ]}})
  show()
  const search=await screen.findByLabelText('Search judges to enroll')
  fireEvent.focus(search)
  expect(screen.getByLabelText('Select Judge One')).toBeDisabled()
  expect(screen.getByLabelText('Select Judge Two')).toBeDisabled()
  expect(screen.getByLabelText('Select all (2 available results)')).toBeInTheDocument()
  fireEvent.click(screen.getByLabelText('Select Judge Three'))
  fireEvent.click(screen.getByLabelText('Select Judge Four'))
  expect(screen.getByText('2 selected')).toBeInTheDocument()
  const enrollButton=screen.getByRole('button',{name:'+ Enroll 2 Judges'})
  expect(enrollButton).toBeEnabled()
  fireEvent.click(enrollButton)
  await waitFor(()=>expect(service.enroll).toHaveBeenCalledWith('event',['judge-3','judge-4']))
 })
})
