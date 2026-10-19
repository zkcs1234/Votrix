import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { reportsService } from '@/services/reports.service'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import Button from '@/components/ui/Button'
import PageHeader from '@/components/ui/PageHeader'
import { getErrorMessage } from '@/utils/getErrorMessage'

// The report is now a stage inside each module, so link into the module route
// (which carries the stepper, stage footer and sidebar) rather than the old
// standalone /organizer/reports/:module/:id path.
function toModuleReportPath(reportPath) {
  const match = reportPath?.match(/^\/organizer\/reports\/(election|competition|polling)\/(.+)$/)
  return match ? `/organizer/${match[1]}/events/${match[2]}/report` : reportPath
}

function EventList({ title, events, accent, statLabel }) {
  const eventCount = events?.length ?? 0

  if (!events?.length) {
    return (
      <section className="v-card p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold text-v-text">{title}</h3>
          <span className="rounded-full bg-v-surface-elevated px-2.5 py-1 text-xs font-medium text-v-text-subtle">0 events</span>
        </div>
        <p className="mt-3 text-sm text-v-text-subtle">No events yet.</p>
      </section>
    )
  }

  return (
    <section className="v-card p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold text-v-text">{title}</h3>
        <span className={`rounded-full bg-v-primary-soft px-2.5 py-1 text-xs font-semibold ${accent}`}>
          {eventCount} {eventCount === 1 ? 'event' : 'events'}
        </span>
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {events.map((event) => (
          <li key={event.id}>
            <Link
              to={toModuleReportPath(event.reportPath)}
              className="group flex min-h-16 items-center justify-between gap-3 rounded-xl border border-v-border bg-v-surface px-4 py-3 transition-colors hover:border-v-border-strong hover:bg-v-surface-elevated focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v-primary"
            >
              <span className="min-w-0 truncate font-medium text-v-text">{event.title}</span>
              {event.stats && (
                <span className={`shrink-0 text-right text-xs font-medium ${accent}`}>
                  {statLabel(event.stats)}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default function ReportsOverviewPage() {
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadReport = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await reportsService.getOverview()
      setReport(data.report)
    } catch (requestError) {
      setError(requestError)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadReport() }, [loadReport])

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner />
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <PageHeader title="Reports overview" description="Turnout, vote summaries, rankings, and poll charts for all your events." />
        <div role="alert" className="v-card space-y-3 p-5">
          <p className="v-error-text">{getErrorMessage(error, 'Reports could not be loaded. Please retry.')}</p>
          <Button variant="secondary" onClick={loadReport}>Retry reports</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Reports overview"
        description="Turnout, vote summaries, rankings, and poll charts for all your events."
      />

      <div className="space-y-5">
        <div data-module="election">
          <EventList
            title="Election turnout & vote summaries"
            events={report?.elections}
            accent="text-v-primary"
            statLabel={(s) => `${s.turnoutPercentage}% turnout (${s.votedCount}/${s.totalVoters})`}
          />
        </div>

        <div data-module="competition-scoring">
          <EventList
            title="Competition rankings & judge turnout"
            events={report?.competitions ?? report?.pageants}
            accent="text-v-primary"
            statLabel={(s) => `${s.turnoutPercentage}% judges scored (${s.submittedCount}/${s.totalJudges})`}
          />
        </div>

        <div data-module="polling">
          <EventList
            title="Polling charts & responses"
            events={report?.polls}
            accent="text-v-primary"
            statLabel={(s) => `${s.totalSubmissions} submissions`}
          />
        </div>
      </div>
    </div>
  )
}
