import { nativeRoundAdvancement } from '@/utils/nativeRoundAdvancement'

export default function NativeRoundProgress({ view, roundName, nextRound, onReview, reviewer, busy }) {
  if (!view || !nextRound) return null
  const state = nativeRoundAdvancement(view, nextRound)
  return <div className="v-tab-round-progress" aria-label="Round progression status"><div><strong>{roundName}</strong><span role="status">{state.status}</span></div>{!reviewer && <button type="button" className="v-tab-small-button" disabled={busy} onClick={onReview}>{state.confirmed ? `Open ${nextRound.name} handoff` : `Advancement to ${nextRound.name}`}</button>}</div>
}
