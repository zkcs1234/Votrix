// Setup validation is shared by the saved-data UI, publication, and session start.
// This validates inputs; score aggregation remains in competition-calculation.js.
export const CRITERIA_WEIGHT_TOLERANCE = 0.001
export const isCriteriaActive = item => (item.isActive ?? item.is_active) !== false
const number = value => value == null || value === '' ? NaN : Number(value)
const eventIdOf = item => item.eventId ?? item.event_id
const compareId = (a, b) => String(a.id).localeCompare(String(b.id))
const nullableNumber = value => value == null ? null : Number(value)

export function scoringInputBounds(input) {
  const type = input.scoreType ?? input.score_type
  if (type === 'range_1_100') return { min: 1, max: 100 }
  if (type === 'range_1_10') return { min: 1, max: 10 }
  if (type === 'decimal') return { min: 0, max: 10 }
  if (type === 'custom_range') return { min: number(input.customMin ?? input.custom_min), max: number(input.customMax ?? input.custom_max) }
  if (type) return { min: NaN, max: NaN }
  // The versioned engine supports direct parent scoring with explicit bounds.
  return { min: number(input.minScore ?? input.min_score), max: number(input.maxScore ?? input.max_score) }
}

const minorRows = foundation => foundation.minorCriteria ?? (foundation.criteria ?? []).flatMap(c =>
  (c.minorCriteria ?? []).map(m => ({ ...m, criteriaId: m.criteriaId ?? m.criteria_id ?? c.id })))

// Canonical source projection is compared under the database's event lock at
// publication. It detects concurrent saves without duplicating scoring rules in SQL.
export function criteriaSource(foundation) {
  return {
    rounds: [...(foundation.rounds ?? [])].sort(compareId).map(r => ({
      id: r.id, name: r.name, displayOrder: Number(r.displayOrder ?? r.display_order ?? 0),
      criteriaIds: [...(r.criteriaIds ?? [])].sort(),
    })),
    criteria: [...(foundation.criteria ?? [])].sort(compareId).map(c => ({
      id: c.id, name: c.name, isActive: isCriteriaActive(c), percentage: Number(c.percentage),
      minScore: nullableNumber(c.minScore ?? c.min_score), maxScore: nullableNumber(c.maxScore ?? c.max_score),
    })),
    minors: [...minorRows(foundation)].sort(compareId).map(m => ({
      id: m.id, criteriaId: m.criteriaId ?? m.criteria_id, name: m.name,
      isActive: isCriteriaActive(m), scoreType: m.scoreType ?? m.score_type ?? null,
      customMin: nullableNumber(m.customMin ?? m.custom_min), customMax: nullableNumber(m.customMax ?? m.custom_max),
    })),
  }
}

