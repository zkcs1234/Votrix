import { asyncHandler } from '../utils/asyncHandler.js'
import * as electionService from '../services/election.service.js'
import { validateBallot } from '../validators/election.validator.js'

export const listMyEvents = asyncHandler(async (req, res) => {
  const events = await electionService.listVoterElectionEvents(req.user.id)
  res.json({ success: true, events })
})

export const getBallot = asyncHandler(async (req, res) => {
  const ballot = await electionService.getVoterBallot(req.params.eventId, req.user.id)
  res.json({ success: true, ...ballot })
})

export const getResults = asyncHandler(async (req, res) => {
  const results = await electionService.getVoterElectionResults(req.params.eventId, req.user.id)
  res.json({ success: true, results })
})

export const submitVote = asyncHandler(async (req, res) => {
  const selections = validateBallot(req.body)
  const result = await electionService.submitBallot(
    req.params.eventId,
    req.user.id,
    selections,
  )
  res.json(result)
})
