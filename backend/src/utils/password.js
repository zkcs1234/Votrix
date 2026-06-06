import bcrypt from 'bcrypt'

const SALT_ROUNDS = 12

export async function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS)
}

export async function comparePassword(plain, hash) {
  // TEMPORARY DEBUG — remove after fixing the login issue
  console.log('[comparePassword] DEBUG', {
    plainType: typeof plain,
    plainLength: typeof plain === 'string' ? plain.length : null,
    plainBytes: typeof plain === 'string' ? Buffer.from(plain).toString('hex') : null,
    hashType: typeof hash,
    hashLength: typeof hash === 'string' ? hash.length : null,
    hashPrefix: typeof hash === 'string' ? hash.slice(0, 7) : null,
  })
  const result = await bcrypt.compare(plain, hash)
  console.log('[comparePassword] DEBUG result =', result)
  return result
}
