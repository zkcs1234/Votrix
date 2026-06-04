import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { reportsService } from '@/services/reports.service'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import ReportHeader from '@/components/reports/ReportHeader'
import TurnoutReport from '@/components/reports/TurnoutReport'
import { downloadCsv, downloadJson } from '@/utils/exportReport'

export default function PageantReportPage() {
  const { eventId } = useParams()
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    reportsService
      .getPageantReport(eventId)
      .then(({ data }) => setReport(data.report))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    const interval = setInterval(load, 15000)
    return () => clearInterval(interval)
  }, [eventId])

  const handleExportCsv = () => {
    const rows = (report?.rankings ?? []).map((r) => ({
      rank: r.rank,
      contestantNumber: r.contestantNumber,
      contestantName: r.contestantName,
      weightedScore: r.weightedScore,
    }))
    downloadCsv(`competition-rankings-${eventId}.csv`, rows)
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
    <div className="mx-auto max-w-4xl space-y-8">
      <ReportHeader
        title={report.event.title}
        subtitle="Competition Scoring report â€” rankings & judge turnout"
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
          Export rankings CSV
        </button>
        <button
          type="button"
          onClick={() => downloadJson(`competition-report-${eventId}.json`, report)}
          className="rounded-lg border border-v-border-strong px-3 py-1.5 text-sm text-v-text-muted"
        >
          Export JSON
        </button>
      </div>

      <TurnoutReport
        title="Judge scoring turnout"
        stats={report.judgeTurnout}
        accentClass="text-v-text-muted"
        barColorClass="bg-v-primary"
      />

      <section className="v-card p-6">
        <h3 className="font-medium text-v-text">Ranking report</h3>
        <p className="mt-1 text-xs text-v-text-subtle">
          Weighted score = Î£ (criterion average Ã— weight %)
        </p>

        <div className="mt-6 space-y-4">
          {(report.rankings ?? []).map((r) => (
            <article
              key={r.contestantId}
              className="flex gap-4 rounded-xl border border-v-border bg-v-surface-elevated p-4"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-v-surface-elevated text-lg font-bold text-v-text-muted">
                {r.rank}
              </div>
              {r.photo && (
                <img src={r.photo} alt="" className="h-16 w-16 rounded-lg object-cover" />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-v-text">
                  #{r.contestantNumber} {r.contestantName}
                </p>
                <p className="text-2xl font-bold text-v-text-muted">{r.weightedScore.toFixed(2)}</p>
                <ul className="mt-2 flex flex-wrap gap-2 text-xs text-v-text-subtle">
                  {r.criteriaBreakdown.map((c) => (
                    <li key={c.criteriaId} className="rounded bg-v-surface-elevated px-2 py-1">
                      {c.criteriaName}: {c.average} avg ({c.percentage}%)
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
          {!report.rankings?.length && (
            <p className="text-sm text-v-text-subtle">No rankings yet.</p>
          )}
        </div>
      </section>
    </div>
  )
}
