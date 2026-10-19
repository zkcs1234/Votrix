import { expect, test, vi } from 'vitest'
vi.mock('../../src/services/user.service.js', () => ({ findUserById: vi.fn(async () => ({ id: 'user', role: 'organizer', token_version: 0 })) }))
vi.mock('../../src/services/session.service.js', () => ({ isSessionActive: vi.fn(async () => true) }))
import { authenticate } from '../../src/middleware/auth.js'
import { signAccessToken } from '../../src/utils/jwt.js'
import { env } from '../../src/config/env.js'

test('authenticates using only the HTTP-only cookie, ignoring bearer headers', async () => {
  const token = signAccessToken({ sub: 'user', role: 'organizer', tokenVersion: 0 })
  const req = {
    headers: { authorization: 'Bearer unrelated-token' },
    cookies: { [env.jwt.accessCookieName]: token },
  }
  const next = vi.fn()
  await authenticate(req, {}, next)
  expect(next).toHaveBeenCalledWith()
  expect(req.user.id).toBe('user')
})

test('a valid bearer token without the session cookie is rejected', async()=>{
 const token=signAccessToken({sub:'user',role:'organizer',tokenVersion:0}),next=vi.fn()
 const req={headers:{authorization:`Bearer ${token}`},cookies:{}}
 await authenticate(req,{},next)
 expect(next.mock.calls[0][0]).toMatchObject({statusCode:401})
 expect(req.user).toBeUndefined()
})
