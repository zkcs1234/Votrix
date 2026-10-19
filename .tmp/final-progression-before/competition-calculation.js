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
export function calculateOfficial(rules, submissions, { roundId = null, deductions = [], eligibility = [] } = {}) {
  const dp = rules.scoringConfig.decimalPlaces ?? 2, method = rules.scoringConfig.calculationMethod
  if (!OFFICIAL_METHODS.includes(method) || ['manual','undecided'].includes(method)) throw new Error('Numeric calculation requires confirmed numeric rules')
  const target=rules.rounds.find(r=>r.id===roundId), carry=target?.progression==='carry_forward'
  const final = rules.rounds.find(r=>r.id===rules.scoringConfig.finalRoundId) ?? rules.rounds.filter(r => r.purpose === 'final').at(-1) ?? (rules.rounds.length===1?rules.rounds[0]:null)
  const rounds = roundId ? rules.rounds.filter(r => carry ? r.displayOrder<=target.displayOrder && r.purpose!=='special' : r.id === roundId) : rules.rounds.length ? rules.rounds.filter(r => final?.progression==='back_to_zero' ? r.id===final.id : r.purpose!=='special' && (!final || final.progression!=='carry_forward' || r.displayOrder<=final.displayOrder)) : [{ id: null, weight: 100 }]
  const missing = [], worksheets = [], roundResults = []
  for (const round of rounds) {
    const field = roundField(rules, round.id)
    for (const entry of field.entries) {
      if (eligibility.some(e => e.contestant_id === entry.id && e.status === 'approved' && (!e.round_id || e.round_id === round.id))) continue
      const judges = rules.judges.filter(j => j.isActive !== false && ['judge','head_judge'].includes(j.role) && scopeAllows(j, entry, field.round, rules.event.id))
      const judgeTotals = []
      for (const judge of judges) {
        const submission = submissions.find(s => s.judge_id === judge.judgeId && s.round_id === round.id && s.status === 'submitted' && s.rules_version === rules.id)
        const source = submission?.sources.find(s => s.contestantId === entry.id)
        const trace = [], contributions = []
        for (const criterion of field.criteria) {
          const minors = criterion.minorCriteria.length ? criterion.minorCriteria : [{ id: criterion.id, minScore: criterion.minScore, maxScore: criterion.maxScore }]
          const normalized = []
          for (const minor of minors) {
            const raw = source?.scores?.[minor.id]
            if (raw === null || raw === undefined || raw === '') { missing.push({ entryId: entry.id, judgeId: judge.judgeId, roundId: round.id, criteriaId: criterion.id, minorId: minor.id }); continue }
            if (!Number.isFinite(Number(raw)) || Number(raw) < minor.minScore || Number(raw) > minor.maxScore) throw new Error('Submitted score exceeds frozen bounds')
            normalized.push(Q.of(raw).div(Q.of(minor.maxScore)).mul(Q.of(100)))
          }
          if (normalized.length !== minors.length) continue
          const value = mean(normalized), weighted = value.mul(Q.of(criterion.percentage)).div(Q.of(100))
          contributions.push(weighted)
          trace.push({ criteriaId: criterion.id, name: criterion.name, percentage: criterion.percentage, minors: minors.map((m,i) => ({ ...m, raw: source.scores[m.id], normalized: normalized[i].rounded(dp) })), average: value.rounded(dp), contribution: weighted.rounded(dp) })
        }
        const complete = contributions.length === field.criteria.length && !!source && !!judges.length
        const total = complete ? sum(contributions).rounded(dp) : null
        worksheets.push({ roundId: round.id, entryId: entry.id, judgeId: judge.judgeId, submissionId: submission?.id ?? null, total, complete, criteria: trace })
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
      const penalty = sum(deductions.filter(d => d.contestant_id === entry.id && d.decision_status === 'approved' && (d.round_id === round.id || (!rules.rounds.length && !d.round_id))).map(d => Q.of(d.amount))).rounded(dp)
      roundResults.push({ contestantId: entry.id, contestantName: entry.name, contestantNumber: entry.contestantNumber, divisionId: entry.divisionId, photo: entry.photo, roundId: round.id, baseScore, deductionTotal: penalty, finalScore: baseScore === null ? null : Q.of(baseScore).add(Q.of(-penalty)).rounded(dp), perCriterion: {}, perRound: {}, perCategory: {}, judgeTotals, status: baseScore === null ? 'Incomplete' : 'Submitted' })
    }
    if (method === 'rank_based') {
      const rows = roundResults.filter(r => r.roundId === round.id)
      for (const row of rows) {
        if (row.finalScore === null) continue
        let placements = 0
        for (const judge of rules.judges) {
          const sheet = worksheets.filter(w => w.roundId === round.id && w.judgeId === judge.judgeId && w.complete && (!rules.scoringConfig.perDivision || rules.contestants.find(e=>e.id===w.entryId)?.divisionId===row.divisionId)).sort((a,b) => b.total-a.total)
          const cell = sheet.find(w => w.entryId === row.contestantId)
          if (cell) placements += 1 + sheet.filter(w => w.total > cell.total).length
        }
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
      results = rules.contestants.filter(entry=>roundResults.some(r=>r.contestantId===entry.id && included.some(q=>q.id===r.roundId))).map(entry => {
        const cells = roundResults.filter(r => r.contestantId === entry.id && included.some(rnd => rnd.id === r.roundId))
        const complete = cells.length > 0 && cells.every(c => c.finalScore !== null)
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
  if(!roundId&&rules.rounds.length){results=results.map(row=>{const amount=sum(deductions.filter(d=>d.contestant_id===row.contestantId&&d.decision_status==='approved'&&!d.round_id).map(d=>Q.of(d.amount))).rounded(dp);return{...row,deductionTotal:(row.deductionTotal??0)+amount,finalScore:row.finalScore===null?null:Q.of(row.finalScore).add(Q.of(method==='rank_based'?amount:-amount)).rounded(dp)}})}
  const compare = (a,b) => (a.finalScore===null)-(b.finalScore===null) || (method==='rank_based' ? a.finalScore-b.finalScore : b.finalScore-a.finalScore)
  results.forEach(row=>{
    const parents=new Map()
    for(const w of worksheets.filter(w=>w.entryId===row.contestantId&&w.complete))for(const c of w.criteria){const key=`${w.roundId}:${c.criteriaId}`;parents.set(key,[...(parents.get(key)??[]),c.average])}
    row.tieKey=Math.max(0,...[...parents.values()].map(values=>mean(values.map(Q.of)).rounded(dp)))
  })
  const tieActive=method!=='rank_based'&&rules.scoringConfig.tiePolicy==='highest_criterion'
  results.sort((a,b)=>compare(a,b)||(tieActive?b.tieKey-a.tieKey:0))
  for (const group of rules.scoringConfig.perDivision ? [...new Set(results.map(r => r.divisionId))].map(id => results.filter(r => r.divisionId === id)) : [results]) {
    group.forEach((row,i) => { row.rank = row.finalScore===null ? null : i && row.finalScore === group[i-1].finalScore && (!tieActive||row.tieKey===group[i-1].tieKey) ? group[i-1].rank : i+1; row.rankingScore=row.finalScore; row.weightedScore=row.finalScore })
  }
  return { results, worksheets, missing, ready: missing.length === 0 && results.length > 0 && results.every(r => r.finalScore!==null), roundResults }
}
