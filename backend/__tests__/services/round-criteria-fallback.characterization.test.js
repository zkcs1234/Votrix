// Versioned official rules deliberately remove the all-event criterion fallback.
import {test,expect} from 'vitest'
import {roundField} from '../../../shared/competition-calculation.js'
const rules={rounds:[{id:'r',contestantIds:['one'],criteriaIds:['assigned']}],contestants:[{id:'one'},{id:'outside'}],criteria:[{id:'assigned'},{id:'unrelated'}]}
test('explicit round membership excludes other entries and criteria',()=>{expect(roundField(rules,'r').entries.map(e=>e.id)).toEqual(['one']);expect(roundField(rules,'r').criteria.map(e=>e.id)).toEqual(['assigned'])})
test('flat competition keeps event-wide criteria',()=>{expect(roundField({...rules,rounds:[]},null).criteria).toHaveLength(2)})
