import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest'
const f=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn(),select:vi.fn(),eq:vi.fn(),limit:vi.fn(),maybeSingle:vi.fn()}))
vi.mock('../../src/foundation/db.js',()=>({db:()=>({rpc:f.rpc,from:f.from})}))
vi.mock('../../src/websocket/ws-emitter.js',()=>({emitToUser:vi.fn()}))
import {scoringChoicesResponse} from '../../src/services/competition-native-scoring.service.js'
const event='12345678-1234-4234-8234-123456789012',actor='22345678-1234-4234-8234-123456789012'
beforeEach(()=>{vi.clearAllMocks();for(const k of ['COMPETITION_CHILD_CONTEXTS_ENABLED','COMPETITION_NATIVE_SETUP_ENABLED','COMPETITION_NATIVE_SCORING_ENABLED'])vi.stubEnv(k,'true');f.rpc.mockResolvedValue({data:[]});const query={select:f.select,eq:f.eq,limit:f.limit,maybeSingle:f.maybeSingle};f.from.mockReturnValue(query);f.select.mockReturnValue(query);f.eq.mockReturnValue(query);f.limit.mockResolvedValue({data:[{id:'private-unassigned-child'}]});f.maybeSingle.mockResolvedValue({data:{title:'Campus arts'},error:null})})
afterEach(()=>vi.unstubAllEnvs())
describe('Empty native context discovery',()=>{
 it('returns authorized navigation state and event metadata without disclosing unassigned children',async()=>{const data=await scoringChoicesResponse(event,actor);expect(data).toEqual({contexts:[],nativeEvent:true,eventName:'Campus arts',event:{title:'Campus arts'}});expect(JSON.stringify(data)).not.toContain('private-unassigned-child');expect(f.eq).toHaveBeenCalledWith('event_id',event);expect(f.eq).toHaveBeenCalledWith('origin','native');expect(f.rpc.mock.calls[0][0]).toBe('competition_child_judge_navigation');expect(f.rpc.mock.calls[0][1]).toMatchObject({p_event:event,p_actor:actor,p_reviewers:false})})
 it('distinguishes a legacy-only event and preserves explicit owner discovery',async()=>{f.limit.mockResolvedValue({data:[]});expect(await scoringChoicesResponse(event,actor,true)).toEqual({contexts:[],nativeEvent:false,eventName:'Campus arts',event:{title:'Campus arts'}});expect(f.rpc.mock.calls[0][1].p_owner).toBe(true)})
 it('does not use a legacy fallback when native identity discovery fails',async()=>{f.limit.mockResolvedValue({error:{code:'42P01'}});await expect(scoringChoicesResponse(event,actor)).rejects.toMatchObject({statusCode:503})})
})
