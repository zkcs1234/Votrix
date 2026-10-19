import {expect,test} from 'vitest'
import {participationFor,entryParticipation,potentialRoundEntries,qualificationSources,registrationSource,roundAcceptsEntry} from '../../../shared/competition-participation.js'
const foundation={event:{official_rules_id:'v'},contestants:['a','b','c'].map(id=>({id,name:id,divisionId:id==='c'?'junior':'senior'})),rounds:[
  {id:'pre',name:'Preliminary',displayOrder:0,purpose:'qualification',advancementType:'top_n',advancementValue:2,contestantIds:['a','b'],criteriaIds:['x']},
  {id:'final',name:'Final',displayOrder:1,purpose:'final',contestantIds:['a','b','c']}],advancementDecisions:[],eligibilityDecisions:[]}
test('registration and planned later-round memberships never imply qualification',()=>{
  const p=participationFor(foundation,'final')
  expect(p.protected).toBe(true);expect(p.assignedIds).toEqual([]);expect(p.plannedIds).toHaveLength(3)
  expect(entryParticipation(foundation,foundation.contestants[0],'final').status).toMatch(/awaiting qualification/)
  expect(potentialRoundEntries(foundation,'final').map(e=>e.id)).toEqual(['a','b'])
})
test('only confirmed decisions for the current version establish finalists and elimination history',()=>{
  const f={...foundation,advancementDecisions:[{rules_version:'old',round_id:'pre',next_round_id:'final',qualifiers:['b']},{rules_version:'v',round_id:'pre',next_round_id:'final',qualifiers:['a'],selection_basis:'automatic'}]}
  expect(participationFor(f,'final').assignedIds).toEqual(['a'])
  expect(entryParticipation(f,f.contestants[0],'final').status).toBe('Finalist')
  expect(entryParticipation(f,f.contestants[1],'final').status).toBe('Eliminated')
  expect(entryParticipation(f,f.contestants[2],'final').status).toMatch(/outside qualification scope/)
})
test('approved manual qualifiers remain distinct and approved noncompeting decisions take precedence',()=>{
  const f={...foundation,advancementDecisions:[{rules_version:'v',round_id:'pre',next_round_id:'final',qualifiers:['a'],selection_basis:'manual'}]}
  expect(entryParticipation(f,f.contestants[0],'final').status).toBe('Approved manual qualifier')
  f.eligibilityDecisions=[{rules_version:'v',contestant_id:'a',status:'approved',round_id:'final'}]
  expect(entryParticipation(f,f.contestants[0],'final').status).toBe('Withdrawn / Non-competing')
})
test('one-round open competitions and actual division scope remain ordinary assignments',()=>{
  expect(qualificationSources([foundation.rounds[0]],'pre')).toEqual([])
  expect(roundAcceptsEntry({divisionId:'senior'},foundation.contestants[2])).toBe(false)
  expect(roundAcceptsEntry({},foundation.contestants[2])).toBe(true)
  expect(registrationSource(foundation).rounds[0].id).toBe('final')
})
