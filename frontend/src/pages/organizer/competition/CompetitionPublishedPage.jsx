import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Play,
  Table2,
} from 'lucide-react'
import Button from '@/components/ui/Button'
import { nativeCompetitionService } from '@/services/competition-native.service'

export default function CompetitionPublishedPage() {
  const { eventId } = useParams()
  const location = useLocation()
  const [event, setEvent] = useState(() => location.state?.eventTitle ? {
    title: location.state.eventTitle,
    status: location.state.eventStatus,
    startDate: location.state.startDate,
    endDate: location.state.endDate,
  } : null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (event) return undefined
    let current = true
    nativeCompetitionService.parentReview(eventId)
      .then(({ data }) => {
        if (current) setEvent(data.event)
      })
      .catch((requestError) => {
        if (current) setError(requestError.response?.data?.message ?? requestError.message ?? 'Unable to load the published event.')
      })
    return () => { current = false }
  }, [eventId, event])

  const startDate = event?.startDate
    ? new Date(event.startDate).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : null
  const endDate = event?.endDate
    ? new Date(event.endDate).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : null

  return (
    <section className="mx-auto max-w-6xl space-y-7 py-5" aria-labelledby="competition-published-title">
      <header className="rounded-2xl bg-gradient-to-br from-v-primary to-v-primary-hover p-6 text-white shadow-sm sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/15">
            <CheckCircle2 className="h-8 w-8" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-wider text-white/75">Event setup complete</p>
            <h1 id="competition-published-title" className="mt-1 text-2xl font-bold sm:text-3xl">
              {event?.title ?? 'Your competition is ready'}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-white/85 sm:text-base">
              All 8 setup steps are complete. Choose an event workspace below; running the competition and reviewing results happen after setup.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {event?.status && (
                <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-bold uppercase tracking-wide">
                  <span className="h-2 w-2 rounded-full bg-amber-300" aria-hidden="true" />
                  {event.status === 'scheduled' ? 'Scheduled · Published' : event.status}
                </span>
              )}
              {(startDate || endDate) && (
                <span className="inline-flex items-center gap-2 text-sm text-white/85">
                  <CalendarDays className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {startDate ?? 'Start time not set'}{endDate ? ` – ${endDate}` : ''}
                </span>
              )}
            </div>
          </div>
          <Link to={`/organizer/competition/events/${eventId}/live`} className="shrink-0">
            <Button className="bg-white text-v-primary hover:bg-white/90 focus-visible:ring-white">
              <Play className="h-4 w-4" aria-hidden="true" />
              Go to Live Control
            </Button>
          </Link>
        </div>
      </header>

      {error && <p role="alert" className="text-sm text-v-danger">{error}</p>}

      <div>
        <h2 className="text-xl font-bold text-v-text">What would you like to do?</h2>
        <p className="mt-1 text-sm text-v-text-muted">
          Live Control, Tabulation, and Results are event work areas—not extra setup steps.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <WorkspaceCard
            icon={Play}
            title="Live Control"
            description="Manage rounds, review the judging setup, and start or monitor the live scoring session."
            detail="Opening Live Control marks the event Active. Judging starts only when you explicitly start scoring."
            to={`/organizer/competition/events/${eventId}/live`}
            action="Open Live Control"
            emphasized
          />
          <WorkspaceCard
            icon={Table2}
            title="Tabulation"
            description="Review judge submissions, calculate scores, finalize a round, and confirm qualifiers."
            detail="You can open this area now. Final calculations require the required scores to be submitted and the scoring session to be closed."
            to={`/organizer/competition/events/${eventId}/tabulation/overview`}
            action="Open Tabulation"
          />
          <WorkspaceCard
            icon={BarChart3}
            title="Results"
            description="Review the official standings and publish the final results when tabulation is complete."
            detail="Official results become available after scores are calculated and finalized."
            to={`/organizer/competition/events/${eventId}/results`}
            action="Open Results"
          />
        </div>
      </div>

      <aside className="rounded-xl border border-v-border bg-v-surface p-5" aria-label="Event setup summary">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-v-success-bg text-v-success">
            <ClipboardCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="flex-1">
            <h2 className="font-semibold text-v-text">Setup is saved</h2>
            <p className="mt-1 text-sm text-v-text-muted">
              Your event details, competition structure, entries, judges, and rules are published. You can return to the setup review at any time.
            </p>
          </div>
          <Link to={`/organizer/competition/events/${eventId}/review`} className="shrink-0">
            <Button variant="secondary">Review event setup</Button>
          </Link>
        </div>
      </aside>

      <div className="flex justify-end">
        <Link to="/organizer/competition/events" className="text-sm font-medium text-v-primary underline-offset-4 hover:underline">
          Return to competition events
        </Link>
      </div>
    </section>
  )
}

function WorkspaceCard({ icon: Icon, title, description, detail, to, action, emphasized = false }) {
  return (
    <article className="flex min-h-64 flex-col rounded-xl border border-v-border bg-v-surface p-5 shadow-sm">
      <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${emphasized ? 'bg-v-primary-soft text-v-primary' : 'bg-v-surface-elevated text-v-text-muted'}`}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <h3 className="mt-4 text-lg font-semibold text-v-text">{title}</h3>
      <p className="mt-1 text-sm text-v-text-muted">{description}</p>
      <p className="mt-3 flex-1 rounded-lg bg-v-surface-elevated px-3 py-2 text-xs leading-relaxed text-v-text-muted">{detail}</p>
      <Link to={to} className="mt-4">
        <Button variant={emphasized ? 'primary' : 'secondary'} className="w-full justify-between">
          {action}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </Link>
    </article>
  )
}
