import { getSystemSettings, saveSystemSetting } from './admin.service.js'
import { ApiError } from '../utils/ApiError.js'

const ALERT_CONFIG_KEY = 'admin_alert_config'

export const DEFAULT_ALERT_CONFIG = {
  failedEmailDelivery: { enabled: true, threshold: 5 },
  newOrganizerSignup: { enabled: true },
  eventCompletion: { enabled: false },
  suspiciousActivity: { enabled: true, failedLoginThreshold: 10 },
}

function validateThreshold(value, label) {
  if (!Number.isInteger(value) || value < 1 || value > 100000) {
    throw new ApiError(400, `${label} must be an integer between 1 and 100000`)
  }
  return value
}

function normalizeAlertConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new ApiError(400, 'Alert configuration must be an object')
  }

  const unknownKeys = Object.keys(config).filter((key) => !(key in DEFAULT_ALERT_CONFIG))
  if (unknownKeys.length > 0) {
    throw new ApiError(400, `Unknown alert configuration: ${unknownKeys.join(', ')}`)
  }

  const merged = {}
  for (const [key, defaults] of Object.entries(DEFAULT_ALERT_CONFIG)) {
    const entry = config[key] ?? {}
    if (typeof entry !== 'object' || Array.isArray(entry) || typeof entry.enabled !== 'boolean') {
      throw new ApiError(400, `${key} must include an enabled boolean`)
    }

    const normalized = { enabled: entry.enabled }
    for (const thresholdKey of Object.keys(defaults).filter((name) => name !== 'enabled')) {
      const value = entry[thresholdKey] ?? defaults[thresholdKey]
      normalized[thresholdKey] = validateThreshold(value, `${key}.${thresholdKey}`)
    }
    merged[key] = normalized
  }

  return merged
}

export async function getAlertConfig() {
  const settings = await getSystemSettings()
  const setting = settings.find((s) => s.setting_key === ALERT_CONFIG_KEY)
  return setting?.setting_value ?? DEFAULT_ALERT_CONFIG
}

export async function updateAlertConfig(config) {
  const normalized = normalizeAlertConfig(config)
  await saveSystemSetting(ALERT_CONFIG_KEY, normalized, 'Admin alert configuration')
  return normalized
}
