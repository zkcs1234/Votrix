import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const sql = readFileSync(
  fileURLToPath(new URL('../../src/database/migrations/145_student_type_election_poll_functions.sql', import.meta.url)),
  'utf8',
)

describe('migration 145 (STUDENT-aware election and poll functions)', () => {
  test('redefines the four functions that gate voting and responding', () => {
    for (const name of [
      'election_group_is_eligible',
      'set_election_group_eligibility',
      'cast_election_ballot',
      'cast_poll_response',
    ]) {
      expect(sql).toContain(`CREATE OR REPLACE FUNCTION ${name}(`)
    }
  })

  test('never matches only a legacy participant type again', () => {
    expect(sql).not.toMatch(/participant_type\s*=\s*'(ELECTION_VOTER|POLLING_RESPONDENT)'/)
    expect(sql.match(/IN \('STUDENT', 'ELECTION_VOTER'\)/g)).toHaveLength(4)
    expect(sql.match(/IN \('STUDENT', 'POLLING_RESPONDENT'\)/g)).toHaveLength(2)
  })
})
