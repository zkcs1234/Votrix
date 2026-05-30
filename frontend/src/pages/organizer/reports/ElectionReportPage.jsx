import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { reportsService } from '@/services/reports.service'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import ReportHeader from '@/components/reports/ReportHeader'
import TurnoutReport from '@/components/reports/TurnoutReport'
import BarChart from '@/components/reports/BarChart'
import StatCard from '@/components/reports/StatCard'
import { downloadCsv, downloadJson } from '@/utils/exportReport'

export default function ElectionReportPage() {
  const { eventId } = useParams()
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    reportsService
      .getElectionReport(eventId)
      .then(({ data }) => setReport(data.report))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [eventId])

  const handleExportCsv = () => {
    const rows = []
    for (const pos of report?.voteSummary?.positionSummaries ?? []) {
      for (const c of pos.candidates) {
        rows.push({
          position: pos.positionName,
          candidate: c.candidateName,
          votes: c.votes,
          votePercentage: c.votePercentage,
        })
      }
    }
    downloadCsv(`election-report-${eventId}.csv`, rows)
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner />
      </div>
    )
  }

  if (!report) return null

  return (
    <div className="mx-auto max-w-4xl space-y-8 print:space-y-6">
      <ReportHeader
        title={report.event.title}
        subtitle="Election report â€” turnout & vote summary"
        generatedAt={report.generatedAt}
      />

      <div className="flex flex-wrap gap-2 print:hidden">
        <button
          type="button"
          onClick={load}
          className="rounded-lg border border-v-border-strong px-3 py-1.5 text-sm text-v-text-muted"
        >
          Refresh
        </button>
        <button
          type="button"
          onClick={handleExportCsv}
          className="rounded-lg border border-v-border px-3 py-1.5 text-sm text-v-text-muted"
        >
          Export CSV
        </button>
        <button
          type="button"
          onClick={() => downloadJson(`election-report-${eventId}.json`, report)}
          className="rounded-lg border border-v-border-strong px-3 py-1.5 text-sm text-v-text-muted"
        >
          Export JSON
        </button>
      </div>

      <TurnoutReport
        title="Voter turnout"
        stats={{
          ...report.turnout,
          turnoutPercentage: report.turnout.turnoutPercentage,
        }}
        accentClass="text-v-text-muted"
        barColorClass="bg-v-primary"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Total ballot selections" value={report.voteSummary.liveTotalVotes} />
        <StatCard label="Positions" value={report.voteSummary.positionSummaries?.length} />
      </div>

      <section className="v-card p-6">
        <h3 className="font-medium text-v-text">Overall vote summary</h3>
        <BarChart
          colorClass="bg-v-primary"
          items={(report.voteSummary.candidateResults ?? []).map((c) => ({
            id: c.candidateId,
            label: c.candidateName,
            count: c.votes,
          }))}
          valueKey="count"
          labelKey="label"
        />
      </section>

      {(report.voteSummary.positionSummaries ?? []).map((position) => (
        <section
          key={position.positionId}
          className="v-card p-6"
        >
          <div className="flex flex-wrap justify-between gap-2">
            <h3 className="font-medium text-v-text">{position.positionName}</h3>
            <span className="text-xs text-v-text-subtle">{position.totalVotes} votes</span>
          </div>
          {position.leader && (
            <p className="mt-2 text-sm text-v-text-muted">
              Leading: {position.leader.name} ({position.leader.votes} votes,{' '}
              {position.leader.votePercentage}%)
            </p>
          )}
          <div className="mt-4">
            <BarChart
              colorClass="bg-v-primary"
              items={position.candidates.map((c) => ({
                id: c.candidateId,
                label: c.candidateName,
                count: c.votes,
                percentage: c.votePercentage,
              }))}
              valueKey="count"
              labelKey="label"
            />
          </div>
        </section>
      ))}
    </div>
  )
}
