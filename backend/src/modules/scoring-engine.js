// Phase 5 — Scoring engine
// Pure functions that compute per-criterion, per-round, and final scores
// from a flat list of judge scores. Rules come from events.scoring_config
// (validated in validators/competition.validator.js) — no hardcoded rules
// in this file other than the empty-score default (0) and the "drop X" math.

import {
  SCORE_TYPES,
  CALCULATION_METHODS,
} from '../utils/constants.js'

export const DEFAULT_SCORING_CONFIG = Object.freeze({
  scoreType: SCORE_TYPES.RANGE_1_100,
  calculationMethod: CALCULATION_METHODS.WEIGHTED_AVERAGE,
  decimalPlaces: 2,
  customMin: null,
  customMax: null,
  dropHighest: 0,
  dropLowest: 0,
  // Phase 7: optional deterministic tie-break. null = equal ranks on ties
  // (standard-competition "1224", unchanged). 'highest_criterion' = among tied
  // final scores, the contestant with the higher single best per-criterion
  // average ranks first.
  tieBreaker: null,
})

export function mergeScoringConfig(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SCORING_CONFIG }
  return {
    ...DEFAULT_SCORING_CONFIG,
    ...raw,
    // numeric coercion — protect against string values stored in JSONB
    decimalPlaces: Number.isFinite(Number(raw.decimalPlaces))
      ? Number(raw.decimalPlaces)
      : DEFAULT_SCORING_CONFIG.decimalPlaces,
    customMin: raw.customMin === null || raw.customMin === undefined ? null : Number(raw.customMin),
    customMax: raw.customMax === null || raw.customMax === undefined ? null : Number(raw.customMax),
    dropHighest: Number.isFinite(Number(raw.dropHighest))
      ? Number(raw.dropHighest)
      : DEFAULT_SCORING_CONFIG.dropHighest,
    dropLowest: Number.isFinite(Number(raw.dropLowest))
      ? Number(raw.dropLowest)
      : DEFAULT_SCORING_CONFIG.dropLowest,
  }
}

export function resolveScoreBounds(config) {
  const cfg = mergeScoringConfig(config)
  switch (cfg.scoreType) {
    case SCORE_TYPES.RANGE_1_10:
      return { min: 1, max: 10 }
    case SCORE_TYPES.RANGE_1_100:
      return { min: 1, max: 100 }
    case SCORE_TYPES.DECIMAL:
      return { min: 0, max: 10 }
    case SCORE_TYPES.CUSTOM_RANGE: {
      const min = Number(cfg.customMin ?? 0)
      const max = Number(cfg.customMax ?? 100)
      if (Number.isNaN(min) || Number.isNaN(max) || max < min) {
        return { min: 0, max: 100 }
      }
      return { min, max }
    }
    default:
      return { min: 1, max: 100 }
  }
}

export function isScoreInBounds(value, config) {
  const v = Number(value)
  if (Number.isNaN(v)) return false
  const { min, max } = resolveScoreBounds(config)
  return v >= min && v <= max
}

// ---------------------------------------------------------------------------
// Reduction functions — all consume an array of numeric scores.
// They never throw; empty arrays return 0 so missing data degrades gracefully.
// ---------------------------------------------------------------------------
function average(scores) {
  if (!scores.length) return 0
  return scores.reduce((a, b) => a + b, 0) / scores.length
}

function sum(scores) {
  return scores.reduce((a, b) => a + b, 0)
}

function highest(scores) {
  return scores.length ? Math.max(...scores) : 0
}

function lowestRemoved(scores, dropLowest, dropHighest) {
  if (!scores.length) return 0
  const sorted = [...scores].sort((a, b) => a - b)
  const start = Math.max(0, Math.min(dropLowest, sorted.length - 1))
  const end = sorted.length - Math.max(0, Math.min(dropHighest, sorted.length - start - 1))
  const slice = sorted.slice(start, end)
  if (!slice.length) return 0
  return slice.reduce((a, b) => a + b, 0) / slice.length
}

export function reduceScores(scores, config) {
  const cfg = mergeScoringConfig(config)
  const list = (scores ?? []).map(Number).filter((n) => !Number.isNaN(n))
  switch (cfg.calculationMethod) {
    case CALCULATION_METHODS.AVERAGE:
      return average(list)
    case CALCULATION_METHODS.SUM:
      return sum(list)
    case CALCULATION_METHODS.HIGHEST_SCORE:
      return highest(list)
    case CALCULATION_METHODS.LOWEST_REMOVAL:
      return lowestRemoved(list, cfg.dropLowest, cfg.dropHighest)
    case CALCULATION_METHODS.WEIGHTED_AVERAGE:
    default:
      // weighted-average reduction across judges is a per-criterion average.
      // The per-criterion *weight* is applied by the caller.
      return average(list)
  }
}

