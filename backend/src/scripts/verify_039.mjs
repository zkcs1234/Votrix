import { db } from '../foundation/db.js'

const eventId = 'e69adde0-e9ca-41b2-ab7f-3c23b20a4ff4'
const divs = (await db().from('competition_divisions').select('id').eq('event_id', eventId).limit(2)).data
const number = Math.floor(Math.random() * 100000) + 100000

await db().from('competition_contestants').delete().eq('event_id', eventId).eq('contestant_number', number)

console.log('--- TEST 1: insert A into division', divs[0].id)
const a = await db().from('competition_contestants').insert({
  event_id: eventId, division_id: divs[0].id, contestant_number: number, name: 'TEST-A',
}).select()
console.log('A:', a.status, JSON.stringify(a.error))

console.log('--- TEST 2: insert B into division', divs[1].id, 'with same number', number)
const b = await db().from('competition_contestants').insert({
  event_id: eventId, division_id: divs[1].id, contestant_number: number, name: 'TEST-B',
}).select()
console.log('B:', b.status, JSON.stringify(b.error))

console.log('--- TEST 3: insert C into SAME division as B with same number (should fail if 039 in effect)')
const c = await db().from('competition_contestants').insert({
  event_id: eventId, division_id: divs[1].id, contestant_number: number, name: 'TEST-C',
}).select()
console.log('C:', c.status, JSON.stringify(c.error))

await db().from('competition_contestants').delete().eq('event_id', eventId).eq('contestant_number', number)
