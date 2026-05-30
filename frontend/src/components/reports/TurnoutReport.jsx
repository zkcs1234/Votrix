import StatCard from '@/components/reports/StatCard'

export default function TurnoutReport({
  title,
  stats,
  accentClass = 'text-v-success',
  barColorClass = 'bg-emerald-500',
}) {
  if (!stats) return null

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
          <div className="flex justify-between text-xs text-v-text-subtle">
            <span>0%</span>
            <span>{stats.turnoutPercentage}%</span>
            <span>100%</span>
          </div>
          <div className="mt-1 h-3 overflow-hidden rounded-full bg-v-surface-elevated">
            <div
              className={`h-full ${barColorClass}`}
              style={{ width: `${Math.min(stats.turnoutPercentage, 100)}%` }}
            />
          </div>
        </div>
      )}
    </section>
  )
}
