// Test helper: read back a workbook produced by utils/xlsxWriter.js. The writer
// stores entries uncompressed, so every part can be decoded without an unzip
// library. Returns { files: { 'xl/workbook.xml': '<xml…>' }, sheets: [{ name, xml }] }.

export async function toBytes(part) {
  if (part instanceof Uint8Array) return part
  if (part instanceof ArrayBuffer) return new Uint8Array(part)
  if (typeof part?.arrayBuffer === 'function') return new Uint8Array(await part.arrayBuffer())
  throw new Error('Not binary data')
}

export function readXlsx(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const decoder = new TextDecoder()
  const files = {}
  let offset = 0
  while (offset + 4 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    const method = view.getUint16(offset + 8, true)
    if (method !== 0) throw new Error('Expected a stored (uncompressed) entry')
    const size = view.getUint32(offset + 18, true)
    const nameLength = view.getUint16(offset + 26, true)
    const extraLength = view.getUint16(offset + 28, true)
    const nameStart = offset + 30
    const name = decoder.decode(bytes.subarray(nameStart, nameStart + nameLength))
    const dataStart = nameStart + nameLength + extraLength
    files[name] = decoder.decode(bytes.subarray(dataStart, dataStart + size))
    offset = dataStart + size
  }
  const names = [...files['xl/workbook.xml'].matchAll(/<sheet name="([^"]*)"/g)].map((m) => m[1])
  const sheets = names.map((name, index) => ({ name, xml: files[`xl/worksheets/sheet${index + 1}.xml`] }))
  return { files, sheets }
}
