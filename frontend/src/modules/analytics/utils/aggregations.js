/**
 * Module-agnostic aggregation helpers.
 *
 * These functions operate on plain arrays of {id, label, value} objects.
 * They are intentionally generic — each module is responsible for
 * mapping its own domain entities to this shape before calling them.
 */

import { safePercentage } from './format'

/**
 * Sort items by a numeric key in descending order.
 * Returns a new array; original is not mutated.
 */
export function sortByValue(items, valueKey = 'value', direction = 'desc') {
  const dir = direction === 'asc' ? 1 : -1
  return [...items].sort((a, b) => {
    const av = Number(a?.[valueKey] ?? 0)
    const bv = Number(b?.[valueKey] ?? 0)
    return (av - bv) * dir
  })
}

/**
 * Take the top N items by value. Useful for "top candidates" or
 * "most selected choices" lists.
 */
export function topN(items, n = 5, valueKey = 'value') {
  return sortByValue(items, valueKey, 'desc').slice(0, n)
}

/**
 * Add a percentage field to each item based on total.
 * `totalKey` lets the caller override the total (e.g. weighted sum).
 */
export function withPercentage(items, valueKey = 'value', totalKey) {
  const total =
    totalKey !== undefined
      ? items.reduce((s, i) => s + Number(i?.[totalKey] ?? 0), 0)
      : items.reduce((s, i) => s + Number(i?.[valueKey] ?? 0), 0)
  return items.map((item) => ({
    ...item,
    percentage: safePercentage(item?.[valueKey] ?? 0, total),
  }))
}

/**
 * Sum a numeric field across items.
 */
export function sumBy(items, valueKey = 'value') {
  return items.reduce((acc, item) => acc + Number(item?.[valueKey] ?? 0), 0)
}

/**
 * Group items by a key and compute per-group counts/percentages.
 */
export function groupDistribution(items, key, valueKey = 'value') {
  const map = new Map()
  for (const item of items) {
    const k = item?.[key] ?? 'Unknown'
    map.set(k, (map.get(k) ?? 0) + Number(item?.[valueKey] ?? 0))
  }
  const total = Array.from(map.values()).reduce((a, b) => a + b, 0)
  return Array.from(map.entries()).map(([label, value]) => ({
    id: label,
    label,
    value,
    percentage: safePercentage(value, total),
  }))
}

/**
 * Compute a simple trend series from a list of { date, value } points.
 * Returns the count and (if dates are present) the daily change.
 */
export function summarizeTrend(points) {
  if (!Array.isArray(points) || points.length === 0) {
    return { count: 0, delta: 0, latest: 0 }
  }
  const sorted = [...points].sort((a, b) => {
    const ad = new Date(a.date ?? a.timestamp ?? 0).getTime()
    const bd = new Date(b.date ?? b.timestamp ?? 0).getTime()
    return ad - bd
  })
  const first = Number(sorted[0]?.value ?? 0)
  const latest = Number(sorted[sorted.length - 1]?.value ?? 0)
  return {
    count: sorted.length,
    delta: latest - first,
    latest,
  }
}
