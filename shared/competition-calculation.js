import { validScore } from './competition-score-input.js'
// Exact rational arithmetic for the versioned official engine. No missing cell
// is converted to zero. Legacy calculations remain in their original engine.
class Q {
  constructor(n, d = 1n) { this.n = n; this.d = d }
  static of(value) {
    const match = /^(-?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(String(value))
    if (!match) throw new Error('Invalid finite decimal')
    const fraction = match[3] ?? ''
    const power = fraction.length - Number(match[4] ?? 0)
    const n = BigInt((match[1] || '') + match[2] + fraction)
    return power < 0 ? new Q(n * 10n ** BigInt(-power)) : new Q(n, 10n ** BigInt(power))
  }
  add(q) { return new Q(this.n * q.d + q.n * this.d, this.d * q.d) }
  mul(q) { return new Q(this.n * q.n, this.d * q.d) }
  div(q) { if (!q.n) throw new Error('Zero denominator'); return new Q(this.n * q.d, this.d * q.n) }
  rounded(dp) {
    const scale = 10n ** BigInt(dp), negative = this.n < 0n
    const n = (negative ? -this.n : this.n) * scale, d = this.d < 0n ? -this.d : this.d
    const result = n / d + (n % d * 2n >= d ? 1n : 0n)
    return Number(negative ? -result : result) / Number(scale)
  }
}
const sum = values => values.reduce((s, q) => s.add(q), Q.of(0))
const mean = values => sum(values).div(Q.of(values.length))
export function officialMean(values, dp = 2) { return mean(values.map(Q.of)).rounded(dp) }
export function combineOfficialContributions(cells, dp=2) {
  return sum(cells.map(c=>Q.of(c.score).mul(Q.of(c.weight)).div(Q.of(100)))).rounded(dp)
}
export function officialDeductionTotal(deductions, entryId, roundId, units='points', dp=2, defaultUnits=units) {
  return sum(deductions.filter(d=>d.contestant_id===entryId && d.decision_status==='approved' && !(d.appliedBy==='organizer' && d.criteria_id) && (d.round_id??null)===(roundId??null) && (d.units??defaultUnits)===units).map(d=>Q.of(d.amount))).rounded(dp)
}
function carryTotals(cells, method, dp) {
  const complete=cells.length>0&&cells.every(c=>c.finalScore!==null)
  const score=complete?sum(cells.map(c=>Q.of(c.finalScore))).rounded(dp):null
  const base=complete?sum(cells.map(c=>Q.of(c.baseScore))).rounded(dp):null
  return {...cells.at(-1),baseScore:base,deductionTotal:complete?Q.of(method==='rank_based'?score-base:base-score).rounded(dp):null,finalScore:score,perRound:Object.fromEntries(cells.map(c=>[c.roundId,{roundId:c.roundId,value:c.finalScore}]))}
}
export const OFFICIAL_METHODS = ['weighted_average', 'sum', 'rank_based', 'highest_score', 'lowest_removal', 'manual', 'undecided']
export function scopeAllows(judge, entry, round, eventId) {
  const list = judge.assignments ?? []
  return !list.length || list.some(a =>
    (a.scope === 'event' && (a.scopeId ?? a.scope_id) === eventId) ||
    (a.scope === 'round' && (a.scopeId ?? a.scope_id) === round?.id) ||
    (a.scope === 'category' && (a.scopeId ?? a.scope_id) === round?.categoryId) ||
    (a.scope === 'division' && (a.scopeId ?? a.scope_id) === entry.divisionId))
}
export function roundField(rules, roundId) {
  const round = rules.rounds.find(r => r.id === roundId) ?? null
  return {
    round,
    entries: rules.contestants.filter(e => !round || (round.contestantIds ?? []).includes(e.id)),
    criteria: rules.criteria.filter(c => c.isActive !== false && (!round || (round.criteriaIds ?? []).includes(c.id))),
  }
}
export function championshipField(rules, { eligibility = [] } = {}) {
  const round = rules.rounds.find(r => r.id === rules.scoringConfig.finalRoundId)
    ?? rules.rounds.filter(r => r.purpose === 'final').at(-1)
    ?? (rules.rounds.length === 1 ? rules.rounds[0] : null)
  const field = roundField(rules, round?.id ?? null)
  return {
    ...field,
    entries: field.entries.filter(entry => !eligibility.some(decision =>
      decision.contestant_id === entry.id && decision.status === 'approved'
      && (!decision.round_id || decision.round_id === round?.id))),
  }
}
export function calculateOfficial(rules, submissions, { roundId = null, deductions = [], judgeDeductions = [], eligibility = [] } = {}) {
  const dp = rules.scoringConfig.decimalPlaces ?? 2, defaultMethod = rules.scoringConfig.calculationMethod
  const pointsBasis = rules.scoringConfig.criterionBasis === 'points'
  if (!OFFICIAL_METHODS.includes(defaultMethod) || ['manual','undecided'].includes(defaultMethod)) throw new Error('Numeric calculation requires confirmed numeric rules')
  const target=rules.rounds.find(r=>r.id===roundId), carry=target?.progression==='carry_forward'
  const final = rules.rounds.find(r=>r.id===rules.scoringConfig.finalRoundId) ?? rules.rounds.filter(r => r.purpose === 'final').at(-1) ?? (rules.rounds.length===1?rules.rounds[0]:null)
  const method = target?.calculationMethod ?? final?.calculationMethod ?? defaultMethod
  const rounds = roundId ? rules.rounds.filter(r => carry ? r.displayOrder<=target.displayOrder && r.purpose!=='special' : r.id === roundId) : rules.rounds.length ? rules.rounds.filter(r => final?.progression==='back_to_zero' ? r.id===final.id : r.purpose!=='special' && (!final || final.progression!=='carry_forward' || r.displayOrder<=final.displayOrder)) : [{ id: null, weight: 100 }]
  const missing = [], worksheets = [], roundResults = []
  for (const round of rounds) {
    const method = round.calculationMethod ?? defaultMethod
    const pointPenalty = entryId => officialDeductionTotal(deductions,entryId,round.id,'points',dp,method==='rank_based'?'placements':'points') + (method==='rank_based' && round.id!=null && round.id===final?.id && !roundId ? officialDeductionTotal(deductions,entryId,null,'points',dp,'placements') : 0)
    const field = roundField(rules, round.id)
    for (const entry of field.entries) {
      if (eligibility.some(e => e.contestant_id === entry.id && e.status === 'approved' && (!e.round_id || e.round_id === round.id))) continue
      const judges = rules.judges.filter(j => j.isActive !== false && ['judge','head_judge'].includes(j.role) && scopeAllows(j, entry, field.round, rules.event.id))
      const judgeTotals = []
      for (const judge of judges) {
        const submission = submissions.find(s => s.judge_id === judge.judgeId && s.round_id === round.id && s.status === 'submitted' && s.rules_version === rules.id)
        const source = submission?.sources.find(s => s.contestantId === entry.id)
        const trace = [], contributions = []
        const ownDeductions = judgeDeductions.filter(d => d.contestant_id === entry.id && d.judge_id === judge.judgeId && (d.round_id ?? null) === round.id)
        const criterionPenalties = criterionId => [
          ...ownDeductions.filter(d => d.criteria_id === criterionId && d.units === 'points'),
          ...deductions.filter(d => d.appliedBy === 'organizer' && d.decision_status === 'approved' && d.contestant_id === entry.id && d.criteria_id === criterionId && (d.round_id ?? null) === round.id && d.units === 'points'),
        ]
        const adjustCriterion = (criterion, value) => {
          const penalties = criterionPenalties(criterion.id)
          return { value: value.add(sum(penalties.map(d => Q.of(-d.amount)))), penalties }
        }
        for (const criterion of field.criteria) {
          const minors = criterion.minorCriteria.length ? criterion.minorCriteria : [{ id: criterion.id, minScore: criterion.minScore, maxScore: criterion.maxScore }]
          const normalized = []
          const pointScores = []
          for (const minor of minors) {
            const raw = source?.scores?.[pointsBasis ? criterion.id : minor.id]
            if (raw === null || raw === undefined || raw === '') { missing.push({ entryId: entry.id, judgeId: judge.judgeId, roundId: round.id, criteriaId: criterion.id, minorId: minor.id }); continue }
            if (!validScore(raw, pointsBasis ? criterion : minor, rules.scoringConfig)) throw new Error('Submitted score exceeds frozen bounds or input precision')
            if (pointsBasis) { pointScores.push(Q.of(raw)); break }
            normalized.push(Q.of(raw).div(Q.of(minor.maxScore)).mul(Q.of(100)))
          }
          if (pointsBasis ? pointScores.length !== 1 : normalized.length !== minors.length) continue
          if (pointsBasis) {
            const value = pointScores[0]
            const adjusted = adjustCriterion(criterion, value)
            contributions.push(adjusted.value)
            trace.push({ criteriaId: criterion.id, name: criterion.name, maxScore: criterion.maxScore, raw: pointScores[0].rounded(dp), average: value.rounded(dp), originalContribution: value.rounded(dp), adjustedAverage: adjusted.value.rounded(dp), contribution: adjusted.value.rounded(dp), deductions: adjusted.penalties })
            continue
          }
          const weightedMinors = minors.some(m => m.percentage !== undefined)
          const overallMinorWeights = rules.scoringConfig.minorWeightBasis === 'overall'
          const expectedMinorTotal = overallMinorWeights ? criterion.percentage : 100
          if (weightedMinors && (minors.some(m => !Number.isFinite(m.percentage) || m.percentage <= 0) || Math.abs(minors.reduce((s,m)=>s+m.percentage,0)-expectedMinorTotal)>0.001)) throw new Error(`Minor criterion weights must total ${expectedMinorTotal}%`)
          const minorValue = weightedMinors ? sum(normalized.map((q,i)=>q.mul(Q.of(minors[i].percentage)).div(Q.of(100)))) : mean(normalized)
          const value = weightedMinors && overallMinorWeights ? minorValue.mul(Q.of(100)).div(Q.of(criterion.percentage)) : minorValue
          const weighted = weightedMinors && overallMinorWeights ? minorValue : value.mul(Q.of(criterion.percentage)).div(Q.of(100))
          const adjusted = adjustCriterion(criterion, weighted)
          contributions.push(adjusted.value)
          trace.push({ criteriaId: criterion.id, name: criterion.name, percentage: criterion.percentage, minors: minors.map((m,i) => ({ ...m, raw: source.scores[m.id], normalized: normalized[i].rounded(dp) })), average: value.rounded(dp), originalContribution: weighted.rounded(dp), adjustedAverage: adjusted.value.mul(Q.of(100)).div(Q.of(criterion.percentage)).rounded(dp), contribution: adjusted.value.rounded(dp), deductions: adjusted.penalties })
        }
        const complete = contributions.length === field.criteria.length && !!source && !!judges.length
        const totalPenalties = ownDeductions.filter(d => !d.criteria_id && d.units === 'points')
        const total = complete ? sum(contributions).add(sum(totalPenalties.map(d => Q.of(-d.amount)))).rounded(dp) : null
        const originalTotal = complete ? sum(trace.map(c => Q.of(c.originalContribution))).rounded(dp) : null
        const ownApplied = ownDeductions.filter(d => d.units === 'points')
        worksheets.push({ roundId: round.id, entryId: entry.id, judgeId: judge.judgeId, submissionId: submission?.id ?? null, originalTotal, total, adjustedTotal: total, judgeDeductionTotal: sum(ownApplied.map(d => Q.of(d.amount))).rounded(dp), judgePlacementPenalty: sum(ownDeductions.filter(d => d.units === 'placements').map(d => Q.of(d.amount))).rounded(dp), deductions: [...ownDeductions, ...trace.flatMap(c => c.deductions.filter(d => d.appliedBy === 'organizer'))], complete, criteria: trace })
        if (complete) judgeTotals.push(total)
      }
      if (!judges.length) missing.push({ entryId: entry.id, roundId: round.id, reason: 'No assigned judge' })
      let baseScore = null
      if (judges.length && judgeTotals.length === judges.length) {
        const totals = judgeTotals.map(Q.of)
        if (method === 'sum') baseScore = sum(totals).rounded(dp)
        else if (method === 'highest_score') baseScore = Math.max(...judgeTotals)
        else if (method === 'lowest_removal') {
          const sorted = [...judgeTotals].sort((a,b) => a-b)
          const low = rules.scoringConfig.dropLowest ?? 0, high = rules.scoringConfig.dropHighest ?? 0
          if (low + high >= sorted.length) throw new Error('Removal counts exhaust the judge panel')
          baseScore = mean(sorted.slice(low, sorted.length-high).map(Q.of)).rounded(dp)
        } else baseScore = mean(totals).rounded(dp)
      }
      const penalty = officialDeductionTotal(deductions,entry.id,round.id,method==='rank_based'?'placements':'points',dp)
      roundResults.push({ contestantId: entry.id, contestantName: entry.name, contestantNumber: entry.contestantNumber, divisionId: entry.divisionId, photo: entry.photo, roundId: round.id, baseScore, deductionTotal: penalty, finalScore: baseScore === null ? null : Q.of(baseScore).add(Q.of(-penalty)).rounded(dp), perCriterion: {}, perRound: {}, perCategory: {}, judgeTotals, status: baseScore === null ? 'Incomplete' : 'Submitted' })
    }
    if (method === 'rank_based') {
      const rows = roundResults.filter(r => r.roundId === round.id)
      for (const row of rows) {
        if (row.finalScore === null) continue
        let placements = 0
        const judgeRanks = {}, rawJudgeRanks = {}
        for (const judge of rules.judges) {
          const sheet = worksheets.filter(w => w.roundId === round.id && w.judgeId === judge.judgeId && w.complete && (!rules.scoringConfig.perDivision || rules.contestants.find(e=>e.id===w.entryId)?.divisionId===row.divisionId)).map(w=>({...w,adjustedTotal:Q.of(w.total).add(Q.of(-pointPenalty(w.entryId))).rounded(dp)})).sort((a,b) => b.adjustedTotal-a.adjustedTotal)
          const cell = sheet.find(w => w.entryId === row.contestantId)
          if (cell) {
            const judgeRank = 1 + sheet.filter(w => w.adjustedTotal > cell.adjustedTotal).length
            rawJudgeRanks[judge.judgeId] = judgeRank
            judgeRanks[judge.judgeId] = Q.of(judgeRank).add(Q.of(cell.judgePlacementPenalty ?? 0)).rounded(dp)
            placements += judgeRanks[judge.judgeId]
          }
        }
        row.pointDeductionTotal = pointPenalty(row.contestantId)
        row.numericScore = Q.of(row.baseScore).add(Q.of(-row.pointDeductionTotal)).rounded(dp)
        placements = sum(Object.values(judgeRanks).map(Q.of)).rounded(dp)
        row.rawJudgeRanks = rawJudgeRanks
        row.judgeRanks = judgeRanks
        row.placementTotal = placements; row.baseScore = placements
        row.finalScore = Q.of(placements).add(Q.of(row.deductionTotal)).rounded(dp)
      }
    }
  }
  let results = roundResults
  if (!roundId && rules.rounds.length) {
    if (final?.progression === 'back_to_zero') results = roundResults.filter(r => r.roundId === final.id)
    else if(final?.progression==='carry_forward'){results=roundField(rules,final.id).entries.filter(e=>roundResults.some(r=>r.contestantId===e.id&&r.roundId===final.id)).map(entry=>carryTotals(roundResults.filter(r=>r.contestantId===entry.id&&rules.rounds.some(q=>q.id===r.roundId&&q.purpose!=='special'&&q.displayOrder<=final.displayOrder)),method,dp))}
    else {
      const included = rules.rounds.filter(r => r.purpose !== 'special')
      const field = championshipField(rules, { eligibility })
      results = field.entries.filter(entry => field.round || roundResults.some(r => r.contestantId === entry.id && included.some(q => q.id === r.roundId))).map(entry => {
        const cells = roundResults.filter(r => r.contestantId === entry.id && included.some(rnd => rnd.id === r.roundId))
        const applicableRounds = included.filter(round => roundField(rules, round.id).entries.some(candidate => candidate.id === entry.id)
          && !eligibility.some(decision => decision.contestant_id === entry.id && decision.status === 'approved' && (!decision.round_id || decision.round_id === round.id)))
        const complete = applicableRounds.length > 0 && applicableRounds.every(round => cells.some(cell => cell.roundId === round.id && cell.finalScore !== null))
        const contribution = (c, score) => {
          const round = included.find(r => r.id === c.roundId)
          const category = rules.categories?.find(cat => cat.id === round.categoryId)
          const roundContribution = Q.of(score).mul(Q.of(round.progression === 'carry_forward' ? 100 : round.weight ?? 100)).div(Q.of(100))
          return category ? roundContribution.mul(Q.of(category.weight)).div(Q.of(100)) : roundContribution
        }
        const value = complete ? sum(cells.map(c => contribution(c,c.finalScore))).rounded(dp) : null
        const base = complete ? sum(cells.map(c => contribution(c,c.baseScore))).rounded(dp) : null
        const perCategory = Object.fromEntries((rules.categories??[]).map(category=>[category.id,{categoryId:category.id,categoryName:category.name,value:complete?sum(cells.filter(c=>included.find(r=>r.id===c.roundId)?.categoryId===category.id).map(c=>Q.of(c.finalScore).mul(Q.of(included.find(r=>r.id===c.roundId).weight)).div(Q.of(100)))).rounded(dp):null}]))
        return { ...cells[0], contestantId: entry.id, contestantName: entry.name, contestantNumber: entry.contestantNumber, divisionId: entry.divisionId, baseScore:base,deductionTotal:base===null?null:Q.of(method==='rank_based'?value-base:base-value).rounded(dp),finalScore: value, weightedScore: value, status: complete ? 'Submitted' : 'Incomplete', perCategory,perRound: Object.fromEntries(cells.map(c => [c.roundId, { roundId: c.roundId, value: c.finalScore }])) }
      })
    }
  }
  if(carry){const ids=new Set(roundField(rules,roundId).entries.filter(e=>roundResults.some(r=>r.contestantId===e.id&&r.roundId===roundId)).map(e=>e.id));results=[...ids].map(id=>({...carryTotals(roundResults.filter(r=>r.contestantId===id),method,dp),roundId}))}
  if(!roundId&&rules.rounds.length){results=results.map(row=>{const amount=officialDeductionTotal(deductions,row.contestantId,null,method==='rank_based'?'placements':'points',dp);return{...row,deductionTotal:(row.deductionTotal??0)+amount,finalScore:row.finalScore===null?null:Q.of(row.finalScore).add(Q.of(method==='rank_based'?amount:-amount)).rounded(dp)}})}
  const compare = (a,b) => (a.finalScore===null)-(b.finalScore===null) || (method==='rank_based' ? a.finalScore-b.finalScore : b.finalScore-a.finalScore)
  results.forEach(row=>{
    const parents=new Map()
    for(const w of worksheets.filter(w=>w.entryId===row.contestantId&&w.complete))for(const c of w.criteria){const key=`${w.roundId}:${c.criteriaId}`;parents.set(key,[...(parents.get(key)??[]),(c.adjustedAverage ?? c.average)])}
    row.tieKey=Math.max(0,...[...parents.values()].map(values=>mean(values.map(Q.of)).rounded(dp)))
  })
  const tieActive=method!=='rank_based'&&rules.scoringConfig.tiePolicy==='highest_criterion'
  results.sort((a,b)=>compare(a,b)||(tieActive?b.tieKey-a.tieKey:0))
  for (const group of rules.scoringConfig.perDivision ? [...new Set(results.map(r => r.divisionId))].map(id => results.filter(r => r.divisionId === id)) : [results]) {
    group.forEach((row,i) => { row.rank = row.finalScore===null ? null : i && row.finalScore === group[i-1].finalScore && (!tieActive||row.tieKey===group[i-1].tieKey) ? group[i-1].rank : i+1; row.rankingScore=row.finalScore; row.weightedScore=row.finalScore })
  }
  return { results, worksheets, missing, ready: missing.length === 0 && results.length > 0 && results.every(r => r.finalScore!==null), roundResults }
}
