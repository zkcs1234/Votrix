import { db } from '../foundation/db.js'
import { ApiError } from '../utils/ApiError.js'
import { ACCOUNT_STATUS, DB_TABLES, MAX_INVITATION_EXPIRY_DAYS, USER_ROLES } from '../utils/constants.js'

// The settings on Admin → System settings that change how the platform behaves.
// They are stored in system_settings; this module is the only place that reads
// them, so what the page says is what the platform does:
//
//   maintenance_mode  only administrators can use the platform
//   max_organizers    maximum number of organizer accounts
//   email_daily_limit emails the platform may send per day (unset → env / 50)
//   invitation_expiry_days  how long a new organizer invitation link stays valid
//
// The platform NAME is deliberately fixed ("Votrix"): it is baked into emails,
// exported reports, help text and the logo artwork, so a setting could only ever
// rename part of it. Any value saved under `platform_name` is ignored and new
// writes are refused.

export const PLATFORM_SETTING_KEYS = {
  NAME: 'platform_name', // fixed; kept only so writes to it can be refused
  MAINTENANCE: 'maintenance_mode',
  MAX_ORGANIZERS: 'max_organizers',
  EMAIL_DAILY_LIMIT: 'email_daily_limit',
  INVITATION_EXPIRY_DAYS: 'invitation_expiry_days',
}
// The settings that are actually read from the database.
const KEY_LIST = [
  PLATFORM_SETTING_KEYS.MAINTENANCE,
  PLATFORM_SETTING_KEYS.MAX_ORGANIZERS,
  PLATFORM_SETTING_KEYS.EMAIL_DAILY_LIMIT,
  PLATFORM_SETTING_KEYS.INVITATION_EXPIRY_DAYS,
]

export const PLATFORM_DEFAULTS = {
  platformName: 'Votrix',
  maintenanceMode: false,
  maxOrganizers: 100,
  // null = not set by an admin: the email guard then uses RESEND_DAILY_LIMIT, or 50.
  emailDailyLimit: null,
  invitationExpiryDays: 7,
}

export const MAX_ORGANIZER_LIMIT = 100000
export const MAX_EMAIL_DAILY_LIMIT = 10000

// Settings are read on (almost) every request by the maintenance guard, so they
// are cached briefly. Saving through the API invalidates the cache immediately;
// other server instances pick a change up within the TTL.
const CACHE_TTL_MS = 5000
let cache = null // { at, value }

export function invalidatePlatformSettings() {
  cache = null
}

function normalizeMaintenance(value) {
  return value === true || value === 'true'
}

function normalizeMax(value) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  return Number.isInteger(n) && n >= 1 && n <= MAX_ORGANIZER_LIMIT ? n : PLATFORM_DEFAULTS.maxOrganizers
}

function toInteger(value) {
  return typeof value === 'string' && value.trim() !== '' ? Number(value) : value
}

function normalizeEmailDailyLimit(value) {
  const n = toInteger(value)
  return Number.isInteger(n) && n >= 1 && n <= MAX_EMAIL_DAILY_LIMIT ? n : PLATFORM_DEFAULTS.emailDailyLimit
}

function normalizeExpiryDays(value) {
  const n = toInteger(value)
  return Number.isInteger(n) && n >= 1 && n <= MAX_INVITATION_EXPIRY_DAYS ? n : PLATFORM_DEFAULTS.invitationExpiryDays
}

/** Turn raw system_settings rows into the effective settings (defaults fill any gap). */
export function normalizePlatformSettings(rows = []) {
  const byKey = new Map(rows.map((r) => [r.setting_key, r.setting_value]))
  return {
    // Always the fixed name, whatever an older save left in the database.
    platformName: PLATFORM_DEFAULTS.platformName,
    maintenanceMode: normalizeMaintenance(byKey.get(PLATFORM_SETTING_KEYS.MAINTENANCE)),
    maxOrganizers: normalizeMax(byKey.get(PLATFORM_SETTING_KEYS.MAX_ORGANIZERS)),
    emailDailyLimit: normalizeEmailDailyLimit(byKey.get(PLATFORM_SETTING_KEYS.EMAIL_DAILY_LIMIT)),
    invitationExpiryDays: normalizeExpiryDays(byKey.get(PLATFORM_SETTING_KEYS.INVITATION_EXPIRY_DAYS)),
  }
}

/**
 * The effective platform settings. A database error never locks anyone out: it
 * falls back to the last known value, or the defaults (maintenance OFF).
 */
