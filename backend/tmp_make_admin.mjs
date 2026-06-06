import bcrypt from 'bcrypt'

const plain = 'VotrixAdmin2026'
const hash = await bcrypt.hash(plain, 12)
const verify = await bcrypt.compare(plain, hash)

console.log('PLAINTEXT:', JSON.stringify(plain))
console.log('LENGTH:', plain.length)
console.log('HASH:', hash)
console.log('HASH_LENGTH:', hash.length)
console.log('VERIFY:', verify)
