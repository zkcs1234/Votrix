import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Undo2, Lock, CheckCircle2 } from 'lucide-react'
import { pollingService } from '@/services/polling.service'
import Button from '@/components/ui/Button'
import StageFooter from '@/components/ui/StageFooter'
import ReadinessItem from '@/components/organizer/ReadinessItem'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { useToast } from '@/hooks/useToast'
import { EVENT_STATUS, canUnpublishEventStatus } from '@/utils/constants'

// Review & Publish sits between Builder and Respondents. Publishing a draft
// hands it to the schedule (draft → scheduled) and locks setup; the poll opens
// on its dates. While scheduled the organizer can unpublish to correct setup,
// or move on to invite respondents.
export default function PollingReviewPage() {
  const { eventId } = useParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState(null)
  const [title, setTitle] = useState('')
  const [questionsCount, setQuestionsCount] = useState(0)
  const [respondentsCount, setRespondentsCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [publishing, setPublishing] = useState(false)
  const [unpublishing, setUnpublishing] = useState(false)
  const { success, error: showError } = useToast()

  const showLoader = useDelayedLoading(loading, 300)

  const load = useCallback(async () => {
    try {
      const [{ data: settings }, { data: q }, { data: v }] = await Promise.all([
        pollingService.getSettings(eventId),
        pollingService.listQuestions(eventId),
        pollingService.listVoters(eventId),
      ])
      setStatus(settings.settings?.status ?? null)
      setTitle(settings.settings?.title ?? '')
      setQuestionsCount(Array.isArray(q.questions) ? q.questions.length : 0)
      setRespondentsCount(Array.isArray(v.voters) ? v.voters.length : 0)
    } catch (err) {
      console.error('Failed to load review data:', err)
    } finally {
      setLoading(false)
    }
  }, [eventId])

  useEffect(() => {
    load()
  }, [load])

  const isDraft = status === EVENT_STATUS.DRAFT
  const canUnpublish = canUnpublishEventStatus(status)
  // Publishing no longer requires respondents — they are invited after publish.
  const publishReady = questionsCount > 0

  const handlePublish = async () => {
    if (!publishReady) return
    setPublishing(true)
    try {
      await pollingService.publishEvent(eventId)
      success('Poll published. It will open based on its schedule.')
      await load()
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to publish poll')
    } finally {
      setPublishing(false)
    }
  }

  const handleUnpublish = async () => {
    setUnpublishing(true)
    try {
      await pollingService.unpublishEvent(eventId)
      success('Poll moved back to draft. You can edit setup again.')
      await load()
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to unpublish poll')
    } finally {
      setUnpublishing(false)
    }
  }

  if (loading && !showLoader) return null
  if (loading) return <p className="v-caption">Loading…</p>

  return (
    <div className="space-y-6">
      <div>
        <h2 className="v-page-title">Review &amp; Publish</h2>
        <p className="v-helper-text mt-1">
          Publishing finishes setup and hands the poll to its schedule. It does not open the poll
          immediately — it opens and closes based on the start and end dates you set. After
          publishing you can still register and invite respondents until the poll opens.
        </p>
      </div>

      <div className="v-card-sm">
        <h3 className="v-label mb-3">{title || 'Untitled poll'}</h3>
        <dl className="grid gap-3 sm:grid-cols-2">
          <SummaryStat label="Questions" value={questionsCount} />
          <SummaryStat label="Registered respondents" value={respondentsCount} />
        </dl>
      </div>

      {isDraft && (
        <div className="v-card-sm">
          <h3 className="v-label mb-1">Ready to publish?</h3>
          <p className="v-helper-text mb-3">
            You need at least one question before publishing. Respondents can be registered and
            invited afterwards.
          </p>
          <ul className="space-y-1.5">
            <ReadinessItem ok={questionsCount > 0} label="At least one question" />
          </ul>
        </div>
      )}

      {!isDraft && (
        <div className="flex items-start gap-3 rounded-2xl border border-v-border bg-v-surface-elevated p-4">
          <div className="rounded-full bg-emerald-500/15 p-1.5 text-emerald-500">
            {status === EVENT_STATUS.SCHEDULED ? (
              <CheckCircle2 className="h-5 w-5" strokeWidth={2} />
            ) : (
              <Lock className="h-5 w-5" strokeWidth={2} />
            )}
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-v-text">
              {status === EVENT_STATUS.SCHEDULED
                ? 'Published — waiting on the schedule'
                : status === EVENT_STATUS.ACTIVE
                  ? 'The poll is open'
                  : 'This poll is closed'}
            </p>
            <p className="text-xs text-v-text-muted mt-0.5">
              {canUnpublish
                ? 'Setup is locked. Unpublish to make corrections, or continue to Respondents to invite people.'
                : 'Setup and the respondent roster are locked.'}
            </p>
            {canUnpublish && (
              <div className="mt-3 flex flex-wrap gap-3">
                <Button
                  variant="secondary"
                  onClick={handleUnpublish}
                  loading={unpublishing}
                  disabled={unpublishing}
                >
                  <Undo2 className="h-4 w-4" strokeWidth={1.5} />
                  Unpublish to draft
                </Button>
                <Button onClick={() => navigate(`/organizer/polling/events/${eventId}/respondents`)}>
                  Continue to Respondents
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      <StageFooter
        module="polling"
        currentKey="review"
        eventId={eventId}
        {...(isDraft
          ? {
              saving: publishing,
              onNext: handlePublish,
              nextLabel: 'Finish & Publish',
              nextDisabled: !publishReady,
            }
          : {})}
      />
    </div>
  )
}

function SummaryStat({ label, value }) {
  return (
    <div className="rounded-lg border border-v-border px-3 py-2">
      <dt className="v-caption">{label}</dt>
      <dd className="text-lg font-semibold text-v-text">{value}</dd>
    </div>
  )
}
