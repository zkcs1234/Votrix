/**
 * Shared analytics formatters.
 *
 * Module-agnostic utilities used by every analytics view. None of these
 * functions read module-specific data — they only transform primitive
 * numbers and arrays.
 */

export function formatCount(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 0
  return Number(value)
}

export function formatPercentage(value, fractionDigits = 0) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '0%'
  const num = Number(value)
  return `${num.toFixed(fractionDigits)}%`
}

export function formatDecimal(value, fractionDigits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '0'
  return Number(value).toFixed(fractionDigits)
}

export function formatDuration(ms) {
  if (!ms || Number.isNaN(Number(ms))) return '—'
  const seconds = Math.round(Number(ms) / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remaining = seconds % 60
  if (minutes < 60) return remaining ? `${minutes}m ${remaining}s` : `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remM = minutes % 60
  return remM ? `${hours}h ${remM}m` : `${hours}h`
}

export function formatDate(value) {
  if (!value) return '—'
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString()
}

/**
 * Compute a percentage safely (avoids division by zero).
 * Returns 0 when both numerator and denominator are 0 or invalid.
 */
export function safePercentage(numerator, denominator, fractionDigits = 0) {
  const n = Number(numerator) || 0
  const d = Number(denominator) || 0
  if (d === 0) return 0
  return Number(((n / d) * 100).toFixed(fractionDigits))
}
