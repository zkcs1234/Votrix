import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { electionService } from '@/services/election.service'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import ElectionPositionSection from '@/components/voter/election/ElectionPositionSection'
import Button from '@/components/ui/Button'

function validateSelections(positions, selections) {
  for (const position of positions) {
    const selected = selections[position.id] ?? []
    const count = selected.length

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
  return null
}

export default function VoterEventPage() {
  const { eventId } = useParams()
  const [ballot, setBallot] = useState(null)
  const [selections, setSelections] = useState(() => {
    try {
      const saved = localStorage.getItem(`votrix_election_draft_${eventId}`)
      return saved ? JSON.parse(saved) : {}
    } catch {
      return {}
    }
  })
  const [skippedPositions, setSkippedPositions] = useState(() => {
    try {
      const saved = localStorage.getItem(`votrix_election_skipped_${eventId}`)
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
    localStorage.setItem(`votrix_election_draft_${eventId}`, JSON.stringify(selections))
    localStorage.setItem(
      `votrix_election_skipped_${eventId}`,
      JSON.stringify(Array.from(skippedPositions))
    )
  }, [eventId, selections, skippedPositions])

  useEffect(() => {
    electionService
      .getBallot(eventId)
      .then(({ data }) => {
        setBallot(data)
        if (data.hasVoted) setDone(true)
      })
      .finally(() => setLoading(false))
  }, [eventId])

  const positions = ballot?.positions ?? []
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
      localStorage.removeItem(`votrix_election_draft_${eventId}`)
      localStorage.removeItem(`votrix_election_skipped_${eventId}`)
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
    return (
      <div className="mx-auto max-w-lg v-card-lg text-center border-v-success">
        <p className="v-page-title text-v-success">Ballot submitted</p>
        <p className="v-caption mt-2">
          Your vote for {ballot?.event?.title} has been recorded and locked.
        </p>
        <Link to="/voter" className="v-btn-tertiary mt-6 inline-block">
          Back to dashboard
        </Link>
      </div>
    )
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
      <div>
        <Link to="/voter" className="v-btn-tertiary text-sm">
          ← Dashboard
        </Link>
        <h2 className="v-page-title mt-2">{ballot.event.title}</h2>
        {ballot.event.description && (
          <p className="v-caption mt-1">{ballot.event.description}</p>
        )}
      </div>

      <div className="v-card-sm">
        <div className="flex justify-between text-sm">
          <span className="v-caption">Ballot progress</span>
          <span className="v-caption">{progress}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-v-surface-elevated">
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