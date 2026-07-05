import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { pollingService } from '@/services/polling.service'
import { validatePollAnswers } from '@/utils/pollValidation'
import { getDraftStorageKey } from '@/utils/draftStorage'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import Button from '@/components/ui/Button'
import PollQuestionField from '@/components/voter/polling/PollQuestionField'

export default function VoterPollPage() {
  const { eventId } = useParams()
  const draftKey = getDraftStorageKey('pollDraft', eventId)
  const [poll, setPoll] = useState(null)
  const [answers, setAnswers] = useState(() => {
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

  const loadPoll = () => {
    return pollingService.getPoll(eventId).then(({ data }) => {
      setPoll(data)
      if (!data.canSubmit && data.submissionCount > 0) setDone(true)
      return data
    })
  }

  useEffect(() => {
    loadPoll().finally(() => setLoading(false))
  }, [eventId])

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
      await pollingService.submitPoll(eventId, answers)
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
        <p className="text-white">This poll is closed or has expired.</p>
        <Link to="/voter" className="mt-4 inline-block text-v-text-muted">
          Back to dashboard
        </Link>
      </div>
    )
  }

  if (!poll?.canSubmit) {
    return (
      <div className="mx-auto max-w-lg v-card p-8 text-center">
        <p className="text-white">You have already responded to this poll.</p>
        <Link to="/voter" className="mt-4 inline-block text-v-text-muted">
          Back to dashboard
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-6 pb-24">
      <div>
        <Link to="/voter" className="text-sm text-v-text-subtle hover:text-v-text-muted">
          ← Dashboard
        </Link>
        <h2 className="mt-2 text-xl font-semibold text-v-text">{poll.event.title}</h2>
        {poll.event.description && (
          <p className="mt-1 text-sm text-v-text-subtle">{poll.event.description}</p>
        )}
        {poll.event.pollAnonymous && (
          <p className="mt-2 text-xs text-v-text-subtle/80">Your responses are anonymous.</p>
        )}
      </div>

      <div className="rounded-xl border border-v-border bg-v-surface-elevated px-4 py-3 text-sm">
        <span className="text-v-text-muted">
          {answeredCount} of {questions.length} questions answered
        </span>
      </div>

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

      <Button type="submit" loading={submitting} className="w-full">
        {submitting ? 'Submitting…' : 'Submit response'}
      </Button>
    </form>
  )
}
