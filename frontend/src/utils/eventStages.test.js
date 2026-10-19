import { describe, expect, it } from 'vitest'
import { getStageProgressStatus, stagePath } from './eventStages'

describe('getStageProgressStatus', () => {
  it.each(['election', 'competition', 'polling'])(
    'marks setup stages completed and result stages available for published %s events',
    (module) => {
      const firstSetupStage = {
        election: 'positions',
        competition: 'contestants',
        polling: 'builder',
      }[module]
      const resultStage = module === 'competition' ? 'rankings' : 'analytics'

      expect(
        getStageProgressStatus(module, firstSetupStage, { eventStatus: 'active' }),
      ).toBe('Completed')
      expect(
        getStageProgressStatus(module, resultStage, { eventStatus: 'active' }),
      ).toBe('Available')
    },
  )

  it('shows the current read-only stage as viewing without changing its completion state', () => {
    expect(
      getStageProgressStatus('election', 'details', {
        currentKey: 'details',
        eventStatus: 'active',
        readOnly: true,
      }),
    ).toBe('Viewing')
  })

  it('keeps unvisited draft stages not started and honors saved completion', () => {
    expect(
      getStageProgressStatus('polling', 'builder', { eventStatus: 'draft' }),
    ).toBe('Not started')
    expect(
      getStageProgressStatus('polling', 'branding', {
        eventStatus: 'draft',
        completedKeys: ['branding'],
      }),
    ).toBe('Completed')
  })
  it.each(['election', 'competition', 'polling'])('uses mounted create routes for %s and requires an ID for saved setup', module => {
    expect(stagePath(module, 'details', 'new')).toBe(`/organizer/${module}/events/new`)
    expect(stagePath(module, 'branding', 'new')).toBe(`/organizer/${module}/events/new/branding`)
    expect(stagePath(module, module === 'competition' ? 'workspace' : module === 'election' ? 'positions' : 'builder', 'new')).toBeNull()
  })
})
