function escapeCsvCell(value) {
  let cell = String(value ?? '')
  if (/^[=+\-@\t\r]/.test(cell)) cell = `'${cell}`
  return `"${cell.replace(/"/g, '""')}"`
}

export function downloadCsv(filename, headers, rows) {
  const content = [headers, ...rows]
    .map((row) => row.map(escapeCsvCell).join(','))
    .join('\r\n')
  downloadBlob(filename, new Blob([content], { type: 'text/csv;charset=utf-8;' }))
}

export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}