export async function getPlatformSettings({ force = false } = {}) {
  const now = Date.now()
  if (!force && cache && now - cache.at < CACHE_TTL_MS) return cache.value

  try {
    const { data, error } = await db()
      .from(DB_TABLES.SYSTEM_SETTINGS)
      .select('setting_key, setting_value')
      .in('setting_key', KEY_LIST)
    if (error) throw new Error(error.message)
    const value = normalizePlatformSettings(data ?? [])
    cache = { at: now, value }
    return value
  } catch (err) {
    console.warn('[platform-settings] could not read settings, using last known values:', err.message)
    return cache?.value ?? { ...PLATFORM_DEFAULTS }
  }
}

/**
 * Validate (and normalise) a value being saved for one of the platform settings.
 * Returns the value to store, or the input unchanged for any other key.
 */
export function validatePlatformSettingValue(key, value) {
  if (key === PLATFORM_SETTING_KEYS.NAME) {
    throw new ApiError(400, `The platform name is fixed (${PLATFORM_DEFAULTS.platformName}) and cannot be changed`)
  }
  if (key === PLATFORM_SETTING_KEYS.MAINTENANCE) {
    if (typeof value !== 'boolean') throw new ApiError(400, 'Maintenance mode must be true or false')
    return value
  }
  if (key === PLATFORM_SETTING_KEYS.MAX_ORGANIZERS) {
    if (!Number.isInteger(value) || value < 1 || value > MAX_ORGANIZER_LIMIT) {
      throw new ApiError(400, `Maximum organizers must be a whole number from 1 to ${MAX_ORGANIZER_LIMIT}`)
    }
    return value
  }
  if (key === PLATFORM_SETTING_KEYS.EMAIL_DAILY_LIMIT) {
    if (!Number.isInteger(value) || value < 1 || value > MAX_EMAIL_DAILY_LIMIT) {
      throw new ApiError(400, `Daily email limit must be a whole number from 1 to ${MAX_EMAIL_DAILY_LIMIT}`)
    }
    return value
  }
  if (key === PLATFORM_SETTING_KEYS.INVITATION_EXPIRY_DAYS) {
    if (!Number.isInteger(value) || value < 1 || value > MAX_INVITATION_EXPIRY_DAYS) {
      throw new ApiError(400, `Invitation expiry must be a whole number of days from 1 to ${MAX_INVITATION_EXPIRY_DAYS}`)
    }
    return value
  }
  return value
}

export function isPlatformSettingKey(key) {
  return KEY_LIST.includes(key)
}

// ---------------------------------------------------------------------------
// Maintenance mode
// ---------------------------------------------------------------------------
export function maintenanceError(platformName) {
  return new ApiError(
    503,
    `${platformName} is under maintenance. Only administrators can sign in right now. Please try again later.`,
    { code: 'MAINTENANCE_MODE' },
  )
}

/** Throws a 503 for any non-admin while maintenance mode is on. */
export async function assertPlatformAvailableFor(role) {
  if (role === USER_ROLES.ADMIN) return
  const { maintenanceMode, platformName } = await getPlatformSettings()
  if (maintenanceMode) throw maintenanceError(platformName)
}

// ---------------------------------------------------------------------------
// Organizer limit
// ---------------------------------------------------------------------------
/** Organizer accounts that count toward the limit (archived accounts do not). */
export async function countOrganizers() {
  const { count, error } = await db()
    .from(DB_TABLES.USERS)
    .select('id', { count: 'exact', head: true })
    .eq('role', USER_ROLES.ORGANIZER)
    .neq('account_status', ACCOUNT_STATUS.ARCHIVED)
  if (error) throw new ApiError(500, error.message)
  return count ?? 0
}

/**
 * Throws a 409 when creating one more organizer would exceed the limit. Reads the
 * setting fresh (not from the cache) so raising the limit works at once.
 */
export async function assertOrganizerCapacity() {
  const { maxOrganizers } = await getPlatformSettings({ force: true })
  const current = await countOrganizers()
  if (current >= maxOrganizers) {
    throw new ApiError(
      409,
      `The platform has reached its limit of ${maxOrganizers} organizer${maxOrganizers === 1 ? '' : 's'}. Raise "Maximum organizers allowed" in System settings, or archive an organizer, to add more.`,
      { code: 'ORGANIZER_LIMIT_REACHED', limit: maxOrganizers, current },
    )
  }
}
