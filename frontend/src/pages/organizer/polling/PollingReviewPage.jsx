import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Undo2, Lock, CheckCircle2 } from 'lucide-react'
import { pollingService } from '@/services/polling.service'
import Button from '@/components/ui/Button'
import StageFooter from '@/components/ui/StageFooter'
import ReadinessItem from '@/components/organizer/ReadinessItem'
import PublishedEventEditPanel from '@/components/organizer/PublishedEventEditPanel'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { useToast } from '@/hooks/useToast'
import { EVENT_STATUS, canUnpublishEventStatus } from '@/utils/constants'

// Review & Publish is the final setup stage. Publishing a draft hands it to the
// schedule (draft -> scheduled) and locks setup.
export default function PollingReviewPage() {
  const { eventId } = useParams()
  const navigate = useNavigate()
  const [event, setEvent] = useState(null)
  const [title, setTitle] = useState('')
  const [questionsCount, setQuestionsCount] = useState(0)
  const [respondentsCount, setRespondentsCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  // When the data was last read; the end-date check compares against this, not the render clock.
  const [loadedAt, setLoadedAt] = useState(0)
  const [publishing, setPublishing] = useState(false)
  const [unpublishing, setUnpublishing] = useState(false)
  const { success, error: showError } = useToast()

  const showLoader = useDelayedLoading(loading, 300)

  const load = useCallback(async () => {
    try {
      setLoadError('')
      setLoadedAt(Date.now())
      const [{ data: settings }, { data: q }, { data: v }] = await Promise.all([
        pollingService.getSettings(eventId),
        pollingService.listQuestions(eventId),
        pollingService.listVoters(eventId),
      ])
      setEvent(settings.settings ?? null)
      setTitle(settings.settings?.title ?? '')
      setQuestionsCount(Array.isArray(q.questions) ? q.questions.length : 0)
      // meta.total is the whole roster; voters.length is only the first page.
      setRespondentsCount(v.meta?.total ?? (Array.isArray(v.voters) ? v.voters.length : 0))
    } catch (err) {
      console.error('Failed to load review data:', err)
      setLoadError(err.response?.data?.message || 'Could not load the saved poll setup. Reload before publishing.')
    } finally {
      setLoading(false)
    }
  }, [eventId])

  useEffect(() => {
    load()
  }, [load])

  const status = event?.status ?? null
  const isDraft = status === EVENT_STATUS.DRAFT
  const canUnpublish = canUnpublishEventStatus(status)
  // An end date in the past would send the poll straight to "completed".
  const endDateOk = !event?.endDate || new Date(event.endDate).getTime() >= loadedAt
  // Publishing no longer requires respondents — they are invited after publish.
  const publishReady = !loadError && questionsCount > 0 && endDateOk

  const handlePublish = async () => {
    if (!publishReady || publishing) return
    setPublishing(true)
    try {
      await pollingService.publishEvent(eventId)
      success('Poll published. It will open based on its schedule.')
      await load()
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to publish poll')
      await load()
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
    <div data-module="polling" className="mx-auto max-w-7xl space-y-6">
      <div className="v-card-md">
        <h2 className="v-page-title">Review &amp; Publish</h2>
          <p className="v-helper-text mt-1">
          Publishing finishes setup and hands the poll to its schedule. It does not open the poll
            immediately — it opens and closes based on the start and end dates you set.
        </p>
      </div>

      {loadError && (
        <div role="alert" className="v-card-sm space-y-2">
          <p className="v-error-text">{loadError}</p>
          <Button variant="secondary" onClick={() => { setLoading(true); load() }}>Reload saved setup</Button>
        </div>
      )}

      <div className="v-card-md">
        <h3 className="v-section-title mb-3">{title || 'Untitled poll'}</h3>
        <dl className="grid gap-3 sm:grid-cols-3">
          <SummaryStat label="Questions" value={questionsCount} />
          <SummaryStat label="Registered respondents" value={respondentsCount} />
          <SummaryStat label="Results for respondents" value={RESULTS_LABEL[event?.resultsVisibility] ?? RESULTS_LABEL.hidden} />
        </dl>
      </div>

      {isDraft && (
        <div className="v-card-sm">
          <h3 className="v-label mb-1">Ready to publish?</h3>
          <p className="v-helper-text mb-3">
            You need at least one question and an end date in the future before publishing.
            Respondents can be registered and invited afterwards.
          </p>
          <ul className="space-y-1.5">
            <ReadinessItem ok={questionsCount > 0} label="At least one question" />
            <ReadinessItem ok={endDateOk} label="End date has not passed" />
          </ul>
        </div>
      )}

      {event && !isDraft && (
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
                {status === EVENT_STATUS.SCHEDULED && (
                  <Button variant="secondary" onClick={() => navigate(`/organizer/polling/events/${eventId}/respondents`)}>
                    Manage respondents
                  </Button>
                )}
                <Button onClick={() => navigate(`/organizer/polling/events/${eventId}/analytics`)}>
                  Continue to Analytics
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      <PublishedEventEditPanel
        eventId={eventId}
        event={event}
        service={pollingService}
        noun="poll"
        onChanged={load}
      />

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

const RESULTS_LABEL = {
  hidden: 'Hidden',
  public: 'After the poll closes',
  real_time: 'Real-time',
}

function SummaryStat({ label, value }) {
  return (
    <div className="rounded-xl border border-v-border bg-v-surface-elevated px-4 py-3">
      <dt className="v-caption">{label}</dt>
      <dd className="text-lg font-semibold text-v-text">{value}</dd>
    </div>
  )
}
