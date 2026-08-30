// Phase 5 — template weight invariants. A template must seed an immediately-valid
// event, so its weights have to be internally consistent (per §8A):
//   - categories (if any) total 100
//   - rounds (if any) total 100
//   - each round that carries its own criteria totals 100 WITHIN that round
//   - flat top-level criteria (if any) total 100
//   - a template uses EITHER per-round criteria OR flat criteria, not both

import { describe, test, expect } from 'vitest'
import { listTemplates, getTemplate } from '../../src/modules/competition-templates.js'

const sum = (arr, key) => (arr ?? []).reduce((s, x) => s + Number(x[key] ?? 0), 0)
const near100 = (n) => Math.abs(n - 100) < 0.01

describe('competition templates — weight invariants', () => {
  for (const t of listTemplates()) {
    describe(`${t.key}`, () => {
      const full = getTemplate(t.key)

      test('categories total 100% when present', () => {
        if (full.categories?.length) expect(near100(sum(full.categories, 'weight'))).toBe(true)
      })

      test('rounds total 100% when present', () => {
        if (full.rounds?.length) expect(near100(sum(full.rounds, 'weight'))).toBe(true)
      })

      test('each round with its own criteria totals 100% within the round', () => {
        for (const r of full.rounds ?? []) {
          if (r.criteria?.length) expect(near100(sum(r.criteria, 'percentage'))).toBe(true)
        }
      })

      test('flat criteria total 100% when present', () => {
        if (full.criteria?.length) expect(near100(sum(full.criteria, 'percentage'))).toBe(true)
      })

      test('does not mix per-round criteria with flat criteria', () => {
        const hasPerRound = (full.rounds ?? []).some((r) => r.criteria?.length)
        const hasFlat = (full.criteria ?? []).length > 0
        expect(hasPerRound && hasFlat).toBe(false)
      })
    })
  }
})
