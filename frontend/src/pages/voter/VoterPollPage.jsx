import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { pollingService } from '@/services/polling.service'
import { validatePollAnswers } from '@/utils/pollValidation'
import { getDraftStorageKey } from '@/utils/draftStorage'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import Button from '@/components/ui/Button'
import ParticipantInformationGate from '@/components/voter/ParticipantInformationGate'
import PollQuestionField from '@/components/voter/polling/PollQuestionField'
import VoterEventHeader from '@/components/voter/VoterEventHeader'

export default function VoterPollPage() {
  const { eventId } = useParams()
  const draftKey = getDraftStorageKey('pollDraft', eventId)

  // Check for saved draft outside of state initializer
  const savedDraft = (() => {
    try {
      const saved = localStorage.getItem(draftKey)
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  })()

  const [draftRestored, setDraftRestored] = useState(Boolean(savedDraft))
  const [poll, setPoll] = useState(null)
  const [answers, setAnswers] = useState(savedDraft ?? {})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
const [done, setDone] = useState(false)
  const [startedAt] = useState(() => new Date().toISOString())

  // Auto-dismiss the draft restoration toast after 4 seconds
  useEffect(() => {
    if (draftRestored) {
      const timer = setTimeout(() => setDraftRestored(false), 4000)
      return () => clearTimeout(timer)
    }
  }, [draftRestored])

  const loadPoll = useCallback(() => {
    return pollingService.getPoll(eventId).then(({ data }) => {
      setPoll(data)
      if (!data.canSubmit && data.submissionCount > 0) setDone(true)
      return data
    })
  }, [eventId])

  useEffect(() => {
    loadPoll().finally(() => setLoading(false))
  }, [loadPoll])

  useEffect(() => {
    localStorage.setItem(draftKey, JSON.stringify(answers))
  }, [draftKey, answers])

  const questions = useMemo(() => poll?.questions ?? [], [poll])

  const answeredCount = useMemo(() => {
    return questions.filter((q) => {
      const val = answers[q.id]
      if (val === undefined || val === null || val === '') return false
      if (Array.isArray(val)) return val.length > 0
      return true
    }).length
  }, [questions, answers])

  const progressPercent = useMemo(() => {
    if (!questions.length) return 0
    return Math.round((answeredCount / questions.length) * 100)
  }, [answeredCount, questions.length])

  const setAnswer = (questionId, value) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    const validationError = validatePollAnswers(questions, answers)
    if (validationError) {
      setError(validationError)
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      await pollingService.submitPoll(eventId, answers, { startedAt })
      localStorage.removeItem(draftKey)
      setDone(true)
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit')
    } finally {
      setSubmitting(false)
    }
  }

  const handleAnother = async () => {
    setDone(false)
    setAnswers({})
    setLoading(true)
    await loadPoll()
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner />
      </div>
    )
  }

  if (done) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-emerald-900/50 bg-emerald-950/30 p-8 text-center">
        <p className="text-lg font-semibold text-emerald-300">Response submitted</p>
        <p className="mt-2 text-sm text-v-text-subtle">
          Thank you for completing {poll?.event?.title}.
        </p>
        {poll?.event?.pollAllowMultipleSubmissions && poll?.pollOpen && (
          <button
            type="button"
            onClick={handleAnother}
            className="mt-4 text-v-text-muted text-sm hover:text-v-text"
          >
            Submit another response
          </button>
        )}
        <Link to="/voter" className="mt-6 block text-v-text-muted hover:text-v-text">
          Back to dashboard
        </Link>
      </div>
    )
  }

  if (!poll?.pollOpen) {
    return (
      <div className="mx-auto max-w-lg v-card p-8 text-center">
        <p className="text-v-text">This poll is closed or has expired.</p>
        {poll?.event?.startDate && poll?.event?.endDate && (
          <p className="mt-2 text-sm text-v-text-subtle">
            This poll was open from{' '}
            {new Date(poll.event.startDate).toLocaleDateString()} to{' '}
            {new Date(poll.event.endDate).toLocaleDateString()}.
          </p>
        )}

        <Link to="/voter" className="mt-4 inline-block text-v-text-muted">
          Back to dashboard
        </Link>
      </div>
    )
  }

  if (!poll?.canSubmit) {
    return (
      <div className="mx-auto max-w-lg v-card p-8 text-center">
        <p className="text-v-text">You have already responded to this poll.</p>
        <Link to="/voter" className="mt-4 inline-block text-v-text-muted">
          Back to dashboard
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* Fixed Progress Bar at Top */}
      <div className="sticky top-0 z-40 border-b border-v-border bg-v-background shadow-sm">
        <div className="mx-auto max-w-2xl px-4 py-3 md:px-8">
          <div className="v-card-sm">
            <div className="flex items-center justify-between text-sm">
              <span className="text-v-text-muted">
                {answeredCount} of {questions.length} questions answered
              </span>
              <span className="text-v-text-muted font-semibold">{progressPercent}%</span>
            </div>
            <div
              className="mt-2 h-2 overflow-hidden rounded-full bg-v-surface-elevated"
              role="progressbar"
              aria-valuenow={progressPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Poll progress"
            >
              <div
                className="h-full rounded-full bg-v-primary transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 md:px-8 pb-32">
        {/* Autosave restoration notification */}
        {draftRestored && (
          <div
            className="rounded-lg border border-v-border bg-v-surface-elevated px-4 py-3 text-sm text-v-text-muted"
            role="status"
            aria-live="polite"
          >
            We restored your previous answers.
          </div>
        )}

        <VoterEventHeader event={poll.event} eyebrow="Poll">
          {poll.event.pollAnonymous && (
            <p className="text-xs font-medium text-white/70">Your responses are anonymous.</p>
          )}
        </VoterEventHeader>

        <ParticipantInformationGate eventId={eventId} />

        {questions.map((q, idx) => (
          <PollQuestionField
            key={q.id}
            question={q}
            index={idx}
            value={answers[q.id]}
            onChange={(val) => setAnswer(q.id, val)}
            disabled={submitting}
          />
        ))}

        {error && <p className="text-sm text-v-danger">{error}</p>}
      </div>

      {/* Fixed Submit Footer - matches header style */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-v-border bg-v-surface shadow-v-shadow">
        <div className="mx-auto max-w-2xl px-4 py-3 md:px-8">
          <Button type="submit" loading={submitting} className="w-full">
            {submitting ? 'Submitting…' : 'Submit response'}
          </Button>
        </div>
      </div>
    </form>
  )
}
