import { describe, expect, test } from 'vitest'
import {
  eventUrl,
  participantEventUrl,
  pollingEventUrl,
  competitionScoreUrl,
} from '../../src/utils/urls.js'

describe('participant event URLs', () => {
  test('maps each participant module to its frontend route', () => {
    expect(participantEventUrl('election-1', 'election')).toBe(eventUrl('election-1'))
    expect(participantEventUrl('poll-1', 'polling')).toBe(pollingEventUrl('poll-1'))
    expect(participantEventUrl('pageant-1', 'pageant')).toBe(competitionScoreUrl('pageant-1'))
    expect(participantEventUrl('competition-1', 'competition_scoring')).toBe(
      competitionScoreUrl('competition-1'),
    )
  })
})
