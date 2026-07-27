import { Trophy, Users, BarChart3, Eye } from 'lucide-react'
import Badge from '@/components/ui/Badge'

function TurnoutBar({ voted, total }) {
  const pct = total > 0 ? Math.round((voted / total) * 100) : 0
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-v-text-subtle">Turnout</span>
        <span className="font-medium text-v-text-muted">
          {voted} / {total} ({pct}%)
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-v-surface-elevated" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${pct}% turnout`}>
        <div className="h-full rounded-full bg-v-success transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function CandidateBar({ name, votes, votePercentage, maxVotes, party }) {
  const pct = maxVotes > 0 ? (votes / maxVotes) * 100 : 0
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-medium text-v-text truncate">{name}</span>
          {party && <span className="text-xs text-v-text-subtle shrink-0">({party})</span>}
        </div>
        <span className="shrink-0 ml-3 text-xs tabular-nums text-v-text-muted">
          {votes} vote{votes === 1 ? '' : 's'}
          {votePercentage !== undefined && (
            <span className="text-v-text-subtle ml-1">({votePercentage}%)</span>
          )}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-v-surface-elevated">
        <div
          className="h-full rounded-full bg-v-primary transition-all"
          style={{ width: `${Math.max(pct, 2)}%` }}
        />
      </div>
    </div>
  )
}

export default function ElectionResultsCard({ results, electionTitle, resultsVisibility }) {
  if (!results) return null

  const { positionSummaries, totalVoters, votedCount, turnoutPercentage } = results
  const showLiveBadge = resultsVisibility === 'real_time'

  return (
    <div className="v-card overflow-hidden">
      {/* Header */}
      <div className="border-b border-v-border bg-v-surface-elevated/50 px-5 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-v-accent" strokeWidth={1.5} />
            <h3 className="font-semibold text-v-text">{electionTitle}</h3>
          </div>
          {showLiveBadge && (
            <Badge variant="success" size="sm">
              <Eye className="mr-1 h-3 w-3 inline" aria-hidden />
              Live
            </Badge>
          )}
        </div>
      </div>

      <div className="px-5 py-4 space-y-5">
        {/* Turnout stats */}
        <div className="rounded-xl border border-v-border bg-v-surface-elevated/30 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Users className="h-4 w-4 text-v-text-subtle" strokeWidth={1.5} />
            <span className="text-xs font-medium uppercase tracking-wide text-v-text-subtle">
              Voter turnout
            </span>
          </div>
          <div className="grid grid-cols-3 gap-4 mb-3">
            <div>
              <p className="text-xs text-v-text-subtle">Registered</p>
              <p className="v-stat-number text-lg">{totalVoters ?? 0}</p>
            </div>
            <div>
              <p className="text-xs text-v-text-subtle">Voted</p>
              <p className="v-stat-number text-lg text-v-success">{votedCount ?? 0}</p>
            </div>
            <div>
              <p className="text-xs text-v-text-subtle">Turnout</p>
              <p className="v-stat-number text-lg text-v-accent">{turnoutPercentage ?? 0}%</p>
            </div>
          </div>
          {totalVoters > 0 && (
            <TurnoutBar voted={votedCount ?? 0} total={totalVoters} />
          )}
        </div>

        {/* Positions */}
        <div className="space-y-4">
          {(positionSummaries ?? []).map((position) => (
            <div key={position.positionId} className="rounded-xl border border-v-border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-v-text-subtle" strokeWidth={1.5} />
                  <p className="font-medium text-v-text text-sm">{position.positionName}</p>
                </div>
                <span className="text-xs text-v-text-subtle">
                  {position.totalVotes} vote{position.totalVotes === 1 ? '' : 's'} cast
                </span>
              </div>
              <div className="space-y-3">
                {(position.candidates ?? [])
                  .sort((a, b) => b.votes - a.votes)
                  .map((candidate, idx, arr) => (
                    <div key={candidate.candidateId}>
                      <CandidateBar
                        name={candidate.candidateName}
                        votes={candidate.votes}
                        votePercentage={candidate.votePercentage}
                        maxVotes={arr[0]?.votes || 1}
                        party={candidate.party}
                      />
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>

        {(!positionSummaries || positionSummaries.length === 0) && (
          <p className="text-center text-sm text-v-text-subtle py-4">
            No results data available yet.
          </p>
        )}
      </div>
    </div>
  )
}

