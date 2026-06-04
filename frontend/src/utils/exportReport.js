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
  const headers = Array.from(
    rows.reduce((set, r) => {
      Object.keys(r ?? {}).forEach((k) => set.add(k))
      return set
    }, new Set()),
  )
  const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const lines = [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => escape(r?.[h])).join(',')),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
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
