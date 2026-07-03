import { createApp } from './app.js'
import { env, isProduction } from './config/env.js'

import { createServer } from 'http'
import { attachWebSocketServer } from './websocket/ws-server.js'

const app = createApp()
const httpServer = createServer(app)

attachWebSocketServer(httpServer)

httpServer.listen(env.port, '0.0.0.0', () => {
  console.log(`[votrix] API listening on port ${env.port}`)
  console.log(`[votrix] Environment: ${env.nodeEnv}`)
  console.log(`[votrix] Frontend URL: ${env.clientUrl}`)
  console.log(`[votrix] CSRF token: GET http://localhost:${env.port}/api/auth/csrf`)
  if (env.clientOrigins.length > 1) {
    console.log(`[votrix] Additional CORS origins: ${env.clientOrigins.slice(1).join(', ')}`)
  }
  // Cookie config sanity check — visible in Render logs after deploy
  const sameSite = isProduction ? 'none' : env.cookie.sameSite
  const secure   = isProduction || sameSite === 'none'
  console.log(`[votrix] Cookie config: SameSite=${sameSite} Secure=${secure}`)
  if (sameSite === 'none' && !secure) {
    console.error('[votrix] WARNING: SameSite=None without Secure=true — mobile browsers will drop auth cookies!')
  }
})
