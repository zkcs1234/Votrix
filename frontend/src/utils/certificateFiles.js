// Client-side mirror of the server's certificate rules
// (backend/src/services/certificate-storage.service.js). The server remains the
// authority — it verifies the real file type by content — this only gives the
// applicant fast, specific feedback before uploading.
export const CERTIFICATE_MAX_FILES = 5
export const CERTIFICATE_MAX_BYTES = 8 * 1024 * 1024
export const CERTIFICATE_ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png'

const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png'])
const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png']

function isAllowed(file) {
  const name = String(file.name ?? '').toLowerCase()
  return ALLOWED_TYPES.has(file.type) || ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext))
}

/**
 * Merge newly picked files into the current selection.
 * Returns { files, errors }: accepted files (capped at the maximum) plus a
 * message for every file that was refused.
 */
export function addCertificateFiles(current, incoming) {
  const files = [...current]
  const errors = []

  for (const file of incoming) {
    if (!isAllowed(file)) {
      errors.push(`"${file.name}" is not a PDF, JPEG or PNG file.`)
    } else if (file.size === 0) {
      errors.push(`"${file.name}" is empty.`)
    } else if (file.size > CERTIFICATE_MAX_BYTES) {
      errors.push(`"${file.name}" is larger than ${CERTIFICATE_MAX_BYTES / (1024 * 1024)} MB.`)
    } else if (files.some((f) => f.name === file.name && f.size === file.size)) {
      errors.push(`"${file.name}" was already added.`)
    } else if (files.length >= CERTIFICATE_MAX_FILES) {
      errors.push(`You can attach at most ${CERTIFICATE_MAX_FILES} certificates.`)
    } else {
      files.push(file)
    }
  }
  return { files, errors }
}

export function formatFileSize(bytes) {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}
