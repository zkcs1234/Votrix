import { workflowService } from '@/services/competition-workflow.service'
import {NativeResultsBoundary} from '@/components/organizer/competition/NativeResultsWorkspace'
import { useParams } from 'react-router-dom'
import { useRef, useState } from 'react'
import Button from '@/components/ui/Button'
import PlacementBadge from '@/components/ui/PlacementBadge'
import { getErrorMessage } from '@/utils/getErrorMessage'
import useCompetitionSync from '@/hooks/useCompetitionSync'
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

export default function CompetitionReportPage(){const {eventId}=useParams();return <NativeResultsBoundary eventId={eventId} Legacy={LegacyCompetitionReportPage} reportMode/>}
function LegacyCompetitionReportPage() {
  const { eventId } = useParams()
  const { report, loading, refresh, lastUpdated, error, reportError } = useModuleAnalytics({
    moduleId: 'competition',
    eventId,
    pollIntervalMs: 0,
  })
  const showLoader = useDelayedLoading(loading, 300)
  const [exportError, setExportError] = useState('')
  const [exporting, setExporting] = useState(false)
  const exportBusy = useRef(false)
  useCompetitionSync(eventId, refresh)
  const loadError = reportError ?? (!report ? error : null)
  const numericLabel = value => value == null ? 'Incomplete' : Number(value).toFixed(2)

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
  if (!report) return <div role="alert" className="v-card p-5 space-y-3"><p className="v-error-text">{getErrorMessage(loadError, 'The report is not available yet. Retry loading the saved competition.')}</p><Button variant="secondary" onClick={refresh}>Retry report</Button></div>

  const rankings = report.rankings ?? []
  const categoryResults = buildCompetitionCategoryResults(report)
  const roundResults = buildCompetitionRoundResults(report)
  const contestantPerformance = buildCompetitionContestantPerformance(report)

  const handleExportCsv = () => {
    downloadCsv(`competition-rankings-${eventId}.csv`, buildCompetitionReportCsvRows(report))
  }
  const handleExportExcel = async () => {
    if (exportBusy.current) return
    exportBusy.current = true; setExporting(true); setExportError('')
    try {
      let data
      try { ({data}=await workflowService.exportExcel(eventId)) }
      catch(failure){if(failure.response?.status===409){downloadExcel(`competition-report-${eventId}`,buildCompetitionReportSheets(report));return}throw failure}
      const url=URL.createObjectURL(data),link=document.createElement('a')
      link.href=url;link.download=`competition-report-${eventId}.xlsx`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
    } catch (failure) { setExportError(getErrorMessage(failure, 'Could not download the competition workbook. Retry the export.')) }
    finally { exportBusy.current = false; setExporting(false) }
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
      moduleLabel="competition-scoring"
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
      {loadError && <div role="alert" className="v-card p-4 space-y-2"><p className="v-error-text">{getErrorMessage(loadError, 'Could not refresh the report. Showing the last saved view.')}</p><Button variant="secondary" onClick={refresh}>Retry report</Button></div>}
      {exporting && <p role="status" className="v-caption">Preparing workbook…</p>}
      {exportError && <p role="alert" className="v-error-text">{exportError}</p>}
      <TurnoutReport
        title="Judge scoring turnout"
        stats={report.judgeTurnout}
        accentClass="text-v-text-muted"
        barColorClass="bg-v-primary"
      />

      <AnalyticsSection
        title="Ranking report"
        description={report.isOfficial
          ? `Published tabulation results${report.tabulationMethod ? ` · ${report.tabulationMethod}` : ''}.`
          : 'No published tabulation yet. Showing live scoring preview.'}
      >
        <RankingList
          items={contestantPerformance}
          emptyMessage="No rankings yet."
          valueFormatter={(v) => report.tabulationMethod==='manual'?'Manual official decision':numericLabel(v)}
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
                        <td className="px-3 py-3"><PlacementBadge rank={standing.rank}/></td>
                        <td className="px-3 py-3 font-medium text-v-text">
                          #{standing.contestantNumber} {standing.contestantName}
                        </td>
                        <td className="px-3 py-3 text-right text-v-text-muted">
                          {report.tabulationMethod === 'manual' ? 'Manual official decision' : numericLabel(standing.score)}
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
                      {division.winner ? report.tabulationMethod === 'manual' ? 'Manual official decision' : numericLabel(division.winner.finalScore) : '—'}
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
            valueFormatter={(v) => v == null ? 'Incomplete' : v}
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
