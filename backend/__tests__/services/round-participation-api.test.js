import {beforeEach,expect,test,vi} from 'vitest'
const mocks=vi.hoisted(()=>({rpc:vi.fn(),owner:vi.fn()}))
vi.mock('../../src/foundation/db.js',()=>({db:()=>({rpc:mocks.rpc})}))
vi.mock('../../src/services/event.service.js',()=>({assertOrganizerOwnsEvent:mocks.owner,getEventById:vi.fn()}))
vi.mock('../../src/foundation/activity.js',()=>({recordEventActivity:vi.fn()}))
import {addContestantToRound,removeContestantFromRound} from '../../src/services/competition.service.js'
beforeEach(()=>{vi.clearAllMocks();mocks.owner.mockResolvedValue({id:'e',event_type:'competition_scoring',status:'draft'});mocks.rpc.mockResolvedValue({data:{success:true},error:null})})
test('ordinary membership writes always use the atomic event-scoped authorization RPC',async()=>{
 await addContestantToRound('e','owner','pre','entry');await removeContestantFromRound('e','owner','pre','entry')
 expect(mocks.rpc.mock.calls).toEqual([['competition_set_round_membership',{p_event:'e',p_actor:'owner',p_round:'pre',p_entry:'entry',p_add:true}],['competition_set_round_membership',{p_event:'e',p_actor:'owner',p_round:'pre',p_entry:'entry',p_add:false}]])
})
test('protected direct Final writes fail and an unapplied migration cannot fall back to unchecked inserts',async()=>{
 mocks.rpc.mockResolvedValue({error:{message:'PROTECTED_ROUND_ASSIGNMENT: Use approved advancement'}})
 await expect(addContestantToRound('e','owner','final','entry')).rejects.toMatchObject({statusCode:409})
 mocks.rpc.mockResolvedValue({error:{code:'PGRST202',message:'missing RPC'}})
 await expect(addContestantToRound('e','owner','pre','entry')).rejects.toMatchObject({statusCode:503})
})
test('ownership and published setup locks are checked before a membership mutation',async()=>{
 mocks.owner.mockRejectedValueOnce(new Error('forbidden'));await expect(addContestantToRound('e','other','pre','entry')).rejects.toThrow('forbidden')
 mocks.owner.mockResolvedValue({id:'e',event_type:'competition_scoring',status:'active'});await expect(removeContestantFromRound('e','owner','pre','entry')).rejects.toMatchObject({statusCode:409})
 expect(mocks.rpc).not.toHaveBeenCalled()
})
