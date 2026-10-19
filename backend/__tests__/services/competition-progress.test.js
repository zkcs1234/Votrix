import {expect,test} from 'vitest'
import {progressFromSources} from '../../src/services/competition-workflow.service.js'
const state={rules:{event:{id:'e'},rounds:[],criteria:[{id:'c',name:'Quality'}],contestants:[{id:'a',divisionId:'one'},{id:'b',divisionId:'two'}],judges:[{judgeId:'j',role:'judge'},{judgeId:'inactive',role:'judge'},{judgeId:'reviewer',role:'score_reviewer'}]},session:{id:'s',current_round_id:null},lockedSources:[{judge_id:'j',contestant_id:'a',round_id:null,locked_criteria:['c']}],submissions:[],eligibility:[]}
const participant=(user,id='p',role='judge',status='active')=>({id,user_id:user,judge_role:role,is_active:true,users:{account_status:status}})
test('progress enforces division scope and never promotes complete locks to Submit Round',()=>{
 const result=progressFromSources(state,[participant('j'),participant('inactive','i','judge','inactive'),participant('reviewer','r','score_reviewer')],[{participant_id:'p',scope:'division',scope_id:'one'}])
 expect(result.judges.map(j=>j.judgeId)).toEqual(['j']);expect(result.requiredCells).toBe(1);expect(result.progress[0].fullyLocked).toBe(true);expect(result.roundSubmissions).toEqual([])
})
test('explicit submitted version is separately exposed in the Organizer progress grid',()=>{
 const result=progressFromSources({...state,submissions:[{judge_id:'j',round_id:null,version:2}]},[participant('j')],[])
 expect(result.roundSubmissions[0]).toMatchObject({roundSubmitted:true,submissionVersion:2})
})
