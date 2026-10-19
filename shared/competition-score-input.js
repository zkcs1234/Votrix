// Optional precision preserves unrestricted decimal inputs in historical rules.
export function scorePrecision(target, config = {}) {
  return target.decimalPlaces ?? config.inputDecimalPlaces
}

export function validScore(value, target, config = {}) {
  if (value === '' || value == null) return false
  const n = Number(value), precision = scorePrecision(target, config)
  if (!Number.isFinite(n) || n < target.minScore || n > target.maxScore) return false
  if (precision == null) return true
  const decimal = /^(?:-?\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(String(n))
  const places = Math.max(0, (decimal?.[1]?.length ?? 0) - Number(decimal?.[2] ?? 0))
  return places <= precision
}