// ---------------------------------------------------------------------------
// Final ranking computation
// ---------------------------------------------------------------------------
//
// Inputs:
//   scores       — flat array of { judgeId, contestantId, criteriaId, roundId?, categoryId?, score }
//   contestants  — array of { id, name, contestantNumber, photo? }
//   criteria     — array of { id, name, percentage, categoryId? }
//   rounds       — array of { id, name, weight }  (optional; missing ⇒ treat as one implicit round with weight 100)
//   categories   — array of { id, name, weight }  (optional)
//   config       — events.scoring_config
//
// Output:
//   {
//     rankings: [{ contestantId, ... perCriterion, perRound, perCategory, finalScore, rank }],
//     debug:    { criterionTotals, roundTotals, categoryTotals }
//   }
//
// Notes:
//   * The engine never assumes any number of categories / rounds. If none are
//     configured, behaviour collapses to the legacy "criteria × percentage"
//     formula. If rounds exist, each round is reduced to a number, then
//     combined with `round.weight`. If categories exist, the per-category
//     result is combined with `category.weight`.
//
//   * A criterion belongs to ONE category (or to the event if no category).
//   * A round belongs to ONE category (or to the event if no category).
//
//   * Phase 4 (§8A) SCOPED mode: when `roundCriteria` ({ [roundId]: [criteriaId] })
//     is supplied and non-empty AND rounds exist, each round is scored using ONLY
//     its own criteria (normalized within that round), and scores are attributed
//     to their `round_id` (no cross-round merge). This is feature-guarded: with no
//     `roundCriteria` the engine runs the LEGACY path and produces identical
//     numbers to before, so pre-existing flat-model events are unaffected.
// ---------------------------------------------------------------------------
function round2(value, places) {
  if (!Number.isFinite(value)) return 0
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}

// Standard competition ranking ("1224"): equal finalScores share a rank; the
// next distinct score resumes at its ordinal position. §7.3 — replaces the old
// always-sequential (1,2,3…) assignment so genuine ties are shown as ties.
//
// Phase 7: when a tie-breaker is active, two rows share a rank only if they are
// equal on BOTH the final score and the tie-break key, so a decisive tie-break
// produces distinct ranks.
function assignRanks(sorted, tieBreakActive = false) {
  sorted.forEach((row, i) => {
    if (i > 0) {
      const prev = sorted[i - 1]
      const sameFinal = row.finalScore === prev.finalScore
      const sameTie = !tieBreakActive || (row._tieKey ?? 0) === (prev._tieKey ?? 0)
      if (sameFinal && sameTie) {
        row.rank = prev.rank
        return
      }
    }
    row.rank = i + 1
  })
}

export function computeRankings({
  scores = [],
  contestants = [],
  criteria = [],
  rounds = [],
  categories = [],
  config = {},
  roundCriteria = null,
}) {
  const cfg = mergeScoringConfig(config)
  const method = cfg.calculationMethod
  const dp = Math.max(0, Math.min(6, cfg.decimalPlaces))

  // Build contestant result skeletons.
  const results = contestants.map((c) => ({
    contestantId: c.id,
    contestantName: c.name,
    contestantNumber: c.contestant_number ?? c.contestantNumber,
    photo: c.photo,
    perCriterion: {},
    perRound: {},
    perCategory: {},
    finalScore: 0,
  }))
  const byContestant = new Map(results.map((r) => [r.contestantId, r]))

  // Feature guard (§8A): only take the scoped path when a round→criteria map is
  // supplied AND rounds exist. Otherwise fall through to the untouched legacy
  // math so existing events keep identical numbers.
  const hasRoundCriteria =
    roundCriteria &&
    typeof roundCriteria === 'object' &&
    Object.keys(roundCriteria).length > 0
  const scoped = hasRoundCriteria && rounds.length > 0

  if (scoped) {
    computeScopedPerRound({
      scores,
      contestants,
      criteria,
      rounds,
      roundCriteria,
      byContestant,
      cfg,
      dp,
    })
  } else {
    computeLegacyPerRound({
      scores,
      contestants,
      criteria,
      rounds,
      byContestant,
      cfg,
      method,
      dp,
    })
  }

  const effectiveRounds = rounds.length
    ? rounds
    : [{ id: null, name: 'Overall', weight: 100 }]

  // 3. Combine rounds → categories (SHARED by both paths; reads row.perRound).
  combineRoundsToFinal({ contestants, categories, effectiveRounds, byContestant, dp })

  // Phase 7: optional deterministic tie-break key.
  const tieBreakActive = cfg.tieBreaker === 'highest_criterion'
  if (tieBreakActive) {
    for (const row of results) {
      const avgs = Object.values(row.perCriterion).map((c) => c.average ?? 0)
      row._tieKey = avgs.length ? Math.max(...avgs) : 0
    }
  }

  // Sort by final score desc (then tie-break key desc when active); assign ranks.
  const sorted = [...results].sort(
    (a, b) =>
      b.finalScore - a.finalScore ||
      (tieBreakActive ? (b._tieKey ?? 0) - (a._tieKey ?? 0) : 0),
  )
  assignRanks(sorted, tieBreakActive)
  if (tieBreakActive) for (const row of sorted) delete row._tieKey

  // Weight totals for organizer feedback.
  const criterionTotals = criteria.reduce((s, c) => s + Number(c.percentage ?? 0), 0)
  const roundTotals = rounds.reduce((s, r) => s + Number(r.weight ?? 0), 0)
  const categoryTotals = categories.reduce((s, c) => s + Number(c.weight ?? 0), 0)

  return {
    rankings: sorted,
    debug: {
      criterionTotals: round2(criterionTotals, dp),
      roundTotals: round2(roundTotals, dp),
      categoryTotals: round2(categoryTotals, dp),
    },
  }
}

