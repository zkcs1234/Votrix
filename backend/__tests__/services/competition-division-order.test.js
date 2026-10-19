import { beforeEach, expect, test, vi } from 'vitest'
const fixture=vi.hoisted(()=>({rpc:vi.fn(),status:'draft',ids:['10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002']}))
vi.mock('../../src/services/event.service.js',()=>({assertOrganizerOwnsEvent:async()=>({id:'e',event_type:'competition_scoring',status:fixture.status})}))
vi.mock('../../src/foundation/activity.js',()=>({recordEventActivity:vi.fn()}))
vi.mock('../../src/foundation/db.js',()=>({db:()=>({rpc:fixture.rpc,from:table=>{const q={select:()=>q,eq:()=>q,order:()=>q,maybeSingle:async()=>({data:{id:'e',event_type:'competition_scoring'},error:null}),then:resolve=>resolve({data:table==='competition_divisions'?fixture.ids.map((id,index)=>({id,event_id:'e',display_order:index})):[],error:null})};return q}})}))
import { reorderDivisions } from '../../src/services/competition-division.service.js'
beforeEach(()=>{fixture.rpc.mockReset().mockResolvedValue({data:{success:true},error:null});fixture.status='draft'})
test('division move sends one complete event/actor permutation to atomic RPC',async()=>{
 await expect(reorderDivisions('e','organizer',[...fixture.ids].reverse())).resolves.toHaveLength(2)
 expect(fixture.rpc).toHaveBeenCalledTimes(1);expect(fixture.rpc).toHaveBeenCalledWith('competition_reorder_divisions',{p_event:'e',p_actor:'organizer',p_ids:[...fixture.ids].reverse()})
})
test('incomplete/duplicate/foreign/malformed permutations and frozen setup reject before RPC',async()=>{
 for(const ids of [[fixture.ids[0]],[fixture.ids[0],fixture.ids[0]],['10000000-0000-0000-0000-000000000003',fixture.ids[0]],['invalid',fixture.ids[0]]]) await expect(reorderDivisions('e','organizer',ids)).rejects.toMatchObject({statusCode:400})
 fixture.status='scheduled';await expect(reorderDivisions('e','organizer',fixture.ids)).rejects.toMatchObject({statusCode:409})
 expect(fixture.rpc).not.toHaveBeenCalled()
})
test('missing atomic division schema fails closed with migration guidance',async()=>{
 fixture.rpc.mockResolvedValue({error:{code:'PGRST202',message:'Function absent'}})
 await expect(reorderDivisions('e','organizer',fixture.ids)).rejects.toMatchObject({statusCode:503,message:expect.stringContaining('100')})
})
