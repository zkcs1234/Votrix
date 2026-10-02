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
        description="Final scores and status from the existing competition scoring engine."
      >
        <RankingList
          items={contestantPerformance}
          emptyMessage="No rankings yet."
          valueFormatter={(v) => Number(v ?? 0).toFixed(2)}
          metaFormatter={(meta) => meta}
        />
      </AnalyticsSection>

      {report.roundResults?.length > 0 && (
        <AnalyticsSection
          title="Finalized round results"
          description="Round standings recorded by the existing advancement workflow."
        >
          <div className="space-y-5">
            {report.roundResults.map((round) => (
              <div key={round.roundId} className="overflow-x-auto">
                <h4 className="mb-2 text-sm font-medium text-v-text">{round.roundName}</h4>
                <table className="w-full min-w-140 text-left text-sm">
                  <thead className="border-b border-v-border text-xs uppercase tracking-wide text-v-text-subtle">
                    <tr>
                      <th className="px-3 py-2 font-medium">Rank</th>
                      <th className="px-3 py-2 font-medium">Contestant</th>
                      <th className="px-3 py-2 text-right font-medium">Score</th>
                      <th className="px-3 py-2 text-right font-medium">Qualified</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(round.standings ?? []).map((standing) => (
                      <tr key={standing.contestantId} className="border-b border-v-border last:border-0">
                        <td className="px-3 py-3 text-v-text-muted">{standing.rank}</td>
                        <td className="px-3 py-3 font-medium text-v-text">
                          #{standing.contestantNumber} {standing.contestantName}
                        </td>
                        <td className="px-3 py-3 text-right text-v-text-muted">
                          {Number(standing.score ?? 0).toFixed(2)}
                        </td>
                        <td className="px-3 py-3 text-right text-v-text-muted">
                          {standing.qualified === undefined ? '—' : standing.qualified ? 'Yes' : 'No'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </AnalyticsSection>
      )}

      {report.divisionResults?.length > 0 && (
        <AnalyticsSection
          title="Division results"
          description="Winners and rankings remain scoped to their configured division."
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-140 text-left text-sm">
              <thead className="border-b border-v-border text-xs uppercase tracking-wide text-v-text-subtle">
                <tr>
                  <th className="px-3 py-2 font-medium">Division</th>
                  <th className="px-3 py-2 font-medium">Winner</th>
                  <th className="px-3 py-2 text-right font-medium">Score</th>
                </tr>
              </thead>
              <tbody>
                {report.divisionResults.map((division) => (
                  <tr key={division.divisionId} className="border-b border-v-border last:border-0">
                    <td className="px-3 py-3 font-medium text-v-text">{division.name}</td>
                    <td className="px-3 py-3 text-v-text-muted">
                      {division.winner
                        ? `#${division.winner.contestantNumber} ${division.winner.contestantName}`
                        : '—'}
                    </td>
                    <td className="px-3 py-3 text-right text-v-text-muted">
                      {division.winner ? Number(division.winner.finalScore ?? 0).toFixed(2) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AnalyticsSection>
      )}

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
