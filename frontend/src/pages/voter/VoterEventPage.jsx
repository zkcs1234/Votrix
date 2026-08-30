import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { electionService } from '@/services/election.service'
import { getDraftStorageKey } from '@/utils/draftStorage'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import ElectionPositionSection from '@/components/voter/election/ElectionPositionSection'
import Button from '@/components/ui/Button'
import VoterEventHeader from '@/components/voter/VoterEventHeader'
import ParticipantInformationGate from '@/components/voter/ParticipantInformationGate'
import ElectionResultsCard from '@/components/voter/ElectionResultsCard'
import FullscreenVotingShell from '@/components/voter/FullscreenVotingShell'

function validateSelections(positions, selections) {
  let hasAtLeastOneVote = false

  for (const position of positions) {
    const selected = selections[position.id] ?? []
    const count = selected.length

    if (count > 0) hasAtLeastOneVote = true

    if (count === 0) {
      return `Please vote for ${position.name}.`
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
        <>
          {resultsLoading && <LoadingSpinner />}
          {!resultsLoading && resultsMessage && (
            <p className="text-sm text-v-text-subtle">{resultsMessage}</p>
          )}
          {!resultsLoading && !resultsMessage && (
            <ElectionResultsCard
              results={results}
              electionTitle={ballot?.event?.title}
              resultsVisibility={ballot?.resultsVisibility}
            />
          )}
        </>
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
  const [ballot, setBallot] = useState(null)
  const [selections, setSelections] = useState(() => {
    try {
      const saved = localStorage.getItem(draftKey)
      return saved ? JSON.parse(saved) : {}
    } catch {
      return {}
    }
  })
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    localStorage.setItem(draftKey, JSON.stringify(selections))
  }, [draftKey, selections])

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
      return sel.length > 0
    }).length
    return Math.round((filled / positions.length) * 100)
  }, [positions, selections])

  const toggleCandidate = (positionId, candidateId, maxVote) => {
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



  const [isReviewing, setIsReviewing] = useState(false)

  const handleStartReview = () => {
    const validationError = validateSelections(positions, selections)
    if (validationError) {
      setError(validationError)
      return
    }
    setError(null)
    setIsReviewing(true)
  }

  const handleSubmit = async () => {
    const validationError = validateSelections(positions, selections)
    if (validationError) {
      setError(validationError)
      setIsReviewing(false)
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      await electionService.submitVote(eventId, {
        selections,
        votingNonce: ballot?.votingNonce,
      })
      localStorage.removeItem(draftKey)
      setDone(true)
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit ballot')
      setIsReviewing(false)
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
    /*
      Full-viewport shell using dynamic viewport height (dvh) so mobile
      browser toolbars showing/hiding never shift the fixed footer.
      Layout: [fixed progress bar] · [scrollable middle] · [fixed footer]
      Portaled to <body> so `position: fixed` pins to the viewport (see
      FullscreenVotingShell) — otherwise the animated <main> traps it and the
      progress bar and submit footer cannot both stay on screen on mobile.
    */
    <FullscreenVotingShell>
    <div className="fixed inset-0 z-50 flex flex-col h-[100dvh] bg-v-surface">
      {/* ===== FIXED TOP: Progress bar only (does not scroll) ===== */}
      {!isReviewing && (
        <div className="shrink-0 border-b border-v-border bg-v-surface">
          <div className="mx-auto max-w-2xl px-4 py-3 md:px-8">
            <div className="v-card-sm">
              <div className="flex items-center justify-between text-sm">
                <span className="v-caption">Ballot progress</span>
                <span className="v-caption font-medium">{progress}%</span>
              </div>
              <div
                className="mt-2 h-2 overflow-hidden rounded-full bg-v-surface-elevated"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
                aria-label="Ballot progress"
              >
                <div className="h-full bg-v-primary transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
              <p className="v-caption mt-2">
                {positions.length} position{positions.length !== 1 ? 's' : ''} on this ballot
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ===== SCROLLABLE MIDDLE: header + ballot content scroll here ===== */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 md:px-8">
          <VoterEventHeader event={ballot.event} eyebrow="Election ballot" />

          {!done && !ballot?.hasVoted && <ParticipantInformationGate eventId={eventId} />}

          {isReviewing ? (
            <div className="v-card p-6 space-y-6">
              <div className="border-b border-v-border pb-4">
                <h2 className="text-xl font-semibold text-v-text">Review your ballot</h2>
                <p className="v-caption mt-1">Please confirm your selections before submitting.</p>
              </div>

              <div className="space-y-4">
                {positions.map((position) => {
                  const selectedCandidateIds = selections[position.id] ?? []
                  const selectedCandidates = position.candidates.filter((c) =>
                    selectedCandidateIds.includes(c.id),
                  )
                  const isUnanswered = selectedCandidates.length === 0

                  return (
                    <div key={position.id} className="rounded-xl border border-v-border p-4 bg-v-surface-elevated">
                      <p className="font-medium text-v-text text-sm">{position.name}</p>
                      {isUnanswered ? (
                        <p className="mt-1 text-xs text-v-danger font-medium">No selection</p>
                      ) : (
                        <ul className="mt-2 space-y-1">
                          {selectedCandidates.map((cand) => (
                            <li key={cand.id} className="text-xs text-v-text-muted flex items-center gap-2">
                              <span className="text-v-primary">✓</span>
                              <span className="font-medium text-v-text">{cand.name}</span>
                              {(cand.party || cand.partylist) && (
                                <span className="text-v-text-subtle">({cand.party || cand.partylist})</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )
                })}
              </div>

              {error && <p className="text-sm text-v-danger">{error}</p>}
            </div>
          ) : (
            <>
              {positions.map((position) => (
                <ElectionPositionSection
                  key={position.id}
                  position={position}
                  selectedIds={selections[position.id]}
                  onToggle={toggleCandidate}
                  disabled={submitting}
                />
              ))}

              {error && <p className="text-sm text-v-danger">{error}</p>}
            </>
          )}
        </div>
      </div>

      {/* ===== FIXED BOTTOM: Submit footer (does not scroll) ===== */}
      <div className="shrink-0 border-t border-v-border bg-v-surface px-4 py-3 shadow-v-shadow md:px-8 pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto max-w-2xl">
          {isReviewing ? (
            <div className="flex flex-wrap gap-3 justify-end">
              <Button
                variant="secondary"
                onClick={() => setIsReviewing(false)}
                disabled={submitting}
              >
                Back to editing
              </Button>
              <Button onClick={handleSubmit} loading={submitting} disabled={submitting}>
                Confirm & Submit ballot
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Button
                onClick={handleStartReview}
                disabled={submitting}
                className="w-full"
              >
                Review ballot
              </Button>
              <p className="text-xs text-center text-v-text-subtle">
                Review your selections before final submission
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
    </FullscreenVotingShell>
  )
}
