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
  useModuleAnalytics,
} from '@/modules/analytics'
import {
  buildElectionStats,
  buildElectionParticipationGroups,
  buildElectionCandidateRanking,
  buildElectionPositionSummaries,
  buildElectionParticipationTrend,
  electionVisibilityLabel,
} from '@/modules/election'

function ParticipationTable({ rows, votedLabel = 'Voted' }) {
  if (!rows.length) return <p className="text-sm text-v-text-subtle">No participation data yet.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-140 text-left text-sm">
        <thead className="border-b border-v-border text-xs uppercase tracking-wide text-v-text-subtle">
          <tr>
            <th className="px-3 py-2 font-medium">Group</th>
            <th className="px-3 py-2 text-right font-medium">Registered</th>
            <th className="px-3 py-2 text-right font-medium">{votedLabel}</th>
            <th className="px-3 py-2 text-right font-medium">Not voted</th>
            <th className="px-3 py-2 text-right font-medium">Turnout</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-v-border last:border-0">
              <td className="px-3 py-3 font-medium text-v-text">{row.label}</td>
              <td className="px-3 py-3 text-right text-v-text-muted">{row.registered}</td>
              <td className="px-3 py-3 text-right text-v-text-muted">{row.voted}</td>
              <td className="px-3 py-3 text-right text-v-text-muted">{row.notVoted}</td>
              <td className="px-3 py-3 text-right font-medium text-v-text">{row.turnoutPercentage}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function ElectionAnalyticsPage() {
  const { eventId } = useParams()
  const [event, setEvent] = useState(null)
  const [timeline, setTimeline] = useState(null)
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

    electionService
      .getVotingTimeline(eventId)
      .then(({ data: res }) => {
        if (alive) setTimeline(res.timeline)
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
  const ballotSections = data?.ballotSections ?? []
  const trend = buildElectionParticipationTrend(data)
  const programParticipation = buildElectionParticipationGroups(data, 'program')
  const yearSectionParticipation = buildElectionParticipationGroups(data, 'yearSection')

  const timelineItems = (timeline?.hourly?.length ? timeline.hourly : timeline?.daily ?? []).map((t) => ({
    label: t.period,
    value: t.votes,
  }))

  return (
    <AnalyticsLayout
      title="Election analytics"
      description="Live turnout, candidate rankings, and position results."
      fullReportTo={`/organizer/election/events/${eventId}/report`}
      fullReportLabel="Full report"
    >
      <div className="rounded-xl border border-v-border bg-v-surface p-4 text-sm text-v-text-muted">
        <span className="font-medium text-v-text">Voter-facing results:</span>{' '}
        {electionVisibilityLabel(visibility)}
      </div>

      <AnalyticsStatsGrid stats={stats} columns={4} />

      {timelineItems.length > 0 && (
        <AnalyticsSection
          title="Voting activity timeline"
          description="Vote activity breakdown over time (hourly & daily)."
        >
          <DistributionList
            items={timelineItems}
            valueKey="value"
            labelKey="label"
            showCount
            emptyMessage="No timeline activity recorded yet."
          />
        </AnalyticsSection>
      )}

      <AnalyticsSection
        title="Voting progress"
        description="How many registered students have cast their ballot so far."
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

      <AnalyticsSection
        title="Participation by program"
        description="Turnout among the registered students in each program."
      >
        <ParticipationTable rows={programParticipation} />
      </AnalyticsSection>

      <AnalyticsSection
        title="Participation by year & section"
        description="The system stores year and section together as one managed student field."
      >
        <ParticipationTable rows={yearSectionParticipation} />
      </AnalyticsSection>

      {ballotSections.length > 1 && ballotSections.map((section) => (
        <AnalyticsSection
          key={section.id}
          title={section.name}
          meta={`${section.votedCount} / ${section.totalVoters} submitted`}
          description={`${section.turnoutPercentage}% section turnout · ${section.totalVotes} selections`}
        >
          <p className="text-sm text-v-text-muted">
            {section.positionSummaries.length} positions in this ballot section
          </p>
        </AnalyticsSection>
      ))}

      {positionSummaries.map((position) => (
        <AnalyticsSection
          key={position.id}
          title={position.ballotSectionName
            ? `${position.ballotSectionName} · ${position.name}`
            : position.name}
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
            chartType="pie"
            emptyMessage="No candidates for this position."
          />
        </AnalyticsSection>
      ))}
    </AnalyticsLayout>
  )
}
