import { v2 as cloudinary } from 'cloudinary'
import { env } from './env.js'

let configured = false

export function configureCloudinary() {
  if (configured) return cloudinary

  const { cloudName, apiKey, apiSecret } = env.cloudinary
  if (!cloudName || !apiKey || !apiSecret) {
    console.warn('[cloudinary] Credentials not set — uploads disabled')
    return null
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  })

  configured = true
  return cloudinary
}

export function getCloudinary() {
  return configureCloudinary()
}
