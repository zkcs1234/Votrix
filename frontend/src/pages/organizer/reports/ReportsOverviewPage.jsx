import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { reportsService } from '@/services/reports.service'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

function EventList({ title, events, accent, statLabel }) {
  if (!events?.length) {
    return (
      <section className="rounded-2xl border border-v-border bg-v-surface p-6">
        <h3 className="font-medium text-v-text">{title}</h3>
        <p className="mt-2 text-sm text-v-text-subtle">No events yet.</p>
      </section>
    )
  }

  return (
    <section className="v-card p-6">
      <h3 className="font-medium text-v-text">{title}</h3>
      <ul className="mt-4 space-y-2">
        {events.map((event) => (
          <li key={event.id}>
            <Link
              to={event.reportPath}
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

  useEffect(() => {
    reportsService
      .getOverview()
      .then(({ data }) => setReport(data.report))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner />
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

      <EventList
        title="Election turnout & vote summaries"
        events={report?.elections}
        accent="text-v-text-muted"
        statLabel={(s) => `${s.turnoutPercentage}% turnout (${s.votedCount}/${s.totalVoters})`}
      />

      <EventList
        title="Competition rankings & judge turnout"
        events={report?.competitions ?? report?.pageants}
        accent="text-v-text-muted"
        statLabel={(s) => `${s.turnoutPercentage}% judges scored (${s.submittedCount}/${s.totalJudges})`}
      />

      <EventList
        title="Polling charts & responses"
        events={report?.polls}
        accent="text-v-text-muted"
        statLabel={(s) => `${s.totalSubmissions} submissions`}
      />
    </div>
  )
}
