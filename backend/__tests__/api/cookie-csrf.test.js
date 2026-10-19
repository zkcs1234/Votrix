import { expect, test } from 'vitest'
import { csrfProtection } from '../../src/middleware/csrf.js'
test('an arbitrary bearer header cannot bypass cookie-authenticated mutation CSRF', () => {
  let failure
  csrfProtection({ method: 'POST', originalUrl: '/api/organizer/competition/events/e/session/start', headers: { authorization: 'Bearer invalid' }, cookies: {} }, {}, error => { failure = error })
  expect(failure?.statusCode).toBe(403)
})
