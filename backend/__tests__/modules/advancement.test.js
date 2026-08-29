// Phase 6 — advancement selection (pure).

import { describe, test, expect } from 'vitest'
import { selectQualifiers, applyQualifierOverride } from '../../src/modules/advancement.js'

// standing sorted by rank asc; ranks use standard-competition "1224".
const standing = [
  { contestantId: 'a', rank: 1, score: 95 },
  { contestantId: 'b', rank: 2, score: 90 },
  { contestantId: 'c', rank: 3, score: 80 },
  { contestantId: 'd', rank: 4, score: 70 },
  { contestantId: 'e', rank: 5, score: 60 },
]

const ids = (set) => [...set].sort()

describe('selectQualifiers', () => {
  test('none → everyone continues', () => {
    expect(ids(selectQualifiers(standing, 'none'))).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  test('top_n picks the top N by rank', () => {
    expect(ids(selectQualifiers(standing, 'top_n', 3))).toEqual(['a', 'b', 'c'])
  })

  test('top_n includes boundary ties (all sharing the cutoff rank advance)', () => {
    const tied = [
      { contestantId: 'a', rank: 1, score: 95 },
      { contestantId: 'b', rank: 2, score: 90 },
      { contestantId: 'c', rank: 3, score: 80 },
      { contestantId: 'd', rank: 3, score: 80 }, // tied for 3rd
      { contestantId: 'e', rank: 5, score: 60 },
    ]
    // Top 3 → cutoff rank is 3, so both c and d qualify (4 total).
    expect(ids(selectQualifiers(tied, 'top_n', 3))).toEqual(['a', 'b', 'c', 'd'])
  })

  test('top_percent picks ceil(count * pct)', () => {
    // 5 contestants, 50% → ceil(2.5) = 3
    expect(ids(selectQualifiers(standing, 'top_percent', 50))).toEqual(['a', 'b', 'c'])
  })

  test('threshold qualifies by minimum score', () => {
    expect(ids(selectQualifiers(standing, 'threshold', 80))).toEqual(['a', 'b', 'c'])
  })

  test('manual auto-qualifies nobody', () => {
    expect(ids(selectQualifiers(standing, 'manual', 3))).toEqual([])
  })

  test('empty / invalid inputs return an empty set', () => {
    expect(selectQualifiers([], 'top_n', 3).size).toBe(0)
    expect(selectQualifiers(standing, 'top_n', 0).size).toBe(0)
    expect(selectQualifiers(standing, 'top_n', 'x').size).toBe(0)
  })
})

describe('applyQualifierOverride', () => {
  test('adds and removes contestants (organizer discretion)', () => {
    const base = selectQualifiers(standing, 'top_n', 2) // a, b
    const out = applyQualifierOverride(base, { add: ['e'], remove: ['b'] })
    expect(ids(out)).toEqual(['a', 'e'])
  })

  test('no override returns an equivalent set', () => {
    const base = selectQualifiers(standing, 'top_n', 2)
    expect(ids(applyQualifierOverride(base, null))).toEqual(['a', 'b'])
  })
})
