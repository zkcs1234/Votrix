import { BarChart as RechartsBarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
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
          <div className="flex justify-between text-xs text-v-text-subtle mb-2">
            <span>0%</span>
            <span className="font-medium">{stats.turnoutPercentage}%</span>
            <span>100%</span>
          </div>
          <div className="h-8">
            <ResponsiveContainer width="100%" height="100%">
              <RechartsBarChart
                data={[
                  { name: 'Progress', value: Math.min(stats.turnoutPercentage, 100) },
                ]}
                layout="vertical"
                margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
              >
                <XAxis type="number" domain={[0, 100]} hide />
                <YAxis type="category" dataKey="name" hide />
                <Tooltip
                  content={({ active }) => {
                    if (active) {
                      return (
                        <div className="rounded-lg border border-v-border bg-v-surface-elevated px-3 py-2 shadow-lg">
                          <p className="text-sm font-medium text-v-text">{stats.turnoutPercentage}%</p>
                        </div>
                      )
                    }
                    return null
                  }}
                />
                <Bar
                  dataKey="value"
                  radius={[4, 4, 4, 4]}
                  barSize={24}
                >
                  <Cell fill={barColorClass.includes('emerald') ? '#10b981' : '#3b82f6'} />
                </Bar>
              </RechartsBarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </section>
  )
}
