import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { pollingService } from '@/services/polling.service'
import { pollAnswerErrors } from '@/utils/pollValidation'
import { getDraftStorageKey } from '@/utils/draftStorage'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import FormAlert from '@/components/ui/FormAlert'
import Button from '@/components/ui/Button'
import PollQuestionField from '@/components/voter/polling/PollQuestionField'
import VoterEventHeader from '@/components/voter/VoterEventHeader'
import VoterDashboardLink from '@/components/voter/VoterDashboardLink'
import { useAuth } from '@/hooks/useAuth'
import ParticipantTaskFooter from '@/components/voter/ParticipantTaskFooter'
import { getErrorMessage } from '@/utils/getErrorMessage'

// Shown on the closed / done screens when the organizer lets students see results.
function ViewResultsLink({ show }) {
  if (!show) return null
  return (
    <Link
      to="/participant/results"
      className="mt-4 inline-block rounded-lg px-3 py-2 text-sm font-medium text-v-primary hover:bg-v-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v-primary"
    >
      View poll results
    </Link>
  )
}

export default function VoterPollPage() {
  const { eventId } = useParams()
  const { user } = useAuth()
  const voterName = [user?.firstName, user?.lastName].filter(Boolean).join(' ')
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
  const isArchived = poll?.event?.status === 'archived'

  // Auto-dismiss the draft restoration toast after 4 seconds
  useEffect(() => {
    if (draftRestored) {
      const timer = setTimeout(() => setDraftRestored(false), 4000)
      return () => clearTimeout(timer)
    }
  }, [draftRestored])

  const loadPoll = useCallback(async () => {
    setError(null)
    try {
      const { data } = await pollingService.getPoll(eventId)
      setPoll(data)
      if (!data.canSubmit && data.submissionCount > 0) setDone(true)
      return data
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load poll'))
      return null
    }
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

  // Problems with the current answers, per question. A question's message shows once
  // the voter has touched it (e.g. answered it and then cleared it) or has pressed
  // Submit, and then updates live. Untouched questions are never flagged early.
  const answerErrors = useMemo(() => pollAnswerErrors(questions, answers), [questions, answers])
  const [touchedIds, setTouchedIds] = useState({})
  const [attempted, setAttempted] = useState(false)
  const shownError = (id) => (attempted || touchedIds[id] ? answerErrors[id] : undefined)
  const shownCount = questions.filter((q) => shownError(q.id)).length

  const setAnswer = (questionId, value) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }))
    setTouchedIds((prev) => (prev[questionId] ? prev : { ...prev, [questionId]: true }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    const firstInvalid = questions.find((q) => answerErrors[q.id])
    if (firstInvalid) {
      setAttempted(true)
      // The list scrolls, so bring the first problem into view.
      const el = document.getElementById(`poll-question-${firstInvalid.id}`)
      el?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
      el?.querySelector?.('input, textarea, button')?.focus?.({ preventScroll: true })
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
    setTouchedIds({})
    setAttempted(false)
    setLoading(true)
    try {
      await loadPoll()
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner />
      </div>
    )
  }

  if (error && !poll) {
    return (
      <div data-module="polling" className="mx-auto max-w-lg space-y-4">
        <FormAlert variant="error">{error}</FormAlert>
        <Button variant="secondary" onClick={() => {
          setLoading(true)
          loadPoll().finally(() => setLoading(false))
        }}>
          Retry loading poll
        </Button>
      </div>
    )
  }

  if (done) {
    return (
      <div data-module="polling" className="mx-auto max-w-lg rounded-2xl border border-v-success/30 bg-v-success-bg p-8 text-center">
        <p className="text-lg font-semibold text-v-success">Response submitted</p>
        <p className="mt-2 text-sm text-v-text-subtle">
          Thank you for completing {poll?.event?.title}.
        </p>
        {poll?.event?.pollAllowMultipleSubmissions && poll?.pollOpen && (
          <button
            type="button"
            onClick={handleAnother}
            className="mt-4 rounded-lg px-3 py-2 text-sm font-medium text-v-primary hover:bg-v-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v-primary"
          >
            Submit another response
          </button>
        )}
        <div><ViewResultsLink show={poll?.canViewResults} /></div>
        <VoterDashboardLink className="mt-5" />
      </div>
    )
  }

  if (!poll?.pollOpen) {
    return (
      <div data-module="polling" className="mx-auto max-w-lg v-card p-8 text-center">
        <p className="text-v-text">This poll is closed or has expired.</p>
        {poll?.event?.startDate && poll?.event?.endDate && (
          <p className="mt-2 text-sm text-v-text-subtle">
            This poll was open from{' '}
            {new Date(poll.event.startDate).toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}{' '}
            to{' '}
            {new Date(poll.event.endDate).toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
            .
          </p>
        )}

        <div><ViewResultsLink show={poll?.canViewResults} /></div>
        <VoterDashboardLink className="mt-5" />
      </div>
    )
  }

  if (!poll?.canSubmit) {
    return (
      <div data-module="polling" className="mx-auto max-w-lg v-card p-8 text-center">
        <p className="text-v-text">You have already responded to this poll.</p>
        <div><ViewResultsLink show={poll?.canViewResults} /></div>
        <VoterDashboardLink className="mt-5" />
      </div>
    )
  }

  return (
    <>
      {/*
        The poll stays inside the participant layout, so the header and sidebar rail
        remain visible. The progress card is sticky under the header and the Submit
        bar is pinned in the layout's footer slot (ParticipantTaskFooter), so both
        stay on screen on phones too.
      */}
      <form id="poll-form" onSubmit={handleSubmit} data-module="polling" className="mx-auto max-w-2xl space-y-6">
        <div className="sticky top-[var(--v-header-h)] z-30 -mx-1 px-1 pt-1">
          <div className="v-card-sm p-3 shadow-v-shadow-md">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-v-text-muted">
                {answeredCount} of {questions.length} answered
              </span>
              <span className="text-v-text-muted font-semibold">{progressPercent}%</span>
            </div>
            <div
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-v-surface-elevated"
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
          {voterName && <p>Responding as {voterName}</p>}
          {poll.event.pollAnonymous && (
            <p>Your responses are anonymous.</p>
          )}
        </VoterEventHeader>

        {questions.map((q, idx) => (
          <PollQuestionField
            key={q.id}
            question={q}
            index={idx}
            value={answers[q.id]}
            onChange={(val) => setAnswer(q.id, val)}
            disabled={submitting || isArchived}
            error={shownError(q.id)}
          />
        ))}

        {attempted && shownCount > 0 && (
          <FormAlert variant="error">
            {shownCount === 1
              ? 'Answer the highlighted question to submit.'
              : `Answer the ${shownCount} highlighted questions to submit.`}
          </FormAlert>
        )}
        {error && <FormAlert variant="error">{error}</FormAlert>}
      </form>

      <ParticipantTaskFooter>
        {/* This bar renders outside the <form> in the DOM, so it points at the form by id. */}
        <Button type="submit" form="poll-form" loading={submitting} disabled={submitting || isArchived} className="w-full">
          {submitting ? 'Submitting…' : 'Submit response'}
        </Button>
      </ParticipantTaskFooter>
    </>
  )
}