// LEGACY per-round population (unchanged behavior): criteria are one flat pool,
// every round is computed over ALL criteria (so rounds do not differentiate).
function computeLegacyPerRound({ scores, contestants, criteria, rounds, byContestant, cfg, method, dp }) {
  // Group scores by (contestant, criteria) — round_id intentionally ignored.
  const byCell = new Map()
  for (const s of scores) {
    const key = `${s.contestant_id ?? s.contestantId}|${s.criteria_id ?? s.criteriaId}`
    if (!byCell.has(key)) byCell.set(key, [])
    byCell.get(key).push(Number(s.score))
  }

  // 1. Per-criterion reduction.
  // The "weighted_average" method is the only one whose final value depends
  // on criteria.percentage. For other methods we just record the reduced
  // value; the caller may opt in to a weight check externally.
  for (const crit of criteria) {
    const criterionWeight = Number(crit.percentage ?? 0) / 100
    for (const contestant of contestants) {
      const cellScores = byCell.get(`${contestant.id}|${crit.id}`) ?? []
      const reduced = reduceScores(cellScores, cfg)
      const row = byContestant.get(contestant.id)
      if (!row) continue
      row.perCriterion[crit.id] = {
        criteriaId: crit.id,
        criteriaName: crit.name,
        percentage: Number(crit.percentage ?? 0),
        average: round2(reduced, dp),
        judgeCount: cellScores.length,
      }
    }
  }

  // 2. Combine per-criterion values per round.
  //    rounds: empty ⇒ single implicit round, weight 100
  const effectiveRounds = rounds.length
    ? rounds
    : [{ id: null, name: 'Overall', weight: 100 }]

  // For each round, gather the criteria it covers.
  // The legacy flow has no round_criteria mapping; we treat each round as
  // covering ALL criteria. A future migration can add per-round criteria
  // membership and the engine will narrow accordingly.

  for (const round of effectiveRounds) {
    const roundWeight = Number(round.weight ?? 100) / 100
    for (const contestant of contestants) {
      const row = byContestant.get(contestant.id)
      if (!row) continue
      let roundValue = 0
      if (method === CALCULATION_METHODS.WEIGHTED_AVERAGE) {
        // weighted average of this round's criteria
        const totalPct = criteria.reduce(
          (s, c) => s + Number(c.percentage ?? 0),
          0,
        ) || 100
        for (const crit of criteria) {
          const cell = row.perCriterion[crit.id]
          if (!cell) continue
          const w = Number(crit.percentage ?? 0) / totalPct
          roundValue += cell.average * w
        }
      } else {
        // non-weighted methods: average of per-criterion values
        const list = criteria
          .map((c) => row.perCriterion[c.id]?.average)
          .filter((v) => Number.isFinite(v))
        roundValue = list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0
      }
      row.perRound[round.id ?? 'overall'] = {
        roundId: round.id,
        roundName: round.name,
        weight: Number(round.weight ?? 100),
        value: round2(roundValue, dp),
      }
    }
  }

}

