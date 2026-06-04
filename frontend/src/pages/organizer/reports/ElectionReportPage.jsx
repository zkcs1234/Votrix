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
  buildElectionAuditActivity,
  buildElectionExportPayload,
  buildElectionReportCsvRows,
  buildElectionReportSheets,
} from '@/modules/election'
import {
  SkeletonChart,
  SkeletonReport,
  SkeletonStatCard,
} from '@/components/ui/Skeleton'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'

export default function ElectionReportPage() {
  const { eventId } = useParams()
  const { report, loading, refresh, lastUpdated } = useModuleAnalytics({
    moduleId: 'election',
    eventId,
    skipReport: false,
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

  const voteSummary = report.voteSummary ?? {}
  const positionSummaries = voteSummary.positionSummaries ?? []
  const candidateResults = voteSummary.candidateResults ?? []
  const auditActivity = buildElectionAuditActivity({
    totalVoters: report.turnout?.totalVoters,
    votedCount: report.turnout?.votedCount,
    liveTotalVotes: voteSummary.liveTotalVotes,
    positionSummaries: { length: positionSummaries.length },
  })

  const handleExportCsv = () => {
    downloadCsv(`election-report-${eventId}.csv`, buildElectionReportCsvRows(report))
  }
  const handleExportExcel = () => {
    downloadExcel(`election-report-${eventId}`, buildElectionReportSheets(report))
  }
  const handleExportJson = () => {
    downloadJson(`election-report-${eventId}.json`, report)
  }
  const handleExportPdf = () => {
    downloadPdf(
      `election-report-${eventId}.pdf`,
      buildElectionExportPayload(report, {
        generatedAt: report.generatedAt ?? lastUpdated,
      }),
    )
  }

  return (
    <ReportDocument
      title={report.event.title}
      subtitle="Election report — turnout & vote summary"
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
        title="Voter turnout"
        stats={{
          ...report.turnout,
          turnoutPercentage: report.turnout.turnoutPercentage,
        }}
        accentClass="text-v-text-muted"
        barColorClass="bg-v-primary"
      />

      <AnalyticsStatsGrid
        stats={[
          {
            id: 'selections',
            label: 'Total ballot selections',
            value: voteSummary.liveTotalVotes ?? 0,
          },
          {
            id: 'positions',
            label: 'Positions',
            value: positionSummaries.length,
          },
        ]}
        columns={2}
      />

      <AnalyticsSection title="Overall vote summary">
        <DistributionList
          items={candidateResults.map((c) => ({
            id: c.candidateId,
            label: c.candidateName,
            value: c.votes,
            percentage: c.votePercentage,
          }))}
          valueKey="value"
          labelKey="label"
          emptyMessage="No candidate data."
        />
      </AnalyticsSection>

      <AnalyticsSection title="Audit activity" description="Summary of records touched by this election.">
        <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {auditActivity.map((row) => (
            <div
              key={row.key}
              className="flex items-center justify-between rounded-lg border border-v-border px-4 py-2 text-sm"
            >
              <dt className="text-v-text-muted">{row.key}</dt>
              <dd className="font-semibold text-v-text">{row.value}</dd>
            </div>
          ))}
        </dl>
      </AnalyticsSection>

      {positionSummaries.map((position) => (
        <AnalyticsSection
          key={position.positionId}
          title={position.positionName}
          meta={`${position.totalVotes ?? 0} votes`}
          description={
            position.leader
              ? `Leading: ${position.leader.name} (${position.leader.votes} votes, ${position.leader.votePercentage}%)`
              : null
          }
        >
          <DistributionList
            items={position.candidates.map((c) => ({
              id: c.candidateId,
              label: c.candidateName,
              value: c.votes,
              percentage: c.votePercentage,
            }))}
            valueKey="value"
            labelKey="label"
            emptyMessage="No candidates for this position."
          />
        </AnalyticsSection>
      ))}
    </ReportDocument>
  )
}
