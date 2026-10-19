import {expect,test} from 'vitest'
import {scoreDraftKey,recoverScoreDrafts} from './useJudgeScoreDrafts'
test('draft recovery cannot cross Judge, session, round or rule version',()=>{
 const base={sessionId:'session',roundId:'round',rulesVersion:'version'},key=scoreDraftKey('judge','event',base)
 expect(scoreDraftKey('other','event',base)).not.toBe(key)
 for(const property of Object.keys(base))expect(scoreDraftKey('judge','event',{...base,[property]:'other'})).not.toBe(key)
})

const sheet={criteria:[{id:'parent',minors:[{id:'minor'}]}],contestants:[{id:'entry',existingScores:{minor:0},lockedCriteria:['parent']}],drafts:[{contestant_id:'entry',scores:{minor:8}}]}
test('saved locks take precedence over stale local or server drafts, including zero',()=>{
 expect(recoverScoreDrafts(sheet,{'entry:minor':9})).toEqual({'entry:minor':0})
})
test('periodic sheet refresh preserves a newer unsaved edit only for unlocked targets',()=>{
 const unlocked={...sheet,contestants:[{...sheet.contestants[0],lockedCriteria:[]}]}
 expect(recoverScoreDrafts(unlocked,{}, {'entry:minor':9})).toEqual({'entry:minor':9})
})
