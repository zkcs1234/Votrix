/**
 * Minimal, dependency-free .xlsx (Office Open XML) writer.
 *
 * Replaces the old SpreadsheetML-2003 ".xls" downloads, which Excel opens with a
 * "file format and extension don't match" warning. It writes only what the exports
 * need: values (text, numbers, booleans), a few fixed cell styles, column widths,
 * row heights, merged cells, a frozen header row and landscape fit-to-width.
 *
 * Text is always written as an inline string, so a name such as "=1+1" can never be
 * evaluated as a formula. The archive is "stored" (uncompressed), which every
 * spreadsheet reader accepts and keeps this file small and easy to verify.
 *
 *   buildXlsx([{ name, rows, widths?, heights?, merges?, freezeRows?, landscape? }]) → Uint8Array
 *
 * A cell is a primitive, or `{ v, s }` where `s` is a key of XLSX_STYLES. `rows` is an
 * array of arrays; use `null` for an empty cell.
 */

// Style keys → index in the cellXfs list written to styles.xml below.
export const XLSX_STYLES = {
  default: 0,
  title: 1,
  label: 2,
  value: 3,
  header: 4,
  center: 5,
  totalLabel: 6,
  totalValue: 7,
  headerLeft: 8,
}

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="4">
<font><sz val="11"/><name val="Arial"/></font>
<font><b/><sz val="11"/><name val="Arial"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font>
<font><b/><sz val="16"/><color rgb="FFFFFFFF"/><name val="Arial"/></font>
</fonts>
<fills count="5">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF172B56"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF2455D6"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFDCEBFF"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left/><right/><top style="thin"><color rgb="FFB7CEF7"/></top><bottom/><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="9">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="3" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="1" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
const MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

// XML 1.0 forbids most control characters; strip them rather than corrupt the file.
// eslint-disable-next-line no-control-regex
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g

