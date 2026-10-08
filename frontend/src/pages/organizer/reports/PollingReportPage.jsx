import { useParams } from 'react-router-dom'
import {
  AnalyticsSection,
  AnalyticsStatsGrid,
  DistributionList,
  ReportActionsBar,
  ReportDocument,
  useModuleAnalytics,
  downloadCsv,
  downloadExcel,
  downloadJson,
  downloadPdf,
} from '@/modules/analytics'
import TurnoutReport from '@/components/reports/TurnoutReport'
import {
  buildPollingExportPayload,
  buildPollingReportCsvRows,
  buildPollingReportSheets,
  pollingQuestionTypeLabel,
} from '@/modules/polling'
import {
  SkeletonChart,
  SkeletonReport,
  SkeletonStatCard,
} from '@/components/ui/Skeleton'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'

function ParticipationTable({ rows }) {
  if (!rows.length) return null
  return (
    <AnalyticsSection
      title="Program participation"
      description="Response rate among registered respondents by program."
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-140 text-left text-sm">
          <thead className="border-b border-v-border text-xs uppercase tracking-wide text-v-text-subtle">
            <tr>
              <th className="px-3 py-2 font-medium">Program</th>
              <th className="px-3 py-2 text-right font-medium">Registered</th>
              <th className="px-3 py-2 text-right font-medium">Responded</th>
              <th className="px-3 py-2 text-right font-medium">Not responded</th>
              <th className="px-3 py-2 text-right font-medium">Rate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b border-v-border last:border-0">
                <td className="px-3 py-3 font-medium text-v-text">{row.label}</td>
                <td className="px-3 py-3 text-right text-v-text-muted">{row.registered}</td>
                <td className="px-3 py-3 text-right text-v-text-muted">{row.responded}</td>
                <td className="px-3 py-3 text-right text-v-text-muted">{row.notResponded}</td>
                <td className="px-3 py-3 text-right font-medium text-v-text">{row.responseRate}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AnalyticsSection>
  )
}

export default function PollingReportPage() {
  const { eventId } = useParams()
  const { report, loading, refresh, lastUpdated } = useModuleAnalytics({
    moduleId: 'polling',
    eventId,
  })
  const showLoader = useDelayedLoading(loading, 300)

  if (loading && !showLoader) return null
  if (loading || showLoader) {
    return (
      <div className="mx-auto max-w-4xl space-y-8 print:space-y-6">
        <SkeletonReport />
        <SkeletonStatCard />
        <SkeletonChart />
      </div>
    )
  }
  if (!report) return null

  const summary = report.responseSummary ?? {}
  const questions = report.questions ?? []

  const handleExportCsv = () => {
    downloadCsv(`poll-report-${eventId}.csv`, buildPollingReportCsvRows(report))
  }
  const handleExportExcel = () => {
    downloadExcel(`poll-report-${eventId}`, buildPollingReportSheets(report))
  }
  const handleExportJson = () => {
    downloadJson(`poll-report-${eventId}.json`, report)
  }
  const handleExportPdf = () => {
    downloadPdf(
      `poll-report-${eventId}.pdf`,
      buildPollingExportPayload(report, {
        generatedAt: report.generatedAt ?? lastUpdated,
      }),
    )
  }

  return (
    <ReportDocument
      title={report.event.title}
      subtitle="Poll report — response charts"
      generatedAt={report.generatedAt}
      actions={
        <ReportActionsBar
          onRefresh={refresh}
          onExportCsv={handleExportCsv}
          onExportExcel={handleExportExcel}
          onExportPdf={handleExportPdf}
          onExportJson={handleExportJson}
        />
      }
    >
      <TurnoutReport
        title="Response summary"
        stats={{
          enrolledRespondents: summary.enrolledRespondents,
          respondedRespondents: summary.respondedRespondents,
          notRespondedRespondents: summary.notRespondedRespondents,
          responseRate: summary.responseRate,
        }}
        accentClass="text-v-text-muted"
        barColorClass="bg-v-primary"
      />

      <ParticipationTable rows={report.participationByProgram ?? []} />

      <AnalyticsStatsGrid
        stats={[
          {
            id: 'mode',
            label: 'Mode',
            value: summary.pollAnonymous ? 'Anonymous' : 'Identified',
            tone: 'muted',
          },
        ]}
        columns={1}
      />

      {questions.map((q) => (
        <AnalyticsSection
          key={q.questionId}
          title={q.question}
          meta={`${pollingQuestionTypeLabel(q.type)} · ${q.responseCount ?? 0} answers`}
        >
          {q.type === 'choice' && q.options && (
            <DistributionList
              items={q.options.map((o) => ({
                id: o.optionId,
                label: o.label,
                value: o.count,
                percentage: o.percentage,
              }))}
              valueKey="value"
              labelKey="label"
              chartType="pie"
              emptyMessage="No answers yet."
            />
          )}
          {q.type === 'rating' && q.distribution && (
            <>
              <p className="mb-2 text-sm text-v-text-subtle">
                Average: <span className="text-v-text-muted">{q.average}</span> / 5
              </p>
              <DistributionList
                items={q.distribution.map((d) => ({
                  id: String(d.rating),
                  label: `${d.rating} star${d.rating !== 1 ? 's' : ''}`,
                  value: d.count,
                  percentage: d.percentage,
                }))}
                valueKey="value"
                labelKey="label"
                chartType="bar"
                emptyMessage="No rating responses yet."
              />
            </>
          )}
          {q.type === 'text' && (
            <ul className="space-y-2 text-sm text-v-text-muted">
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
        </AnalyticsSection>
      ))}

      {questions.length === 0 && (
        <AnalyticsSection title="No questions yet">
          <p className="text-sm text-v-text-subtle">
            Add questions to start collecting responses for this poll.
          </p>
        </AnalyticsSection>
      )}
    </ReportDocument>
  )
}
