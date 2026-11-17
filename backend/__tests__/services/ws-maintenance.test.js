import { beforeEach, describe, expect, test, vi } from 'vitest'
import { makeWorld } from '../helpers/officer-world.js'

let world
vi.mock('../../src/config/database.js', () => ({ getSupabase: () => world.client }))

// authenticate() normally verifies the JWT cookie; here the "token" is the role.
vi.mock('../../src/middleware/auth.js', () => ({
  authenticate: (req, _res, next) => { req.user = { id: 'u1', role: req.cookies.role }; next() },
  requireActiveAccount: (_req, _res, next) => next(),
  requirePasswordChanged: (_req, _res, next) => next(),
}))

import { socketIdentity } from '../../src/websocket/ws-authorization.js'
import { invalidatePlatformSettings } from '../../src/services/platform-settings.service.js'

const connect = (role) => socketIdentity({}, { role })

beforeEach(() => {
  world = makeWorld({ extra: { system_settings: [] } })
  invalidatePlatformSettings()
})

describe('WebSocket identity and maintenance mode', () => {
  test('everyone can connect while maintenance is off', async () => {
    for (const role of ['admin', 'organizer', 'participant']) {
      await expect(connect(role)).resolves.toMatchObject({ role })
    }
  })

  test('while on, administrators connect and everyone else is refused (and existing sockets fail the next heartbeat check)', async () => {
    world.raw('system_settings').push({ setting_key: 'maintenance_mode', setting_value: true })

    await expect(connect('admin')).resolves.toMatchObject({ role: 'admin' })
    for (const role of ['organizer', 'participant']) {
      await expect(connect(role)).rejects.toMatchObject({ statusCode: 503, details: { code: 'MAINTENANCE_MODE' } })
    }
  })
})
