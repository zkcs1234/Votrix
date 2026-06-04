import { useParams } from 'react-router-dom'
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
  buildPollingStats,
  buildPollingQuestionStats,
  buildPollingMostSelected,
  buildPollingRatingDistributions,
  buildPollingParticipationTrend,
  buildPollingQuestionDistribution,
  pollingQuestionTypeLabel,
} from '@/modules/polling'

function TextResponses({ responses = [] }) {
  if (!responses.length) {
    return <p className="text-sm text-v-text-subtle">No text responses yet.</p>
  }
  return (
    <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto text-sm text-v-text-muted">
      {responses.map((r, i) => (
        <li key={i} className="rounded-lg border border-v-border px-3 py-2">
          {r.text}
        </li>
      ))}
    </ul>
  )
}

export default function PollingAnalyticsPage() {
  const { eventId } = useParams()
  const { data, loading } = useModuleAnalytics({
    moduleId: 'polling',
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

  const stats = buildPollingStats(data)
  const questionStats = buildPollingQuestionStats(data)
  const mostSelected = buildPollingMostSelected(data)
  const ratingDistros = buildPollingRatingDistributions(data)
  const trend = buildPollingParticipationTrend(data)
  const distributions = buildPollingQuestionDistribution(data)

  return (
    <AnalyticsLayout
      title="Poll analytics"
      description="Respondents, response rate, question statistics, and rating distributions."
      fullReportTo={`/organizer/reports/polling/${eventId}`}
    >
      <div className="rounded-xl border border-v-border bg-v-surface p-4 text-sm text-v-text-muted">
        <span className="font-medium text-v-text">Mode:</span>{' '}
        {data?.pollAnonymous ? 'Anonymous' : 'Identified'}
      </div>

      <AnalyticsStatsGrid stats={stats} columns={4} />

      <AnalyticsSection
        title="Most selected choices"
        description="Top options across every choice-style question in this poll."
      >
        <RankingList
          items={mostSelected}
          showRank
          variant="compact"
          emptyMessage="No choice questions answered yet."
          valueFormatter={(v, item) =>
            item?.percentage !== undefined ? `${v} (${item.percentage}%)` : v
          }
        />
      </AnalyticsSection>

      <AnalyticsSection
        title="Rating distributions"
        description="Average rating and per-question distribution for every rating question."
      >
        <div className="space-y-6">
          {ratingDistros.length === 0 && (
            <p className="text-sm text-v-text-subtle">No rating questions in this poll.</p>
          )}
          {ratingDistros.map((rd) => (
            <div key={rd.id}>
              <p className="text-sm font-medium text-v-text">{rd.name}</p>
              <p className="text-xs text-v-text-subtle">{rd.sublabel}</p>
              <p className="mt-2 text-xs text-v-text-subtle">{rd.meta}</p>
            </div>
          ))}
        </div>
      </AnalyticsSection>

      <TrendList
        title="Participation trends"
        description="Response counts per question."
        items={trend}
        emptyMessage="No questions answered yet."
      />

      <AnalyticsSection
        title="Question statistics"
        description="Per-question breakdown including choice distributions and text responses."
      >
        <div className="space-y-6">
          {distributions.length === 0 && (
            <p className="text-sm text-v-text-subtle">No questions configured.</p>
          )}
          {distributions.map((q) => (
            <div key={q.id}>
              <div className="flex flex-wrap justify-between gap-2">
                <h4 className="text-sm font-medium text-v-text">{q.name}</h4>
                <span className="text-xs text-v-text-subtle">{q.sublabel}</span>
              </div>
              {q.contestants && (
                <div className="mt-2">
                  <DistributionList
                    items={q.contestants}
                    valueKey="value"
                    labelKey="label"
                    emptyMessage="No answers yet."
                  />
                </div>
              )}
              {q.responses && <TextResponses responses={q.responses} />}
              {q.value !== undefined && !q.contestants && !q.responses && (
                <p className="mt-2 text-sm text-v-text-muted">
                  Average rating: {Number(q.value).toFixed(2)} / 5
                </p>
              )}
            </div>
          ))}
        </div>
      </AnalyticsSection>

      <AnalyticsSection
        title="Question response summary"
        description="Number of answers captured per question."
      >
        <DistributionList
          items={questionStats.map((q) => ({
            id: q.id,
            label: q.name,
            value: q.value,
            sublabel: q.sublabel,
          }))}
          valueKey="value"
          labelKey="label"
          showCount
          showPercentage={false}
          emptyMessage="No question responses yet."
        />
      </AnalyticsSection>

      {!data?.questions?.length && (
        <p className="text-sm text-v-text-subtle">
          {pollingQuestionTypeLabel
            ? 'No questions yet. Add questions to start collecting responses.'
            : ''}
        </p>
      )}
    </AnalyticsLayout>
  )
}
