/**
 * Feature modules (admin, election, competition_scoring, polling, voter)
 *
 * The legacy 'pageant' module has been renamed to 'competition_scoring'.
 * Re-exports keep existing imports working until the rest of the codebase
 * catches up.
 */
export { getOrCreateCompetitionScoringOrganization as getOrCreatePageantOrganization } from '../services/organization.service.js'
