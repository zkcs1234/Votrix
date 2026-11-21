import { expect, test } from 'vitest'
import { dateStamp, exportFileName, slugify } from './exportFilename'

test('slugify keeps names readable and filesystem-safe', () => {
  expect(slugify('Hip-Hop Battle: Final Round!')).toBe('hip-hop-battle-final-round')
  expect(slugify('Café Royale')).toBe('cafe-royale')
  expect(slugify('')).toBe('')
  expect(slugify('a'.repeat(60))).toHaveLength(40)
})

test('dateStamp uses the local calendar date, zero-padded', () => {
  expect(dateStamp(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
})

test('file names read as competition, round, kind and date', () => {
  const date = new Date(2026, 10, 21)
  expect(exportFileName({ competition: 'Hip Hop Battle', round: 'Final Round', kind: 'score-matrix', ext: 'xlsx', date }))
    .toBe('hip-hop-battle-final-round-score-matrix-2026-11-21.xlsx')
  expect(exportFileName({ competition: '', round: '', kind: 'judge-sheets', ext: 'csv', date }))
    .toBe('competition-judge-sheets-2026-11-21.csv')
})
