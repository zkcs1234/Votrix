// Registration, planned membership and confirmed advancement are distinct.
export const ENTRY_TYPES = [
  { id: 'individual', label: 'Individual' }, { id: 'duo', label: 'Pair / Duo' },
  { id: 'group', label: 'Team / Group' }, { id: 'other', label: 'Other' },
]
export const orderedRounds = rounds => [...(rounds ?? [])].sort((a, b) => Number(a.displayOrder ?? 0) - Number(b.displayOrder ?? 0) || String(a.id).localeCompare(String(b.id)))
export function nextRound(rounds, source) {
  return source.nextRoundId ? rounds.find(r => r.id === source.nextRoundId) ?? null
    : orderedRounds(rounds).find(r => Number(r.displayOrder ?? 0) > Number(source.displayOrder ?? 0)) ?? null
}
export function qualificationSources(rounds, roundId) {
  return (rounds ?? []).filter(source => (source.purpose === 'qualification' || (source.advancementType ?? 'none') !== 'none') && nextRound(rounds, source)?.id === roundId)
}
export function roundAcceptsEntry(round, entry) {
  return !round.divisionId || round.divisionId === (entry.divisionId ?? entry.division_id)
}
export function potentialRoundEntries(foundation, roundId, visited = new Set()) {
  if (visited.has(roundId)) return []
  const round = foundation.rounds?.find(r => r.id === roundId)
  if (!round) return foundation.contestants ?? []
  const sources = qualificationSources(foundation.rounds, roundId)
  const entries = sources.length ? sources.flatMap(source => potentialRoundEntries(foundation, source.id, new Set([...visited, roundId])))
    : (foundation.contestants ?? []).filter(e => round.contestantIds?.includes(e.id))
  return [...new Map(entries.filter(e => roundAcceptsEntry(round, e)).map(e => [e.id, e])).values()]
}
export function advancementLabel(source) {
  if (!source) return ''
  const type = source.advancementType ?? 'none', value = source.advancementValue
  return type === 'top_n' ? `Top ${value}` : type === 'top_percent' ? `Top ${value}%`
    : type === 'threshold' ? `Minimum score ${value}` : type === 'manual' ? 'Approved manual selection' : 'All eligible entries'
}
export function participationFor(foundation, roundId) {
  const round = foundation.rounds?.find(r => r.id === roundId), sources = qualificationSources(foundation.rounds, roundId)
  const version = foundation.event?.official_rules_id
  const decision = (foundation.advancementDecisions ?? []).find(d => d.rules_version === version && d.next_round_id === roundId && sources.some(s => s.id === d.round_id))
  return { round, sources, protected: sources.length > 0, decision,
    plannedIds: round?.contestantIds ?? [], assignedIds: sources.length ? decision?.qualifiers ?? [] : round?.contestantIds ?? [] }
}
export function entryParticipation(foundation, entry, selectedRoundId) {
  const rounds = orderedRounds(foundation.rounds), initial = rounds[0]
  const selected = participationFor(foundation, selectedRoundId)
  const version = foundation.event?.official_rules_id
  const sanction = (foundation.eligibilityDecisions ?? []).find(d => d.rules_version === version && d.contestant_id === entry.id && d.status === 'approved' && (!d.round_id || d.round_id === selectedRoundId))
  const assigned = rounds.filter(r => participationFor(foundation, r.id).assignedIds.includes(entry.id))
  let status = assigned.some(r => r.id === initial?.id) ? 'Assigned to initial round' : 'Registered — awaiting initial assignment'
  if (!rounds.length) status = 'Registered — event-wide scoring'
  let source = null
  if (selected.protected) {
    source = selected.decision
    const eligible = potentialRoundEntries(foundation, selectedRoundId).some(e => e.id === entry.id)
    status = selected.decision ? selected.assignedIds.includes(entry.id)
      ? selected.decision.selection_basis === 'manual' ? 'Approved manual qualifier' : selected.round?.purpose === 'final' ? 'Finalist' : 'Qualified / Advanced'
      : eligible ? 'Eliminated' : 'Registered — outside qualification scope'
      : eligible ? 'Eligible for next round — awaiting qualification' : 'Registered — awaiting initial assignment'
  }
  if (sanction) status = 'Withdrawn / Non-competing'
  return { status, source, assigned, initial: assigned.find(r => r.id === initial?.id), nonCompeting: Boolean(sanction) }
}
// Canonical source for publication race detection, not a scoring formula.
export function registrationSource(foundation) {
  return { divisionsEnabled: Boolean(foundation.event?.divisions_enabled),
    entries: [...(foundation.contestants ?? [])].sort((a,b) => a.id.localeCompare(b.id)).map(e => ({ id:e.id, divisionId:e.divisionId ?? e.division_id ?? null })),
    rounds: [...(foundation.rounds ?? [])].sort((a,b) => a.id.localeCompare(b.id)).map(r => ({ id:r.id, displayOrder:Number(r.displayOrder ?? 0), divisionId:r.divisionId ?? null,
      purpose:r.purpose ?? 'regular', advancementType:r.advancementType ?? 'none', advancementValue:r.advancementValue === null || r.advancementValue === undefined ? null : Number(r.advancementValue), nextRoundId:r.nextRoundId ?? null,
      contestantIds:[...(r.contestantIds ?? [])].sort() })) }
}
