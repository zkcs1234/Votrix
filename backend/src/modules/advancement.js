// Phase 6 — Advancement selection (pure).
//
// Given a round's STANDING (already ranked, standard-competition "1224" ranks
// from the scoring engine) and the round's advancement config, decide which
// contestants qualify for the next round. No DB, no side effects — the service
// layer handles persistence, overrides, and seeding.
//
// standing: [{ contestantId, rank, score }, ...] sorted by rank ascending.
//
// Boundary ties advance together: selection is by RANK threshold, so if the Nth
// place is tied, everyone sharing that rank qualifies (as real competitions do).

import { ADVANCEMENT_TYPES } from '../utils/constants.js'

// The rank at the Nth position (1-indexed), clamped to the list. Contestants
// with rank <= this qualify, which naturally includes boundary ties.
function cutoffRankForCount(standing, n) {
  if (n <= 0 || !standing.length) return 0
  const idx = Math.min(n, standing.length) - 1
  return standing[idx]?.rank ?? 0
}

export function selectQualifiers(standing, advancementType, advancementValue) {
  const qualified = new Set()
  if (!Array.isArray(standing) || !standing.length) return qualified

  const type = advancementType || ADVANCEMENT_TYPES.NONE
  const val = Number(advancementValue)

  switch (type) {
    case ADVANCEMENT_TYPES.NONE:
      // No elimination — everyone continues.
      for (const s of standing) qualified.add(s.contestantId)
      break

    case ADVANCEMENT_TYPES.THRESHOLD: {
      if (Number.isNaN(val)) break
      for (const s of standing) if (Number(s.score) >= val) qualified.add(s.contestantId)
      break
    }

    case ADVANCEMENT_TYPES.TOP_N: {
      const n = Math.floor(val)
      if (!Number.isFinite(n) || n <= 0) break
      const cutoff = cutoffRankForCount(standing, n)
      for (const s of standing) if (s.rank <= cutoff) qualified.add(s.contestantId)
      break
    }

    case ADVANCEMENT_TYPES.TOP_PERCENT: {
      const pct = Math.max(0, Math.min(100, val))
      if (!Number.isFinite(pct) || pct <= 0) break
      const n = Math.ceil((standing.length * pct) / 100)
      const cutoff = cutoffRankForCount(standing, n)
      for (const s of standing) if (s.rank <= cutoff) qualified.add(s.contestantId)
      break
    }

    case ADVANCEMENT_TYPES.MANUAL:
    default:
      // Organizer selects qualifiers explicitly via overrides; none auto-qualify.
      break
  }

  return qualified
}

// Apply an organizer's manual override to an auto-computed qualifier set.
// override = { add?: string[], remove?: string[] }. Returns a NEW Set.
export function applyQualifierOverride(qualified, override) {
  const result = new Set(qualified)
  if (!override) return result
  for (const id of override.remove ?? []) result.delete(id)
  for (const id of override.add ?? []) result.add(id)
  return result
}
