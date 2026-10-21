import VoterDashboardLink from '@/components/voter/VoterDashboardLink'

export default function JudgeScoringHeader({ sheet }) {
  return (
    <header className="space-y-4">
      <VoterDashboardLink />
      <div className="v-judge-page-intro">
        <div className="min-w-0 flex-1">
          <h1>{sheet?.event?.title ?? 'Judge Scoring'}</h1>
          <p>Judge workspace · Your scores are private until submitted.</p>
        </div>
      </div>
    </header>
  )
}
