// Phase 1–2 — Competition template catalog integrity.
//
// Guards against shipping a preset that would seed an event that can't open
// scoring: each template's category / round / criteria weights must be
// internally valid per §8A (100% within their axis when present).

import { describe, test, expect } from 'vitest'
import {
  listTemplates,
  getTemplate,
  isValidCompetitionType,
  COMPETITION_TYPES,
} from '../../src/modules/competition-templates.js'

const sum = (arr, key) => arr.reduce((s, x) => s + Number(x[key] ?? 0), 0)

describe('competition templates: catalog', () => {
  test('every declared type resolves to a template', () => {
    for (const key of COMPETITION_TYPES) {
      expect(getTemplate(key)).toBeTruthy()
    }
  })

  test('isValidCompetitionType accepts catalog keys and null, rejects junk', () => {
    expect(isValidCompetitionType(null)).toBe(true)
    expect(isValidCompetitionType(undefined)).toBe(true)
    expect(isValidCompetitionType('pageant')).toBe(true)
    expect(isValidCompetitionType('not-a-type')).toBe(false)
  })

  test('getTemplate returns null for unknown/empty keys', () => {
    expect(getTemplate('nope')).toBeNull()
    expect(getTemplate('')).toBeNull()
    expect(getTemplate(null)).toBeNull()
  })
})

describe('competition templates: weight invariants (§8A)', () => {
  for (const t of listTemplates()) {
    describe(t.key, () => {
      test('categories sum to 100% when present', () => {
        if (t.categories.length) expect(sum(t.categories, 'weight')).toBeCloseTo(100, 5)
      })
      test('rounds sum to 100% when present', () => {
        if (t.rounds.length) expect(sum(t.rounds, 'weight')).toBeCloseTo(100, 5)
      })
      test('criteria sum to 100% when present', () => {
        if (t.criteria.length) expect(sum(t.criteria, 'percentage')).toBeCloseTo(100, 5)
      })
      test('has a valid scoring config', () => {
        expect(t.scoringConfig?.scoreType).toBeTruthy()
        expect(t.scoringConfig?.calculationMethod).toBeTruthy()
      })
    })
  }
})
