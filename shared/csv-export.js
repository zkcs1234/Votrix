// Keep finite numeric cells numeric. User-entered text is a literal even when
// a spreadsheet would otherwise interpret its leading characters as a formula.
export function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value)
  if (typeof value !== 'number' && (/^[\s\u0000-\u001f]*[=+\-@]/u.test(text) || /^[\t\r\n]/.test(text))) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

export function serializeCsv(rows) {
  if (!rows?.length) return ''
  const headers = [...new Set(rows.flatMap(row => Object.keys(row ?? {})))]
  return [headers.map(csvCell).join(','), ...rows.map(row => headers.map(header => csvCell(row?.[header])).join(','))].join('\n')
}
