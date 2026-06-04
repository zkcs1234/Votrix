import { useParams } from 'react-router-dom'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import {
  AnalyticsLayout,
  AnalyticsSection,
  AnalyticsStatsGrid,
  DistributionList,
  RankingList,
  TrendList,
  EmptyAnalyticsState,
  useModuleAnalytics,
} from '@/modules/analytics'
import {
  buildCompetitionStats,
  buildCompetitionScoreStats,
  buildCompetitionOverallRankings,
  buildCompetitionCategoryRankings,
  buildCompetitionJudgeActivity,
  buildCompetitionRounds,
} from '@/modules/competition'

export default function CompetitionAnalyticsPage() {
  const { eventId } = useParams()
  const { data, loading } = useModuleAnalytics({
    moduleId: 'competition',
    eventId,
    pollIntervalMs: 30_000,
    skipReport: true,
  })

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner />
      </div>
    )
  }

  const hasAny =
    data &&
    (data.totalContestants ||
      data.totalJudges ||
      data.totalCategories ||
      data.totalRounds ||
      (data.rankings && data.rankings.length))

  if (!hasAny) {
    return (
      <AnalyticsLayout
        title="Competition analytics"
        description="Contestants, judges, scoring progress, and rankings."
        fullReportTo={`/organizer/reports/competition/${eventId}`}
      >
        <EmptyAnalyticsState
          title="No competition activity yet"
          description="Add contestants, judges, and criteria to begin collecting scores."
        />
      </AnalyticsLayout>
    )
  }

  const stats = buildCompetitionStats(data)
  const scoreStats = buildCompetitionScoreStats(data)
  const overallRankings = buildCompetitionOverallRankings(data)
  const categoryRankings = buildCompetitionCategoryRankings(data)
  const judges = buildCompetitionJudgeActivity(data)
  const rounds = buildCompetitionRounds(data)

  return (
    <AnalyticsLayout
      title="Competition analytics"
      description="Contestants, judges, scoring progress, and rankings."
      fullReportTo={`/organizer/reports/competition/${eventId}`}
    >
      <AnalyticsStatsGrid stats={stats} columns={4} />

      <AnalyticsSection
        title="Scoring progress"
        description="Submitted vs. pending judge scores across all categories and rounds."
      >
        <AnalyticsStatsGrid stats={scoreStats} columns={3} />
      </AnalyticsSection>

      <AnalyticsSection
        title="Overall rankings"
        description="Weighted score = Σ (criterion average × weight %)."
      >
        <RankingList
          items={overallRankings}
          emptyMessage="No rankings yet."
          valueFormatter={(v) => Number(v ?? 0).toFixed(2)}
        />
      </AnalyticsSection>

      <AnalyticsSection
        title="Category rankings"
        description="Per-category leaderboards."
      >
        <div className="space-y-6">
          {categoryRankings.length === 0 && (
            <p className="text-sm text-v-text-subtle">No category data yet.</p>
          )}
          {categoryRankings.map((cat) => (
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

      <AnalyticsSection
        title="Judge activity"
        description="How many score sheets each judge has submitted."
      >
        <RankingList
          items={judges}
          showRank={false}
          variant="compact"
          emptyMessage="No judges assigned yet."
          valueFormatter={(v) => v ?? 0}
        />
      </AnalyticsSection>

      <TrendList
        title="Round results"
        description="Submitted scores per round."
        items={rounds}
        emptyMessage="No rounds scheduled yet."
      />
    </AnalyticsLayout>
  )
}
