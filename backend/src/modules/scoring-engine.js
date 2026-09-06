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
  // Phase 7 / Option B: optional deterministic tie-break. null = equal ranks on
  // ties (standard-competition "1224", unchanged). See TIE_BREAKERS.
  tieBreaker: null,
  // Option B: when tieBreaker === 'highest_round', which round decides. null =
  // use each contestant's single best round value.
  tieBreakRoundId: null,
  // Option B: when true, judges' scores are combined using their per-assignment
  // weight instead of a plain equal average. Default false = today's behavior.
  judgeWeightingEnabled: false,
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
    judgeWeightingEnabled: Boolean(raw.judgeWeightingEnabled),
    tieBreakRoundId: raw.tieBreakRoundId ?? null,
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
    case CALCULATION_METHODS.TRIMMED_AVERAGE:
      // Both drop N highest + N lowest judge scores, then average the rest.
      // trimmed_average is the organizer-facing label; the math is identical.
      return lowestRemoved(list, cfg.dropLowest, cfg.dropHighest)
    case CALCULATION_METHODS.WEIGHTED_AVERAGE:
    case CALCULATION_METHODS.PERCENTILE:
    case CALCULATION_METHODS.RANK_BASED:
    default:
      // weighted-average reduction across judges is a per-criterion average.
      // The per-criterion *weight* is applied by the caller. percentile and
      // rank_based transform the scores upstream (see preprocessScoresForMethod)
      // and then combine like a weighted average, so they land here too.
      return average(list)
  }
}

