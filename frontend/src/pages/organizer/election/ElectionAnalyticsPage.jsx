import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { electionService } from '@/services/election.service'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import {
  AnalyticsLayout,
  AnalyticsSection,
  AnalyticsStatsGrid,
  DistributionList,
  RankingList,
  TrendList,
  useModuleAnalytics,
} from '@/modules/analytics'
import {
  buildElectionStats,
  buildElectionCandidateRanking,
  buildElectionPositionSummaries,
  buildElectionParticipationTrend,
  electionVisibilityLabel,
} from '@/modules/election'

export default function ElectionAnalyticsPage() {
  const { eventId } = useParams()
  const [event, setEvent] = useState(null)
  const { data, loading } = useModuleAnalytics({
    moduleId: 'election',
    eventId,
    pollIntervalMs: 30_000,
    skipReport: true,
  })

  useEffect(() => {
    let alive = true
    electionService
      .getEvent(eventId)
      .then(({ data: res }) => {
        if (alive) setEvent(res.event)
      })
      .catch(() => {
        /* non-fatal */
      })
    return () => {
      alive = false
    }
  }, [eventId])

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner />
      </div>
    )
  }

  const visibility = event?.resultsVisibility ?? event?.results_visibility ?? 'public'
  const stats = buildElectionStats(data)
  const rankings = buildElectionCandidateRanking(data)
  const positionSummaries = buildElectionPositionSummaries(data)
  const trend = buildElectionParticipationTrend(data)

  return (
    <AnalyticsLayout
      title="Election analytics"
      description="Live turnout, candidate rankings, and position results."
      fullReportTo={`/organizer/reports/election/${eventId}`}
    >
      <div className="rounded-xl border border-v-border bg-v-surface p-4 text-sm text-v-text-muted">
        <span className="font-medium text-v-text">Voter-facing results:</span>{' '}
        {electionVisibilityLabel(visibility)}
      </div>

      <AnalyticsStatsGrid stats={stats} columns={4} />

      <AnalyticsSection
        title="Voting progress"
        description="How many registered voters have cast their ballot so far."
      >
        <DistributionList
          items={trend}
          valueKey="value"
          labelKey="label"
          showCount
          showPercentage={false}
          emptyMessage="No voter activity yet."
        />
      </AnalyticsSection>

      <AnalyticsSection
        title="Candidate rankings"
        description="Overall ranking across every position in this election."
      >
        <RankingList
          items={rankings}
          emptyMessage="No candidate data yet."
          emptyDescription="Rankings will appear here once votes are cast."
          valueFormatter={(v) => v ?? 0}
        />
      </AnalyticsSection>

      <TrendList
        title="Election participation trends"
        description="Snapshot of total registered voters, votes cast, and outstanding ballots."
        items={trend}
      />

      {positionSummaries.map((position) => (
        <AnalyticsSection
          key={position.id}
          title={position.name}
          meta={`${position.totalVotes} votes`}
          description={
            position.leader
              ? `Leading: ${position.leader.name} (${position.leader.votes} votes, ${position.leader.percentage}%)`
              : 'No votes yet for this position.'
          }
        >
          <DistributionList
            items={position.candidates}
            valueKey="value"
            labelKey="label"
            emptyMessage="No candidates for this position."
          />
        </AnalyticsSection>
      ))}
    </AnalyticsLayout>
  )
}
