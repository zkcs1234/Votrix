import { ArrowLeft, Info, Lock } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function JudgeScoringHeader({ sheet, sessionState, judgeName }) {
  const contestants = sheet?.contestants ?? []
  const criteria = sheet?.criteria ?? []
  const criterionIds = criteria.map(criterion => criterion.id)
  // Display the same contestant completion condition used by the scoresheet.
  const completed = contestants.filter(contestant => Boolean(contestant.hasSubmitted) ||
    (criterionIds.length > 0 && criterionIds.every(id => (contestant.lockedCriteria ?? []).includes(id)))).length
  const scoringOpen = sessionState?.status === 'active' && !sheet?.submission &&
    contestants.some(contestant => contestant.open !== false) && criteria.some(criterion => criterion.open !== false)
  const roundName = sheet?.roundName ?? sessionState?.currentRoundName
  return <header className="space-y-4">
    <Link to="/participant" className="inline-flex items-center gap-1.5 text-xs text-v-text-subtle hover:text-v-primary"><ArrowLeft className="h-3.5 w-3.5" aria-hidden />Dashboard</Link>
    <div className="v-judge-page-intro">
      <div>
        {roundName && <span className="v-judge-round-label">{roundName}</span>}
        <h1>Judge Scoring</h1>
        {sheet?.event?.title && <p className="font-medium">{sheet.event.title}</p>}
        <p>Score each criterion using the configured scale. VOTRIX automatically applies the criterion weights and calculates your total.</p>
      </div>
      {judgeName && <span className="rounded-full border border-v-border bg-v-surface px-3 py-2 text-xs text-v-text-muted">{judgeName}</span>}
    </div>
    <div className="v-judge-summary" role="status">
      <span><Info aria-hidden /><strong className="tabular-nums">{completed} / {contestants.length}</strong> contestants scored</span>
      <span className="v-judge-status-badge" data-complete={scoringOpen}><Lock aria-hidden />{scoringOpen ? 'Scoring Open' : sessionState?.status === 'paused' ? 'Scoring Paused' : 'Scoring Closed'}</span>
    </div>
  </header>
}
