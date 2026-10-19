import {expect,test} from 'vitest'
import {validateContestant} from '../../src/validators/competition.validator.js'
test.each(['individual','duo','group','other'])('accepts the existing %s entry contract',entryType=>{
  expect(validateContestant({name:' Example ',contestantNumber:1,entryType})).toMatchObject({name:'Example',entryType})
})
test('unsupported entry types are rejected before a database write',()=>{
  expect(()=>validateContestant({name:'Entry',contestantNumber:1,entryType:'team'})).toThrow('supported entry type')
})
test('omitted registration fields preserve existing photo and division on edits',()=>{
  const result=validateContestant({name:'Entry',contestantNumber:1})
  expect(result).not.toHaveProperty('photo');expect(result).not.toHaveProperty('divisionId');expect(result).not.toHaveProperty('entryType')
  expect(validateContestant({name:'Entry',contestantNumber:1,divisionId:null,photo:null})).toMatchObject({divisionId:null,photo:null})
})
