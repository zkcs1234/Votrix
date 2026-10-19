import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('../../src/services/admin.service.js', () => ({
  getSystemSettings: vi.fn(),
  saveSystemSetting: vi.fn(),
}))

import { getSystemSettings, saveSystemSetting } from '../../src/services/admin.service.js'
import {
  getParticipantTaxonomy,
  normalizeParticipantSection,
  updateParticipantTaxonomy,
} from '../../src/services/participant-taxonomy.service.js'

describe('participant taxonomy section normalization', () => {
  beforeEach(() => vi.clearAllMocks())

  test.each([
    ['3A', '3-A'],
    ['3-A', '3-A'],
    ['3 - a', '3-A'],
    ['11b', '11-B'],
    ['Main Hall', 'Main Hall'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeParticipantSection(input)).toBe(expected)
  })

  test('canonicalizes and deduplicates existing taxonomy values when read', async () => {
    getSystemSettings.mockResolvedValue([{
      setting_key: 'participant_taxonomy',
      setting_value: { programs: ['BSIT'], sections: ['3A', '3-A', '4B'] },
    }])

    await expect(getParticipantTaxonomy()).resolves.toEqual({
      programs: ['BSIT'],
      sections: ['3-A', '4-B'],
    })
  })

  test('persists canonical section values when taxonomy is updated', async () => {
    saveSystemSetting.mockResolvedValue(undefined)

    await expect(updateParticipantTaxonomy({ programs: [], sections: ['3A', '4-B'] }))
      .resolves.toEqual({ programs: [], sections: ['3-A', '4-B'] })
    expect(saveSystemSetting).toHaveBeenCalledWith(
      'participant_taxonomy',
      { programs: [], sections: ['3-A', '4-B'] },
      expect.any(String),
    )
  })
})