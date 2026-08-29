// M4 — Competition scoring integration harness (real database).
//
// The unit/service suites mock Supabase, so they verify orchestration but not
// that the queries are valid against the ACTUAL schema. This harness runs the
// real service functions against a real Postgres/Supabase and is the layer that
// catches wrong columns, missing constraints, and migration drift.
//
// It is SKIPPED unless a test database is configured, so the normal `npm test`
// run stays fast and hermetic. To run it:
//
//   1. Point a disposable Supabase/Postgres at the repo and apply every
//      migration in src/database/migrations (through 058).
//   2. Set the env the app already reads (SUPABASE_URL + service key, or the
//      project's DATABASE_URL) AND set RUN_DB_INTEGRATION=1.
//   3. npx vitest run __tests__/integration
//
// Seeding a full event (organizer, event, contestants, judges, criteria, rounds,
// scores) is intentionally left to a fixtures helper so this file documents the
// contract without hard-coding one project's IDs.

import { describe, test, expect, beforeAll } from 'vitest'

const ENABLED = process.env.RUN_DB_INTEGRATION === '1'
const d = ENABLED ? describe : describe.skip

d('competition scoring — real database', () => {
  let services

  beforeAll(async () => {
    // Imported lazily so the mocked suites never pull a live client.
    services = {
      session: await import('../../src/services/competition-session.service.js'),
      pageant: await import('../../src/services/pageant.service.js'),
    }
  })

  test('service module loads against the real client', () => {
    expect(typeof services.session.finalizeRound).toBe('function')
    expect(typeof services.pageant.getCompetitionResults).toBe('function')
  })

  // The checks below require a seeded event id in TEST_EVENT_ID + organizer id in
  // TEST_ORGANIZER_ID (created by your fixtures step). They exercise the exact
  // query shapes the mocked suites can't validate.
  const hasFixture = Boolean(process.env.TEST_EVENT_ID && process.env.TEST_ORGANIZER_ID)
  const f = hasFixture ? test : test.skip

  f('getLiveRankings returns a well-formed shape (validates every query column)', async () => {
    const res = await services.pageant.getLiveRankings(
      process.env.TEST_EVENT_ID,
      process.env.TEST_ORGANIZER_ID,
    )
    expect(res).toHaveProperty('rankings')
    expect(res).toHaveProperty('judges')
    expect(Array.isArray(res.rankings)).toBe(true)
  })

  f('getCompetitionResults assembles without query errors', async () => {
    const res = await services.pageant.getCompetitionResults(
      process.env.TEST_EVENT_ID,
      process.env.TEST_ORGANIZER_ID,
    )
    expect(res).toHaveProperty('overall')
    expect(res).toHaveProperty('categoryAwards')
    expect(res).toHaveProperty('rounds')
  })
})