function escapeXml(value) {
  return String(value ?? '')
    .replace(INVALID_XML, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function columnLetter(index) {
  let n = index
  let letters = ''
  do {
    letters = String.fromCharCode(65 + (n % 26)) + letters
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return letters
}

const cellRef = (row, column) => `${columnLetter(column)}${row + 1}`

// Excel limits: 31 characters, none of \ / ? * [ ] :, unique case-insensitively.
export function safeWorksheetName(name, index, used = new Set()) {
  const base = String(name || `Sheet${index + 1}`).replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || `Sheet${index + 1}`
  let candidate = base
  let suffix = 2
  while (used.has(candidate.toLowerCase())) {
    const text = ` (${suffix++})`
    candidate = `${base.slice(0, 31 - text.length)}${text}`
  }
  used.add(candidate.toLowerCase())
  return candidate
}

function cellXml(value, row, column) {
  const styled = value !== null && typeof value === 'object' && !Array.isArray(value) && 'v' in value
  const raw = styled ? value.v : value
  const style = styled ? XLSX_STYLES[value.s] ?? 0 : 0
  const styleAttr = style ? ` s="${style}"` : ''
  const ref = cellRef(row, column)
  if (raw === null || raw === undefined || raw === '') return style ? `<c r="${ref}"${styleAttr}/>` : ''
  if (typeof raw === 'number' && Number.isFinite(raw)) return `<c r="${ref}"${styleAttr}><v>${raw}</v></c>`
  if (typeof raw === 'boolean') return `<c r="${ref}"${styleAttr} t="b"><v>${raw ? 1 : 0}</v></c>`
  return `<c r="${ref}"${styleAttr} t="inlineStr"><is><t xml:space="preserve">${escapeXml(raw)}</t></is></c>`
}

function worksheetXml(sheet) {
  const rows = sheet.rows ?? []
  const widest = rows.reduce((max, row) => Math.max(max, row?.length ?? 0), 0)
  const heights = sheet.heights ?? {}
  const sheetData = rows
    .map((row, rowIndex) => {
      const cells = (row ?? []).map((value, column) => cellXml(value, rowIndex, column)).join('')
      const height = heights[rowIndex]
      const heightAttr = height ? ` ht="${height}" customHeight="1"` : ''
      return cells || heightAttr ? `<row r="${rowIndex + 1}"${heightAttr}>${cells}</row>` : ''
    })
    .join('')
  const freeze = sheet.freezeRows
    ? `<pane ySplit="${sheet.freezeRows}" topLeftCell="A${sheet.freezeRows + 1}" activePane="bottomLeft" state="frozen"/>`
    : ''
  const cols = sheet.widths?.length
    ? `<cols>${sheet.widths.map((width, i) => `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`).join('')}</cols>`
    : ''
  const merges = sheet.merges?.length
    ? `<mergeCells count="${sheet.merges.length}">${sheet.merges
        .map(([r1, c1, r2, c2]) => `<mergeCell ref="${cellRef(r1, c1)}:${cellRef(r2, c2)}"/>`)
        .join('')}</mergeCells>`
    : ''
  const dimension = rows.length && widest ? `<dimension ref="A1:${cellRef(rows.length - 1, widest - 1)}"/>` : ''
  return (
    `${XML_HEAD}<worksheet xmlns="${MAIN_NS}" xmlns:r="${REL_NS}">` +
    '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' +
    dimension +
    `<sheetViews><sheetView workbookViewId="0">${freeze}</sheetView></sheetViews>` +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    cols +
    `<sheetData>${sheetData}</sheetData>` +
    merges +
    '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>' +
    `<pageSetup orientation="${sheet.landscape ? 'landscape' : 'portrait'}" fitToWidth="1" fitToHeight="0"/>` +
    '</worksheet>'
  )
}

/* ----------------------- ZIP (stored) ----------------------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes) {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

const DOS_TIME = 0
const DOS_DATE = (0 << 9) | (1 << 5) | 1 // 1980-01-01: keeps the archive deterministic

function zipStored(files) {
  const encoder = new TextEncoder()
  const locals = []
  const centrals = []
  let offset = 0
  for (const file of files) {
    const name = encoder.encode(file.name)
    const data = typeof file.data === 'string' ? encoder.encode(file.data) : file.data
    const crc = crc32(data)

    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true)
    local.setUint16(6, 0x0800, true) // UTF-8 names
    local.setUint16(8, 0, true) // stored
    local.setUint16(10, DOS_TIME, true)
    local.setUint16(12, DOS_DATE, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, data.length, true)
    local.setUint32(22, data.length, true)
    local.setUint16(26, name.length, true)
    local.setUint16(28, 0, true)
    locals.push(new Uint8Array(local.buffer), name, data)

    const central = new DataView(new ArrayBuffer(46))
    central.setUint32(0, 0x02014b50, true)
    central.setUint16(4, 20, true)
    central.setUint16(6, 20, true)
    central.setUint16(8, 0x0800, true)
    central.setUint16(10, 0, true)
    central.setUint16(12, DOS_TIME, true)
    central.setUint16(14, DOS_DATE, true)
    central.setUint32(16, crc, true)
    central.setUint32(20, data.length, true)
    central.setUint32(24, data.length, true)
    central.setUint16(28, name.length, true)
    central.setUint32(42, offset, true)
    centrals.push(new Uint8Array(central.buffer), name)

    offset += 30 + name.length + data.length
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, files.length, true)
  end.setUint16(10, files.length, true)
  end.setUint32(12, centralSize, true)
  end.setUint32(16, offset, true)

  const parts = [...locals, ...centrals, new Uint8Array(end.buffer)]
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let position = 0
  for (const part of parts) {
    out.set(part, position)
    position += part.length
  }
  return out
}

/** Build a complete .xlsx file. See the file header for the sheet shape. */
export function buildXlsx(sheets) {
  if (!sheets?.length) throw new Error('A workbook needs at least one sheet.')
  const used = new Set()
  const named = sheets.map((sheet, index) => ({ ...sheet, name: safeWorksheetName(sheet.name, index, used) }))
  const files = [
    {
      name: '[Content_Types].xml',
      data:
        `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        named
          .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
          .join('') +
        '</Types>',
    },
    {
      name: '_rels/.rels',
      data:
        `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>',
    },
    {
      name: 'xl/workbook.xml',
      data:
        `${XML_HEAD}<workbook xmlns="${MAIN_NS}" xmlns:r="${REL_NS}"><sheets>` +
        named.map((sheet, i) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
        '</sheets></workbook>',
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data:
        `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        named
          .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
          .join('') +
        `<Relationship Id="rId${named.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        '</Relationships>',
    },
    { name: 'xl/styles.xml', data: STYLES_XML },
    ...named.map((sheet, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: worksheetXml(sheet) })),
  ]
  return zipStored(files)
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
