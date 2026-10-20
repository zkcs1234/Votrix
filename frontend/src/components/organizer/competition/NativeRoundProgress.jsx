import { nativeRoundAdvancement } from '@/utils/nativeRoundAdvancement'

export default function NativeRoundProgress({ view, roundName, nextRound, onReview, onAction, reviewer, busy }) {
  if (!view || !nextRound) return null
  const state = nativeRoundAdvancement(view, nextRound)
  const action = state.blocker?.stage
  return <div className="v-tab-round-progress" aria-label="Round progression status"><div><strong>{roundName} → {nextRound.name}</strong><span role="status">{state.status}</span><p className="v-caption">Close scoring → automatic calculation → organizer finalization → confirm qualifiers → open the next round in Live Control.</p></div>{!reviewer && <button type="button" className="v-tab-small-button" disabled={busy} onClick={() => action && onAction ? onAction(action) : onReview()}>{action && onAction ? state.blocker.label : state.confirmed ? `Open ${nextRound.name} handoff` : `Advancement to ${nextRound.name}`}</button>}</div>
}
