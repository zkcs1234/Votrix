// Phase 5 — Scoring engine
// Pure functions that compute per-criterion, per-round, and final scores
// from a flat list of judge scores. Rules come from events.scoring_config
// (validated in validators/competition.validator.js) — no hardcoded rules
// in this file other than the empty-score default (0) and the "drop X" math.

import {
  SCORE_TYPES,
  CALCULATION_METHODS,
  TIE_BREAKERS,
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
  // Only read when tieBreaker === 'highest_round'; null falls back to the
  // contestant's single best round.
  tieBreakerRoundId: null,
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
// Judge weighting
// ---------------------------------------------------------------------------
// A "cell" is every score given for one (contestant, criterion[, round]) — one
// entry per judge. Internally cells carry { value, judgeId } so a judge's weight
// can be honoured; `reduceScores` above stays number-in for its public callers.
//
// Weights only apply to the averaging methods. SUM and HIGHEST_SCORE are
// deliberately left alone: scaling a sum by weights changes its magnitude rather
// than the balance between judges, and a weighted "highest" is meaningless.
function weightedAverage(entries, judgeWeights) {
  let weighted = 0
  let totalWeight = 0
  for (const entry of entries) {
    const w = Number(judgeWeights.get(entry.judgeId) ?? 0)
    if (!(w > 0)) continue
    weighted += entry.value * w
    totalWeight += w
  }
  // Every contributing judge is unweighted/unknown → fall back to a plain mean
  // so a partially-configured event still produces sensible numbers.
  if (totalWeight <= 0) return average(entries.map((e) => e.value))
  return weighted / totalWeight
}

function reduceCell(cell, cfg, judgeWeights) {
  const entries = (cell ?? [])
    .map((e) => (typeof e === 'object' && e !== null ? e : { value: e, judgeId: null }))
    .map((e) => ({ value: Number(e.value), judgeId: e.judgeId ?? null }))
    .filter((e) => !Number.isNaN(e.value))

  if (!judgeWeights || judgeWeights.size === 0) {
    return reduceScores(entries.map((e) => e.value), cfg)
  }

  switch (cfg.calculationMethod) {
    case CALCULATION_METHODS.SUM:
    case CALCULATION_METHODS.HIGHEST_SCORE:
      return reduceScores(entries.map((e) => e.value), cfg)
    case CALCULATION_METHODS.LOWEST_REMOVAL: {
      // Trim the extremes first, then weight whatever survives.
      const sorted = [...entries].sort((a, b) => a.value - b.value)
      const start = Math.max(0, Math.min(cfg.dropLowest, sorted.length - 1))
      const end = sorted.length - Math.max(0, Math.min(cfg.dropHighest, sorted.length - start - 1))
      const kept = sorted.slice(start, end)
      if (!kept.length) return 0
      return weightedAverage(kept, judgeWeights)
    }
    default:
      if (!entries.length) return 0
      return weightedAverage(entries, judgeWeights)
  }
}

// ---------------------------------------------------------------------------
// Percentile normalization (pre-processing)
// ---------------------------------------------------------------------------
// Rescales every judge's raw scores onto their OWN 0–100 distribution before any
// other math runs, so a judge who scores 70–80 all night carries the same pull as
// one who ranges 40–95. Uses a midrank percentile, which needs no assumption
// about the shape of the distribution (unlike a z-score).
function percentileNormalizeScores(scores) {
  const byJudge = new Map()
  for (const s of scores) {
    const judgeId = s.judge_id ?? s.judgeId ?? null
    if (!byJudge.has(judgeId)) byJudge.set(judgeId, [])
    byJudge.get(judgeId).push(Number(s.score))
  }

  return scores.map((s) => {
    const judgeId = s.judge_id ?? s.judgeId ?? null
    const pool = byJudge.get(judgeId) ?? []
    const value = Number(s.score)
    if (!pool.length || Number.isNaN(value)) return s
    // A judge with a single score has no spread to correct for.
    if (pool.length === 1) return { ...s, score: 50 }
    let below = 0
    let equal = 0
    for (const v of pool) {
      if (v < value) below += 1
      else if (v === value) equal += 1
    }
    return { ...s, score: ((below + equal / 2) / pool.length) * 100 }
  })
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
  judgeWeights = null,
}) {
  const rawCfg = mergeScoringConfig(config)
  const dp = Math.max(0, Math.min(6, rawCfg.decimalPlaces))

  // PERCENTILE is a normalization, not a reduction: rescale each judge's scores
  // onto their own distribution, then combine them the standard weighted way.
  const usesPercentile = rawCfg.calculationMethod === CALCULATION_METHODS.PERCENTILE
  const usesRankBased = rawCfg.calculationMethod === CALCULATION_METHODS.RANK_BASED
  const effectiveScores = usesPercentile ? percentileNormalizeScores(scores) : scores
  const cfg =
    usesPercentile || usesRankBased
      ? { ...rawCfg, calculationMethod: CALCULATION_METHODS.WEIGHTED_AVERAGE }
      : rawCfg
  const method = cfg.calculationMethod

  // Judge weights are opt-in: an empty/absent map leaves every judge equal and
  // every downstream number identical to an unweighted event.
  const weightMap =
    judgeWeights instanceof Map
      ? judgeWeights
      : judgeWeights && typeof judgeWeights === 'object'
        ? new Map(Object.entries(judgeWeights))
        : null
  const activeWeights = weightMap && weightMap.size > 0 ? weightMap : null

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
      scores: effectiveScores,
      contestants,
      criteria,
      rounds,
      roundCriteria,
      byContestant,
      cfg,
      dp,
      judgeWeights: activeWeights,
    })
  } else {
    computeLegacyPerRound({
      scores: effectiveScores,
      contestants,
      criteria,
      rounds,
      byContestant,
      cfg,
      method,
      dp,
      judgeWeights: activeWeights,
    })
  }

  // RANK_BASED replaces each round's score with placement points derived from
  // how each judge ordered the field. perCriterion keeps the raw averages above
  // so the organizer can still see what was actually scored.
  if (usesRankBased) {
    applyRankBasedRounds({
      scores: effectiveScores,
      contestants,
      criteria,
      rounds,
      roundCriteria: scoped ? roundCriteria : null,
      byContestant,
      dp,
      judgeWeights: activeWeights,
    })
  }

  const effectiveRounds = rounds.length
    ? rounds
    : [{ id: null, name: 'Overall', weight: 100 }]

  // Legacy safety (no per-round criteria): every round reuses ALL criteria, so
  // each round holds the SAME value V. The final Σ(V × weight/100) then collapses
  // to V × (Σ round weights)/100 — which INFLATES the overall (even past 100)
  // whenever the round weights don't total 100%. Normalize the weights so an
  // unpartitioned event can't blow past a single round's score. No effect when
  // weights already total 100%, and no effect in scoped mode (correct there) or
  // when categories drive the grouping.
  const roundWeightTotal = (rounds ?? []).reduce((s, r) => s + Number(r.weight ?? 0), 0)
  const roundWeightScale =
    !scoped && categories.length === 0 && rounds.length > 0 && roundWeightTotal > 0
      ? 100 / roundWeightTotal
      : 1

  // 3. Combine rounds → categories (SHARED by both paths; reads row.perRound).
  combineRoundsToFinal({ contestants, categories, effectiveRounds, byContestant, dp, roundWeightScale })

  // Phase 7: optional deterministic tie-break key. MANUAL deliberately resolves
  // nothing — it leaves the tie standing so the organizer decides on the spot.
  const tieBreakActive =
    Boolean(cfg.tieBreaker) &&
    cfg.tieBreaker !== TIE_BREAKERS.NONE &&
    cfg.tieBreaker !== TIE_BREAKERS.MANUAL
  if (tieBreakActive) {
    applyTieBreakKeys({
      results,
      cfg,
      scores: effectiveScores,
      contestants,
      criteria,
      rounds,
      roundCriteria: scoped ? roundCriteria : null,
    })
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
function computeLegacyPerRound({ scores, contestants, criteria, rounds, byContestant, cfg, method, dp, judgeWeights = null }) {
  // Group scores by (contestant, criteria) — round_id intentionally ignored.
  const byCell = new Map()
  for (const s of scores) {
    const key = `${s.contestant_id ?? s.contestantId}|${s.criteria_id ?? s.criteriaId}`
    if (!byCell.has(key)) byCell.set(key, [])
    byCell.get(key).push({ value: Number(s.score), judgeId: s.judge_id ?? s.judgeId ?? null })
  }

  // 1. Per-criterion reduction.
  // The "weighted_average" method is the only one whose final value depends
  // on criteria.percentage. For other methods we just record the reduced
  // value; the caller may opt in to a weight check externally.
  for (const crit of criteria) {
    const criterionWeight = Number(crit.percentage ?? 0) / 100
    for (const contestant of contestants) {
      const cellScores = byCell.get(`${contestant.id}|${crit.id}`) ?? []
      const reduced = reduceCell(cellScores, cfg, judgeWeights)
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
function computeScopedPerRound({ scores, contestants, criteria, rounds, roundCriteria, byContestant, cfg, dp, judgeWeights = null }) {
  const critById = new Map(criteria.map((c) => [c.id, c]))

  // How many rounds each criterion belongs to. A criterion in exactly ONE round
  // can safely accept scores that lack a round_id (e.g. scored while no round was
  // active, or via a path that didn't stamp round_id) — there is no other round
  // to attribute them to, so no double-counting. A criterion shared across rounds
  // must match round_id exactly.
  const roundsPerCriterion = new Map()
  for (const round of rounds) {
    for (const id of Array.isArray(roundCriteria[round.id]) ? roundCriteria[round.id] : []) {
      roundsPerCriterion.set(id, (roundsPerCriterion.get(id) ?? 0) + 1)
    }
  }

  // Group scores by (contestant, criteria, round) — round_id kept this time —
  // plus a round-agnostic bucket for the single-round-tolerance fallback.
  const byCellRound = new Map()
  const byCellAny = new Map()
  for (const s of scores) {
    const cid = s.contestant_id ?? s.contestantId
    const critId = s.criteria_id ?? s.criteriaId
    const rid = s.round_id ?? s.roundId ?? null
    const key = `${cid}|${critId}|${rid}`
    const entry = { value: Number(s.score), judgeId: s.judge_id ?? s.judgeId ?? null }
    if (!byCellRound.has(key)) byCellRound.set(key, [])
    byCellRound.get(key).push(entry)
    const anyKey = `${cid}|${critId}`
    if (!byCellAny.has(anyKey)) byCellAny.set(anyKey, [])
    byCellAny.get(anyKey).push(entry)
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
        const exact = byCellRound.get(`${contestant.id}|${crit.id}|${round.id}`) ?? []
        // Single-round criterion with no round-matched scores → accept its scores
        // regardless of round_id so existing (unstamped) scores still count.
        const cell =
          exact.length === 0 && (roundsPerCriterion.get(crit.id) ?? 0) <= 1
            ? byCellAny.get(`${contestant.id}|${crit.id}`) ?? []
            : exact
        const reduced = reduceCell(cell, cfg, judgeWeights)
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
        average: round2(reduceCell(cell, cfg, judgeWeights), dp),
        judgeCount: cell.length,
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Per-judge round values
// ---------------------------------------------------------------------------
// The main paths above reduce ACROSS judges, which loses the information needed
// to know how any single judge ordered the field. Rank-based scoring and the
// judges-majority tie-break both need that, so this rebuilds one weighted round
// value per (round, judge, contestant).
//
// Returns Map<roundKey, Map<judgeId, Map<contestantId, value>>>. A contestant a
// judge never scored is absent rather than 0, so they don't sink to last place
// on missing data.
function perJudgeRoundValues({ scores, contestants, criteria, rounds, roundCriteria }) {
  const critById = new Map(criteria.map((c) => [c.id, c]))
  const effRounds = rounds.length ? rounds : [{ id: null, name: 'Overall', weight: 100 }]
  const scoped = Boolean(roundCriteria)

  const cells = new Map()
  const judgeIds = new Set()
  for (const s of scores) {
    const judgeId = s.judge_id ?? s.judgeId ?? null
    judgeIds.add(judgeId)
    const cid = s.contestant_id ?? s.contestantId
    const critId = s.criteria_id ?? s.criteriaId
    const rid = s.round_id ?? s.roundId ?? null
    const value = Number(s.score)
    const push = (key) => {
      if (!cells.has(key)) cells.set(key, [])
      cells.get(key).push(value)
    }
    push(`${rid}|${judgeId}|${cid}|${critId}`)
    // Round-agnostic bucket, mirroring the same tolerance computeScopedPerRound
    // applies to scores written before round_id was stamped.
    push(`*|${judgeId}|${cid}|${critId}`)
  }

  const out = new Map()
  for (const round of effRounds) {
    const critIds = scoped
      ? Array.isArray(roundCriteria[round.id])
        ? roundCriteria[round.id]
        : []
      : criteria.map((c) => c.id)
    const crits = critIds.map((id) => critById.get(id)).filter(Boolean)
    const totalPct = crits.reduce((s, c) => s + Number(c.percentage ?? 0), 0) || 100

    const perJudge = new Map()
    for (const judgeId of judgeIds) {
      const perContestant = new Map()
      for (const contestant of contestants) {
        let value = 0
        let scored = false
        for (const crit of crits) {
          const exact = cells.get(`${round.id ?? null}|${judgeId}|${contestant.id}|${crit.id}`)
          const cell = exact ?? cells.get(`*|${judgeId}|${contestant.id}|${crit.id}`) ?? []
          if (!cell.length) continue
          scored = true
          const avg = cell.reduce((a, b) => a + b, 0) / cell.length
          value += avg * (Number(crit.percentage ?? 0) / totalPct)
        }
        if (scored) perContestant.set(contestant.id, value)
      }
      if (perContestant.size) perJudge.set(judgeId, perContestant)
    }
    out.set(round.id ?? 'overall', perJudge)
  }
  return out
}

// Midrank placements (1 = best) for one judge's ordering, so two contestants a
// judge scored identically share a placement instead of being split arbitrarily.
function midrankPlacements(ordered) {
  const placements = new Map()
  let i = 0
  while (i < ordered.length) {
    let j = i
    while (j + 1 < ordered.length && ordered[j + 1][1] === ordered[i][1]) j += 1
    const midrank = (i + j) / 2 + 1
    for (let k = i; k <= j; k += 1) placements.set(ordered[k][0], midrank)
    i = j + 1
  }
  return placements
}

// RANK_BASED: judges effectively place contestants rather than score them. Each
// round's value becomes placement points on a 0–100 scale (1st = 100, last = 0)
// averaged over judges, so round weights and the rest of the pipeline still work
// unchanged.
function applyRankBasedRounds({ scores, contestants, criteria, rounds, roundCriteria, byContestant, dp, judgeWeights }) {
  const perRoundJudge = perJudgeRoundValues({ scores, contestants, criteria, rounds, roundCriteria })
  const effRounds = rounds.length ? rounds : [{ id: null, name: 'Overall', weight: 100 }]

  for (const round of effRounds) {
    const roundKey = round.id ?? 'overall'
    const perJudge = perRoundJudge.get(roundKey) ?? new Map()

    // If no participating judge carries a positive weight, treat them all as
    // equal rather than zeroing the round out.
    const anyWeighted =
      judgeWeights && [...perJudge.keys()].some((id) => Number(judgeWeights.get(id) ?? 0) > 0)
    const weightOf = (judgeId) =>
      anyWeighted ? Math.max(0, Number(judgeWeights.get(judgeId) ?? 0)) : 1

    const points = new Map()
    for (const [judgeId, perContestant] of perJudge) {
      const weight = weightOf(judgeId)
      if (weight <= 0) continue
      const ordered = [...perContestant.entries()].sort((a, b) => b[1] - a[1])
      const n = ordered.length
      if (!n) continue
      for (const [contestantId, placement] of midrankPlacements(ordered)) {
        const value = n > 1 ? ((n - placement) / (n - 1)) * 100 : 100
        const acc = points.get(contestantId) ?? { sum: 0, weight: 0 }
        acc.sum += value * weight
        acc.weight += weight
        points.set(contestantId, acc)
      }
    }

    for (const contestant of contestants) {
      const row = byContestant.get(contestant.id)
      if (!row) continue
      const acc = points.get(contestant.id)
      row.perRound[roundKey] = {
        roundId: round.id,
        roundName: round.name,
        weight: Number(round.weight ?? 100),
        value: round2(acc && acc.weight > 0 ? acc.sum / acc.weight : 0, dp),
      }
    }
  }
}

// Populates row._tieKey (higher wins) for the configured strategy. Only reached
// when a tie-breaker other than none/manual is active.
function applyTieBreakKeys({ results, cfg, scores, contestants, criteria, rounds, roundCriteria }) {
  const setKey = (fn) => {
    for (const row of results) row._tieKey = fn(row)
  }

  switch (cfg.tieBreaker) {
    case TIE_BREAKERS.HIGHEST_ROUND: {
      // A specific round decides it (e.g. Q&A); with none chosen, the
      // contestant's own best round stands in.
      const targetId = cfg.tieBreakerRoundId
      setKey((row) => {
        if (targetId && row.perRound[targetId]) return row.perRound[targetId].value ?? 0
        const values = Object.values(row.perRound).map((r) => r.value ?? 0)
        return values.length ? Math.max(...values) : 0
      })
      return
    }
    case TIE_BREAKERS.COUNTBACK: {
      // How many individual criteria this contestant won outright.
      const best = new Map()
      for (const row of results) {
        for (const [critId, cell] of Object.entries(row.perCriterion)) {
          const value = cell.average ?? 0
          if (!best.has(critId) || value > best.get(critId)) best.set(critId, value)
        }
      }
      setKey((row) =>
        Object.entries(row.perCriterion).reduce((won, [critId, cell]) => {
          const top = best.get(critId) ?? 0
          return won + (top > 0 && (cell.average ?? 0) >= top ? 1 : 0)
        }, 0),
      )
      return
    }
    case TIE_BREAKERS.JUDGES_MAJORITY: {
      // Borda count over each judge's own ordering: how many contestants did
      // this one outscore, summed across judges and rounds. For the common
      // two-way tie this is exactly "whoever more judges scored higher".
      const perRoundJudge = perJudgeRoundValues({ scores, contestants, criteria, rounds, roundCriteria })
      const wins = new Map()
      for (const perJudge of perRoundJudge.values()) {
        for (const perContestant of perJudge.values()) {
          const entries = [...perContestant.entries()]
          for (const [contestantId, value] of entries) {
            const beaten = entries.reduce(
              (n, [otherId, otherValue]) => n + (otherId !== contestantId && value > otherValue ? 1 : 0),
              0,
            )
            wins.set(contestantId, (wins.get(contestantId) ?? 0) + beaten)
          }
        }
      }
      setKey((row) => wins.get(row.contestantId) ?? 0)
      return
    }
    case TIE_BREAKERS.HIGHEST_CRITERION:
    default: {
      setKey((row) => {
        const averages = Object.values(row.perCriterion).map((c) => c.average ?? 0)
        return averages.length ? Math.max(...averages) : 0
      })
    }
  }
}

// SHARED: combine per-round values → per-category → final. Reads row.perRound
// (populated by whichever path ran) so both legacy and scoped modes reuse it.
function combineRoundsToFinal({ contestants, categories, effectiveRounds, byContestant, dp, roundWeightScale = 1 }) {
  if (categories.length === 0) {
    for (const contestant of contestants) {
      const row = byContestant.get(contestant.id)
      if (!row) continue
      let final = 0
      for (const round of effectiveRounds) {
        const v = row.perRound[round.id ?? 'overall']?.value ?? 0
        final += v * ((Number(round.weight ?? 100) * roundWeightScale) / 100)
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
