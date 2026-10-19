import {expect,test,vi} from 'vitest'
const mocks=vi.hoisted(()=>({published:vi.fn()}))
vi.mock('../../src/services/event.service.js',()=>({assertOrganizerOwnsEvent:vi.fn(async()=>({id:'event',event_type:'competition_scoring',official_rules_id:'rules'})),getEventById:vi.fn()}))
vi.mock('../../src/services/competition-workflow.service.js',()=>({tabulationData:vi.fn(async()=>({ready:true,rules:{scoringConfig:{},judges:[],rounds:[],categories:[],divisions:[]},submissions:[]})),publicResults:()=>[]}))
vi.mock('../../src/foundation/db.js',()=>({db:()=>({from:()=>{const query={select:()=>query,eq:()=>query,filter:()=>query,order:()=>query,limit:()=>query,maybeSingle:()=>mocks.published()};return query}})}))
import {getOfficialRankings} from '../../src/services/pageant.service.js'
test('published tie-break ranks remain authoritative when the standings are read',async()=>{
 mocks.published.mockResolvedValue({error:null,data:{id:'publication',configuration_snapshot:{method:'weighted_average',ruleVersion:1},result_snapshot:[{contestantId:'a',finalScore:50,rank:1},{contestantId:'b',finalScore:50,rank:2}]}})
 const result=await getOfficialRankings('event','owner');expect(result.isOfficial).toBe(true);expect(result.rankings.map(r=>r.rank)).toEqual([1,2])
})
