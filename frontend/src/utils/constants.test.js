import { describe, it, expect } from 'vitest'
import {
  EVENT_STATUS,
  isSetupLocked,
  isParticipantsLocked,
  canUnpublishEventStatus,
  isReadOnlyEventStatus,
} from './constants'

// Locks the staged edit-locking model shipped for the publish-before-invite work.
describe('event lifecycle edit-locking', () => {
  describe('isSetupLocked', () => {
    it('is unlocked only while draft', () => {
      expect(isSetupLocked(EVENT_STATUS.DRAFT)).toBe(false)
    })

    it('is locked once published or beyond', () => {
      expect(isSetupLocked(EVENT_STATUS.SCHEDULED)).toBe(true)
      expect(isSetupLocked(EVENT_STATUS.ACTIVE)).toBe(true)
      expect(isSetupLocked(EVENT_STATUS.COMPLETED)).toBe(true)
      expect(isSetupLocked(EVENT_STATUS.CANCELLED)).toBe(true)
    })

    it('treats unknown/null status as locked (fail safe)', () => {
      expect(isSetupLocked(null)).toBe(true)
      expect(isSetupLocked(undefined)).toBe(true)
    })
  })

  describe('isParticipantsLocked', () => {
    it('stays editable through draft and scheduled (the resend window)', () => {
      expect(isParticipantsLocked(EVENT_STATUS.DRAFT)).toBe(false)
      expect(isParticipantsLocked(EVENT_STATUS.SCHEDULED)).toBe(false)
    })

    it('locks once voting/scoring is active and after', () => {
      expect(isParticipantsLocked(EVENT_STATUS.ACTIVE)).toBe(true)
      expect(isParticipantsLocked(EVENT_STATUS.COMPLETED)).toBe(true)
      expect(isParticipantsLocked(EVENT_STATUS.CANCELLED)).toBe(true)
    })
  })

  describe('canUnpublishEventStatus', () => {
    it('allows unpublish only while scheduled', () => {
      expect(canUnpublishEventStatus(EVENT_STATUS.SCHEDULED)).toBe(true)
    })

    it('disallows unpublish in every other state', () => {
      expect(canUnpublishEventStatus(EVENT_STATUS.DRAFT)).toBe(false)
      expect(canUnpublishEventStatus(EVENT_STATUS.ACTIVE)).toBe(false)
      expect(canUnpublishEventStatus(EVENT_STATUS.COMPLETED)).toBe(false)
      expect(canUnpublishEventStatus(null)).toBe(false)
    })
  })

  describe('isReadOnlyEventStatus (terminal states)', () => {
    it('is true only for completed/cancelled', () => {
      expect(isReadOnlyEventStatus(EVENT_STATUS.COMPLETED)).toBe(true)
      expect(isReadOnlyEventStatus(EVENT_STATUS.CANCELLED)).toBe(true)
      expect(isReadOnlyEventStatus(EVENT_STATUS.DRAFT)).toBe(false)
      expect(isReadOnlyEventStatus(EVENT_STATUS.SCHEDULED)).toBe(false)
      expect(isReadOnlyEventStatus(EVENT_STATUS.ACTIVE)).toBe(false)
    })
  })
})
