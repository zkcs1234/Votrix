import {beforeEach,expect,test,vi} from 'vitest'
const f=vi.hoisted(()=>({rpc:vi.fn(),insert:vi.fn(),schedule:vi.fn(),clearDraft:vi.fn()}))
vi.mock('../../src/foundation/db.js',()=>({db:()=>({rpc:f.rpc,from:()=>({insert:f.insert})})}))
vi.mock('../../src/services/organization.service.js',async original=>({...await original(),getOrCreateCompetitionScoringOrganization:async()=>({id:'organization'})}))
vi.mock('../../src/services/event-schedule-sync.service.js',()=>({syncEventSchedules:f.schedule}))
vi.mock('../../src/services/draft.service.js',()=>({deleteDraft:f.clearDraft}))
vi.mock('../../src/foundation/activity.js',()=>({recordEventActivity:vi.fn()}))
import {createCompetitionEvent} from '../../src/services/pageant.service.js'
const payload={title:'Competition',startDate:'2026-10-13T08:00:00Z',endDate:'2026-10-13T10:00:00Z',idempotencyKey:'d85e560b-c705-4182-9c5d-667895bd9e27'}
beforeEach(()=>{vi.clearAllMocks();f.rpc.mockResolvedValue({data:{id:'event',status:'draft'},error:null});f.schedule.mockResolvedValue();f.clearDraft.mockResolvedValue()})
test('wizard creation passes stable request identity to the atomic owner-scoped RPC',async()=>{
 const result=await createCompetitionEvent('owner',payload)
 expect(result.id).toBe('event')
 expect(f.rpc).toHaveBeenCalledWith('competition_create_event',expect.objectContaining({p_actor:'owner',p_organization:'organization',p_request:payload.idempotencyKey,p_payload:expect.objectContaining({title:'Competition',event_type:'competition_scoring'})}))
 expect(f.insert).not.toHaveBeenCalled()
})
test.each([['PGRST202','missing function',503],['P0001','CREATE_REQUEST_CONFLICT',409],['P0001','ORGANIZER_FORBIDDEN',403],['P0001','INVALID_CREATE_DETAILS',400]])('creation failure %s/%s preserves the draft with the proper HTTP error',async(code,message,statusCode)=>{
 f.rpc.mockResolvedValueOnce({error:{code,message}})
 await expect(createCompetitionEvent('owner',payload)).rejects.toMatchObject({statusCode})
 expect(f.clearDraft).not.toHaveBeenCalled();expect(f.schedule).not.toHaveBeenCalled()
})