// SCOPED per-round population (§8A): each round scored using ONLY its own
// criteria (normalized within the round); scores attributed to their round_id so
// the same criterion scored in two rounds does NOT merge. Also fills
// row.perCriterion with an event-level aggregate (across rounds) for the UI.
function computeScopedPerRound({ scores, contestants, criteria, rounds, roundCriteria, byContestant, cfg, dp }) {
  const critById = new Map(criteria.map((c) => [c.id, c]))

  // Group scores by (contestant, criteria, round) — round_id kept this time.
  const byCellRound = new Map()
  for (const s of scores) {
    const cid = s.contestant_id ?? s.contestantId
    const critId = s.criteria_id ?? s.criteriaId
    const rid = s.round_id ?? s.roundId ?? null
    const key = `${cid}|${critId}|${rid}`
    if (!byCellRound.has(key)) byCellRound.set(key, [])
    byCellRound.get(key).push(Number(s.score))
  }

  // For the UI breakdown, aggregate each criterion's cells across the rounds
  // that use it, so row.perCriterion still carries one entry per criterion.
  const aggByCrit = new Map() // `${contestantId}|${critId}` -> number[]

  for (const round of rounds) {
    const critIds = Array.isArray(roundCriteria[round.id]) ? roundCriteria[round.id] : []
    const roundCrits = critIds.map((id) => critById.get(id)).filter(Boolean)
    const totalPct = roundCrits.reduce((s, c) => s + Number(c.percentage ?? 0), 0) || 100

    for (const contestant of contestants) {
      const row = byContestant.get(contestant.id)
      if (!row) continue
      let roundValue = 0
      for (const crit of roundCrits) {
        const cell = byCellRound.get(`${contestant.id}|${crit.id}|${round.id}`) ?? []
        const reduced = reduceScores(cell, cfg)
        // Criterion normalized WITHIN this round.
        roundValue += reduced * (Number(crit.percentage ?? 0) / totalPct)

        const aggKey = `${contestant.id}|${crit.id}`
        if (!aggByCrit.has(aggKey)) aggByCrit.set(aggKey, [])
        for (const v of cell) aggByCrit.get(aggKey).push(v)
      }
      row.perRound[round.id] = {
        roundId: round.id,
        roundName: round.name,
        weight: Number(round.weight ?? 100),
        value: round2(roundValue, dp),
      }
    }
  }

  // Event-level per-criterion aggregate (for the breakdown UI only).
  for (const crit of criteria) {
    for (const contestant of contestants) {
      const row = byContestant.get(contestant.id)
      if (!row) continue
      const cell = aggByCrit.get(`${contestant.id}|${crit.id}`) ?? []
      row.perCriterion[crit.id] = {
        criteriaId: crit.id,
        criteriaName: crit.name,
        percentage: Number(crit.percentage ?? 0),
        average: round2(reduceScores(cell, cfg), dp),
        judgeCount: cell.length,
      }
    }
  }
}

// SHARED: combine per-round values → per-category → final. Reads row.perRound
// (populated by whichever path ran) so both legacy and scoped modes reuse it.
function combineRoundsToFinal({ contestants, categories, effectiveRounds, byContestant, dp }) {
  if (categories.length === 0) {
    for (const contestant of contestants) {
      const row = byContestant.get(contestant.id)
      if (!row) continue
      let final = 0
      for (const round of effectiveRounds) {
        const v = row.perRound[round.id ?? 'overall']?.value ?? 0
        final += v * (Number(round.weight ?? 100) / 100)
      }
      row.finalScore = round2(final, dp)
    }
    return
  }

  // For each category, sum rounds that belong to it; rounds with
  // categoryId=null are event-wide and count toward the final directly.
  for (const category of categories) {
    const catRounds = effectiveRounds.filter(
      (r) => r.category_id === category.id || r.categoryId === category.id,
    )
    for (const contestant of contestants) {
      const row = byContestant.get(contestant.id)
      if (!row) continue
      let catValue = 0
      for (const round of catRounds) {
        const v = row.perRound[round.id ?? 'overall']?.value ?? 0
        catValue += v * (Number(round.weight ?? 100) / 100)
      }
      row.perCategory[category.id] = {
        categoryId: category.id,
        categoryName: category.name,
        weight: Number(category.weight ?? 0),
        value: round2(catValue, dp),
      }
    }
  }
  const eventWideRounds = effectiveRounds.filter((r) => !(r.category_id || r.categoryId))
  for (const contestant of contestants) {
    const row = byContestant.get(contestant.id)
    if (!row) continue
    let final = 0
    for (const cat of categories) {
      const c = row.perCategory[cat.id]?.value ?? 0
      final += c * (Number(cat.weight ?? 0) / 100)
    }
    for (const round of eventWideRounds) {
      const v = row.perRound[round.id ?? 'overall']?.value ?? 0
      final += v * (Number(round.weight ?? 100) / 100)
    }
    row.finalScore = round2(final, dp)
  }
}
