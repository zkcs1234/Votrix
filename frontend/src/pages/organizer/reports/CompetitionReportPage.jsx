import { useParams } from 'react-router-dom'
import {
  AnalyticsSection,
  AnalyticsStatsGrid,
  DistributionList,
  ReportActionsBar,
  ReportDocument,
  RankingList,
  useModuleAnalytics,
  downloadCsv,
  downloadExcel,
  downloadJson,
  downloadPdf,
} from '@/modules/analytics'
import TurnoutReport from '@/components/reports/TurnoutReport'
import {
  buildCompetitionCategoryResults,
  buildCompetitionContestantPerformance,
  buildCompetitionExportPayload,
  buildCompetitionReportCsvRows,
  buildCompetitionReportSheets,
  buildCompetitionRoundResults,
} from '@/modules/competition'
import {
  SkeletonChart,
  SkeletonReport,
  SkeletonStatCard,
} from '@/components/ui/Skeleton'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'

export default function CompetitionReportPage() {
  const { eventId } = useParams()
  const { report, loading, refresh, lastUpdated } = useModuleAnalytics({
    moduleId: 'competition',
    eventId,
    pollIntervalMs: 15_000,
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

  const rankings = report.rankings ?? []
  const categoryResults = buildCompetitionCategoryResults(report)
  const roundResults = buildCompetitionRoundResults(report)
  const contestantPerformance = buildCompetitionContestantPerformance(report)

  const handleExportCsv = () => {
    downloadCsv(`competition-rankings-${eventId}.csv`, buildCompetitionReportCsvRows(report))
  }
  const handleExportExcel = () => {
    downloadExcel(`competition-report-${eventId}`, buildCompetitionReportSheets(report))
  }
  const handleExportJson = () => {
    downloadJson(`competition-report-${eventId}.json`, report)
  }
  const handleExportPdf = () => {
    downloadPdf(
      `competition-report-${eventId}.pdf`,
      buildCompetitionExportPayload(report, {
        generatedAt: report.generatedAt ?? lastUpdated,
      }),
    )
  }

  return (
    <ReportDocument
      title={report.event.title}
      subtitle="Competition Scoring report — rankings & judge turnout"
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
        title="Judge scoring turnout"
        stats={report.judgeTurnout}
        accentClass="text-v-text-muted"
        barColorClass="bg-v-primary"
      />

      <AnalyticsSection
        title="Ranking report"
        description="Weighted score = Σ (criterion average × weight %)"
      >
        <RankingList
          items={contestantPerformance}
          emptyMessage="No rankings yet."
          valueFormatter={(v) => Number(v ?? 0).toFixed(2)}
          metaFormatter={(meta) => meta}
        />
      </AnalyticsSection>

      {categoryResults.length > 0 && (
        <AnalyticsSection
          title="Category results"
          description="Per-category leaderboards."
        >
          <div className="space-y-6">
            {categoryResults.map((cat) => (
              <div key={cat.id}>
                <h4 className="text-sm font-medium text-v-text-muted">{cat.name}</h4>
                <div className="mt-2">
                  <DistributionList
                    items={cat.contestants}
                    valueKey="value"
                    labelKey="label"
                    emptyMessage="No contestants in this category."
                  />
                </div>
              </div>
            ))}
          </div>
        </AnalyticsSection>
      )}

      {roundResults.length > 0 && (
        <AnalyticsSection
          title="Round results"
          description="Submitted scores per round."
        >
          <RankingList
            items={roundResults}
            showRank={false}
            variant="compact"
            emptyMessage="No round data."
            valueFormatter={(v) => v ?? 0}
          />
        </AnalyticsSection>
      )}

      {rankings.length === 0 && (
        <AnalyticsStatsGrid
          stats={[
            {
              id: 'no-data',
              label: 'Status',
              value: 'Waiting for judge submissions',
              tone: 'muted',
            },
          ]}
          columns={1}
        />
      )}
    </ReportDocument>
  )
}
