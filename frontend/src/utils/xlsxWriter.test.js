import { expect, test } from 'vitest'
import { buildXlsx, columnLetter, safeWorksheetName } from './xlsxWriter'
import { readXlsx } from '@/test/readXlsx'

test('column letters follow spreadsheet order past Z', () => {
  expect([0, 25, 26, 27, 51, 52, 701, 702].map(columnLetter)).toEqual(['A', 'Z', 'AA', 'AB', 'AZ', 'BA', 'ZZ', 'AAA'])
})

test('worksheet names are made Excel-safe and unique', () => {
  const used = new Set()
  expect(safeWorksheetName('Judge: A/B?', 0, used)).toBe('Judge  A B')
  expect(safeWorksheetName('judge  a b', 1, used)).toBe('judge  a b (2)')
  expect(safeWorksheetName('x'.repeat(40), 2, used)).toHaveLength(31)
  expect(safeWorksheetName('', 3, used)).toBe('Sheet4')
})

test('writes a valid package with the parts Excel requires', () => {
  const { files, sheets } = readXlsx(buildXlsx([{ name: 'One', rows: [['a']] }, { name: 'Two', rows: [['b']] }]))
  expect(Object.keys(files).sort()).toEqual([
    '[Content_Types].xml',
    '_rels/.rels',
    'xl/_rels/workbook.xml.rels',
    'xl/styles.xml',
    'xl/workbook.xml',
    'xl/worksheets/sheet1.xml',
    'xl/worksheets/sheet2.xml',
  ])
  expect(sheets.map((sheet) => sheet.name)).toEqual(['One', 'Two'])
  expect(files['[Content_Types].xml']).toContain('/xl/worksheets/sheet2.xml')
  expect(files['xl/_rels/workbook.xml.rels']).toContain('styles.xml')
})

test('stores numbers as numbers and every string as inline text', () => {
  const { sheets } = readXlsx(buildXlsx([{ name: 'S', rows: [['=SUM(A1)', 12.5, true, null, 'a & <b>'], [{ v: 'Head', s: 'header' }]] }]))
  const xml = sheets[0].xml
  expect(xml).toContain('<c r="A1" t="inlineStr"><is><t xml:space="preserve">=SUM(A1)</t></is></c>')
  expect(xml).toContain('<c r="B1"><v>12.5</v></c>')
  expect(xml).toContain('<c r="C1" t="b"><v>1</v></c>')
  expect(xml).not.toContain('r="D1"')
  expect(xml).toContain('a &amp; &lt;b&gt;')
  expect(xml).toContain('<c r="A2" s="4" t="inlineStr">')
  expect(xml).not.toContain('<f>')
})

test('strips characters XML cannot hold instead of corrupting the file', () => {
  const { sheets } = readXlsx(buildXlsx([{ name: 'S', rows: [['bad\u0000\u0008text']] }]))
  expect(sheets[0].xml).toContain('>badtext<')
})

test('supports widths, heights, merges and a frozen header', () => {
  const { sheets } = readXlsx(
    buildXlsx([{ name: 'S', rows: [['t', null], ['x', 'y']], widths: [20, 12], heights: { 0: 30 }, merges: [[0, 0, 0, 1]], freezeRows: 1, landscape: true }]),
  )
  const xml = sheets[0].xml
  expect(xml).toContain('<col min="1" max="1" width="20" customWidth="1"/>')
  expect(xml).toContain('<row r="1" ht="30" customHeight="1">')
  expect(xml).toContain('<mergeCell ref="A1:B1"/>')
  expect(xml).toContain('<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>')
  expect(xml).toContain('orientation="landscape"')
})

test('rejects an empty workbook', () => {
  expect(() => buildXlsx([])).toThrow('at least one sheet')
})
