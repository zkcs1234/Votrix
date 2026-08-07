import { getSystemSettings, saveSystemSetting } from './admin.service.js'

const ALERT_CONFIG_KEY = 'admin_alert_config'

export const DEFAULT_ALERT_CONFIG = {
  failedEmailDelivery: { enabled: true, threshold: 5 },
  newOrganizerSignup: { enabled: true },
  eventCompletion: { enabled: false },
  suspiciousActivity: { enabled: true, failedLoginThreshold: 10 },
}

export async function getAlertConfig() {
  const settings = await getSystemSettings()
  const setting = settings.find((s) => s.setting_key === ALERT_CONFIG_KEY)
  return setting?.setting_value ?? DEFAULT_ALERT_CONFIG
}

export async function updateAlertConfig(config) {
  const merged = { ...DEFAULT_ALERT_CONFIG, ...(config ?? {}) }
  return saveSystemSetting(ALERT_CONFIG_KEY, merged, 'Admin alert configuration')
}
