import multer from 'multer'
import { ApiError } from '../utils/ApiError.js'

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

const storage = multer.memoryStorage()

function imageFileFilter(_req, file, cb) {
  if (IMAGE_MIME_TYPES.has(file.mimetype)) {
    cb(null, true)
    return
  }
  cb(new ApiError(400, 'Invalid file type. Upload JPEG, PNG, WebP, or GIF.'))
}

export const imageUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: imageFileFilter,
})

export const csvUpload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
})

export const uploadSingle = (fieldName) => csvUpload.single(fieldName)
export const uploadImage = (fieldName) => imageUpload.single(fieldName)
export const uploadMultiple = (fieldName, maxCount = 10) => imageUpload.array(fieldName, maxCount)
