import {beforeEach,describe,expect,it,vi} from 'vitest'
const f=vi.hoisted(()=>({competitions:vi.fn()}))
vi.mock('../../src/services/pageant.service.js',()=>({listJudgeCompetitionEvents:f.competitions}))
vi.mock('../../src/services/election.service.js',()=>({listVoterElectionEvents:async()=>[],getVoterElectionResults:vi.fn()}))
vi.mock('../../src/services/polling.service.js',()=>({listVoterPollEvents:async()=>[]}))
import {getVoterDashboard} from '../../src/services/voter.service.js'
beforeEach(()=>{vi.clearAllMocks()})
describe('Native dashboard scopes',()=>{
 it('shows one parent event with its independently scoped child categories',async()=>{
  f.competitions.mockResolvedValue([{id:'parent',title:'Dance',scoringEnabled:false,hasScored:true,status:'draft',nativeContexts:['submitted','open','paused','waiting','closed'].map((state,i)=>({competitionId:'child-'+i,competitionName:'Dance '+i,roundId:null,roundName:'Single phase',state,scoringAvailable:state==='open',reviewer:false}))}])
  const view=await getVoterDashboard('judge');expect(view.events).toHaveLength(1);expect(view.events[0]).toMatchObject({title:'Dance',statusLabel:'Scoring open',bucket:'active',hasScored:true,dashboardKey:'parent:native'});expect(view.events[0].nativeContexts.map(context=>context.statusLabel)).toEqual(['Round submitted','Scoring open','Scoring paused','Waiting to open','Scoring closed']);expect(view.events[0].actionPath).toContain('competitionId=child-1');expect(view.active).toHaveLength(1);expect(view.stats.total).toBe(1)
 })
 it('retains legacy classification when no native context metadata exists',async()=>{f.competitions.mockResolvedValue([{id:'legacy',title:'Legacy',scoringEnabled:false,hasScored:true,status:'draft'}]);const data=await getVoterDashboard('judge');expect(data.completed).toHaveLength(1);expect(data.events[0].dashboardKey).toBeUndefined();expect(data.events[0].actionPath).toBe('/participant/competition/events/legacy/score')})
 it('an empty native grant list never becomes a legacy event card',async()=>{f.competitions.mockResolvedValue([{id:'native',nativeContexts:[],hasScored:true}]);expect((await getVoterDashboard('judge')).events).toEqual([])})
})
