import { useCallback, useMemo, useState } from 'react'

// Read a value from a row using either an accessor function or a dotted path
// string (e.g. 'email' or 'metadata.program').
function getValue(row, accessor) {
  if (typeof accessor === 'function') return accessor(row)
  if (typeof accessor === 'string') {
    return accessor.split('.').reduce((obj, key) => (obj == null ? obj : obj[key]), row)
  }
  return undefined
}

/**
 * Shared client-side table filtering: multi-field text search plus faceted
 * filters with live counts. One primitive so every list (participants,
 * contestants, candidates, admin tables) filters and counts the same way.
 *
 * @param {object}   opts
 * @param {Array}    opts.rows          Full dataset.
 * @param {Array}    opts.searchKeys    Accessors (fn or dotted path) matched against the search text.
 * @param {Array}    opts.facetFields   [{ id, label, accessor }] — each renders a filter with counts.
 * @param {string}   [opts.initialSearch]
 *
 * @returns {{
 *   search: string, setSearch: (v: string) => void,
 *   activeFilters: Record<string, string>, setFilter: (id: string, v: string) => void, clearFilters: () => void,
 *   filtered: Array, facets: Record<string, {value: string, count: number}[]>,
 *   resultCount: number, totalCount: number, hasActiveFilters: boolean,
 * }}
 */
export default function useTableFilter({
  rows = [],
  searchKeys = [],
  facetFields = [],
  initialSearch = '',
}) {
  const [search, setSearch] = useState(initialSearch)
  const [activeFilters, setActiveFilters] = useState({})

  const setFilter = useCallback((fieldId, value) => {
    setActiveFilters((prev) => {
      const next = { ...prev }
      if (value === '' || value == null) delete next[fieldId]
      else next[fieldId] = value
      return next
    })
  }, [])

  const clearFilters = useCallback(() => {
    setSearch('')
    setActiveFilters({})
  }, [])

  const q = search.trim().toLowerCase()

  const matchesSearch = useCallback(
    (row) => {
      if (!q) return true
      return searchKeys.some((key) => {
        const v = getValue(row, key)
        return v != null && String(v).toLowerCase().includes(q)
      })
    },
    [q, searchKeys],
  )

  const matchesFacets = useCallback(
    (row, exceptFieldId = null) =>
      Object.entries(activeFilters).every(([fid, val]) => {
        if (fid === exceptFieldId) return true
        const field = facetFields.find((f) => f.id === fid)
        if (!field) return true
        return String(getValue(row, field.accessor) ?? '') === String(val)
      }),
    [activeFilters, facetFields],
  )

  const filtered = useMemo(
    () => rows.filter((row) => matchesSearch(row) && matchesFacets(row)),
    [rows, matchesSearch, matchesFacets],
  )

  // Facet options with counts, computed over rows matching the current search
  // and every OTHER active facet — so drill-down counts stay accurate (pick
  // Program=BSCS, then Year still shows counts within BSCS).
  const facets = useMemo(() => {
    const out = {}
    for (const field of facetFields) {
      const counts = new Map()
      for (const row of rows) {
        if (!matchesSearch(row)) continue
        if (!matchesFacets(row, field.id)) continue
        const raw = getValue(row, field.accessor)
        if (raw == null || raw === '') continue
        const value = String(raw)
        counts.set(value, (counts.get(value) ?? 0) + 1)
      }
      out[field.id] = [...counts.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    }
    return out
  }, [rows, facetFields, matchesSearch, matchesFacets])

  return {
    search,
    setSearch,
    activeFilters,
    setFilter,
    clearFilters,
    filtered,
    facets,
    resultCount: filtered.length,
    totalCount: rows.length,
    hasActiveFilters: q.length > 0 || Object.keys(activeFilters).length > 0,
  }
}
