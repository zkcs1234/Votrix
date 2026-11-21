/**
 * Shared export helpers — used by all module report pages.
 *
 * No module-specific logic lives here. Each helper accepts a filename
 * and module-agnostic content (rows for CSV/Excel, a structured payload
 * for PDF/JSON) and triggers a browser download.
 *
 *   - CSV:        RFC-4180-ish escaping, plain text
 *   - Excel:      a real .xlsx workbook (see xlsxWriter.js) — opens in Excel,
 *                 Numbers and LibreOffice without a format warning and
 *                 without any third-party dependency
 *   - JSON:       Pretty-printed JSON
 *   - PDF:        Opens a print-styled HTML window so the user can use
 *                 the browser's "Save as PDF" action. Self-contained:
 *                 the report payload is rendered with a small built-in
 *                 stylesheet, no external CSS.
 */

import { serializeCsv } from '../../../shared/csv-export.js'
import { buildXlsx, XLSX_MIME } from './xlsxWriter'

const escapeXml = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/* ----------------------- CSV ----------------------- */

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  downloadBlob(blob, filename)
}

export function downloadCsv(filename, rows) {
  if (!rows || !rows.length) return
  // A leading byte-order mark makes Excel read accented names correctly.
  const blob = new Blob(['﻿', serializeCsv(rows)], { type: 'text/csv;charset=utf-8' })
  downloadBlob(blob, filename)
}

/* ----------------------- Excel ----------------------- */

const xlsxFilename = (filename) => `${String(filename).replace(/\.xlsx?$/i, '')}.xlsx`

function downloadXlsxFile(filename, sheets) {
  const bytes = buildXlsx(sheets)
  downloadBlob(new Blob([bytes], { type: XLSX_MIME }), xlsxFilename(filename))
}

// Column width (in characters) that fits the longest value, within sensible bounds.
function fitWidth(label, values) {
  const lineLength = (value) => Math.max(...String(value ?? '').split('\n').map((line) => line.length))
  const longest = values.reduce((max, value) => Math.max(max, lineLength(value)), String(label).length)
  return Math.min(60, Math.max(10, longest + 2))
}

/**
 * Download one or more sheets as a real .xlsx workbook.
 * Each sheet is { name: string, rows: Array<Record<string, any>> }: a styled,
 * frozen header row followed by one row per record. Numbers stay numeric; text
 * (including anything that looks like a formula) is always stored as text.
 */
export function downloadExcel(filename, sheets) {
  if (!sheets || !sheets.length) return
  const workbookSheets = sheets
    .map((sheet, sheetIdx) => {
      const rows = sheet?.rows ?? []
      const headers = Array.from(
        rows.reduce((set, r) => {
          Object.keys(r ?? {}).forEach((k) => set.add(k))
          return set
        }, new Set()),
      )
      if (!headers.length) return null
      return {
        name: sheet.name ?? `Sheet${sheetIdx + 1}`,
        freezeRows: 1,
        widths: headers.map((h) => fitWidth(h, rows.map((r) => r?.[h]))),
        rows: [
          headers.map((h) => ({ v: h, s: 'header' })),
          ...rows.map((r) => headers.map((h) => r?.[h] ?? null)),
        ],
      }
    })
    .filter(Boolean)
  if (!workbookSheets.length) return
  downloadXlsxFile(filename, workbookSheets)
}

const safeSheetName = (name, index) => {
  const cleaned = String(name || `Judge ${index + 1}`)
    .replaceAll('\\', ' ')
    .replaceAll('/', ' ')
    .replaceAll('?', ' ')
    .replaceAll('*', ' ')
    .replaceAll(':', ' ')
    .replaceAll('[', ' ')
    .replaceAll(']', ' ')
    .trim()
    .slice(0, 31)
  return cleaned || `Judge ${index + 1}`
}

