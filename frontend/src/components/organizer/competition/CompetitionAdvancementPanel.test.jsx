import {beforeEach,expect,test,vi} from 'vitest'
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import CompetitionAdvancementPanel from './CompetitionAdvancementPanel'
import {competitionSessionService} from '@/services/competition-session.service'
vi.mock('@/services/competition-session.service',()=>({competitionSessionService:{previewRoundAdvancement:vi.fn()}}))
let state,calculation,preview,onConfirm
beforeEach(()=>{
  vi.clearAllMocks();onConfirm=vi.fn().mockResolvedValue({})
  state={rules:{id:'rules',scoringConfig:{calculationMethod:'weighted_average'},rounds:[
    {id:'pre',name:'Preliminary',displayOrder:0,advancementType:'top_n',advancementValue:1},
    {id:'final',name:'Final',displayOrder:2,purpose:'final',advancementType:'none'},
  ]},session:{id:'session'},sourceDigest:'source-v1',sourceVersions:[{id:'submission',version:1}]}
  calculation={id:'calc',event_id:'event',round_id:'pre',rules_version:'rules',session_id:'session',status:'under_verification',verified_at:'2026-10-12T01:00:00Z',source_digest:'source-v1',source_versions:state.sourceVersions}
  preview={roundId:'pre',roundName:'Preliminary',ready:true,standing:[{contestantId:'a',contestantName:'Alice',rank:1},{contestantId:'b',contestantName:'Bea',rank:1},{contestantId:'c',contestantName:'Carl',rank:3}],qualifiers:['a','b']}
  competitionSessionService.previewRoundAdvancement.mockImplementation(async()=>({data:structuredClone(preview)}))
})
function element(){return <MemoryRouter><CompetitionAdvancementPanel eventId="event" state={state} calculation={calculation} onConfirm={onConfirm}/></MemoryRouter>}
async function inspect(){fireEvent.click(screen.getByRole('button',{name:'Preview qualifiers'}));await screen.findByRole('checkbox',{name:'Select Alice'})}
test('None proceeds past special awards to the next main round without qualification controls',()=>{
  state.rules.rounds[0].advancementType='none'
  state.rules.rounds.splice(1,0,{id:'award',name:'Audience Award',displayOrder:1,purpose:'special',advancementType:'top_n'})
  render(element())
  expect(screen.getByText('All eligible contestants continue')).toBeInTheDocument()
  expect(screen.getByRole('link',{name:'Activate Final in Live Control'})).toHaveAttribute('href','/organizer/competition/events/event/live')
  expect(screen.queryByRole('button',{name:'Preview qualifiers'})).not.toBeInTheDocument()
  expect(screen.queryByRole('button',{name:'Confirm advancement'})).not.toBeInTheDocument()
  expect(screen.queryByText(/Audience Award/)).not.toBeInTheDocument()
  expect(competitionSessionService.previewRoundAdvancement).not.toHaveBeenCalled()
})
test('Top N keeps shared cutoff ties checked and read-only, with no Final confirmation card',async()=>{
  render(element());expect(screen.getAllByRole('button',{name:'Confirm advancement'})).toHaveLength(1)
  expect(screen.getByRole('button',{name:'Confirm advancement'})).toBeDisabled()
  await inspect()
  expect(screen.getByRole('checkbox',{name:'Select Alice'})).toBeChecked()
  expect(screen.getByRole('checkbox',{name:'Select Bea'})).toBeChecked()
  expect(screen.getByRole('checkbox',{name:'Select Bea'})).toBeDisabled()
  expect(screen.getByRole('button',{name:'Confirm advancement'})).toBeEnabled()
  fireEvent.click(screen.getByRole('button',{name:'Confirm advancement'}))
  await waitFor(()=>expect(onConfirm).toHaveBeenCalledWith({roundId:'pre',calculationId:'calc',reason:''}))
  expect(await screen.findByText(/Advancement confirmed/)).toBeInTheDocument()
  expect(screen.getByRole('button',{name:'Confirm advancement'})).toBeDisabled()
  expect(competitionSessionService.previewRoundAdvancement).toHaveBeenCalledWith('event','pre')
})
test.each([
  ['other round',{round_id:'final'}],['other rules',{rules_version:'old-rules'}],['unverified',{verified_at:null}],
  ['calculated only',{status:'ready_for_verification'}],['old sources',{source_digest:'old-source'}],
  ['old session',{session_id:'old-session'}],['other event',{event_id:'other-event'}],
  ['old submission version',{source_versions:[{id:'submission',version:0}]}],
])('a preview cannot confirm against a calculation from %s',async(_name,changes)=>{
  calculation={...calculation,...changes};render(element());await inspect()
  expect(screen.getByRole('button',{name:'Confirm advancement'})).toBeDisabled()
  expect(onConfirm).not.toHaveBeenCalled()
})
test('incomplete sources disable confirmation even when a verified calculation is present',async()=>{
  preview.ready=false;render(element());await inspect()
  expect(screen.getByRole('status')).toHaveTextContent('Provisional / incomplete')
  expect(screen.getByRole('button',{name:'Confirm advancement'})).toBeDisabled()
})
test('manual qualifiers require a recorded reason and only eligible ranked rows can change',async()=>{
  state.rules.rounds[0].advancementType='manual';preview.qualifiers=[]
  preview.standing.push({contestantId:'incomplete',contestantName:'Incomplete',rank:null})
  render(element());await inspect()
  expect(screen.getByRole('checkbox',{name:'Select Incomplete'})).toBeDisabled()
  fireEvent.click(screen.getByRole('checkbox',{name:'Select Alice'}))
  expect(screen.getByRole('button',{name:'Confirm advancement'})).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Manual qualification reason'),{target:{value:'Approved manual rule selection'}})
  fireEvent.click(screen.getByRole('button',{name:'Confirm advancement'}))
  await waitFor(()=>expect(onConfirm).toHaveBeenCalledWith({roundId:'pre',calculationId:'calc',reason:'Approved manual rule selection',overrides:{add:['a'],remove:[]}}))
})
test('a changed source context invalidates a formerly ready preview',async()=>{
  const view=render(element());await inspect()
  state={...state,sourceDigest:'source-v2'};view.rerender(element())
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  expect(screen.getByRole('button',{name:'Confirm advancement'})).toBeDisabled()
})
test('an outstanding preview from an old rules context is ignored',async()=>{
  let resolvePreview
  competitionSessionService.previewRoundAdvancement.mockImplementation(()=>new Promise(resolve=>{resolvePreview=resolve}))
  const view=render(element());fireEvent.click(screen.getByRole('button',{name:'Preview qualifiers'}))
  state={...state,sourceDigest:'new-source'};view.rerender(element())
  await act(async()=>resolvePreview({data:preview}))
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  expect(screen.getByRole('button',{name:'Confirm advancement'})).toBeDisabled()
})
test('manual official scoring describes verified recorded placements',async()=>{
  state.rules.scoringConfig.calculationMethod='manual'
  render(element());expect(screen.getByText(/Verified recorded placements determine qualifiers/)).toBeInTheDocument()
  await inspect();expect(screen.getByRole('button',{name:'Confirm advancement'})).toBeEnabled()
})
test('a failed confirmation does not claim that advancement was approved',async()=>{
  onConfirm.mockResolvedValue(false);render(element());await inspect()
  fireEvent.click(screen.getByRole('button',{name:'Confirm advancement'}))
  await waitFor(()=>expect(onConfirm).toHaveBeenCalledTimes(1))
  expect(screen.queryByText(/Advancement confirmed/)).not.toBeInTheDocument()
  expect(screen.getByRole('alert')).toHaveTextContent('Check the saved advancement record before retrying')
  await waitFor(()=>expect(screen.getByRole('button',{name:'Confirm advancement'})).toBeEnabled())
})
