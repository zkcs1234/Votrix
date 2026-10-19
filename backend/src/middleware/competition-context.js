import { childCompetitionsEnabled } from '../modules/competition-context.js'
import { legacyContext } from '../services/competition-child.service.js'
import { assertOrganizerOwnsEvent } from '../services/event.service.js'
import { requireEventParticipant } from './auth.js'
import { PARTICIPANT_TYPES } from '../utils/constants.js'

export function requireLegacyCompetitionContext({ parentResources = false, pageantDivisions = false, judge = false } = {}) {
  return (req, res, next) => {
    if (!childCompetitionsEnabled()) return next()
    // Details/branding/master-entry CRUD are unambiguous parent resources.
    if (parentResources && (/^\/$/.test(req.path) || /^\/(banner|contestants)(\/|$)/.test(req.path))) return next()
    const verify = async () => {
      try {
        const event = !judge ? await assertOrganizerOwnsEvent(req.params.eventId, req.user.id) : null
        const pageantDivisionRoute = /^\/(?:divisions(?:\/|$)|divisions-enabled$)/.test(req.path)
        if (pageantDivisions && pageantDivisionRoute && event?.competition_type === 'pageant') return next()
        req.legacyCompetitionContext = await legacyContext(req.params.eventId)
        next()
      } catch (error) { next(error) }
    }
    if (judge) requireEventParticipant(PARTICIPANT_TYPES.COMPETITION_JUDGE)(req, res, error => error ? next(error) : void verify())
    else void verify()
  }
}
