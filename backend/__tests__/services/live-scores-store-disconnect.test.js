import {describe,test,expect,vi,beforeEach} from 'vitest'
const mocks=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn()}))
vi.mock('../../src/foundation/db.js',()=>({db:()=>mocks}))
vi.mock('../../src/websocket/ws-emitter.js',()=>({emitToEvent:vi.fn(),emitToEventOrganizer:vi.fn(),emitToEventVoters:vi.fn(),emitToUser:vi.fn()}))
import {submitJudgeSessionScore} from '../../src/services/competition-session.service.js'
const payload={context:{judgeId:'judge',sessionId:'session',roundId:'round',rulesVersion:'rules'},contestantId:'entry',criteriaId:'criterion',scores:{minor:85}}
beforeEach(()=>{vi.clearAllMocks()})
describe('atomic source/projection criterion Lock',()=>{
 test('uses the transactional scoring RPC with authenticated identity and complete context',async()=>{mocks.rpc.mockResolvedValue({data:{locked:true,lockedCriteria:['criterion']},error:null});await expect(submitJudgeSessionScore('event','judge',payload)).resolves.toMatchObject({locked:true});expect(mocks.rpc).toHaveBeenCalledWith('competition_scoring_write',expect.objectContaining({p_event:'event',p_judge:'judge',p_action:'lock',p_context:payload.context}));expect(mocks.from).not.toHaveBeenCalled()})
 test('a failed transaction returns a conflict and cannot continue with separate projection writes',async()=>{mocks.rpc.mockResolvedValue({data:null,error:{message:'STALE_CONTEXT'}});await expect(submitJudgeSessionScore('event','judge',payload)).rejects.toMatchObject({statusCode:409});expect(mocks.from).not.toHaveBeenCalled()})
 test('legacy payload is rejected instead of guessing its current round',async()=>{await expect(submitJudgeSessionScore('event','judge',{scores:{minor:85}})).rejects.toMatchObject({statusCode:409});expect(mocks.rpc).not.toHaveBeenCalled()})
 test('missing migration produces an actionable prerequisite without fallback writes',async()=>{mocks.rpc.mockResolvedValue({error:{code:'PGRST202',message:'missing RPC'}});await expect(submitJudgeSessionScore('event','judge',payload)).rejects.toMatchObject({statusCode:503});expect(mocks.from).not.toHaveBeenCalled()})
})

test('an old Judge context cannot replay a score under a different authenticated account',async()=>{
 await expect(submitJudgeSessionScore('event','other-judge',payload)).rejects.toMatchObject({statusCode:409});expect(mocks.rpc).not.toHaveBeenCalled()
})
