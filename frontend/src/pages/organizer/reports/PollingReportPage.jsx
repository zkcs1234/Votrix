import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { reportsService } from '@/services/reports.service'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import ReportHeader from '@/components/reports/ReportHeader'
import TurnoutReport from '@/components/reports/TurnoutReport'
import BarChart from '@/components/reports/BarChart'
import { downloadJson } from '@/utils/exportReport'

function typeLabel(type) {
  const map = {
    single_choice: 'Multiple choice',
    checkbox: 'Checkbox',
    yes_no: 'Yes / No',
    text: 'Text',
    rating: 'Rating',
    choice: 'Choice',
  }
  return map[type] ?? type
}

export default function PollingReportPage() {
  const { eventId } = useParams()
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    reportsService
      .getPollingReport(eventId)
      .then(({ data }) => setReport(data.report))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [eventId])

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
        subtitle="Poll report â€” response charts"
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
          onClick={() => downloadJson(`poll-report-${eventId}.json`, report)}
          className="rounded-lg border border-v-border px-3 py-1.5 text-sm text-v-text-muted"
        >
          Export JSON
        </button>
      </div>

      <TurnoutReport
        title="Response summary"
        stats={{
          totalSubmissions: report.responseSummary.totalSubmissions,
          enrolledRespondents: report.responseSummary.enrolledRespondents,
          responseRate: report.responseSummary.responseRate,
        }}
        accentClass="text-v-text-muted"
        barColorClass="bg-v-primary"
      />

      <p className="text-sm text-v-text-subtle">
        Mode: {report.responseSummary.pollAnonymous ? 'Anonymous' : 'Identified'}
      </p>

      {(report.questions ?? []).map((q) => (
        <section
          key={q.questionId}
          className="v-card p-6"
        >
          <div className="flex flex-wrap justify-between gap-2">
            <h3 className="font-medium text-v-text">{q.question}</h3>
            <span className="text-xs text-v-text-subtle/80">
              {typeLabel(q.type)} Â· {q.responseCount} answers
            </span>
          </div>

          {q.type === 'choice' && q.options && (
            <div className="mt-4">
              <BarChart
                colorClass="bg-v-primary"
                items={q.options.map((o) => ({
                  id: o.optionId,
                  label: o.label,
                  count: o.count,
                  percentage: o.percentage,
                }))}
                valueKey="count"
                labelKey="label"
              />
            </div>
          )}

          {q.type === 'rating' && q.distribution && (
            <>
              <p className="mt-3 text-sm text-v-text-subtle">
                Average: <span className="text-v-text-muted">{q.average}</span> / 5
              </p>
              <div className="mt-4">
                <BarChart
                  colorClass="bg-v-primary"
                  items={q.distribution.map((d) => ({
                    id: String(d.rating),
                    label: `${d.rating} star${d.rating !== 1 ? 's' : ''}`,
                    count: d.count,
                    percentage: d.percentage,
                  }))}
                  valueKey="count"
                  labelKey="label"
                />
              </div>
            </>
          )}

          {q.type === 'text' && (
            <ul className="mt-4 max-h-72 space-y-2 overflow-y-auto text-sm text-v-text-muted">
              {(q.responses ?? []).map((r, i) => (
                <li key={i} className="rounded-lg border border-v-border px-3 py-2">
                  {r.text}
                </li>
              ))}
              {!q.responses?.length && (
                <li className="text-v-text-subtle">No text responses.</li>
              )}
            </ul>
          )}
        </section>
      ))}
    </div>
  )
}
