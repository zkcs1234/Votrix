import { checkDatabaseConnection } from '../config/database.js'
import { getCloudinary } from '../config/cloudinary.js'
import { isEmailConfigured } from '../config/resend.js'

export async function checkSystemHealth() {
  const [dbResult, cloudinaryResult, resendResult] = await Promise.allSettled([
    checkDatabaseConnection(),
    Promise.resolve(getCloudinary() ? { connected: true } : { connected: false }),
    Promise.resolve(isEmailConfigured() ? { connected: true } : { connected: false }),
  ])

  const services = [
    {
      service: 'database',
      status: dbResult.status === 'fulfilled' && dbResult.value?.connected ? 'healthy' : 'down',
      message: dbResult.value?.message ?? dbResult.reason?.message ?? null,
      schemaReady: dbResult.value?.schemaReady ?? null,
    },
    {
      service: 'cloudinary',
      status: cloudinaryResult.status === 'fulfilled' && cloudinaryResult.value?.connected ? 'healthy' : 'down',
    },
    {
      service: 'resend',
      status: resendResult.status === 'fulfilled' && resendResult.value?.connected ? 'healthy' : 'down',
    },
  ]

  return {
    overall: services.every((s) => s.status === 'healthy') ? 'healthy' : 'degraded',
    services,
    checkedAt: new Date().toISOString(),
  }
}
