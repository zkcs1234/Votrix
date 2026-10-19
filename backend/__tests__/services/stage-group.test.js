import {test,expect,vi} from 'vitest'
const rpc=vi.hoisted(()=>vi.fn())
vi.mock('../../src/foundation/db.js',()=>({db:()=>({rpc})}))
vi.mock('../../src/websocket/ws-emitter.js',()=>({emitToEvent:vi.fn(),emitToEventOrganizer:vi.fn(),emitToEventVoters:vi.fn(),emitToUser:vi.fn()}))
import {submitJudgeSessionScore} from '../../src/services/competition-session.service.js'
const context={judgeId:'j',sessionId:'s',roundId:'r',rulesVersion:'v'}
test('grouped stage Lock retains the named entry independent of primary row',async()=>{rpc.mockResolvedValue({data:{locked:true}});await submitJudgeSessionScore('e','j',{context,contestantId:'second-entry',criteriaId:'c',scores:{m:80}});expect(rpc.mock.calls.at(-1)[1].p_payload.contestantId).toBe('second-entry')})
test('server refusal of ineligible entry is returned to caller',async()=>{rpc.mockResolvedValue({error:{message:'ROUND_SCOPE_FORBIDDEN'}});await expect(submitJudgeSessionScore('e','j',{context,contestantId:'outside',criteriaId:'c',scores:{m:80}})).rejects.toMatchObject({statusCode:403})})
