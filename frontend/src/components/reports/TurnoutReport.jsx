/**
 * TurnoutReport.jsx
 *
 * Stat cards grid + a single-bar progress indicator.
 * Now uses BarChartView from the unified chart system.
 *
 * Props are unchanged — backward compatible.
 */
import { memo, useMemo } from 'react'
import StatCard from '@/components/reports/StatCard'
import { BarChartView } from '@/components/charts'
import { getChartColor } from '@/components/charts/chartTokens'

const TurnoutReport = memo(function TurnoutReport({
  title,
  stats,
  accentClass = 'text-v-success',
  barColorClass = 'bg-emerald-500',
}) {
  if (!stats) return null

  const progressColor = useMemo(() => {
    if (barColorClass.includes('emerald') || barColorClass.includes('success')) return getChartColor('success')
    if (barColorClass.includes('warning')) return getChartColor('warning')
    if (barColorClass.includes('danger'))  return getChartColor('danger')
    return getChartColor('primary')
  }, [barColorClass])

  const progressData = useMemo(
    () => [{ name: 'Progress', value: Math.min(stats.turnoutPercentage ?? 0, 100) }],
    [stats.turnoutPercentage],
  )

  return (
    <section className="v-card p-6">
      <h3 className="font-medium text-v-text">{title}</h3>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.totalVoters !== undefined && (
          <StatCard label="Total voters" value={stats.totalVoters} />
        )}
        {stats.totalJudges !== undefined && (
          <StatCard label="Total judges" value={stats.totalJudges} />
        )}
        {stats.enrolledRespondents !== undefined && (
          <StatCard label="Enrolled" value={stats.enrolledRespondents} />
        )}
        {stats.votedCount !== undefined && (
          <StatCard label="Voted" value={stats.votedCount} accent={accentClass} />
        )}
        {stats.submittedCount !== undefined && (
          <StatCard label="Submitted" value={stats.submittedCount} accent={accentClass} />
        )}
        {stats.totalSubmissions !== undefined && (
          <StatCard label="Submissions" value={stats.totalSubmissions} accent={accentClass} />
        )}
        {stats.notVotedCount !== undefined && (
          <StatCard label="Not voted" value={stats.notVotedCount} />
        )}
        {stats.pendingCount !== undefined && (
          <StatCard label="Pending" value={stats.pendingCount} />
        )}
        {stats.turnoutPercentage !== undefined && (
          <StatCard
            label="Turnout / completion"
            value={`${stats.turnoutPercentage}%`}
            accent={accentClass}
          />
        )}
        {stats.responseRate !== undefined && (
          <StatCard label="Response rate" value={`${stats.responseRate}%`} accent={accentClass} />
        )}
      </div>

      {stats.turnoutPercentage !== undefined && (
        <div className="mt-6">
          <div className="mb-2 flex justify-between text-xs text-v-text-subtle">
            <span>0%</span>
            <span className="font-medium">{stats.turnoutPercentage}%</span>
            <span>100%</span>
          </div>
          <BarChartView
            data={progressData}
            dataKey="value"
            nameKey="name"
            layout="vertical"
            height={40}
            barSize={24}
            showGrid={false}
            colors={[progressColor]}
            valueFormatter={(v) => `${v}%`}
          />
        </div>
      )}
    </section>
  )
})

export default TurnoutReport