export function buildJudgeScoreSheetData(sources, context, judgeSelection = 'all') {
  const configuration = sources.rules?.configuration_snapshot
  if (!sources.complete || !configuration || !sources.session?.entry_ids?.length) {
    throw new Error('Complete current judge sheets are required for this export.')
  }
  const roundId = context.roundId ?? null
  const scoringConfig = configuration.scoringConfig ?? {}
  const pointsBasis = scoringConfig.criterionBasis === 'points'
  const criteria = (configuration.criteria ?? []).filter(criterion => (criterion.roundId ?? null) === roundId)
  if (!criteria.length) throw new Error('No scoring criteria are configured for the selected round.')
  const entries = sources.session.entry_ids.map(id => sources.entries?.find(entry => entry.id === id))
  if (entries.some(entry => !entry)) throw new Error('A current contestant identity is missing from the judge score sheet.')
  const judges = (sources.progress ?? []).filter(judge =>
    judge.submitted && (judgeSelection === 'all' || judge.judgeId === judgeSelection),
  )
  if (!judges.length) throw new Error('No submitted judge sheet is available for this export.')
  const method = configuration.rounds?.find(round => round.id === roundId)?.calculationMethod
    ?? scoringConfig.calculationMethod
  const methodName = ({
    weighted_average: pointsBasis ? 'Average Score' : 'Weighted Mean',
    sum: 'Total Score',
    rank_based: 'Rank-Based Placement (raw ratings shown)',
    manual: 'Manual Official Results',
    highest_score: 'Highest Judge Score',
    lowest_removal: 'Average after judge score removal',
  })[method] ?? 'Not configured'
  const criterionRows = criteria.flatMap(criterion => {
    if (pointsBasis || !criterion.minorCriteria?.length) {
      return [{
        name: criterion.name,
        weight: pointsBasis ? null : Number(criterion.percentage),
        maxPoints: pointsBasis ? Number(criterion.maxScore) : null,
        criterionId: criterion.id,
        targetId: criterion.id,
      }]
    }
    return criterion.minorCriteria.map(target => ({
      name: `${criterion.name} — ${target.name}`,
      weight: target.percentage == null
        ? Number(criterion.percentage) / criterion.minorCriteria.length
        : scoringConfig.minorWeightBasis === 'overall'
          ? Number(target.percentage)
          : Number(criterion.percentage) * Number(target.percentage) / 100,
      maxPoints: null,
      criterionId: criterion.id,
      targetId: target.id,
    }))
  })
  const usedSheetNames = new Set()
  return judges.map((judge, index) => {
    const submissions = (sources.submissions ?? []).filter(submission =>
      submission.judge_id === judge.judgeId
      && (submission.round_id ?? null) === roundId
      && submission.rules_version === sources.rules.id
      && submission.session_id === sources.session.id,
    )
    if (submissions.length !== 1 || submissions[0].id !== judge.submissionId) {
      throw new Error(`The current submitted sheet for ${judge.judgeName ?? 'this judge'} is unavailable.`)
    }
    const submission = submissions[0]
    const rows = criterionRows.map(row => {
      const scores = entries.map(entry => {
        const matchingSources = (submission.sources ?? []).filter(source =>
          source.entry_id === entry.id && source.criterion_id === row.criterionId,
        )
        if (matchingSources.length !== 1) throw new Error(`The submitted score source for ${entry.name} is ambiguous.`)
        const value = matchingSources[0].scores?.[row.targetId]
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          throw new Error(`A submitted score for ${entry.name} is unavailable.`)
        }
        return value
      })
      return { ...row, scores }
    })
    const baseSheetName = safeSheetName(judge.judgeName, index)
    let sheetName = baseSheetName
    let suffix = 2
    while (usedSheetNames.has(sheetName.toLowerCase())) {
      const suffixText = ` (${suffix++})`
      sheetName = `${baseSheetName.slice(0, 31 - suffixText.length)}${suffixText}`
    }
    usedSheetNames.add(sheetName.toLowerCase())
    return {
      name: sheetName,
      judgeName: judge.judgeName ?? `Judge ${index + 1}`,
      methodName,
      rows,
      entries: entries.map((entry, entryIndex) => ({
        label: `Entry ${entryIndex + 1}\n${entry.name}`,
      })),
      total: criterionRows.reduce((sum, row) => sum + (pointsBasis ? row.maxPoints : row.weight), 0),
      totalLabel: pointsBasis ? 'TOTAL MAX POINTS' : 'TOTAL WEIGHT',
      weightHeader: pointsBasis ? 'MAX POINTS' : 'WEIGHT',
      pointsBasis,
      eventName: context.eventName ?? sources.eventName ?? 'Event',
      competitionName: context.competitionName ?? sources.competitionName ?? 'Competition',
      roundName: context.roundName ?? sources.roundName ?? 'Round',
    }
  })
}

const percentText = (value) => `${Number(value).toFixed(2).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')}%`

export function downloadJudgeScoreSheetsExcel(filename, sheets) {
  if (!sheets?.length) throw new Error('No judge score sheets are available for this export.')
  const workbookSheets = sheets.map(sheet => {
    const columnCount = 2 + sheet.entries.length
    const meta = (label, value) => [{ v: label, s: 'label' }, { v: value, s: 'value' }]
    const rows = [
      [{ v: 'VOTRIX  |  OFFICIAL JUDGE SCORE SHEET', s: 'title' }],
      meta('Event', sheet.eventName),
      meta('Competition', sheet.competitionName),
      meta('Round', sheet.roundName),
      meta('Judge', sheet.judgeName),
      meta('Scoring method', sheet.methodName),
      [],
      [{ v: 'SCORING CRITERIA', s: 'header' }, { v: sheet.weightHeader, s: 'header' }, ...sheet.entries.map(entry => ({ v: entry.label, s: 'header' }))],
      ...sheet.rows.map(row => [
        row.name,
        { v: sheet.pointsBasis ? row.maxPoints : percentText(row.weight), s: 'center' },
        ...row.scores.map(score => ({ v: score, s: 'center' })),
      ]),
      [
        { v: sheet.totalLabel, s: 'totalLabel' },
        { v: sheet.pointsBasis ? sheet.total : percentText(sheet.total), s: 'totalValue' },
        ...Array.from({ length: columnCount - 2 }, () => ({ v: null, s: 'totalValue' })),
      ],
    ]
    const headerRow = 7
    const heights = { 0: 32, [headerRow]: 38, [rows.length - 1]: 24 }
    sheet.rows.forEach((_, index) => { heights[headerRow + 1 + index] = 27 })
    return {
      name: sheet.name,
      rows,
      heights,
      widths: [38, 12, ...sheet.entries.map(() => 20)],
      merges: columnCount > 1 ? [[0, 0, 0, columnCount - 1]] : [],
      landscape: true,
    }
  })
  downloadXlsxFile(filename, workbookSheets)
}

