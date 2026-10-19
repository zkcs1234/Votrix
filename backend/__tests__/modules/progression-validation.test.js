import {expect,test} from 'vitest'
import {progressionIssues} from '../../../shared/competition-progression-validation.js'
import {validateRound} from '../../src/validators/competition.validator.js'
test.each([null,0,-1,1.5,true])('Top N cannot publish an invalid count %s',value=>{
 expect(progressionIssues({advancementType:'top_n',advancementValue:value})).not.toEqual([])
 expect(()=>validateRound({name:'Preliminary',advancementType:'top_n',advancementValue:value})).toThrow()
})
test.each([null,0,101])('percentage rule rejects %s',value=>expect(progressionIssues({advancementType:'top_percent',advancementValue:value})).not.toEqual([]))
test('threshold qualification requires numeric results and preserves a zero numeric threshold',()=>{
 const round={advancementType:'threshold',advancementValue:0}
 expect(progressionIssues(round,[],'weighted_average')).toEqual([])
 expect(progressionIssues(round,[],'manual')).not.toEqual([]);expect(progressionIssues(round,[],'rank_based')).not.toEqual([])
})
test('explicit next-round links reject independent special-award targets',()=>{
 const rounds=[{id:'pre',displayOrder:0,nextRoundId:'award'},{id:'award',displayOrder:1,purpose:'special'}]
 expect(progressionIssues(rounds[0],rounds)).toEqual([expect.stringMatching(/Special awards/)])
})
