import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { pollingService } from '@/services/polling.service'
import { validatePollAnswers } from '@/utils/pollValidation'
import { getDraftStorageKey } from '@/utils/draftStorage'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import FormAlert from '@/components/ui/FormAlert'
import Button from '@/components/ui/Button'
import PollQuestionField from '@/components/voter/polling/PollQuestionField'
import VoterEventHeader from '@/components/voter/VoterEventHeader'
import VoterDashboardLink from '@/components/voter/VoterDashboardLink'
import { useAuth } from '@/hooks/useAuth'
import FullscreenVotingShell from '@/components/voter/FullscreenVotingShell'
import { getErrorMessage } from '@/utils/getErrorMessage'

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

        <VoterDashboardLink className="mt-5" />
      </div>
    )
  }

  if (!poll?.canSubmit) {
    return (
      <div data-module="polling" className="mx-auto max-w-lg v-card p-8 text-center">
        <p className="text-v-text">You have already responded to this poll.</p>
        <VoterDashboardLink className="mt-5" />
      </div>
    )
  }

  return (
    /*
      Full-viewport shell using dynamic viewport height (dvh) so mobile
      browser toolbars showing/hiding never shift the fixed footer.
      Layout: [fixed progress bar] · [scrollable middle] · [fixed footer]
      Mirrors the VoterEventPage (ballot) shell structure. Portaled to <body>
      via FullscreenVotingShell so `position: fixed` pins to the viewport rather
      than the animated <main>, keeping the progress bar and submit footer both
      visible on mobile.
    */
    <FullscreenVotingShell>
    <form onSubmit={handleSubmit} data-module="polling" className="fixed inset-0 z-50 flex h-dvh flex-col bg-v-surface">
      {/* ===== FIXED TOP: Floating progress card (does not scroll) ===== */}
      <div className="shrink-0">
        <div className="mx-auto max-w-2xl px-4 pt-3 pb-1 md:px-8">
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
      </div>

      {/* ===== SCROLLABLE MIDDLE: header + questions scroll here ===== */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 md:px-8">
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
            />
          ))}

          {error && <FormAlert variant="error">{error}</FormAlert>}
        </div>
      </div>

      {/* ===== FIXED BOTTOM: Submit footer (does not scroll) ===== */}
      <div className="shrink-0 border-t border-v-border bg-v-surface px-4 py-3 shadow-v-shadow md:px-8 pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto max-w-2xl">
          <Button type="submit" loading={submitting} disabled={submitting || isArchived} className="w-full">
            {submitting ? 'Submitting…' : 'Submit response'}
          </Button>
        </div>
      </div>
    </form>
    </FullscreenVotingShell>
  )
}