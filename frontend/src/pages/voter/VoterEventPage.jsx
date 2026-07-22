import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { electionService } from '@/services/election.service'
import { getDraftStorageKey } from '@/utils/draftStorage'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import ElectionPositionSection from '@/components/voter/election/ElectionPositionSection'
import Button from '@/components/ui/Button'
import VoterEventHeader from '@/components/voter/VoterEventHeader'

function validateSelections(positions, selections) {
  let hasAtLeastOneVote = false

  for (const position of positions) {
    const selected = selections[position.id] ?? []
    const count = selected.length

    if (count > 0) hasAtLeastOneVote = true

    if (count === 0 && position.allowSkip) continue
    if (count === 0) {
      return `Please vote for ${position.name} or skip the position.`
    }
    if (count < position.minVote) {
      return `${position.name}: select at least ${position.minVote} candidate(s).`
    }
    if (count > position.maxVote) {
      return `${position.name}: select at most ${position.maxVote} candidate(s).`
    }
  }

  if (!hasAtLeastOneVote) {
    return 'Your ballot must include at least one selection.'
  }

  return null
}

function BallotSubmittedScreen({ ballot, eventId }) {
  const [results, setResults] = useState(null)
  const [resultsLoading, setResultsLoading] = useState(Boolean(ballot?.canViewResults))
  const [resultsMessage, setResultsMessage] = useState(null)

  useEffect(() => {
    if (!ballot?.canViewResults) return undefined

    let alive = true
    electionService
      .getResults(eventId)
      .then(({ data }) => {
        if (alive) setResults(data.results ?? null)
      })
      .catch((err) => {
        if (alive) {
          setResultsMessage(err.response?.data?.message || 'Results are not available yet.')
        }
      })
      .finally(() => {
        if (alive) setResultsLoading(false)
      })

    return () => {
      alive = false
    }
  }, [ballot?.canViewResults, eventId])

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="v-card-lg text-center border-v-success">
        <p className="v-page-title text-v-success">Ballot submitted</p>
        <p className="v-caption mt-2">
          Your vote for {ballot?.event?.title} has been recorded and locked.
        </p>
        <Link to="/voter" className="v-btn-tertiary mt-6 inline-block">
          Back to dashboard
        </Link>
      </div>

      {ballot?.canViewResults && (
        <div className="v-card p-6 space-y-4">
          <h3 className="text-lg font-semibold text-v-text">Election results</h3>
          {resultsLoading && <LoadingSpinner />}
          {!resultsLoading && resultsMessage && (
            <p className="text-sm text-v-text-subtle">{resultsMessage}</p>
          )}
          {!resultsLoading && results?.positionSummaries?.map((position) => (
            <div key={position.positionId} className="rounded-xl border border-v-border p-4">
              <p className="font-medium text-v-text">{position.positionName}</p>
              <ul className="mt-3 space-y-2">
                {(position.candidates ?? []).map((candidate) => (
                  <li
                    key={candidate.candidateId}
                    className="flex items-center justify-between text-sm text-v-text-muted"
                  >
                    <span>{candidate.candidateName}</span>
                    <span>
                      {candidate.votes} vote{candidate.votes === 1 ? '' : 's'}
                      {candidate.votePercentage !== undefined
                        ? ` (${candidate.votePercentage}%)`
                        : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {ballot?.resultsVisibility === 'public' && !ballot?.canViewResults && (
        <p className="text-center text-sm text-v-text-subtle">
          Results will be available once voting closes.
        </p>
      )}
    </div>
  )
}

export default function VoterEventPage() {
  const { eventId } = useParams()
  const draftKey = getDraftStorageKey('electionDraft', eventId)
  const skippedDraftKey = getDraftStorageKey('electionSkipped', eventId)
  const [ballot, setBallot] = useState(null)
  const [selections, setSelections] = useState(() => {
    try {
      const saved = localStorage.getItem(draftKey)
      return saved ? JSON.parse(saved) : {}
    } catch {
      return {}
    }
  })
  const [skippedPositions, setSkippedPositions] = useState(() => {
    try {
      const saved = localStorage.getItem(skippedDraftKey)
      return saved ? new Set(JSON.parse(saved)) : new Set()
    } catch {
      return new Set()
    }
  })
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    localStorage.setItem(draftKey, JSON.stringify(selections))
    localStorage.setItem(skippedDraftKey, JSON.stringify(Array.from(skippedPositions)))
  }, [draftKey, skippedDraftKey, selections, skippedPositions])

  useEffect(() => {
    electionService
      .getBallot(eventId)
      .then(({ data }) => {
        setBallot(data)
        if (data.hasVoted) setDone(true)
      })
      .finally(() => setLoading(false))
  }, [eventId])

  const positions = useMemo(() => ballot?.positions ?? [], [ballot])
  const progress = useMemo(() => {
    if (!positions.length) return 0
    const filled = positions.filter((p) => {
      const sel = selections[p.id] ?? []
      return sel.length > 0 || skippedPositions.has(p.id)
    }).length
    return Math.round((filled / positions.length) * 100)
  }, [positions, selections, skippedPositions])

  const toggleCandidate = (positionId, candidateId, maxVote) => {
    setSkippedPositions((prev) => {
      const next = new Set(prev)
      next.delete(positionId)
      return next
    })
    setSelections((prev) => {
      const current = prev[positionId] ?? []
      const exists = current.includes(candidateId)
      let next

      if (exists) {
        next = current.filter((id) => id !== candidateId)
      } else if (maxVote === 1) {
        next = [candidateId]
      } else if (current.length < maxVote) {
        next = [...current, candidateId]
      } else {
        return prev
      }

      return { ...prev, [positionId]: next }
    })
  }

  const skipPosition = (positionId) => {
    setSkippedPositions((prev) => new Set(prev).add(positionId))
    setSelections((prev) => ({ ...prev, [positionId]: [] }))
  }

  const handleSubmit = async () => {
    const validationError = validateSelections(positions, selections)
    if (validationError) {
      setError(validationError)
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      await electionService.submitVote(eventId, selections)
      localStorage.removeItem(draftKey)
      localStorage.removeItem(skippedDraftKey)
      setDone(true)
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit ballot')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner />
      </div>
    )
  }

  if (done || ballot?.hasVoted) {
    return <BallotSubmittedScreen ballot={ballot} eventId={eventId} />
  }

  if (!ballot?.votingOpen) {
    return (
      <div className="mx-auto max-w-lg v-card-md text-center">
        <p className="v-body-text">Voting is not open for this event yet.</p>
        <p className="v-caption mt-2">Check back when the organizer opens voting.</p>
        <Link to="/voter" className="v-btn-tertiary mt-4 inline-block">
          Back to dashboard
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-28">
      <VoterEventHeader event={ballot.event} eyebrow="Election ballot" />

      <div className="v-card-sm">
        <div className="flex justify-between text-sm">
          <span className="v-caption">Ballot progress</span>
          <span className="v-caption">{progress}%</span>
        </div>
        <div
          className="mt-2 h-2 overflow-hidden rounded-full bg-v-surface-elevated"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          aria-label="Ballot progress"
        >
          <div className="h-full bg-v-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
        <p className="v-caption mt-2">
          {positions.length} position{positions.length !== 1 ? 's' : ''} on this ballot
        </p>
      </div>

      {positions.map((position) => (
        <ElectionPositionSection
          key={position.id}
          position={position}
          selectedIds={selections[position.id]}
          isSkipped={skippedPositions.has(position.id)}
          onToggle={toggleCandidate}
          onSkip={skipPosition}
          disabled={submitting}
        />
      ))}

      {error && <p className="text-sm text-v-danger">{error}</p>}

      <div className="fixed bottom-0 left-0 right-0 border-t border-v-border bg-v-surface p-4 md:static md:border-0 md:bg-transparent md:p-0">
        <Button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full md:w-auto"
        >
          {submitting ? 'Submitting...' : 'Submit ballot'}
        </Button>
        <p className="v-caption mt-2 text-center md:hidden">
          Once submitted, your ballot cannot be changed
        </p>
      </div>
    </div>
  )
}
