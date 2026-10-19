import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import CompetitionCreationReview from './CompetitionCreationReview'
import { nativeCompetitionService as service } from '@/services/competition-native.service'
vi.mock('@/services/competition-native.service',()=>({nativeCompetitionService:Object.fromEntries(['parentReview','list','enrollments','foundation','entries','complete'].map(k=>[k,vi.fn()]))}))
const parentReviewToken='a'.repeat(32)
const children=[{id:'dance',event_id:'event',name:'Dance',setup_revision:4,input_revision:5},{id:'music',event_id:'event',name:'Music',setup_revision:7,input_revision:8}]
const foundation=c=>({competition:{...c,origin:'native'},configuration:{structure:'single',rounds:[],criteria:[{id:'criterion',roundId:null,percentage:100}],scoringConfig:{calculationMethod:'weighted_average'}},criteriaReadiness:{allReady:true},assignments:[{participant_id:'judge',round_id:null}]})
beforeEach(()=>{
 vi.resetAllMocks();service.parentReview.mockResolvedValue({data:{parentReviewToken,event:{title:'Campus arts',competitionType:'other',startDate:'2030-01-01',endDate:'2030-01-02'}}})
 service.list.mockResolvedValue({data:{competitions:children.map(c=>({...c,origin:'native'}))}});service.enrollments.mockResolvedValue({data:{judges:[{id:'judge',role:'judge',isActive:true,accountStatus:'active'}]}})
 service.foundation.mockImplementation((_e,id)=>Promise.resolve({data:foundation(children.find(c=>c.id===id))}));service.entries.mockResolvedValue({data:{entries:[{id:'entry'}]}});service.complete.mockResolvedValue({data:{created:true}})
})
const show=()=>render(<MemoryRouter initialEntries={['/review']}><Routes><Route path="/review" element={<CompetitionCreationReview eventId="event"/>}/><Route path="/organizer/competition/events/event/live" element={<p>Live Control handoff</p>}/></Routes></MemoryRouter>)
describe('event-wide competition review',()=>{
 it('blocks the event when any independent competition lacks scoring',async()=>{
  service.foundation.mockImplementation((_e,id)=>Promise.resolve({data:{...foundation(children.find(c=>c.id===id)),criteriaReadiness:{allReady:id==='dance'}}}))
  show();await screen.findByText('Complete scoring criteria and calculation settings.');expect(screen.getByRole('button',{name:'Review & Publish Event'})).toBeDisabled();expect(service.complete).not.toHaveBeenCalled()
 })
 it('requires acknowledgment and sends every observed child revision before publication',async()=>{
  show();await screen.findByText('Dance');expect(screen.getByRole('button',{name:'Review & Publish Event'})).toBeDisabled();fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Review & Publish Event'}))
  await screen.findByText('Live Control handoff');expect(service.complete).toHaveBeenCalledExactlyOnceWith('event',{acknowledged:true,parentReviewToken,competitions:[{id:'dance',setupRevision:4,inputRevision:5},{id:'music',setupRevision:7,inputRevision:8}]})
 })
 it('reloads all branches and clears acknowledgment after a revision conflict',async()=>{
  service.complete.mockRejectedValue({response:{data:{message:'Competition setup changed'}}});show();await screen.findByText('Dance');fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Review & Publish Event'}))
  await screen.findByText('Competition setup changed');await waitFor(()=>expect(screen.getByRole('checkbox')).not.toBeChecked());expect(screen.getByRole('button',{name:'Review & Publish Event'})).toBeDisabled()
 })
 it('prevents completion without an authoritative parent review token',async()=>{
  service.parentReview.mockResolvedValue({data:{event:{title:'Campus arts'}}})
  show();await screen.findByText('Reload the event review before publishing');expect(screen.getByRole('button',{name:'Review & Publish Event'})).toBeDisabled();expect(service.complete).not.toHaveBeenCalled()
 })
 it('reviews one Pageant competition instead of legacy division competition records',async()=>{
  const pageant={id:'pageant',event_id:'event',name:'Pageant',competition_type:'pageant',setup_revision:5,input_revision:7,origin:'native'}
  const women={id:'women',event_id:'event',name:'Women',competition_type:'pageant',setup_revision:0,input_revision:0,origin:'native'}
  const men={id:'men',event_id:'event',name:'Men',competition_type:'pageant',setup_revision:0,input_revision:0,origin:'native'}
  service.parentReview.mockResolvedValue({data:{parentReviewToken,event:{title:'Campus pageant',competitionType:'pageant',startDate:'2030-01-01',endDate:'2030-01-02'}}})
  service.list.mockResolvedValue({data:{competitions:[women,pageant,men]}})
  service.foundation.mockImplementation(async(_event,id)=>{
   const child=[women,pageant,men].find(item=>item.id===id)
   return {data:foundation(child)}
  })
  show()

  expect(await screen.findByText('Pageant')).toBeInTheDocument()
  expect(screen.queryByText('Women — Needs attention')).not.toBeInTheDocument()
  expect(screen.queryByText('Men — Needs attention')).not.toBeInTheDocument()
  expect(service.foundation).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.click(screen.getByRole('button',{name:'Review & Publish Event'}))

  await screen.findByText('Live Control handoff')
  expect(service.complete).toHaveBeenCalledWith('event',{
   acknowledged:true,
   parentReviewToken,
   competitions:[{id:'pageant',setupRevision:5,inputRevision:7}],
  })
 })
})
