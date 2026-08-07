import { asyncHandler } from '../utils/asyncHandler.js'
import * as draftService from '../services/draft.service.js'
import { validateDraft } from '../validators/draft.validator.js'
import { createElectionEvent } from '../services/election.service.js'
import { createCompetitionEvent } from '../services/pageant.service.js'
import { createPollEvent } from '../services/polling.service.js'
import { validateCreateEvent as validateElectionEvent } from '../validators/election.validator.js'
import { validateCompetitionEvent } from '../validators/competition.validator.js'
import { validatePollEvent } from '../validators/polling.validator.js'

// Module → { create service, create validator }. Validators that need an
// isCreate flag (competition/polling) pass `true` so the same validation rules
// as `POST /events` apply to publish.
const CREATE_MAP = {
  election: { create: createElectionEvent, validate: (body) => validateElectionEvent(body) },
  competition: { create: createCompetitionEvent, validate: (body) => validateCompetitionEvent(body, true) },
  polling: { create: createPollEvent, validate: (body) => validatePollEvent(body, true) },
}

/**
 * Handlers are factories bound to a module so each module router mounts the
 * same controller without string-matching on the URL. Ownership is enforced by
 * querying on `req.user.id` — an organizer can only reach their own drafts.
 */
export const getDraft = (module) =>
  asyncHandler(async (req, res) => {
    const draft = await draftService.getDraft(req.user.id, module)
    if (!draft) return res.json({ success: true, draft: null })
    res.json({ success: true, draft: mapDraft(draft) })
  })

export const saveDraft = (module) =>
  asyncHandler(async (req, res) => {
    const body = validateDraft(req.body)
    const draft = await draftService.saveDraft(req.user.id, module, body)
    res.json({ success: true, draft: mapDraft(draft) })
  })

export const deleteDraft = (module) =>
  asyncHandler(async (req, res) => {
    await draftService.deleteDraft(req.user.id, module)
    res.json({ success: true })
  })

export const publishDraft = (module) =>
  asyncHandler(async (req, res) => {
    const { create, validate } = CREATE_MAP[module]
    const payload = validate(req.body)
    const event = await draftService.publishDraft(req.user.id, module, create, payload)
    res.status(201).json({ success: true, event })
  })

function mapDraft(row) {
  return {
    id: row.id,
    module: row.module,
    step: row.step,
    title: row.title,
    banner: row.banner,
    payload: row.payload,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  }
}