/* ----------------------- PDF ----------------------- */

/**
 * Open a print-styled HTML window containing the report so the user can
 * use the browser's "Save as PDF" action.
 *
 * `payload` is a module-agnostic descriptor:
 *   {
 *     title: string,
 *     subtitle?: string,
 *     generatedAt?: string | Date,
 *     sections: Array<{
 *       title: string,
 *       kind: 'stats' | 'table' | 'keyvalue',
 *       stats?: Array<{ label, value }>,
 *       columns?: Array<{ key, label }>,
 *       rows?: Array<Record<string, any>>,
 *       keyValue?: Array<{ key, value }>,
 *     }>
 *   }
 */
export function downloadPdf(filename, payload) {
  if (typeof window === 'undefined') return
  const win = window.open('', '_blank', 'width=900,height=700')
  if (!win) return
  const safeTitle = escapeXml(payload?.title ?? 'Report')
  const safeSubtitle = payload?.subtitle ? escapeXml(payload.subtitle) : ''
  const generated = payload?.generatedAt
    ? new Date(payload.generatedAt).toLocaleString()
    : new Date().toLocaleString()

  const sectionsHtml = (payload?.sections ?? [])
    .map((section) => renderPdfSection(section))
    .join('')

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${safeTitle}</title>
<style>
  body { font-family: Inter, system-ui, -apple-system, sans-serif; color: #111827; margin: 32px; }
  h1 { font-size: 22px; margin: 0 0 4px 0; }
  h2 { font-size: 15px; margin: 24px 0 8px 0; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
  p.subtitle { color: #6b7280; margin: 0; font-size: 12px; }
  p.meta { color: #9ca3af; font-size: 11px; margin: 4px 0 0 0; }
  .stats { display: flex; flex-wrap: wrap; gap: 8px; }
  .stat { border: 1px solid #e5e7eb; border-radius: 6px; padding: 8px 12px; min-width: 120px; }
  .stat .label { font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em; }
  .stat .value { font-size: 16px; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 4px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #e5e7eb; }
  th { background: #f9fafb; color: #374151; font-size: 11px; text-transform: uppercase; }
  .kv { display: grid; grid-template-columns: 1fr 2fr; gap: 4px 12px; font-size: 12px; }
  .kv .k { color: #6b7280; }
  .kv .v { color: #111827; font-weight: 500; }
  @media print { body { margin: 16px; } }
</style>
</head>
<body>
  <h1>${safeTitle}</h1>
  ${safeSubtitle ? `<p class="subtitle">${safeSubtitle}</p>` : ''}
  <p class="meta">Generated ${escapeXml(generated)}</p>
  ${sectionsHtml}
  <script>window.onload = function () { setTimeout(function () { window.print(); }, 250); };</script>
</body>
</html>`

  win.document.open()
  win.document.write(html)
  win.document.close()
  // Filename hint for the browser's print dialog.
  try {
    win.document.title = filename.replace(/\.pdf$/i, '')
  } catch {
    /* noop */
  }
}

function renderPdfSection(section) {
  const title = section?.title ? `<h2>${escapeXml(section.title)}</h2>` : ''
  if (section?.kind === 'stats') {
    const stats = section.stats ?? []
    return `${title}<div class="stats">${stats
      .map(
        (s) =>
          `<div class="stat"><div class="label">${escapeXml(
            s.label ?? '',
          )}</div><div class="value">${escapeXml(s.value ?? '')}</div></div>`,
      )
      .join('')}</div>`
  }
  if (section?.kind === 'table') {
    const cols = section.columns ?? []
    const rows = section.rows ?? []
    const head = `<tr>${cols
      .map((c) => `<th>${escapeXml(c.label ?? c.key ?? '')}</th>`)
      .join('')}</tr>`
    const body = rows
      .map(
        (r) =>
          `<tr>${cols
            .map((c) => `<td>${escapeXml(r?.[c.key] ?? '')}</td>`)
            .join('')}</tr>`,
      )
      .join('')
    return `${title}<table><thead>${head}</thead><tbody>${body}</tbody></table>`
  }
  if (section?.kind === 'keyvalue') {
    const items = section.keyValue ?? []
    return `${title}<div class="kv">${items
      .map(
        (kv) =>
          `<div class="k">${escapeXml(kv.key ?? '')}</div><div class="v">${escapeXml(
            kv.value ?? '',
          )}</div>`,
      )
      .join('')}</div>`
  }
  return title
}
