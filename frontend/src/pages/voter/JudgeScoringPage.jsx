import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { pageantService } from '@/services/pageant.service'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import PageantScoringForm from '@/components/voter/pageant/PageantScoringForm'

export default function JudgeScoringPage() {
  const { eventId } = useParams()
  const [sheet, setSheet] = useState(null)
  const [scores, setScores] = useState({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    pageantService
      .getScoringSheet(eventId)
      .then(({ data }) => {
        setSheet(data)
        if (data.hasScored) setDone(true)
        
        try {
          const savedStr =
            localStorage.getItem(`votrix_competition_draft_${eventId}`) ??
            localStorage.getItem(`votrix_pageant_draft_${eventId}`)
          const saved = savedStr ? JSON.parse(savedStr) : {}
          setScores({ ...data.existingScores, ...saved })
        } catch {
          setScores({ ...data.existingScores })
        }
      })
      .finally(() => setLoading(false))
  }, [eventId])

  useEffect(() => {
    if (Object.keys(scores).length > 0) {
      localStorage.setItem(`votrix_competition_draft_${eventId}`, JSON.stringify(scores))
    }
  }, [eventId, scores])

  const setScore = (contestantId, criteriaId, value) => {
    const key = `${contestantId}:${criteriaId}`
    setScores((prev) => ({ ...prev, [key]: value }))
  }

  const filledCount =
    sheet?.contestants?.length && sheet?.criteria?.length
      ? sheet.contestants.length * sheet.criteria.length
      : 0

  const enteredCount = Object.values(scores).filter((v) => v !== '' && v !== undefined).length

  const handleSubmit = async () => {
    setSubmitting(true)
    setError(null)

    const payload = []
    for (const contestant of sheet.contestants) {
      for (const crit of sheet.criteria) {
        const key = `${contestant.id}:${crit.id}`
        const val = scores[key]
        if (val === undefined || val === '') {
          setError('Please score every contestant on every criterion before submitting.')
          setSubmitting(false)
          return
        }
        const num = Number(val)
        if (Number.isNaN(num) || num < crit.minScore || num > crit.maxScore) {
          setError(
            `Score for ${contestant.name} â€” ${crit.name} must be between ${crit.minScore} and ${crit.maxScore}.`,
          )
          setSubmitting(false)
          return
        }
        payload.push({
          contestantId: contestant.id,
          criteriaId: crit.id,
          score: num,
        })
      }
    }

    try {
      await pageantService.submitScores(eventId, payload)
      localStorage.removeItem(`votrix_competition_draft_${eventId}`)
      localStorage.removeItem(`votrix_pageant_draft_${eventId}`)
      setDone(true)
    } catch (err) {
      setError(err.response?.data?.message || 'Submit failed')
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

  if (done || sheet?.hasScored) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-emerald-900/50 bg-emerald-950/30 p-8 text-center">
        <p className="text-lg font-semibold text-emerald-300">Scores submitted</p>
        <p className="mt-2 text-sm text-v-text-subtle">Your scores are locked for {sheet?.event?.title}.</p>
        <Link to="/voter" className="mt-6 inline-block text-v-text-muted">
          Back to dashboard
        </Link>
      </div>
    )
  }

  if (!sheet?.scoringOpen) {
    return (
      <div className="mx-auto max-w-lg v-card p-8 text-center">
        <p className="text-white">Scoring is not open yet.</p>
        <Link to="/voter" className="mt-4 inline-block text-v-text-muted">
          Back to dashboard
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-24">
      <div>
        <Link to="/voter" className="text-sm text-v-text-subtle hover:text-v-text-muted">
          â† Dashboard
        </Link>
        <h2 className="mt-2 text-xl font-semibold text-v-text">{sheet.event.title}</h2>
        <p className="text-sm text-v-text-muted/90">Judge scoring â€” one submission only</p>
      </div>

      <div className="rounded-xl border border-v-border bg-v-surface-elevated px-4 py-3 text-sm">
        <p className="text-v-text-muted">
          Score all <strong className="text-white">{sheet.contestants.length}</strong> contestants on{' '}
          <strong className="text-white">{sheet.criteria.length}</strong> criteria.
        </p>
        <p className="mt-1 text-xs text-v-text-subtle">
          Progress: {enteredCount} / {filledCount} scores entered
        </p>
      </div>

      <PageantScoringForm
        sheet={sheet}
        scores={scores}
        onScoreChange={setScore}
        disabled={submitting}
      />

      {error && <p className="text-sm text-v-danger">{error}</p>}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full rounded-lg bg-v-primary py-3 font-medium text-white hover:bg-v-primary-hover disabled:opacity-60"
      >
        {submitting ? 'Submittingâ€¦' : 'Submit all scores (locked)'}
      </button>
    </div>
  )
}
