/**
 * Shared export helpers — used by all module report pages.
 *
 * No module-specific logic lives here. Each helper accepts a filename
 * and module-agnostic content (rows for CSV/Excel, a structured payload
 * for PDF/JSON) and triggers a browser download.
 *
 *   - CSV:        RFC-4180-ish escaping, plain text
 *   - Excel:      SpreadsheetML 2003 XML (.xls) — opens in Excel, Numbers,
 *                 and LibreOffice without any third-party dependency
 *   - JSON:       Pretty-printed JSON
 *   - PDF:        Opens a print-styled HTML window so the user can use
 *                 the browser's "Save as PDF" action. Self-contained:
 *                 the report payload is rendered with a small built-in
 *                 stylesheet, no external CSS.
 */

import { serializeCsv } from '../../../shared/csv-export.js'

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
  const blob = new Blob([serializeCsv(rows)], { type: 'text/csv;charset=utf-8' })
  downloadBlob(blob, filename)
}

/* ----------------------- Excel ----------------------- */

/**
 * Generate a SpreadsheetML 2003 XML workbook (.xls) from one or more sheets.
 * Each sheet is { name: string, rows: Array<Record<string, any>> }.
 * Opens in Excel, Numbers, and LibreOffice without any dependency.
 */
export function downloadExcel(filename, sheets) {
  if (!sheets || !sheets.length) return
  const sheetEntries = sheets
    .map((sheet, sheetIdx) => {
      const rows = sheet?.rows ?? []
      const headers = Array.from(
        rows.reduce((set, r) => {
          Object.keys(r ?? {}).forEach((k) => set.add(k))
          return set
        }, new Set()),
      )
      if (!headers.length) return ''
      const headerRow = `<Row>${headers
        .map((h) => `<Cell><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`)
        .join('')}</Row>`
      const dataRows = rows
        .map((r) => {
          const cells = headers
            .map((h) => {
              const v = r?.[h]
              if (v === null || v === undefined || v === '') {
                return '<Cell><Data ss:Type="String"></Data></Cell>'
              }
              if (typeof v === 'number' && Number.isFinite(v)) {
                return `<Cell><Data ss:Type="Number">${v}</Data></Cell>`
              }
              return `<Cell><Data ss:Type="String">${escapeXml(v)}</Data></Cell>`
            })
            .join('')
          return `<Row>${cells}</Row>`
        })
        .join('')
      return `<Worksheet ss:Name="${escapeXml(sheet.name ?? `Sheet${sheetIdx + 1}`)}"><Table>${headerRow}${dataRows}</Table></Worksheet>`
    })
    .filter(Boolean)
    .join('')

  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:html="http://www.w3.org/TR/REC-html40">
<Styles><Style ss:ID="Default" ss:Name="Normal"><Font ss:FontName="Calibri" ss:Size="11"/></Style></Styles>
${sheetEntries}
</Workbook>`
  const blob = new Blob([xml], { type: 'application/vnd.ms-excel' })
  downloadBlob(blob, filename.endsWith('.xls') ? filename : `${filename}.xls`)
}

const escapeStyledXml = value => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;')

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

export function downloadJudgeScoreSheetsExcel(filename, sheets) {
  if (!sheets?.length) throw new Error('No judge score sheets are available for this export.')
  const workbookSheets = sheets.map(sheet => {
    const columnCount = 2 + sheet.entries.length
    const cell = (value, style = 'Default', mergeAcross = null) =>
      `<Cell ss:StyleID="${style}"${mergeAcross == null ? '' : ` ss:MergeAcross="${mergeAcross}"`}><Data ss:Type="${typeof value === 'number' && Number.isFinite(value) ? 'Number' : 'String'}">${escapeStyledXml(value)}</Data></Cell>`
    const rows = [
      `<Row ss:Height="32">${cell('VOTRIX  |  OFFICIAL JUDGE SCORE SHEET', 'Title', columnCount - 1)}</Row>`,
      `<Row>${cell('Event', 'MetadataLabel')}${cell(sheet.eventName, 'MetadataValue')}</Row>`,
      `<Row>${cell('Competition', 'MetadataLabel')}${cell(sheet.competitionName, 'MetadataValue')}</Row>`,
      `<Row>${cell('Round', 'MetadataLabel')}${cell(sheet.roundName, 'MetadataValue')}</Row>`,
      `<Row>${cell('Judge', 'MetadataLabel')}${cell(sheet.judgeName, 'MetadataValue')}</Row>`,
      `<Row>${cell('Scoring method', 'MetadataLabel')}${cell(sheet.methodName, 'MetadataValue')}</Row>`,
      '<Row/>',
      `<Row ss:Height="38">${cell('SCORING CRITERIA', 'TableHeader')}${cell(sheet.weightHeader, 'TableHeader')}${sheet.entries.map(entry => cell(entry.label, 'TableHeader')).join('')}</Row>`,
      ...sheet.rows.map(row =>
        `<Row ss:Height="27">${cell(row.name)}${cell(sheet.pointsBasis ? row.maxPoints : `${Number(row.weight).toFixed(2).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')}%`, 'Weight')}${row.scores.map(score => cell(score, 'Score')).join('')}</Row>`,
      ),
      `<Row ss:Height="24">${cell(sheet.totalLabel, 'TotalLabel')}${cell(sheet.pointsBasis ? sheet.total : `${Number(sheet.total).toFixed(2).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')}%`, 'TotalValue')}${Array.from({ length: columnCount - 2 }, () => cell('', 'TotalValue')).join('')}</Row>`,
    ]
    const widths = `<Column ss:Width="270"/><Column ss:Width="82"/>${sheet.entries.map(() => '<Column ss:Width="140"/>').join('')}`
    return `<Worksheet ss:Name="${escapeStyledXml(sheet.name)}"><Table>${widths}${rows.join('')}</Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><PageSetup><Layout x:Orientation="Landscape"/></PageSetup><Print><ValidPrinterInfo/><FitWidth>1</FitWidth><FitHeight>0</FitHeight></Print><Selected/></WorksheetOptions></Worksheet>`
  }).join('')
  const xml = `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="Default" ss:Name="Normal"><Font ss:FontName="Arial" ss:Size="11"/><Alignment ss:Vertical="Center"/></Style><Style ss:ID="Title"><Font ss:FontName="Arial" ss:Size="16" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#172B56" ss:Pattern="Solid"/><Alignment ss:Vertical="Center" ss:Horizontal="Left"/></Style><Style ss:ID="MetadataLabel"><Font ss:Bold="1"/><Alignment ss:Vertical="Center"/></Style><Style ss:ID="MetadataValue"><Alignment ss:Vertical="Center"/></Style><Style ss:ID="TableHeader"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#2455D6" ss:Pattern="Solid"/><Alignment ss:Vertical="Center" ss:Horizontal="Center" ss:WrapText="1"/></Style><Style ss:ID="Weight"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/></Style><Style ss:ID="Score"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/></Style><Style ss:ID="TotalLabel"><Font ss:Bold="1"/><Interior ss:Color="#DCEBFF" ss:Pattern="Solid"/><Borders><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#B7CEF7"/></Borders></Style><Style ss:ID="TotalValue"><Font ss:Bold="1"/><Interior ss:Color="#DCEBFF" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Borders><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#B7CEF7"/></Borders></Style></Styles>${workbookSheets}</Workbook>`
  downloadBlob(new Blob([xml], { type: 'application/vnd.ms-excel' }), filename.endsWith('.xls') ? filename : `${filename}.xls`)
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
