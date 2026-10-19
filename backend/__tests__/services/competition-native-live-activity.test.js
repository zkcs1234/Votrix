import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest'
const f=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn()}))
vi.mock('../../src/foundation/db.js',()=>({db:()=>({rpc:f.rpc,from:f.from})}))
vi.mock('../../src/websocket/ws-emitter.js',()=>({emitToUser:vi.fn()}))
import {liveActivity} from '../../src/services/competition-native-scoring.service.js'

const event='12345678-1234-4234-8234-123456789012',actor='22345678-1234-4234-8234-123456789012'
beforeEach(()=>{
 vi.clearAllMocks()
 for(const key of ['COMPETITION_CHILD_CONTEXTS_ENABLED','COMPETITION_NATIVE_SETUP_ENABLED','COMPETITION_NATIVE_SCORING_ENABLED'])vi.stubEnv(key,'true')
 f.rpc.mockImplementation(async(name)=>name==='competition_child_scoring_choices'
  ?{data:[{competitionId:'category-a',competitionName:'Hip-Hop',roundId:null,roundName:'Final'}],error:null}
  :{data:[{competitionId:'category-a',roundId:null,action:'submit',actorId:actor,createdAt:'2026-10-17T10:00:00Z'}],error:null})
})
afterEach(()=>vi.unstubAllEnvs())

describe('native organizer live activity',()=>{
 it('authorizes the owner and returns scoped activity metadata without score payloads',async()=>{
  await expect(liveActivity(event,actor)).resolves.toEqual([{action:'submit',actorId:actor,createdAt:'2026-10-17T10:00:00Z',competitionName:'Hip-Hop',roundName:'Final'}])
  expect(f.rpc).toHaveBeenCalledWith('competition_child_scoring_choices',{p_event:event,p_actor:actor,p_owner:true})
  expect(f.rpc).toHaveBeenCalledWith('competition_child_live_activity',{p_event:event,p_actor:actor})
  expect(f.from).not.toHaveBeenCalled()
 })
 it('returns an empty activity list without querying audit rows when there are no sessions',async()=>{
  f.rpc.mockImplementation(async(name)=>name==='competition_child_scoring_choices'
   ?{data:[],error:null}
   :{data:[],error:null})
  await expect(liveActivity(event,actor)).resolves.toEqual([])
 })
 it('requires migration 120 instead of issuing direct table reads',async()=>{
  f.rpc.mockImplementation(async(name)=>name==='competition_child_scoring_choices'
   ?{data:[],error:null}
   :{data:null,error:{code:'PGRST202',message:'function not found'}})
  await expect(liveActivity(event,actor)).rejects.toMatchObject({statusCode:503,message:'Reviewed migration 120 is required for native live activity'})
  expect(f.from).not.toHaveBeenCalled()
 })
})
