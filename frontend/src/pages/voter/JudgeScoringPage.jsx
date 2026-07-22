import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { pageantService } from '@/services/pageant.service'
import { getDraftStorageKey } from '@/utils/draftStorage'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import Button from '@/components/ui/Button'
import CompetitionScoringForm from '@/components/voter/competition/CompetitionScoringForm'
import VoterEventHeader from '@/components/voter/VoterEventHeader'

export default function JudgeScoringPage() {
  const { eventId } = useParams()
  const competitionDraftKey = getDraftStorageKey('competitionDraft', eventId)
  const pageantDraftKey = getDraftStorageKey('pageantDraft', eventId)
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
            localStorage.getItem(competitionDraftKey) ?? localStorage.getItem(pageantDraftKey)
          const saved = savedStr ? JSON.parse(savedStr) : {}
          setScores({ ...data.existingScores, ...saved })
        } catch {
          setScores({ ...data.existingScores })
        }
      })
      .finally(() => setLoading(false))
  }, [competitionDraftKey, eventId, pageantDraftKey])

  useEffect(() => {
    if (Object.keys(scores).length > 0) {
      localStorage.setItem(competitionDraftKey, JSON.stringify(scores))
    }
  }, [competitionDraftKey, scores])

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
            `Score for ${contestant.name} — ${crit.name} must be between ${crit.minScore} and ${crit.maxScore}.`,
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
      localStorage.removeItem(competitionDraftKey)
      localStorage.removeItem(pageantDraftKey)
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
      <VoterEventHeader event={sheet.event} eyebrow="Judge scoring">
        <p className="text-sm font-medium text-white/75">One submission only</p>
      </VoterEventHeader>

      <div className="rounded-xl border border-v-border bg-v-surface-elevated px-4 py-3 text-sm">
        <p className="text-v-text-muted">
          Score all <strong className="text-white">{sheet.contestants.length}</strong> contestants on{' '}
          <strong className="text-white">{sheet.criteria.length}</strong> criteria.
        </p>
        <p className="mt-1 text-xs text-v-text-subtle">
          Progress: {enteredCount} / {filledCount} scores entered
        </p>
      </div>

      <CompetitionScoringForm
        sheet={sheet}
        scores={scores}
        onScoreChange={setScore}
        disabled={submitting}
      />

      {error && <p className="text-sm text-v-danger">{error}</p>}

      <Button type="button" onClick={handleSubmit} loading={submitting} className="w-full">
        {submitting ? 'Submitting…' : 'Submit all scores (locked)'}
      </Button>
    </div>
  )
}
