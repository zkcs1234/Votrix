import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import useTableFilter from './useTableFilter'

const rows = [
  { email: 'a@x.com', metadata: { program: 'BSCS', year: '4A' } },
  { email: 'b@x.com', metadata: { program: 'BSCS', year: '3B' } },
  { email: 'c@x.com', metadata: { program: 'BSIT', year: '4A' } },
]

const setup = (extra = {}) =>
  renderHook(() =>
    useTableFilter({
      rows,
      searchKeys: ['email', (r) => r.metadata.program],
      facetFields: [
        { id: 'program', label: 'Program', accessor: (r) => r.metadata.program },
        { id: 'year', label: 'Year', accessor: (r) => r.metadata.year },
      ],
      ...extra,
    }),
  )

describe('useTableFilter', () => {
  it('returns all rows with no search or filters', () => {
    const { result } = setup()
    expect(result.current.filtered).toHaveLength(3)
    expect(result.current.resultCount).toBe(3)
    expect(result.current.totalCount).toBe(3)
    expect(result.current.hasActiveFilters).toBe(false)
  })

  it('searches across every provided key (email + metadata)', () => {
    const { result } = setup()
    act(() => result.current.setSearch('BSIT'))
    expect(result.current.filtered).toHaveLength(1)
    expect(result.current.filtered[0].email).toBe('c@x.com')

    act(() => result.current.setSearch('a@x'))
    expect(result.current.filtered).toHaveLength(1)
  })

  it('search is case-insensitive', () => {
    const { result } = setup()
    act(() => result.current.setSearch('bscs'))
    expect(result.current.filtered).toHaveLength(2)
  })

  it('computes facet options with counts', () => {
    const { result } = setup()
    const program = result.current.facets.program
    expect(program).toEqual([
      { value: 'BSCS', count: 2 },
      { value: 'BSIT', count: 1 },
    ])
  })

  it('filters by a selected facet', () => {
    const { result } = setup()
    act(() => result.current.setFilter('program', 'BSCS'))
    expect(result.current.filtered).toHaveLength(2)
    expect(result.current.hasActiveFilters).toBe(true)
  })

  it('keeps other-facet counts accurate under an active facet', () => {
    const { result } = setup()
    act(() => result.current.setFilter('program', 'BSCS'))
    // Year counts should reflect only the BSCS rows (4A x1, 3B x1).
    expect(result.current.facets.year).toEqual(
      expect.arrayContaining([
        { value: '4A', count: 1 },
        { value: '3B', count: 1 },
      ]),
    )
    // The active program facet still shows the full split so you can switch.
    expect(result.current.facets.program).toEqual(
      expect.arrayContaining([
        { value: 'BSCS', count: 2 },
        { value: 'BSIT', count: 1 },
      ]),
    )
  })

  it('clearFilters resets search and selections', () => {
    const { result } = setup()
    act(() => {
      result.current.setSearch('BSCS')
      result.current.setFilter('year', '4A')
    })
    expect(result.current.hasActiveFilters).toBe(true)
    act(() => result.current.clearFilters())
    expect(result.current.search).toBe('')
    expect(result.current.filtered).toHaveLength(3)
    expect(result.current.hasActiveFilters).toBe(false)
  })
})
