import { createApp } from './app.js'
import { env } from './config/env.js'

const app = createApp()

app.listen(env.port, '0.0.0.0', () => {
  console.log(`[votrix] API listening on port ${env.port}`)
  console.log(`[votrix] Environment: ${env.nodeEnv}`)
  console.log(`[votrix] Frontend URL: ${env.clientUrl}`)
  console.log(`[votrix] CSRF token: GET http://localhost:${env.port}/api/auth/csrf`)
  if (env.clientOrigins.length > 1) {
    console.log(`[votrix] Additional CORS origins: ${env.clientOrigins.slice(1).join(', ')}`)
  }
})
