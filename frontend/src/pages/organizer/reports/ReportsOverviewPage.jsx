import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { reportsService } from '@/services/reports.service'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import Button from '@/components/ui/Button'
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
      <section className="rounded-2xl border border-v-border bg-v-surface p-6">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-medium text-v-text">{title}</h3>
          <span className="text-xs text-v-text-subtle">0 events</span>
        </div>
        <p className="mt-2 text-sm text-v-text-subtle">No events yet.</p>
      </section>
    )
  }

  return (
    <section className="v-card p-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-medium text-v-text">{title}</h3>
        <span className={`text-xs ${accent}`}>
          {eventCount} {eventCount === 1 ? 'event' : 'events'}
        </span>
      </div>
      <ul className="mt-4 space-y-2">
        {events.map((event) => (
          <li key={event.id}>
            <Link
              to={toModuleReportPath(event.reportPath)}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-v-border px-4 py-3 hover:border-v-border-strong"
            >
              <span className="text-v-text-muted">{event.title}</span>
              {event.stats && (
                <span className={`text-xs ${accent}`}>
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
        <div>
          <h2 className="text-xl font-semibold text-v-text">Reports overview</h2>
          <p className="mt-1 text-sm text-v-text-subtle">Turnout, vote summaries, rankings, and poll charts for all your events.</p>
        </div>
        <div role="alert" className="v-card space-y-3 p-5">
          <p className="v-error-text">{getErrorMessage(error, 'Reports could not be loaded. Please retry.')}</p>
          <Button variant="secondary" onClick={loadReport}>Retry reports</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-v-text">Reports overview</h2>
        <p className="mt-1 text-sm text-v-text-subtle">
          Turnout, vote summaries, rankings, and poll charts for all your events.
        </p>
      </div>

      <div className="space-y-8">
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