export function evaluateCriteriaReadiness(foundation) {
  const criteria = foundation.criteria ?? []
  const pointsBasis = foundation.scoringConfig?.criterionBasis === 'points'
  const savedRounds = foundation.rounds ?? []
  const rounds = [...savedRounds].sort((a, b) => Number(a.displayOrder ?? a.display_order ?? 0) - Number(b.displayOrder ?? b.display_order ?? 0))
  const eventId = foundation.event?.id
  const minors = minorRows(foundation)
  const criteriaById = new Map(criteria.map(c => [c.id, c]))
  const duplicateParents = new Set(criteria.filter((c, i) => criteria.findIndex(v => v.id === c.id) !== i).map(c => c.id))
  const duplicateMinors = new Set(minors.filter((m, i) => minors.findIndex(v => v.id === m.id) !== i).map(m => m.id))
  const orphanMinors = minors.filter(m => !criteriaById.has(m.criteriaId ?? m.criteria_id))
  const scopes = (rounds.length ? rounds : [{ id: null, name: 'Event-wide criteria' }]).map((round, index) => {
    const issues = []
    const add = (code, message, criterionId = null) => issues.push({ code, message, criterionId })
    const ids = rounds.length ? round.criteriaIds ?? [] : criteria.map(c => c.id)
    if (new Set(ids).size !== ids.length) add('duplicate_link', 'Remove duplicate criterion links.')
    if (ids.some(id => !criteriaById.has(id))) add('invalid_link', 'A linked criterion is missing or belongs to another event.')
    if (eventId && eventIdOf(round) && eventIdOf(round) !== eventId) add('invalid_round', 'This round belongs to another event.')
    if (orphanMinors.length) add('invalid_minor_link', 'A minor criterion has no valid parent. Repair its saved link.')
    const applicable = criteria.filter(c => ids.includes(c.id) && isCriteriaActive(c))
    let total = 0
    for (const c of applicable) {
      const weight = number(c.percentage)
      if (pointsBasis) {
        if (!Number.isFinite(number(c.maxScore)) || number(c.maxScore) <= 0) add('invalid_range', `${c.name}: enter a positive maximum point value.`, c.id)
      } else {
        if (!Number.isFinite(weight) || weight <= 0 || weight > 100) add('invalid_weight', `${c.name}: enter a weight greater than 0 and no more than 100%.`, c.id)
        if (Number.isFinite(weight)) total += weight
      }
      if (duplicateParents.has(c.id) || eventId && eventIdOf(c) && eventIdOf(c) !== eventId) add('invalid_parent_link', `${c.name}: repair the criterion's event link.`, c.id)
      const configured = minors.filter(m => (m.criteriaId ?? m.criteria_id) === c.id)
      const active = configured.filter(isCriteriaActive)
      if (!pointsBasis && active.some(m => m.percentage !== undefined) && (active.some(m => !Number.isFinite(m.percentage) || m.percentage <= 0 || m.percentage > 100) || Math.abs(active.reduce((sum,m)=>sum+(Number(m.percentage)||0),0)-100)>CRITERIA_WEIGHT_TOLERANCE)) add('minor_weight_total', `${c.name}: minor criterion weights must total 100%.`, c.id)
      if (configured.length && !active.length) add('missing_inputs', `${c.name}: enable at least one minor criterion or remove disabled minors to use direct scoring.`, c.id)
      for (const input of pointsBasis ? [c] : configured.length ? active : [c]) {
        const bounds = scoringInputBounds(input)
        if (!Number.isFinite(bounds.min) || !Number.isFinite(bounds.max) || bounds.max <= 0 || bounds.min >= bounds.max) add('invalid_range', `${input.name ?? c.name}: configure a valid score range (maximum greater than minimum and zero).`, c.id)
        if (input !== c && (duplicateMinors.has(input.id) || eventId && eventIdOf(input) && eventIdOf(input) !== eventId)) add('invalid_minor_link', `${input.name}: repair the minor criterion's link.`, c.id)
      }
    }
    if (!applicable.length) add('missing_criteria', 'Add or enable major criteria for this scoring scope.')
    const completeWeight = pointsBasis || Math.abs(total - 100) <= CRITERIA_WEIGHT_TOLERANCE + Number.EPSILON * 100
    if (!completeWeight) add('weight_total', total > 100 ? `Reduce criteria by ${formatCriteriaPercent(total - 100)}% to total 100%.` : `${formatCriteriaPercent(100 - total)}% remaining. Add or adjust criteria to complete this round.`)
    const ready = issues.length === 0
    const status = ready ? 'Complete' : issues.some(i => !['missing_criteria', 'weight_total'].includes(i.code)) || total > 100 + CRITERIA_WEIGHT_TOLERANCE ? 'Needs Attention' : applicable.length ? 'In Progress' : 'Not Started'
    return { roundId: round.id, name: round.name, number: index + 1, total, remaining: Math.max(0, 100 - total), ready, status, issues }
  })
  return { tolerance: CRITERIA_WEIGHT_TOLERANCE, hasRounds: rounds.length > 0, scopes, readyCount: scopes.filter(s => s.ready).length, allReady: scopes.every(s => s.ready) }
}

export function formatCriteriaPercent(value) { return String(Number(Number(value).toFixed(3))) }