// Judge-weighted reduction of ONE cell (all judges' scores for a single
// contestant × criterion). `cell` is an array of { score, judgeId }. When judge
// weighting is off, or no weights are known, this is byte-identical to
// reduceScores over the plain values — so existing events are unaffected.
function reduceCell(cell, cfg, judgeWeights) {
  const values = cell.map((x) => Number(x.score)).filter((n) => !Number.isNaN(n))
  const weightingOn =
    cfg.judgeWeightingEnabled &&
    judgeWeights &&
    (cfg.calculationMethod === CALCULATION_METHODS.AVERAGE ||
      cfg.calculationMethod === CALCULATION_METHODS.WEIGHTED_AVERAGE ||
      cfg.calculationMethod === CALCULATION_METHODS.PERCENTILE ||
      cfg.calculationMethod === CALCULATION_METHODS.RANK_BASED)

  if (!weightingOn) return reduceScores(values, cfg)

  // Weighted mean across judges. A judge with no known weight falls back to the
  // average of the known weights so they still count (never silently dropped).
  const known = cell
    .map((x) => ({ v: Number(x.score), w: Number(judgeWeights.get?.(x.judgeId) ?? judgeWeights[x.judgeId]) }))
    .filter((x) => !Number.isNaN(x.v))
  if (!known.length) return 0
  const knownWeights = known.map((x) => x.w).filter((w) => Number.isFinite(w) && w > 0)
  const fallback = knownWeights.length ? knownWeights.reduce((a, b) => a + b, 0) / knownWeights.length : 1
  let wsum = 0
  let acc = 0
  for (const x of known) {
    const w = Number.isFinite(x.w) && x.w > 0 ? x.w : fallback
    acc += x.v * w
    wsum += w
  }
  return wsum > 0 ? acc / wsum : 0
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
  const cfg = mergeScoringConfig(config)
  const method = cfg.calculationMethod
  const dp = Math.max(0, Math.min(6, cfg.decimalPlaces))

  // Option B: judge weighting lookup (judgeId → weight). Accept a Map or a plain
  // object. Left null / disabled ⇒ equal weighting (today's behavior).
  const judgeWeightMap =
    cfg.judgeWeightingEnabled && judgeWeights
      ? judgeWeights instanceof Map
        ? judgeWeights
        : new Map(Object.entries(judgeWeights))
      : null

  // Option B: percentile and rank_based work by TRANSFORMING each judge's raw
  // numbers before the normal weighted pipeline runs. Judges still enter numbers
  // (derived-rank model) — this only reshapes what those numbers mean. Every
  // other method uses the scores untouched, so their output is unchanged.
  const workingScores =
    method === CALCULATION_METHODS.PERCENTILE || method === CALCULATION_METHODS.RANK_BASED
      ? preprocessScoresForMethod(scores, contestants, method)
      : scores

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
      scores: workingScores,
      contestants,
      criteria,
      rounds,
      roundCriteria,
      byContestant,
      cfg,
      dp,
      judgeWeights: judgeWeightMap,
    })
  } else {
    computeLegacyPerRound({
      scores: workingScores,
      contestants,
      criteria,
      rounds,
      byContestant,
      cfg,
      method,
      dp,
      judgeWeights: judgeWeightMap,
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

  // Option B: resolve ties per the configured tie-breaker (or standard "1224"
  // shared ranks when none). Sort by final score, then break equal-score groups.
  const sorted = resolveTiesAndRank(results, cfg, {
    scores: workingScores,
    criteria,
  })

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
  // Each cell keeps { score, judgeId } so judge weighting can apply.
  const byCell = new Map()
  for (const s of scores) {
    const key = `${s.contestant_id ?? s.contestantId}|${s.criteria_id ?? s.criteriaId}`
    if (!byCell.has(key)) byCell.set(key, [])
    byCell.get(key).push({ score: Number(s.score), judgeId: s.judge_id ?? s.judgeId ?? null })
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
    const entry = { score: Number(s.score), judgeId: s.judge_id ?? s.judgeId ?? null }
    if (!byCellRound.has(key)) byCellRound.set(key, [])
    byCellRound.get(key).push(entry)
    const anyKey = `${cid}|${critId}`
    if (!byCellAny.has(anyKey)) byCellAny.set(anyKey, [])
    byCellAny.get(anyKey).push(entry)
  }

  // For the UI breakdown, aggregate each criterion's cells across the rounds
  // that use it, so row.perCriterion still carries one entry per criterion.
  const aggByCrit = new Map() // `${contestantId}|${critId}` -> Array<{score, judgeId}>

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

// ---------------------------------------------------------------------------
// Option B — score pre-processing for percentile / rank_based methods.
// Judges still enter plain numbers; these transforms reshape those numbers so
// the normal weighted pipeline then combines them the way the method intends.
// Returns a NEW array; the input is never mutated.
// ---------------------------------------------------------------------------
function preprocessScoresForMethod(scores, contestants, method) {
  const rows = (scores ?? []).filter((s) => !Number.isNaN(Number(s.score)))
  if (!rows.length) return scores

  if (method === CALCULATION_METHODS.PERCENTILE) {
    // Normalize each judge against THEIR OWN scores: replace every score with
    // its percentile rank (0–100) among that judge's submissions. A strict judge
    // (all low) and a lenient judge (all high) then contribute on the same 0–100
    // scale, so neither drags nor inflates the result.
    const byJudge = new Map()
    for (const s of rows) {
      const j = s.judge_id ?? s.judgeId ?? '__nojudge__'
      if (!byJudge.has(j)) byJudge.set(j, [])
      byJudge.get(j).push(Number(s.score))
    }
    const sortedByJudge = new Map()
    for (const [j, vals] of byJudge) sortedByJudge.set(j, [...vals].sort((a, b) => a - b))
    return rows.map((s) => {
      const j = s.judge_id ?? s.judgeId ?? '__nojudge__'
      const arr = sortedByJudge.get(j) ?? []
      const v = Number(s.score)
      const n = arr.length
      if (n <= 1) return { ...s, score: 100 } // a lone score is its judge's top
      let less = 0
      let equal = 0
      for (const x of arr) {
        if (x < v) less++
        else if (x === v) equal++
      }
      const pct = ((less + 0.5 * equal) / n) * 100
      return { ...s, score: pct }
    })
  }

  // RANK_BASED (derived): within each (judge, criteria, round) group, rank the
  // contestants by that judge's number and replace the number with rank points
  // (best = 100 … worst = 0). Only the ORDER a judge gave matters, which is the
  // classic "judges place contestants in order" behavior — without changing the
  // judge's numeric input.
  const groups = new Map()
  for (const s of rows) {
    const j = s.judge_id ?? s.judgeId ?? '__nojudge__'
    const crit = s.criteria_id ?? s.criteriaId ?? '__nocrit__'
    const rid = s.round_id ?? s.roundId ?? '__noround__'
    const key = `${j}|${crit}|${rid}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(s)
  }
  const pointsFor = new Map() // group row identity → points
  for (const [, list] of groups) {
    const ordered = [...list].sort((a, b) => Number(b.score) - Number(a.score))
    const n = ordered.length
    ordered.forEach((s, idx) => {
      // Ties (equal raw score) share the average of their positions' points.
      pointsFor.set(s, n <= 1 ? 100 : ((n - 1 - idx) / (n - 1)) * 100)
    })
    // Average points across equal-score ties so ordering within a tie is neutral.
    let i = 0
    while (i < n) {
      let jdx = i
      while (jdx + 1 < n && Number(ordered[jdx + 1].score) === Number(ordered[i].score)) jdx++
      if (jdx > i) {
        let acc = 0
        for (let k = i; k <= jdx; k++) acc += pointsFor.get(ordered[k])
        const avg = acc / (jdx - i + 1)
        for (let k = i; k <= jdx; k++) pointsFor.set(ordered[k], avg)
      }
      i = jdx + 1
    }
  }
  return rows.map((s) => ({ ...s, score: pointsFor.has(s) ? pointsFor.get(s) : Number(s.score) }))
}

// ---------------------------------------------------------------------------
// Option B — tie resolution. Sorts by final score, then breaks equal-score
// groups per cfg.tieBreaker. With no tie-breaker (default) this reproduces the
// standard "1224" shared-rank behavior exactly.
// ---------------------------------------------------------------------------
function resolveTiesAndRank(results, cfg, ctx) {
  const { compare, equal } = buildTieResolver(cfg.tieBreaker || null, results, cfg, ctx)

  const sorted = [...results].sort((a, b) => b.finalScore - a.finalScore || compare(a, b))

  sorted.forEach((row, i) => {
    if (i > 0) {
      const prev = sorted[i - 1]
      if (row.finalScore === prev.finalScore && equal(prev, row)) {
        row.rank = prev.rank
        return
      }
    }
    row.rank = i + 1
  })

  for (const row of sorted) delete row._tieKey
  return sorted
}

function buildTieResolver(tieBreaker, results, cfg, ctx) {
  const NONE = { compare: () => 0, equal: () => true }
  if (!tieBreaker || tieBreaker === TIE_BREAKERS.MANUAL) {
    // manual: leave genuine ties as shared ranks; the organizer resolves live.
    return NONE
  }

  if (tieBreaker === TIE_BREAKERS.HIGHEST_CRITERION) {
    for (const row of results) {
      const avgs = Object.values(row.perCriterion).map((c) => c.average ?? 0)
      row._tieKey = avgs.length ? Math.max(...avgs) : 0
    }
    return {
      compare: (a, b) => (b._tieKey ?? 0) - (a._tieKey ?? 0),
      equal: (a, b) => (a._tieKey ?? 0) === (b._tieKey ?? 0),
    }
  }

  if (tieBreaker === TIE_BREAKERS.HIGHEST_ROUND) {
    const roundId = cfg.tieBreakRoundId ?? null
    for (const row of results) {
      const vals = Object.values(row.perRound).map((r) => r.value ?? 0)
      row._tieKey = roundId
        ? Number(row.perRound[roundId]?.value ?? 0)
        : vals.length
          ? Math.max(...vals)
          : 0
    }
    return {
      compare: (a, b) => (b._tieKey ?? 0) - (a._tieKey ?? 0),
      equal: (a, b) => (a._tieKey ?? 0) === (b._tieKey ?? 0),
    }
  }

  if (tieBreaker === TIE_BREAKERS.COUNTBACK) {
    // Head-to-head across criteria: whoever wins more individual criteria ranks
    // first. Uses the per-criterion averages already computed on each row.
    const critIds = (ctx.criteria ?? []).map((c) => c.id)
    const wins = (a, b) => {
      let aw = 0
      let bw = 0
      for (const id of critIds) {
        const av = a.perCriterion[id]?.average ?? 0
        const bv = b.perCriterion[id]?.average ?? 0
        if (av > bv) aw++
        else if (bv > av) bw++
      }
      return aw - bw
    }
    return { compare: (a, b) => wins(b, a), equal: (a, b) => wins(a, b) === 0 }
  }

  if (tieBreaker === TIE_BREAKERS.JUDGES_MAJORITY) {
    // Whoever more judges scored higher OVERALL wins. Build each judge's overall
    // (criteria-weighted) score per contestant from the raw score rows.
    const perJudge = buildPerJudgeOverall(ctx.scores, ctx.criteria) // Map<contestantId, Map<judgeId, number>>
    const wins = (a, b) => {
      const am = perJudge.get(a.contestantId) ?? new Map()
      const bm = perJudge.get(b.contestantId) ?? new Map()
      let aw = 0
      let bw = 0
      for (const [j, av] of am) {
        if (!bm.has(j)) continue
        const bv = bm.get(j)
        if (av > bv) aw++
        else if (bv > av) bw++
      }
      return aw - bw
    }
    return { compare: (a, b) => wins(b, a), equal: (a, b) => wins(a, b) === 0 }
  }

  return NONE
}

// Map<contestantId, Map<judgeId, overallWeightedScore>> from raw score rows.
function buildPerJudgeOverall(scores, criteria) {
  const pctById = new Map((criteria ?? []).map((c) => [c.id, Number(c.percentage ?? 0)]))
  // per (contestant, judge): accumulate score*pct and pct for a weighted mean.
  const acc = new Map()
  for (const s of scores ?? []) {
    const cid = s.contestant_id ?? s.contestantId
    const jid = s.judge_id ?? s.judgeId ?? '__nojudge__'
    const critId = s.criteria_id ?? s.criteriaId
    const v = Number(s.score)
    if (Number.isNaN(v)) continue
    const pct = pctById.get(critId) ?? 0
    const key = `${cid}|${jid}`
    if (!acc.has(key)) acc.set(key, { cid, jid, num: 0, den: 0 })
    const cell = acc.get(key)
    // If a criterion has no weight (0), still count it evenly so the judge's
    // overall is never empty when weights are unset.
    const w = pct > 0 ? pct : 1
    cell.num += v * w
    cell.den += w
  }
  const out = new Map()
  for (const { cid, jid, num, den } of acc.values()) {
    if (!out.has(cid)) out.set(cid, new Map())
    out.get(cid).set(jid, den > 0 ? num / den : 0)
  }
  return out
}
