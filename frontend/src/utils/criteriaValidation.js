// Live validation for the competition criteria editor. Pure (no React) so the
// rules can be tested directly. They mirror what the editor already enforced on
// submit (and what the server enforces): a name is required, a weight must be
// above 0 and fit in what is left of the 100% budget, a custom range needs max
// above min.

export function validateCriterionName(name, label = 'Name') {
  return String(name ?? '').trim() ? null : `${label} is required`
}

/**
 * @param {string} text            the raw input value
 * @param {object} opts
 * @param {number} [opts.remaining] percent left in the budget (omit to skip the budget rule)
 * @param {number} [opts.tolerance] rounding tolerance for the budget
 * @param {string} [opts.scopeLabel] e.g. "this round"
 * @param {number} [opts.max] hard upper bound (default 100)
 */
export function validateWeight(text, { remaining, tolerance = 0, scopeLabel = 'the budget', max = 100 } = {}) {
  const raw = String(text ?? '').trim()
  if (!raw) return 'Enter a weight greater than 0'
  const value = Number(raw)
  if (!Number.isFinite(value)) return 'Weight must be a number'
  if (value <= 0) return 'Weight must be greater than 0'
  if (value > max) return `Weight cannot be more than ${max}%`
  if (remaining !== undefined && value > remaining + tolerance) {
    return `Only ${Number(remaining).toFixed(2)}% left in ${scopeLabel}. Lower the weight.`
  }
  return null
}

export function validateCustomRange(minText, maxText) {
  const minRaw = String(minText ?? '').trim()
  const maxRaw = String(maxText ?? '').trim()
  if (!minRaw || !maxRaw) return 'Enter both a minimum and a maximum score'
  const min = Number(minRaw)
  const max = Number(maxRaw)
  if (!Number.isFinite(min) || !Number.isFinite(max)) return 'Scores must be numbers'
  if (max <= min) return 'Maximum must be greater than minimum'
  if (max <= 0) return 'Maximum must be greater than 0'
  return null
}
