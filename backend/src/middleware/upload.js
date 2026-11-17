import multer from 'multer'
import { ApiError } from '../utils/ApiError.js'

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

// Participant lists may arrive as CSV/TSV text or as an Excel workbook — the
// import parser reads all of them by sniffing the file content, so the gate
// here is intentionally lenient (browsers report inconsistent MIME types for
// spreadsheets, e.g. a .csv opened by Excel becomes application/vnd.ms-excel).
const SPREADSHEET_MIME_TYPES = new Set([
  'text/csv',
  'application/csv',
  'text/plain',
  'text/tab-separated-values',
  'application/vnd.ms-excel', // legacy .xls, and .csv on machines with Excel
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/octet-stream', // some browsers send this for .xlsx/.csv
])
const SPREADSHEET_EXTENSIONS = ['.csv', '.tsv', '.txt', '.xlsx', '.xls']

const storage = multer.memoryStorage()

function imageFileFilter(_req, file, cb) {
  if (IMAGE_MIME_TYPES.has(file.mimetype)) {
    cb(null, true)
    return
  }
  cb(new ApiError(400, 'Invalid file type. Upload JPEG, PNG, WebP, or GIF.'))
}

function csvFileFilter(_req, file, cb) {
  const name = (file.originalname || '').toLowerCase()
  const hasSpreadsheetExtension = SPREADSHEET_EXTENSIONS.some((ext) => name.endsWith(ext))
  if (SPREADSHEET_MIME_TYPES.has(file.mimetype) || hasSpreadsheetExtension) {
    cb(null, true)
    return
  }
  cb(new ApiError(400, 'Invalid file type. Upload a CSV or Excel (.xlsx) file.'))
}

export const imageUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: imageFileFilter,
})

export const csvUpload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: csvFileFilter,
})

// Organizer-application certificates: PDF / JPEG / PNG. The MIME check here is
// only a first gate; certificate-storage.service verifies the real file type by
// magic bytes before anything is stored.
const CERTIFICATE_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png'])
export const CERTIFICATE_UPLOAD_MAX_FILES = 5
export const CERTIFICATE_UPLOAD_MAX_BYTES = 8 * 1024 * 1024

function certificateFileFilter(_req, file, cb) {
  if (CERTIFICATE_MIME_TYPES.has(file.mimetype)) {
    cb(null, true)
    return
  }
  cb(new ApiError(400, 'Invalid file type. Upload PDF, JPEG, or PNG certificates.'))
}

export const certificateUpload = multer({
  storage,
  limits: {
    fileSize: CERTIFICATE_UPLOAD_MAX_BYTES,
    files: CERTIFICATE_UPLOAD_MAX_FILES,
    fields: 20,
    fieldSize: 64 * 1024,
  },
  fileFilter: certificateFileFilter,
})

const MULTER_MESSAGES = {
  LIMIT_FILE_SIZE: `Each certificate must be ${CERTIFICATE_UPLOAD_MAX_BYTES / (1024 * 1024)} MB or smaller.`,
  LIMIT_FILE_COUNT: `You can upload at most ${CERTIFICATE_UPLOAD_MAX_FILES} certificates.`,
  LIMIT_UNEXPECTED_FILE: 'Unexpected file field.',
}

// Wraps multer so its own errors become clean 400s instead of reaching the
// global error handler as unclassified 500s.
export const uploadCertificates = (fieldName = 'certificates') => {
  const handler = certificateUpload.array(fieldName, CERTIFICATE_UPLOAD_MAX_FILES)
  return (req, res, next) =>
    handler(req, res, (err) => {
      if (!err) return next()
      if (err instanceof multer.MulterError) {
        return next(new ApiError(400, MULTER_MESSAGES[err.code] || 'Invalid upload'))
      }
      return next(err)
    })
}

export const uploadSingle = (fieldName) => csvUpload.single(fieldName)
export const uploadImage = (fieldName) => imageUpload.single(fieldName)
export const uploadMultiple = (fieldName, maxCount = 10) => imageUpload.array(fieldName, Math.min(maxCount, 20))
