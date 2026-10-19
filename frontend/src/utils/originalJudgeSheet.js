import { combineOfficialContributions } from '../../../shared/competition-calculation.js'

export function judgeSubmissionStatus(judge) {
  if (judge?.submitted) return 'Submitted'
  return ({ incomplete: 'Incomplete or invalid sheet', stale_rules: 'Incompatible frozen rules', unauthorized: 'Unauthorized submission', missing: 'Missing submission' })[judge?.submissionState] ?? 'Missing submission'
}

export function sheetTargetLabel(target) {
  const range = target.minScore != null && target.maxScore != null ? ` [${target.minScore}\u2013${target.maxScore}]` : ''
  return `${target.name}${target.percentage == null ? '' : ` (${target.percentage}%)`}${range}`
}

// Read only the immutable submitted sources, never calculation worksheets or
// contestant results. Bind the head, judge, session, round and frozen rules.
export function originalJudgeSheet(view, selection) {
  const judge = view.progress?.find(item => item.judgeId === selection?.judgeId)
  const unavailable = message => ({ judge, status: judgeSubmissionStatus(judge), message })
  if (!judge) return unavailable('This judge is not assigned to the selected scoring context.')
  if (!view.complete) return unavailable('Original scores are withheld until every required current sheet and qualification is complete.')
  if (!judge.submitted) return unavailable('No complete current submission is available for this judge.')
  const matches = view.submissions?.filter(item => item.id === selection.submissionId && item.id === judge.submissionId && item.judge_id === judge.judgeId) ?? []
  const submission = matches.length === 1 ? matches[0] : null
  if (!submission || !view.session?.id || submission.session_id !== view.session.id || submission.rules_version !== view.rules?.id || (submission.round_id ?? null) !== (view.roundId ?? null)) return unavailable('The selected original submission is unavailable or no longer current. Reopen the sheet from the submission list.')
  const cfg = view.rules.configuration_snapshot
  const groups = (cfg.criteria ?? []).filter(c => (c.roundId ?? null) === (view.roundId ?? null)).map(criterion => ({
    ...criterion,
    targets: cfg.scoringConfig.criterionBasis !== 'points' && criterion.minorCriteria?.length ? criterion.minorCriteria : [criterion],
  }))
  if (!groups.length) return unavailable('The submitted sheet has no configured scoring criteria.')
  const allowed = new Set(view.session.entry_ids ?? [])
  const sources = submission.sources ?? []
  if (sources.some(source => source.session_id !== submission.session_id || source.judge_id !== judge.judgeId || source.locked !== true || !allowed.has(source.entry_id) || !groups.some(group => group.id === source.criterion_id))) return unavailable('The saved score sources do not match this judge\u2019s submitted sheet.')
  const sum = values => {
    if (!values.length || !values.every(value => typeof value === 'number' && Number.isFinite(value))) return null
    const precision = Math.max(...values.map(value => { const [mantissa, exponent = '0'] = String(value).split(/e/i); return Math.max(0, (mantissa.split('.')[1]?.length ?? 0) - Number(exponent)) }))
    return combineOfficialContributions(values.map(score => ({ score, weight: 100 })), precision)
  }
  const rows = (view.entries ?? []).filter(entry => allowed.has(entry.id)).map(entry => {
    const cells = groups.map(group => {
      const matches = sources.filter(source => source.entry_id === entry.id && source.criterion_id === group.id)
      const source = matches.length === 1 ? matches[0] : null
      const values = group.targets.map(target => source?.scores?.[target.id] ?? null)
      return { group, source, values, subtotal: sum(values) }
    })
    return { entry, cells, total: sum(cells.flatMap(cell => cell.values)) }
  })
  const incomplete = rows.length !== allowed.size || rows.some(row => row.total === null)
  return { judge, submission, groups, rows, status: incomplete ? 'Incomplete saved sheet' : 'Submitted', incomplete }
}

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const scoreText = value => value == null ? 'Missing' : String(value)
export function originalJudgeSheetPrintHtml(sheet, context) {
  const h = escapeHtml
  const groups = sheet.groups ?? [], rows = sheet.rows ?? []
  const title = group => `${group.name}${group.percentage == null ? '' : ` (${group.percentage}%)`}`
  return `<!doctype html><html><head><meta charset="utf-8"><title>Judge Score Sheet</title><style>@page{size:landscape;margin:12mm}body{font:13px system-ui,sans-serif;color:#17202a}header{background:#0d2444;color:white;padding:20px;border-radius:10px}h1{font-size:22px;margin:0 0 10px}table{border-collapse:collapse;width:100%;margin:18px 0;font-size:11px}th,td{border:1px solid #d9e0e8;padding:8px;text-align:right}thead th{background:#173766;color:white;text-align:center}tbody th{text-align:left}tbody tr:nth-child(even){background:#f2f5f9}thead{display:table-header-group}tr{break-inside:avoid}small{display:block}footer{color:#526075}</style></head><body><header><h1>Judge Score Sheet</h1><p>${h(context.eventName)} \u00b7 ${h(context.competitionName)} \u00b7 ${h(context.roundName)}</p><p>Judge: ${h(sheet.judge.judgeName)} \u00b7 ${h(sheet.status)}</p><p>Submitted ${h(context.timestamp)}</p><small>Submission ${h(sheet.submission.id)} \u00b7 Frozen rules ${h(sheet.submission.rules_version)}</small></header><h2>Contestant Scores</h2><table><thead><tr><th rowspan="2">No.</th><th rowspan="2">Contestant</th>${groups.map(group => `<th colspan="${group.targets.length + (group.targets.length > 1 ? 1 : 0)}">${h(title(group))}</th>`).join('')}<th rowspan="2">Raw score total</th></tr><tr>${groups.map(group => group.targets.map(target => `<th>${h(sheetTargetLabel(target))}</th>`).join('') + (group.targets.length > 1 ? '<th>Raw subtotal</th>' : '')).join('')}</tr></thead><tbody>${rows.map(row => `<tr><td>${h(row.entry.contestantNumber)}</td><th>${h(row.entry.name)}</th>${row.cells.map(cell => cell.values.map(value => `<td>${h(scoreText(value))}</td>`).join('') + (cell.values.length > 1 ? `<td>${h(scoreText(cell.subtotal))}</td>` : '')).join('')}<td>${h(scoreText(row.total))}</td></tr>`).join('')}</tbody></table><footer>Original submitted inputs, read-only. Raw subtotals add this judge\u2019s scores before weighting or deductions; official calculated results are separate.</footer></body></html>`
}

export function printOriginalJudgeSheet(sheet, context) {
  const win = window.open('', '_blank', 'width=1200,height=800')
  if (!win) return false
  win.opener = null
  win.document.open()
  win.onload = () => { win.focus(); win.print() }
  win.document.write(originalJudgeSheetPrintHtml(sheet, context))
  win.document.close()
  return true
}
