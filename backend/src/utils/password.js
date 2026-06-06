import bcrypt from 'bcrypt'

const SALT_ROUNDS = 12

export async function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS)
}

export async function comparePassword(plain, hash) {
  const plainType = typeof plain
  const plainLen = plainType === 'string' ? plain.length : null
  const plainBytes = plainType === 'string' ? Buffer.from(plain).toString('hex') : null
  const hashType = typeof hash
  const hashLen = hashType === 'string' ? hash.length : null
  const hashPrefix = hashType === 'string' ? hash.slice(0, 7) : null
  console.log('[DEBUG comparePassword]', {
    plainType,
    plainLen,
    plainBytes,
    hashType,
    hashLen,
    hashPrefix,
  })
  const result = await bcrypt.compare(plain, hash)
  console.log('[DEBUG comparePassword] result =', result)
  return result
}
